import crypto from 'node:crypto';
import { UserProfile, UserRole } from '../shared/types';
import {
  NotificationCategory,
  NotificationPriority,
  TicketCategory,
  TicketDetailRecord,
  TicketEventRecord,
  TicketMessageRecord,
  TicketRecord,
  TicketStatus,
} from '../shared/v2Types';
import { AttachmentStore, AttachmentUploadInput } from './attachmentStore';
import { VeriMarkDatabase } from './db';
import { DomainError, LedgerService } from './ledgerService';
import { NotificationService } from './notificationService';

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [
    TicketStatus.ASSIGNED,
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_FOR_STUDENT,
    TicketStatus.ESCALATED,
    TicketStatus.RESOLVED,
    TicketStatus.REJECTED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.ASSIGNED]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_FOR_STUDENT,
    TicketStatus.ESCALATED,
    TicketStatus.RESOLVED,
    TicketStatus.REJECTED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.IN_PROGRESS]: [
    TicketStatus.ASSIGNED,
    TicketStatus.WAITING_FOR_STUDENT,
    TicketStatus.ESCALATED,
    TicketStatus.RESOLVED,
    TicketStatus.REJECTED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.WAITING_FOR_STUDENT]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.ESCALATED,
    TicketStatus.RESOLVED,
    TicketStatus.REJECTED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.ESCALATED]: [
    TicketStatus.ASSIGNED,
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_FOR_STUDENT,
    TicketStatus.RESOLVED,
    TicketStatus.REJECTED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED, TicketStatus.REOPENED],
  [TicketStatus.REJECTED]: [TicketStatus.CLOSED, TicketStatus.REOPENED],
  [TicketStatus.CLOSED]: [TicketStatus.REOPENED],
  [TicketStatus.REOPENED]: [
    TicketStatus.ASSIGNED,
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_FOR_STUDENT,
    TicketStatus.ESCALATED,
    TicketStatus.RESOLVED,
    TicketStatus.REJECTED,
    TicketStatus.CLOSED,
  ],
};

export interface CreateTicketInput {
  category: TicketCategory;
  subject: string;
  description: string;
  relatedExamId?: string | null;
  relatedScheduleId?: string | null;
  relatedResultId?: string | null;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  attachment?: AttachmentUploadInput | null;
}

export class TicketService {
  constructor(
    private readonly database: VeriMarkDatabase,
    private readonly notifications: NotificationService,
    private readonly attachments: AttachmentStore,
    private readonly ledgerService: LedgerService
  ) {}

  private baseSelectSql(): string {
    return `
      SELECT t.*,
             creator.full_name AS created_by_name, creator.role AS created_by_role,
             st.full_name AS student_name, st.registration_number,
             ex.full_name AS assigned_examiner_name,
             sub.code AS related_subject_code,
             (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id) AS messages_count
      FROM tickets t
      JOIN users creator ON creator.id = t.created_by_user_id
      LEFT JOIN students st ON st.id = t.student_id
      LEFT JOIN users ex ON ex.id = t.assigned_examiner_id
      LEFT JOIN results res ON res.id = t.related_result_id
      LEFT JOIN subjects sub ON sub.id = res.subject_id
    `;
  }

  private mapTicketRow(row: Record<string, unknown>): TicketRecord {
    const status = String(row.status) as TicketStatus;
    const dueAt = String(row.due_at);
    const closedStatuses = new Set<TicketStatus>([
      TicketStatus.RESOLVED,
      TicketStatus.REJECTED,
      TicketStatus.CLOSED,
    ]);
    const isOverdue =
      !closedStatuses.has(status) && new Date(dueAt).getTime() < Date.now();

    return {
      id: String(row.id),
      ticketNumber: String(row.ticket_number),
      createdByUserId: String(row.created_by_user_id),
      createdByName: String(row.created_by_name),
      createdByRole: String(row.created_by_role),
      studentId: row.student_id ? String(row.student_id) : null,
      studentName: row.student_name ? String(row.student_name) : null,
      registrationNumber: row.registration_number ? String(row.registration_number) : null,
      assignedExaminerId: row.assigned_examiner_id ? String(row.assigned_examiner_id) : null,
      assignedExaminerName: row.assigned_examiner_name
        ? String(row.assigned_examiner_name)
        : null,
      category: String(row.category) as TicketCategory,
      subject: String(row.subject),
      description: String(row.description),
      relatedExamId: row.related_exam_id ? String(row.related_exam_id) : null,
      relatedScheduleId: row.related_schedule_id ? String(row.related_schedule_id) : null,
      relatedResultId: row.related_result_id ? String(row.related_result_id) : null,
      relatedResultVersion:
        row.related_result_version != null ? Number(row.related_result_version) : null,
      relatedSubjectCode: row.related_subject_code ? String(row.related_subject_code) : null,
      status,
      priority: String(row.priority) as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
      recommendedMarks:
        row.recommended_marks != null ? Number(row.recommended_marks) : null,
      recommendationNote: row.recommendation_note ? String(row.recommendation_note) : null,
      resolutionReason: row.resolution_reason ? String(row.resolution_reason) : null,
      linkedCorrectionId: row.linked_correction_id ? String(row.linked_correction_id) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      dueAt,
      isOverdue,
      messagesCount: Number(row.messages_count ?? 0),
    };
  }

  private recordEvent(
    ticketId: string,
    actorUserId: string,
    eventType: string,
    fromStatus: string | null,
    toStatus: string | null,
    detail: string
  ): void {
    const id = `tev_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    this.database.db
      .prepare(
        `INSERT INTO ticket_events (id, ticket_id, actor_user_id, event_type, from_status, to_status, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, ticketId, actorUserId, eventType, fromStatus, toStatus, detail, new Date().toISOString());
  }

  private assertCanViewTicket(ticket: TicketRecord, user: UserProfile): void {
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.CONTROLLER) {
      return;
    }
    if (user.role === UserRole.STUDENT) {
      if (ticket.createdByUserId !== user.id && ticket.studentId !== user.studentId) {
        throw new DomainError(
          'You do not have permission to view another student’s private ticket',
          403,
          'FORBIDDEN'
        );
      }
      return;
    }
    if (user.role === UserRole.EXAMINER) {
      if (
        ticket.assignedExaminerId !== user.id &&
        ticket.createdByUserId !== user.id
      ) {
        throw new DomainError(
          'Examiners may only inspect tickets assigned to them or raised by them',
          403,
          'FORBIDDEN'
        );
      }
    }
  }

  private findDefaultExaminerForResult(resultId: string | null): string | null {
    if (resultId) {
      const res = this.database.db
        .prepare(`SELECT subject_id FROM results WHERE id = ?`)
        .get(resultId) as { subject_id: string } | undefined;
      if (res) {
        const assigned = this.database.db
          .prepare(
            `SELECT ea.examiner_user_id
             FROM exam_assignments ea
             JOIN exam_schedules es ON es.id = ea.schedule_id
             WHERE es.subject_id = ?
             ORDER BY ea.assigned_at ASC
             LIMIT 1`
          )
          .get(res.subject_id) as { examiner_user_id: string } | undefined;
        if (assigned) return String(assigned.examiner_user_id);
      }
    }
    const firstExaminer = this.database.db
      .prepare(`SELECT id FROM users WHERE role = 'EXAMINER' ORDER BY created_at ASC LIMIT 1`)
      .get() as { id: string } | undefined;
    return firstExaminer ? String(firstExaminer.id) : null;
  }

  public listTickets(
    user: UserProfile,
    filters?: { status?: string; category?: string; overdueOnly?: boolean }
  ): TicketRecord[] {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (user.role === UserRole.STUDENT) {
      where.push('(t.created_by_user_id = ? OR t.student_id = ?)');
      params.push(user.id, user.studentId ?? '__none__');
    } else if (user.role === UserRole.EXAMINER) {
      where.push('(t.assigned_examiner_id = ? OR t.created_by_user_id = ?)');
      params.push(user.id, user.id);
    }

    if (filters?.status && filters.status !== 'ALL') {
      where.push('t.status = ?');
      params.push(filters.status);
    }
    if (filters?.category && filters.category !== 'ALL') {
      where.push('t.category = ?');
      params.push(filters.category);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.database.db
      .prepare(`${this.baseSelectSql()} ${whereSql} ORDER BY t.updated_at DESC`)
      .all(...params) as Record<string, unknown>[];

    let mapped = rows.map((r) => this.mapTicketRow(r));
    if (filters?.overdueOnly) {
      mapped = mapped.filter((t) => t.isOverdue);
    }
    return mapped;
  }

  public getTicketDetail(ticketId: string, user: UserProfile): TicketDetailRecord {
    const row = this.database.db
      .prepare(`${this.baseSelectSql()} WHERE t.id = ?`)
      .get(ticketId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new DomainError('Support ticket not found', 404, 'TICKET_NOT_FOUND');
    }

    const ticket = this.mapTicketRow(row);
    this.assertCanViewTicket(ticket, user);

    // Students never see staff-only internal investigation notes
    const msgSql =
      user.role === UserRole.STUDENT
        ? `SELECT m.*, u.full_name AS sender_name, u.role AS sender_role
           FROM ticket_messages m JOIN users u ON u.id = m.sender_user_id
           WHERE m.ticket_id = ? AND m.is_internal_note = 0
           ORDER BY m.created_at ASC`
        : `SELECT m.*, u.full_name AS sender_name, u.role AS sender_role
           FROM ticket_messages m JOIN users u ON u.id = m.sender_user_id
           WHERE m.ticket_id = ?
           ORDER BY m.created_at ASC`;

    const msgRows = this.database.db.prepare(msgSql).all(ticketId) as Record<
      string,
      unknown
    >[];
    const messages: TicketMessageRecord[] = msgRows.map((m) => ({
      id: String(m.id),
      ticketId: String(m.ticket_id),
      senderUserId: String(m.sender_user_id),
      senderName: String(m.sender_name),
      senderRole: String(m.sender_role),
      body: String(m.body),
      isInternalNote: Number(m.is_internal_note) === 1,
      createdAt: String(m.created_at),
    }));

    const evRows = this.database.db
      .prepare(
        `SELECT e.*, u.full_name AS actor_name
         FROM ticket_events e
         JOIN users u ON u.id = e.actor_user_id
         WHERE e.ticket_id = ?
         ORDER BY e.created_at ASC`
      )
      .all(ticketId) as Record<string, unknown>[];

    const events: TicketEventRecord[] = evRows.map((e) => ({
      id: String(e.id),
      ticketId: String(e.ticket_id),
      actorUserId: String(e.actor_user_id),
      actorName: String(e.actor_name),
      eventType: String(e.event_type),
      fromStatus: e.from_status ? String(e.from_status) : null,
      toStatus: e.to_status ? String(e.to_status) : null,
      detail: String(e.detail),
      createdAt: String(e.created_at),
    }));

    const linkedResult = ticket.relatedResultId
      ? this.ledgerService.getResultById(ticket.relatedResultId)
      : null;

    const linkedCorrection = ticket.linkedCorrectionId
      ? this.ledgerService
          .listCorrectionRequests()
          .find((c) => c.id === ticket.linkedCorrectionId) ?? null
      : null;

    return {
      ...ticket,
      messages,
      events,
      attachments: this.attachments.listByTicket(ticketId),
      linkedResult,
      linkedCorrection,
    };
  }

  public createTicket(input: CreateTicketInput, actor: UserProfile): TicketDetailRecord {
    const validCategories = new Set(Object.values(TicketCategory));
    if (!validCategories.has(input.category)) {
      throw new DomainError('Invalid ticket category', 400, 'INVALID_CATEGORY');
    }
    if (!input.subject?.trim() || input.subject.trim().length < 5) {
      throw new DomainError('Ticket subject must be at least 5 characters', 400);
    }
    if (!input.description?.trim() || input.description.trim().length < 12) {
      throw new DomainError(
        'Please provide a detailed ticket description (at least 12 characters)',
        400
      );
    }

    let relatedResultVersion: number | null = null;
    let studentId: string | null = actor.role === UserRole.STUDENT ? actor.studentId : null;

    if (input.relatedResultId) {
      const res = this.ledgerService.getResultById(input.relatedResultId);
      if (!res) {
        throw new DomainError('Selected result record was not found', 404);
      }
      if (actor.role === UserRole.STUDENT && res.studentId !== actor.studentId) {
        throw new DomainError(
          'Students can only link tickets to their own published results',
          403,
          'FORBIDDEN'
        );
      }
      relatedResultVersion = res.version;
      if (!studentId) studentId = res.studentId;
    }

    const assignedExaminerId =
      actor.role === UserRole.STUDENT
        ? this.findDefaultExaminerForResult(input.relatedResultId ?? null)
        : null;
    const initialStatus =
      assignedExaminerId ? TicketStatus.ASSIGNED : TicketStatus.OPEN;

    const id = `tkt_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const ticketNumber = `TKT-${new Date().getFullYear()}-${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`;
    const now = new Date().toISOString();
    const dueAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const priority =
      input.priority ??
      (input.category === TicketCategory.INCORRECT_MARKS ||
      input.category === TicketCategory.RESULT_VERIFICATION
        ? 'HIGH'
        : 'MEDIUM');

    this.database.runInTransaction(() => {
      this.database.db
        .prepare(
          `INSERT INTO tickets
            (id, ticket_number, created_by_user_id, student_id, assigned_examiner_id, category,
             subject, description, related_exam_id, related_schedule_id, related_result_id,
             related_result_version, status, priority, created_at, updated_at, due_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          ticketNumber,
          actor.id,
          studentId,
          assignedExaminerId,
          input.category,
          input.subject.trim(),
          input.description.trim(),
          input.relatedExamId || null,
          input.relatedScheduleId || null,
          input.relatedResultId || null,
          relatedResultVersion,
          initialStatus,
          priority,
          now,
          now,
          dueAt
        );

      this.recordEvent(
        id,
        actor.id,
        'CREATED',
        null,
        initialStatus,
        `Ticket ${ticketNumber} created (${input.category.replace(/_/g, ' ')})${
          relatedResultVersion ? ` linked to Result v${relatedResultVersion}` : ''
        }`
      );
    });

    if (input.attachment) {
      this.attachments.saveAttachment({
        ticketId: id,
        uploadedByUserId: actor.id,
        upload: input.attachment,
      });
    }

    if (assignedExaminerId) {
      this.notifications.notifyUser({
        userId: assignedExaminerId,
        category: NotificationCategory.TICKET,
        priority: priority === 'HIGH' || priority === 'URGENT'
          ? NotificationPriority.HIGH
          : NotificationPriority.NORMAL,
        title: `Student Ticket Assigned: ${ticketNumber}`,
        message: `${actor.fullName} raised "${input.subject.trim()}" (${input.category.replace(
          /_/g,
          ' '
        )}).`,
        linkPath: `/tickets?id=${id}`,
        entityType: 'ticket',
        entityId: id,
      });
    }

    if (actor.role === UserRole.EXAMINER) {
      this.notifications.notifyUsersByRole([UserRole.CONTROLLER, UserRole.SUPER_ADMIN], {
        category: NotificationCategory.TICKET,
        priority: NotificationPriority.HIGH,
        title: `Examiner Operational Ticket: ${ticketNumber}`,
        message: `${actor.fullName} reported: ${input.subject.trim()}`,
        linkPath: `/tickets?id=${id}`,
        entityType: 'ticket',
        entityId: id,
      });
    }

    return this.getTicketDetail(id, actor);
  }

  public addMessage(
    ticketId: string,
    body: string,
    isInternalNote: boolean,
    actor: UserProfile,
    attachment?: AttachmentUploadInput | null
  ): TicketDetailRecord {
    const ticket = this.getTicketDetail(ticketId, actor);
    if (!body?.trim()) {
      throw new DomainError('Message body cannot be empty', 400);
    }

    const internal = actor.role === UserRole.STUDENT ? false : Boolean(isInternalNote);
    const msgId = `tmg_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();

    this.database.runInTransaction(() => {
      this.database.db
        .prepare(
          `INSERT INTO ticket_messages (id, ticket_id, sender_user_id, body, is_internal_note, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(msgId, ticketId, actor.id, body.trim(), internal ? 1 : 0, now);

      // If student replied while WAITING_FOR_STUDENT, move back to IN_PROGRESS
      let nextStatus = ticket.status;
      if (
        actor.role === UserRole.STUDENT &&
        ticket.status === TicketStatus.WAITING_FOR_STUDENT
      ) {
        nextStatus = TicketStatus.IN_PROGRESS;
        this.recordEvent(
          ticketId,
          actor.id,
          'STATUS_CHANGED',
          ticket.status,
          nextStatus,
          'Student provided requested response/evidence'
        );
      } else if (
        actor.role !== UserRole.STUDENT &&
        !internal &&
        (ticket.status === TicketStatus.OPEN || ticket.status === TicketStatus.ASSIGNED)
      ) {
        nextStatus = TicketStatus.IN_PROGRESS;
        this.recordEvent(
          ticketId,
          actor.id,
          'STATUS_CHANGED',
          ticket.status,
          nextStatus,
          `${actor.fullName} began investigation`
        );
      }

      this.database.db
        .prepare(`UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?`)
        .run(nextStatus, now, ticketId);
    });

    if (attachment) {
      this.attachments.saveAttachment({
        ticketId,
        uploadedByUserId: actor.id,
        upload: attachment,
      });
    }

    // Notifications (never leak internal notes to students)
    if (!internal) {
      if (actor.role !== UserRole.STUDENT && ticket.studentId) {
        this.notifications.notifyStudentByStudentId(ticket.studentId, {
          category: NotificationCategory.TICKET,
          priority: NotificationPriority.NORMAL,
          title: `Ticket Response Received: ${ticket.ticketNumber}`,
          message: `${actor.fullName} replied on "${ticket.subject}".`,
          linkPath: `/tickets?id=${ticketId}`,
          entityType: 'ticket',
          entityId: ticketId,
        });
      } else if (actor.role === UserRole.STUDENT && ticket.assignedExaminerId) {
        this.notifications.notifyUser({
          userId: ticket.assignedExaminerId,
          category: NotificationCategory.TICKET,
          priority: NotificationPriority.NORMAL,
          title: `Student Reply on ${ticket.ticketNumber}`,
          message: `${actor.fullName} posted a follow-up on "${ticket.subject}".`,
          linkPath: `/tickets?id=${ticketId}`,
          entityType: 'ticket',
          entityId: ticketId,
        });
      }
    }

    return this.getTicketDetail(ticketId, actor);
  }

  public updateStatusOrAssignment(
    ticketId: string,
    payload: {
      status?: TicketStatus;
      assignedExaminerId?: string | null;
      recommendedMarks?: number | null;
      recommendationNote?: string | null;
      resolutionReason?: string | null;
    },
    actor: UserProfile
  ): TicketDetailRecord {
    const ticket = this.getTicketDetail(ticketId, actor);
    if (actor.role === UserRole.STUDENT) {
      throw new DomainError('Students cannot directly modify staff ticket status', 403);
    }

    const now = new Date().toISOString();
    let nextStatus = ticket.status;
    let nextAssigned = ticket.assignedExaminerId;
    const eventsToLog: Array<{ type: string; from: string | null; to: string | null; detail: string }> = [];

    if (payload.assignedExaminerId !== undefined) {
      if (actor.role !== UserRole.CONTROLLER && actor.role !== UserRole.SUPER_ADMIN) {
        throw new DomainError('Only Examination Controller or Admin can reassign tickets', 403);
      }
      if (payload.assignedExaminerId) {
        const ex = this.database.db
          .prepare(`SELECT id, full_name, role FROM users WHERE id = ?`)
          .get(payload.assignedExaminerId) as { id: string; full_name: string; role: string } | undefined;
        if (!ex || ex.role !== UserRole.EXAMINER) {
          throw new DomainError('Assignee must be an active Examiner', 400);
        }
        nextAssigned = ex.id;
        if (nextStatus === TicketStatus.OPEN) nextStatus = TicketStatus.ASSIGNED;
        eventsToLog.push({
          type: 'ASSIGNED',
          from: ticket.status,
          to: nextStatus,
          detail: `Assigned ticket to Examiner ${ex.full_name}`,
        });
      }
    }

    if (payload.status && payload.status !== ticket.status) {
      const allowed = VALID_TRANSITIONS[ticket.status] ?? [];
      if (!allowed.includes(payload.status)) {
        throw new DomainError(
          `Invalid ticket status transition: ${ticket.status} → ${payload.status}`,
          400,
          'INVALID_STATUS_TRANSITION'
        );
      }
      if (
        (payload.status === TicketStatus.RESOLVED ||
          payload.status === TicketStatus.REJECTED) &&
        actor.role === UserRole.EXAMINER &&
        ticket.category === TicketCategory.INCORRECT_MARKS
      ) {
        throw new DomainError(
          'Marks dispute tickets must be escalated to the Examination Controller for formal review & two-signature correction',
          403,
          'ESCALATION_REQUIRED'
        );
      }
      if (
        (payload.status === TicketStatus.RESOLVED ||
          payload.status === TicketStatus.REJECTED) &&
        !payload.resolutionReason?.trim()
      ) {
        throw new DomainError(
          'A written resolution or rejection reason is required',
          400,
          'REASON_REQUIRED'
        );
      }
      eventsToLog.push({
        type: 'STATUS_CHANGED',
        from: ticket.status,
        to: payload.status,
        detail:
          payload.resolutionReason?.trim() ||
          `Status updated from ${ticket.status} to ${payload.status}`,
      });
      nextStatus = payload.status;
    }

    if (
      payload.recommendedMarks !== undefined ||
      payload.recommendationNote !== undefined
    ) {
      if (payload.recommendedMarks != null && ticket.linkedResult) {
        if (
          !Number.isFinite(payload.recommendedMarks) ||
          payload.recommendedMarks < 0 ||
          payload.recommendedMarks > ticket.linkedResult.maxMarks
        ) {
          throw new DomainError(
            `Recommended marks must be between 0 and ${ticket.linkedResult.maxMarks}`,
            400
          );
        }
      }
      eventsToLog.push({
        type: 'RECOMMENDATION_RECORDED',
        from: ticket.status,
        to: nextStatus,
        detail: `Examiner recorded recommendation${
          payload.recommendedMarks != null ? ` (proposed marks: ${payload.recommendedMarks})` : ''
        }${payload.recommendationNote ? `: ${payload.recommendationNote.trim()}` : ''}`,
      });
    }

    this.database.runInTransaction(() => {
      this.database.db
        .prepare(
          `UPDATE tickets
           SET status = ?, assigned_examiner_id = ?, recommended_marks = ?,
               recommendation_note = ?, resolution_reason = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          nextStatus,
          nextAssigned,
          payload.recommendedMarks !== undefined
            ? payload.recommendedMarks
            : ticket.recommendedMarks,
          payload.recommendationNote !== undefined
            ? payload.recommendationNote?.trim() || null
            : ticket.recommendationNote,
          payload.resolutionReason !== undefined
            ? payload.resolutionReason?.trim() || null
            : ticket.resolutionReason,
          now,
          ticketId
        );

      for (const ev of eventsToLog) {
        this.recordEvent(ticketId, actor.id, ev.type, ev.from, ev.to, ev.detail);
      }
    });

    if (nextAssigned && nextAssigned !== ticket.assignedExaminerId) {
      this.notifications.notifyUser({
        userId: nextAssigned,
        category: NotificationCategory.TICKET,
        priority: NotificationPriority.HIGH,
        title: `Ticket Assigned: ${ticket.ticketNumber}`,
        message: `${actor.fullName} assigned "${ticket.subject}" to your investigation queue.`,
        linkPath: `/tickets?id=${ticketId}`,
        entityType: 'ticket',
        entityId: ticketId,
      });
    }

    if (nextStatus !== ticket.status && ticket.studentId) {
      this.notifications.notifyStudentByStudentId(ticket.studentId, {
        category: NotificationCategory.TICKET,
        priority: NotificationPriority.NORMAL,
        title: `Ticket ${ticket.ticketNumber}: ${nextStatus.replace(/_/g, ' ')}`,
        message:
          payload.resolutionReason?.trim() ||
          `Your ticket "${ticket.subject}" is now ${nextStatus.replace(/_/g, ' ')}.`,
        linkPath: `/tickets?id=${ticketId}`,
        entityType: 'ticket',
        entityId: ticketId,
      });
    }

    return this.getTicketDetail(ticketId, actor);
  }

  public escalateTicket(
    ticketId: string,
    reason: string,
    recommendedMarks: number | null,
    actor: UserProfile
  ): TicketDetailRecord {
    const ticket = this.getTicketDetail(ticketId, actor);
    if (actor.role === UserRole.STUDENT) {
      throw new DomainError('Only authorized staff can escalate tickets', 403);
    }
    if (!reason?.trim() || reason.trim().length < 8) {
      throw new DomainError('Escalation reason (min 8 characters) is required', 400);
    }

    const now = new Date().toISOString();
    this.database.runInTransaction(() => {
      this.database.db
        .prepare(
          `UPDATE tickets
           SET status = 'ESCALATED', recommended_marks = COALESCE(?, recommended_marks),
               recommendation_note = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(recommendedMarks, reason.trim(), now, ticketId);

      this.recordEvent(
        ticketId,
        actor.id,
        'ESCALATED',
        ticket.status,
        TicketStatus.ESCALATED,
        `Escalated to Examination Controller: ${reason.trim()}${
          recommendedMarks != null ? ` (Recommended marks: ${recommendedMarks})` : ''
        }`
      );
    });

    this.notifications.notifyUsersByRole([UserRole.CONTROLLER, UserRole.SUPER_ADMIN], {
      category: NotificationCategory.TICKET,
      priority: NotificationPriority.HIGH,
      title: `Escalated Ticket: ${ticket.ticketNumber}`,
      message: `${actor.fullName} escalated "${ticket.subject}" for Controller review.`,
      linkPath: `/tickets?id=${ticketId}`,
      entityType: 'ticket',
      entityId: ticketId,
    });

    if (ticket.studentId) {
      this.notifications.notifyStudentByStudentId(ticket.studentId, {
        category: NotificationCategory.TICKET,
        priority: NotificationPriority.NORMAL,
        title: `Ticket Escalated to Controller: ${ticket.ticketNumber}`,
        message: `Your ticket "${ticket.subject}" has been escalated to the Examination Controller for formal review.`,
        linkPath: `/tickets?id=${ticketId}`,
        entityType: 'ticket',
        entityId: ticketId,
      });
    }

    return this.getTicketDetail(ticketId, actor);
  }

  public reopenTicket(
    ticketId: string,
    reason: string,
    actor: UserProfile
  ): TicketDetailRecord {
    const ticket = this.getTicketDetail(ticketId, actor);
    if (
      ticket.status !== TicketStatus.RESOLVED &&
      ticket.status !== TicketStatus.REJECTED &&
      ticket.status !== TicketStatus.CLOSED
    ) {
      throw new DomainError(
        'Only resolved, rejected, or closed tickets can be reopened',
        400
      );
    }
    if (!reason?.trim() || reason.trim().length < 6) {
      throw new DomainError('Please explain why you are reopening this ticket', 400);
    }

    const now = new Date().toISOString();
    this.database.runInTransaction(() => {
      this.database.db
        .prepare(`UPDATE tickets SET status = 'REOPENED', updated_at = ? WHERE id = ?`)
        .run(now, ticketId);

      this.recordEvent(
        ticketId,
        actor.id,
        'REOPENED',
        ticket.status,
        TicketStatus.REOPENED,
        `Reopened by ${actor.fullName}: ${reason.trim()}`
      );
    });

    if (ticket.assignedExaminerId) {
      this.notifications.notifyUser({
        userId: ticket.assignedExaminerId,
        category: NotificationCategory.TICKET,
        priority: NotificationPriority.HIGH,
        title: `Ticket Reopened: ${ticket.ticketNumber}`,
        message: `${actor.fullName} reopened "${ticket.subject}": ${reason.trim()}`,
        linkPath: `/tickets?id=${ticketId}`,
        entityType: 'ticket',
        entityId: ticketId,
      });
    }

    return this.getTicketDetail(ticketId, actor);
  }

  /**
   * FEATURE 11 — TICKET-TO-CORRECTION WORKFLOW
   * Creates a formal CorrectionRequest locked to the exact result version —
   * NEVER alters marks directly! Still requires independent Examiner + Controller Ed25519 signatures.
   */
  public initiateCorrectionFromTicket(
    ticketId: string,
    proposedMarks: number,
    reason: string,
    actor: UserProfile
  ): { ticket: TicketDetailRecord; correctionId: string } {
    if (actor.role !== UserRole.CONTROLLER && actor.role !== UserRole.SUPER_ADMIN) {
      throw new DomainError(
        'Only the Examination Controller or Super Admin can initiate a formal correction request from a ticket',
        403
      );
    }

    const ticket = this.getTicketDetail(ticketId, actor);
    if (!ticket.relatedResultId) {
      throw new DomainError(
        'This ticket is not linked to a published examination result',
        400,
        'NO_LINKED_RESULT'
      );
    }
    if (ticket.linkedCorrectionId) {
      throw new DomainError(
        `Correction request ${ticket.linkedCorrectionId} is already linked to this ticket`,
        409,
        'CORRECTION_ALREADY_LINKED'
      );
    }

    const correction = this.ledgerService.createCorrectionRequest({
      resultId: ticket.relatedResultId,
      proposedMarks,
      reason: `[Ticket ${ticket.ticketNumber}] ${reason.trim()}`,
      requestedByUserId: actor.id,
    });

    const now = new Date().toISOString();
    this.database.runInTransaction(() => {
      this.database.db
        .prepare(`UPDATE correction_requests SET linked_ticket_id = ? WHERE id = ?`)
        .run(ticketId, correction.id);

      this.database.db
        .prepare(
          `UPDATE tickets
           SET linked_correction_id = ?, recommended_marks = ?, status = 'IN_PROGRESS', updated_at = ?
           WHERE id = ?`
        )
        .run(correction.id, proposedMarks, now, ticketId);

      this.recordEvent(
        ticketId,
        actor.id,
        'CORRECTION_INITIATED',
        ticket.status,
        TicketStatus.IN_PROGRESS,
        `Initiated two-authority cryptographic correction ${correction.id} (proposed marks: ${proposedMarks}). Marks remain unchanged until both Examiner and Controller sign and finalize.`
      );
    });

    // Notify Examiner + Controller that cryptographic signatures are required
    if (ticket.assignedExaminerId) {
      this.notifications.notifyUser({
        userId: ticket.assignedExaminerId,
        category: NotificationCategory.CORRECTION,
        priority: NotificationPriority.HIGH,
        title: `Result Correction Awaiting Signature (${correction.subjectCode})`,
        message: `Correction ${correction.id} from Ticket ${ticket.ticketNumber} requires your Ed25519 browser signature.`,
        linkPath: '/approvals/examiner',
        entityType: 'correction_request',
        entityId: correction.id,
      });
    } else {
      this.notifications.notifyUsersByRole([UserRole.EXAMINER], {
        category: NotificationCategory.CORRECTION,
        priority: NotificationPriority.HIGH,
        title: `Result Correction Awaiting Signature (${correction.subjectCode})`,
        message: `Correction ${correction.id} from Ticket ${ticket.ticketNumber} requires Examiner Ed25519 signature.`,
        linkPath: '/approvals/examiner',
        entityType: 'correction_request',
        entityId: correction.id,
      });
    }

    return {
      ticket: this.getTicketDetail(ticketId, actor),
      correctionId: correction.id,
    };
  }

  /**
   * Synchronizes linked ticket(s) ONLY AFTER LedgerService.finalizeCorrection succeeds atomically.
   */
  public syncOnCorrectionFinalized(params: {
    correctionRequestId: string;
    actorUserId: string;
    oldMarks: number;
    newMarks: number;
    newVersion: number;
    newReceiptId: string;
    ledgerSequence: number;
  }): void {
    const linked = this.database.db
      .prepare(`SELECT id, ticket_number, student_id, status FROM tickets WHERE linked_correction_id = ?`)
      .all(params.correctionRequestId) as Array<{
      id: string;
      ticket_number: string;
      student_id: string | null;
      status: string;
    }>;

    const now = new Date().toISOString();
    for (const row of linked) {
      const reason = `Dual-signed cryptographic correction finalized on ledger block #${params.ledgerSequence}: marks updated from ${params.oldMarks} to ${params.newMarks} (v${params.newVersion}, Receipt ${params.newReceiptId}).`;
      this.database.runInTransaction(() => {
        this.database.db
          .prepare(
            `UPDATE tickets SET status = 'RESOLVED', resolution_reason = ?, updated_at = ? WHERE id = ?`
          )
          .run(reason, now, row.id);

        this.recordEvent(
          row.id,
          params.actorUserId,
          'CORRECTION_FINALIZED',
          row.status,
          TicketStatus.RESOLVED,
          reason
        );
      });

      if (row.student_id) {
        this.notifications.notifyStudentByStudentId(row.student_id, {
          category: NotificationCategory.CORRECTION,
          priority: NotificationPriority.HIGH,
          title: `Result Correction Finalized (${row.ticket_number})`,
          message: `Your disputed marks were officially updated from ${params.oldMarks} to ${params.newMarks} (v${params.newVersion}). Receipt ${params.newReceiptId} is now verifiable.`,
          linkPath: '/result-comparison',
          entityType: 'ticket',
          entityId: row.id,
        });
      }
    }
  }
}
