import crypto from 'node:crypto';
import { UserProfile, UserRole } from '../shared/types';
import {
  NotificationCategory,
  NotificationPriority,
  RevaluationRecord,
  RevaluationStatus,
} from '../shared/v2Types';
import { AttachmentStore, AttachmentUploadInput } from './attachmentStore';
import { VeriMarkDatabase } from './db';
import { DomainError, LedgerService } from './ledgerService';
import { NotificationService } from './notificationService';

const ACTIVE_REVALUATION_STATUSES = [
  RevaluationStatus.SUBMITTED,
  RevaluationStatus.UNDER_REVIEW,
  RevaluationStatus.EVIDENCE_REQUIRED,
  RevaluationStatus.RECOMMENDED,
  RevaluationStatus.APPROVED_FOR_CORRECTION,
  RevaluationStatus.CORRECTION_IN_PROGRESS,
];

export class RevaluationService {
  constructor(
    private readonly database: VeriMarkDatabase,
    private readonly notifications: NotificationService,
    private readonly attachments: AttachmentStore,
    private readonly ledgerService: LedgerService
  ) {}

  private baseSelectSql(): string {
    return `
      SELECT rv.*,
             st.full_name AS student_name, st.registration_number,
             r.obtained_marks AS current_marks, r.version AS current_version, r.max_marks,
             sub.code AS subject_code, sub.name AS subject_name,
             e.exam_code,
             ex.full_name AS assigned_examiner_name,
             ctrl.full_name AS reviewed_by_controller_name
      FROM revaluation_requests rv
      JOIN students st ON st.id = rv.student_id
      JOIN results r ON r.id = rv.result_id
      JOIN subjects sub ON sub.id = r.subject_id
      JOIN exams e ON e.id = r.exam_id
      LEFT JOIN users ex ON ex.id = rv.assigned_examiner_id
      LEFT JOIN users ctrl ON ctrl.id = rv.reviewed_by_controller_id
    `;
  }

  private mapRow(row: Record<string, unknown>): RevaluationRecord {
    const id = String(row.id);
    return {
      id,
      requestNumber: String(row.request_number),
      studentId: String(row.student_id),
      studentName: String(row.student_name),
      registrationNumber: String(row.registration_number),
      resultId: String(row.result_id),
      resultVersion: Number(row.result_version),
      subjectCode: String(row.subject_code),
      subjectName: String(row.subject_name),
      examCode: String(row.exam_code),
      maxMarks: Number(row.max_marks),
      originalMarks: Number(row.original_marks),
      currentMarks: Number(row.current_marks),
      currentVersion: Number(row.current_version),
      reason: String(row.reason),
      status: String(row.status) as RevaluationStatus,
      assignedExaminerId: row.assigned_examiner_id ? String(row.assigned_examiner_id) : null,
      assignedExaminerName: row.assigned_examiner_name
        ? String(row.assigned_examiner_name)
        : null,
      examinerRecommendation: row.examiner_recommendation
        ? (String(row.examiner_recommendation) as 'APPROVE' | 'REJECT' | 'EVIDENCE_REQUIRED')
        : null,
      recommendedMarks:
        row.recommended_marks != null ? Number(row.recommended_marks) : null,
      examinerNotes: row.examiner_notes ? String(row.examiner_notes) : null,
      controllerDecision: row.controller_decision
        ? (String(row.controller_decision) as 'APPROVED_FOR_CORRECTION' | 'REJECTED')
        : null,
      controllerNotes: row.controller_notes ? String(row.controller_notes) : null,
      reviewedByControllerId: row.reviewed_by_controller_id
        ? String(row.reviewed_by_controller_id)
        : null,
      reviewedByControllerName: row.reviewed_by_controller_name
        ? String(row.reviewed_by_controller_name)
        : null,
      linkedCorrectionId: row.linked_correction_id ? String(row.linked_correction_id) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      attachments: this.attachments.listByRevaluation(id),
    };
  }

  public listRevaluations(
    user: UserProfile,
    filters?: { status?: string; resultId?: string }
  ): RevaluationRecord[] {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (user.role === UserRole.STUDENT) {
      where.push('rv.student_id = ?');
      params.push(user.studentId ?? '__none__');
    } else if (user.role === UserRole.EXAMINER) {
      where.push(
        `(rv.assigned_examiner_id = ? OR EXISTS (
           SELECT 1 FROM exam_assignments ea
           JOIN exam_schedules es ON es.id = ea.schedule_id
           WHERE ea.examiner_user_id = ? AND es.subject_id = r.subject_id
         ))`
      );
      params.push(user.id, user.id);
    }

    if (filters?.status && filters.status !== 'ALL') {
      where.push('rv.status = ?');
      params.push(filters.status);
    }
    if (filters?.resultId) {
      where.push('rv.result_id = ?');
      params.push(filters.resultId);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.database.db
      .prepare(`${this.baseSelectSql()} ${whereSql} ORDER BY rv.updated_at DESC`)
      .all(...params) as Record<string, unknown>[];

    return rows.map((r) => this.mapRow(r));
  }

  public getById(id: string, user: UserProfile): RevaluationRecord {
    const row = this.database.db
      .prepare(`${this.baseSelectSql()} WHERE rv.id = ?`)
      .get(id) as Record<string, unknown> | undefined;

    if (!row) {
      throw new DomainError('Revaluation request not found', 404, 'REVALUATION_NOT_FOUND');
    }

    const rec = this.mapRow(row);
    if (user.role === UserRole.STUDENT && rec.studentId !== user.studentId) {
      throw new DomainError(
        'Students may only view their own revaluation requests',
        403,
        'FORBIDDEN'
      );
    }
    if (user.role === UserRole.EXAMINER && rec.assignedExaminerId !== user.id) {
      const inScope = this.database.db
        .prepare(
          `SELECT 1 FROM results r
           JOIN exam_schedules es ON es.subject_id = r.subject_id
           JOIN exam_assignments ea ON ea.schedule_id = es.id
           WHERE r.id = ? AND ea.examiner_user_id = ?`
        )
        .get(rec.resultId, user.id);
      if (!inScope) {
        throw new DomainError(
          'Examiners may only review revaluation requests within their assigned examination scope',
          403,
          'FORBIDDEN'
        );
      }
    }

    return rec;
  }

  public submitRevaluation(
    params: {
      resultId: string;
      reason: string;
      attachment?: AttachmentUploadInput | null;
    },
    actor: UserProfile
  ): RevaluationRecord {
    if (actor.role !== UserRole.STUDENT || !actor.studentId) {
      throw new DomainError('Only authenticated students can submit revaluation applications', 403);
    }

    const result = this.ledgerService.getResultById(params.resultId);
    if (!result) {
      throw new DomainError('Published result not found', 404);
    }
    if (result.studentId !== actor.studentId) {
      throw new DomainError(
        'Students may only apply for revaluation of their own results',
        403,
        'FORBIDDEN'
      );
    }
    if (!params.reason?.trim() || params.reason.trim().length < 10) {
      throw new DomainError(
        'Please explain your revaluation grounds clearly (at least 10 characters)',
        400
      );
    }

    // Prevent duplicate active revaluation requests for the same result
    const placeholders = ACTIVE_REVALUATION_STATUSES.map(() => '?').join(', ');
    const duplicate = this.database.db
      .prepare(
        `SELECT id, request_number, status FROM revaluation_requests
         WHERE result_id = ? AND status IN (${placeholders})`
      )
      .get(params.resultId, ...ACTIVE_REVALUATION_STATUSES) as
      | { id: string; request_number: string; status: string }
      | undefined;

    if (duplicate) {
      throw new DomainError(
        `An active revaluation request (${duplicate.request_number}, status ${duplicate.status}) already exists for this result`,
        409,
        'DUPLICATE_REVALUATION'
      );
    }

    // Assign relevant examiner for this subject
    const assignedRow = this.database.db
      .prepare(
        `SELECT ea.examiner_user_id
         FROM exam_assignments ea
         JOIN exam_schedules es ON es.id = ea.schedule_id
         WHERE es.subject_id = ?
         ORDER BY ea.assigned_at ASC
         LIMIT 1`
      )
      .get(result.subjectId) as { examiner_user_id: string } | undefined;

    const fallbackExaminer = this.database.db
      .prepare(`SELECT id FROM users WHERE role = 'EXAMINER' ORDER BY created_at ASC LIMIT 1`)
      .get() as { id: string } | undefined;

    const assignedExaminerId = assignedRow
      ? String(assignedRow.examiner_user_id)
      : fallbackExaminer
      ? String(fallbackExaminer.id)
      : null;

    const id = `rev_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const requestNumber = `REV-${new Date().getFullYear()}-${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`;
    const now = new Date().toISOString();

    this.database.db
      .prepare(
        `INSERT INTO revaluation_requests
          (id, request_number, student_id, result_id, result_version, original_marks, reason,
           status, assigned_examiner_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, ?, ?)`
      )
      .run(
        id,
        requestNumber,
        actor.studentId,
        result.id,
        result.version,
        result.obtainedMarks,
        params.reason.trim(),
        assignedExaminerId,
        now,
        now
      );

    if (params.attachment) {
      this.attachments.saveAttachment({
        revaluationId: id,
        uploadedByUserId: actor.id,
        upload: params.attachment,
      });
    }

    if (assignedExaminerId) {
      this.notifications.notifyUser({
        userId: assignedExaminerId,
        category: NotificationCategory.REVALUATION,
        priority: NotificationPriority.HIGH,
        title: `New Revaluation Request: ${requestNumber}`,
        message: `${result.studentName} (${result.registrationNumber}) requested revaluation for ${result.subjectCode} (${result.obtainedMarks}/${result.maxMarks}).`,
        linkPath: '/revaluations',
        entityType: 'revaluation',
        entityId: id,
      });
    }

    this.notifications.notifyUsersByRole([UserRole.CONTROLLER], {
      category: NotificationCategory.REVALUATION,
      priority: NotificationPriority.NORMAL,
      title: `Pending Revaluation: ${requestNumber}`,
      message: `Revaluation submitted for ${result.subjectCode} by ${result.registrationNumber}.`,
      linkPath: '/revaluations',
      entityType: 'revaluation',
      entityId: id,
    });

    return this.getById(id, actor);
  }

  public submitExaminerRecommendation(
    revaluationId: string,
    params: {
      recommendation: 'APPROVE' | 'REJECT' | 'EVIDENCE_REQUIRED';
      recommendedMarks?: number | null;
      notes: string;
    },
    actor: UserProfile
  ): RevaluationRecord {
    if (actor.role !== UserRole.EXAMINER && actor.role !== UserRole.SUPER_ADMIN) {
      throw new DomainError('Only assigned Examiners can submit revaluation recommendations', 403);
    }

    const rec = this.getById(revaluationId, actor);
    if (
      rec.status === RevaluationStatus.COMPLETED ||
      rec.status === RevaluationStatus.REJECTED ||
      rec.status === RevaluationStatus.CORRECTION_IN_PROGRESS
    ) {
      throw new DomainError('This revaluation request is already finalized or locked', 400);
    }

    if (!params.notes?.trim() || params.notes.trim().length < 8) {
      throw new DomainError('Please provide detailed examiner review notes (min 8 chars)', 400);
    }

    let nextMarks: number | null = null;
    if (params.recommendation === 'APPROVE') {
      if (
        params.recommendedMarks == null ||
        !Number.isFinite(params.recommendedMarks) ||
        params.recommendedMarks < 0 ||
        params.recommendedMarks > rec.maxMarks
      ) {
        throw new DomainError(
          `Recommended marks must be between 0 and ${rec.maxMarks}`,
          400
        );
      }
      if (params.recommendedMarks === rec.currentMarks) {
        throw new DomainError(
          'Recommended marks must differ from current marks when recommending approval',
          400
        );
      }
      nextMarks = params.recommendedMarks;
    }

    const nextStatus =
      params.recommendation === 'EVIDENCE_REQUIRED'
        ? RevaluationStatus.EVIDENCE_REQUIRED
        : RevaluationStatus.RECOMMENDED;
    const now = new Date().toISOString();

    this.database.db
      .prepare(
        `UPDATE revaluation_requests
         SET status = ?, examiner_recommendation = ?, recommended_marks = ?, examiner_notes = ?,
             assigned_examiner_id = COALESCE(assigned_examiner_id, ?), updated_at = ?
         WHERE id = ?`
      )
      .run(
        nextStatus,
        params.recommendation,
        nextMarks,
        params.notes.trim(),
        actor.id,
        now,
        revaluationId
      );

    // Notify student of status update
    this.notifications.notifyStudentByStudentId(rec.studentId, {
      category: NotificationCategory.REVALUATION,
      priority: NotificationPriority.NORMAL,
      title: `Revaluation Update (${rec.requestNumber})`,
      message:
        nextStatus === RevaluationStatus.EVIDENCE_REQUIRED
          ? `Examiner requested supporting information for ${rec.subjectCode}: ${params.notes.trim()}`
          : `Examiner completed review of ${rec.subjectCode} and forwarded recommendation to the Examination Controller.`,
      linkPath: '/revaluations',
      entityType: 'revaluation',
      entityId: revaluationId,
    });

    if (nextStatus === RevaluationStatus.RECOMMENDED) {
      this.notifications.notifyUsersByRole([UserRole.CONTROLLER, UserRole.SUPER_ADMIN], {
        category: NotificationCategory.REVALUATION,
        priority: NotificationPriority.HIGH,
        title: `Examiner Recommendation Ready: ${rec.requestNumber}`,
        message: `${actor.fullName} recommended ${params.recommendation} for ${rec.subjectCode} (${rec.registrationNumber})${
          nextMarks != null ? ` → proposed ${nextMarks}/${rec.maxMarks}` : ''
        }.`,
        linkPath: '/revaluations',
        entityType: 'revaluation',
        entityId: revaluationId,
      });
    }

    return this.getById(revaluationId, actor);
  }

  /**
   * Controller authorizes or rejects a revaluation.
   * CRITICAL SECURITY RULE: Authorizing a revaluation NEVER modifies published marks directly!
   * If initiateCorrection is true, it creates a formal CorrectionRequest in LedgerService
   * which still requires independent Examiner + Controller Ed25519 signatures to finalize.
   */
  public submitControllerDecision(
    revaluationId: string,
    params: {
      decision: 'APPROVED_FOR_CORRECTION' | 'REJECTED';
      notes: string;
      proposedMarks?: number;
      initiateCorrection?: boolean;
    },
    actor: UserProfile
  ): { revaluation: RevaluationRecord; correctionId: string | null } {
    if (actor.role !== UserRole.CONTROLLER && actor.role !== UserRole.SUPER_ADMIN) {
      throw new DomainError(
        'Only the Examination Controller or Super Admin can issue revaluation decisions',
        403
      );
    }

    const rec = this.getById(revaluationId, actor);
    if (
      rec.status === RevaluationStatus.COMPLETED ||
      rec.status === RevaluationStatus.REJECTED ||
      rec.linkedCorrectionId
    ) {
      throw new DomainError('This revaluation request already has a final decision or linked correction', 409);
    }

    if (!params.notes?.trim() || params.notes.trim().length < 8) {
      throw new DomainError('Controller decision explanation (min 8 chars) is required', 400);
    }

    const now = new Date().toISOString();
    let correctionId: string | null = null;
    let nextStatus =
      params.decision === 'REJECTED'
        ? RevaluationStatus.REJECTED
        : RevaluationStatus.APPROVED_FOR_CORRECTION;

    if (params.decision === 'APPROVED_FOR_CORRECTION' && params.initiateCorrection) {
      const targetMarks =
        params.proposedMarks ?? rec.recommendedMarks;
      if (targetMarks == null) {
        throw new DomainError(
          'Proposed marks are required to initiate the dual-signature correction workflow',
          400
        );
      }

      const correction = this.ledgerService.createCorrectionRequest({
        resultId: rec.resultId,
        proposedMarks: targetMarks,
        reason: `[Revaluation ${rec.requestNumber}] ${params.notes.trim()}`,
        requestedByUserId: actor.id,
      });
      correctionId = correction.id;
      nextStatus = RevaluationStatus.CORRECTION_IN_PROGRESS;

      this.database.db
        .prepare(`UPDATE correction_requests SET linked_revaluation_id = ? WHERE id = ?`)
        .run(revaluationId, correction.id);
    }

    this.database.db
      .prepare(
        `UPDATE revaluation_requests
         SET status = ?, controller_decision = ?, controller_notes = ?,
             reviewed_by_controller_id = ?, linked_correction_id = COALESCE(?, linked_correction_id),
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        nextStatus,
        params.decision,
        params.notes.trim(),
        actor.id,
        correctionId,
        now,
        revaluationId
      );

    // Notify student
    this.notifications.notifyStudentByStudentId(rec.studentId, {
      category: NotificationCategory.REVALUATION,
      priority: NotificationPriority.HIGH,
      title: `Revaluation Decision: ${rec.requestNumber}`,
      message:
        params.decision === 'REJECTED'
          ? `Your revaluation for ${rec.subjectCode} was rejected: ${params.notes.trim()}`
          : correctionId
          ? `Revaluation for ${rec.subjectCode} approved for formal two-signature ledger correction (${correctionId}). Marks will update once both authorities sign.`
          : `Revaluation for ${rec.subjectCode} approved for correction workflow. Marks remain unchanged until dual-signed finalization.`,
      linkPath: '/revaluations',
      entityType: 'revaluation',
      entityId: revaluationId,
    });

    if (rec.assignedExaminerId) {
      this.notifications.notifyUser({
        userId: rec.assignedExaminerId,
        category: correctionId
          ? NotificationCategory.CORRECTION
          : NotificationCategory.REVALUATION,
        priority: NotificationPriority.HIGH,
        title: correctionId
          ? `Correction Awaiting Signature (${rec.subjectCode})`
          : `Controller Decision on ${rec.requestNumber}`,
        message: correctionId
          ? `Controller initiated correction ${correctionId} from ${rec.requestNumber}. Your Ed25519 signature is required.`
          : `Controller marked ${rec.requestNumber} as ${params.decision.replace(/_/g, ' ')}.`,
        linkPath: correctionId ? '/approvals/examiner' : '/revaluations',
        entityType: correctionId ? 'correction_request' : 'revaluation',
        entityId: correctionId ?? revaluationId,
      });
    }

    return {
      revaluation: this.getById(revaluationId, actor),
      correctionId,
    };
  }

  public syncOnCorrectionFinalized(params: {
    correctionRequestId: string;
    oldMarks: number;
    newMarks: number;
    newVersion: number;
  }): void {
    const rows = this.database.db
      .prepare(
        `SELECT id, request_number, student_id FROM revaluation_requests WHERE linked_correction_id = ?`
      )
      .all(params.correctionRequestId) as Array<{
      id: string;
      request_number: string;
      student_id: string;
    }>;

    const now = new Date().toISOString();
    for (const r of rows) {
      this.database.db
        .prepare(`UPDATE revaluation_requests SET status = 'COMPLETED', updated_at = ? WHERE id = ?`)
        .run(now, r.id);

      this.notifications.notifyStudentByStudentId(r.student_id, {
        category: NotificationCategory.REVALUATION,
        priority: NotificationPriority.HIGH,
        title: `Revaluation Completed: ${r.request_number}`,
        message: `Dual-signed correction finalized (${params.oldMarks} → ${params.newMarks}, v${params.newVersion}). Check Result Comparison & Proof of Result.`,
        linkPath: '/result-comparison',
        entityType: 'revaluation',
        entityId: r.id,
      });
    }
  }
}
