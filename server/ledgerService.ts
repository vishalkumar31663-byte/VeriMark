import crypto from 'node:crypto';
import {
  GENESIS_PREVIOUS_HASH,
  LEDGER_SCHEMA_VERSION,
  buildBlockHashPreimage,
  buildCorrectionSigningMessage,
  buildPayloadHashPreimage,
  buildReceiptFingerprintPreimage,
  canonicalJson,
} from '../shared/canonical';
import {
  ApprovalEvidence,
  CorrectionApprovedPayload,
  CorrectionRequestRecord,
  CorrectionSigningPayload,
  CorrectionStatus,
  LedgerEntryRecord,
  LedgerEventType,
  ReceiptRecord,
  ResultCorrectedPayload,
  ResultPublishedPayload,
  ResultRecord,
  TrustedCheckpoint,
  UserRole,
} from '../shared/types';
import { sha256Hex, verifyEd25519Hex } from './crypto';
import { VeriMarkDatabase } from './db';
import { ExternalTrustStore } from './trustStore';

export class DomainError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface PublishResultInput {
  registrationNumber: string;
  examId?: string;
  examCode?: string;
  academicSession: string;
  semester: number;
  subjectCode: string;
  subjectName: string;
  maxMarks: number;
  obtainedMarks: number;
  publishedAt?: string;
  publisherUserId: string;
}

export interface SubmitApprovalInput {
  correctionRequestId: string;
  approverUserId: string;
  approverRole: UserRole;
  keyId: string;
  signatureHex: string;
  decision: 'APPROVED' | 'REJECTED';
  comment?: string;
}

export class LedgerService {
  constructor(
    private readonly database: VeriMarkDatabase,
    private readonly trustStore: ExternalTrustStore
  ) {}

  private appendLedgerBlockLocked(
    eventType: LedgerEventType,
    payload: Record<string, unknown>,
    publisherId: string,
    timestamp: string
  ): LedgerEntryRecord {
    const db = this.database.db;
    const latest = db
      .prepare(
        `SELECT sequence, block_hash FROM ledger_entries ORDER BY sequence DESC LIMIT 1`
      )
      .get() as { sequence: number; block_hash: string } | undefined;

    const sequence = latest ? Number(latest.sequence) + 1 : 1;
    const previousHash = latest ? String(latest.block_hash) : GENESIS_PREVIOUS_HASH;
    const eventId = `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const payloadCanonical = canonicalJson(payload);
    const payloadHash = sha256Hex(buildPayloadHashPreimage(payload));

    const serverKeys = this.trustStore.getServerKeys();
    const publisherKeyId = serverKeys.publisherKeyId;
    const blockHash = sha256Hex(
      buildBlockHashPreimage({
        sequence,
        eventId,
        eventType,
        previousHash,
        payloadHash,
        publisherId,
        publisherKeyId,
        timestamp,
        schemaVersion: LEDGER_SCHEMA_VERSION,
      })
    );

    const { signature } = this.trustStore.signBlockHash(blockHash);

    db.prepare(
      `INSERT INTO ledger_entries (
        sequence, event_id, event_type, previous_hash, payload_hash, block_hash,
        publisher_id, publisher_key_id, signature, timestamp, schema_version, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sequence,
      eventId,
      eventType,
      previousHash,
      payloadHash,
      blockHash,
      publisherId,
      publisherKeyId,
      signature,
      timestamp,
      LEDGER_SCHEMA_VERSION,
      payloadCanonical
    );

    return {
      sequence,
      eventId,
      eventType,
      previousHash,
      payloadHash,
      blockHash,
      publisherId,
      publisherKeyId,
      signature,
      timestamp,
      schemaVersion: LEDGER_SCHEMA_VERSION,
      payload,
    };
  }

  private createReceiptLocked(
    resultId: string,
    version: number,
    entry: LedgerEntryRecord,
    createdAt: string
  ): ReceiptRecord {
    const receiptId = `VMK-${new Date(createdAt).getUTCFullYear()}-${String(
      entry.sequence
    ).padStart(4, '0')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const fingerprint = sha256Hex(
      buildReceiptFingerprintPreimage(receiptId, entry.payloadHash, entry.blockHash)
    );
    const shortFingerprint = fingerprint.slice(0, 16).toUpperCase();

    this.database.db
      .prepare(
        `INSERT INTO result_receipts (
          receipt_id, result_id, version, ledger_sequence, payload_hash, block_hash,
          fingerprint, short_fingerprint, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        receiptId,
        resultId,
        version,
        entry.sequence,
        entry.payloadHash,
        entry.blockHash,
        fingerprint,
        shortFingerprint,
        createdAt
      );

    return {
      receiptId,
      resultId,
      version,
      ledgerSequence: entry.sequence,
      payloadHash: entry.payloadHash,
      blockHash: entry.blockHash,
      fingerprint,
      shortFingerprint,
      createdAt,
    };
  }

  /**
   * Publishes a result into the append-only signed ledger, materializes current state,
   * creates a cryptographic receipt, and anchors an external signed checkpoint.
   * If checkpoint writing fails, the DB transaction rolls back completely so no
   * unanchored result is falsely reported as published or verified.
   */
  public publishResult(input: PublishResultInput): {
    result: ResultRecord;
    ledgerEntry: LedgerEntryRecord;
    receipt: ReceiptRecord;
    checkpoint: TrustedCheckpoint;
  } {
    const regNo = (input.registrationNumber ?? '').trim();
    const subjectCode = (input.subjectCode ?? '').trim().toUpperCase();
    const subjectName = (input.subjectName ?? '').trim();
    const academicSession = (input.academicSession ?? '').trim();
    const semester = Number(input.semester);
    const maxMarks = Number(input.maxMarks);
    const obtainedMarks = Number(input.obtainedMarks);

    if (!regNo) throw new DomainError('Student registration number is required');
    if (!subjectCode || !subjectName) {
      throw new DomainError('Subject code and subject name are required');
    }
    if (!academicSession) throw new DomainError('Academic session is required');
    if (!Number.isInteger(semester) || semester < 1 || semester > 12) {
      throw new DomainError('Semester must be an integer between 1 and 12');
    }
    if (!Number.isFinite(maxMarks) || maxMarks <= 0 || maxMarks > 1000) {
      throw new DomainError('Maximum marks must be between 1 and 1000');
    }
    if (!Number.isFinite(obtainedMarks) || obtainedMarks < 0 || obtainedMarks > maxMarks) {
      throw new DomainError(
        `Obtained marks (${obtainedMarks}) must be between 0 and maximum marks (${maxMarks})`
      );
    }

    const publishedAt = input.publishedAt
      ? new Date(input.publishedAt).toISOString()
      : new Date().toISOString();
    if (Number.isNaN(Date.parse(publishedAt))) {
      throw new DomainError('Invalid publication timestamp');
    }

    let createdResultId = '';
    let ledgerEntry!: LedgerEntryRecord;
    let receipt!: ReceiptRecord;
    let checkpoint!: TrustedCheckpoint;

    this.database.runInTransaction(() => {
      const db = this.database.db;

      const student = db
        .prepare(`SELECT * FROM students WHERE registration_number = ?`)
        .get(regNo) as
        | {
            id: string;
            registration_number: string;
            full_name: string;
            course: string;
            semester: number;
            academic_session: string;
          }
        | undefined;

      if (!student) {
        throw new DomainError(
          `Student with registration number "${regNo}" was not found`,
          404,
          'STUDENT_NOT_FOUND'
        );
      }

      // Resolve or create exam
      let exam:
        | { id: string; exam_code: string; title: string; academic_session: string; semester: number }
        | undefined;
      if (input.examId) {
        exam = db
          .prepare(`SELECT * FROM exams WHERE id = ? OR exam_code = ?`)
          .get(input.examId, input.examId) as typeof exam;
      } else if (input.examCode) {
        exam = db
          .prepare(`SELECT * FROM exams WHERE exam_code = ?`)
          .get(input.examCode) as typeof exam;
      }

      if (!exam) {
        const resolvedCode = (input.examCode || input.examId || `EXM-${academicSession}-S${semester}`)
          .trim()
          .toUpperCase();
        const newExamId = `exm_${crypto.randomUUID().slice(0, 8)}`;
        db.prepare(
          `INSERT INTO exams (id, exam_code, title, academic_session, semester, exam_date)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          newExamId,
          resolvedCode,
          `End-Term Examination (${academicSession} · Sem ${semester})`,
          academicSession,
          semester,
          publishedAt.slice(0, 10)
        );
        exam = {
          id: newExamId,
          exam_code: resolvedCode,
          title: `End-Term Examination (${academicSession} · Sem ${semester})`,
          academic_session: academicSession,
          semester,
        };
      }

      // Resolve or create subject
      let subject = db
        .prepare(`SELECT * FROM subjects WHERE code = ?`)
        .get(subjectCode) as
        | { id: string; code: string; name: string; max_marks: number; semester: number }
        | undefined;

      if (!subject) {
        const newSubjectId = `sub_${crypto.randomUUID().slice(0, 8)}`;
        db.prepare(
          `INSERT INTO subjects (id, code, name, max_marks, semester) VALUES (?, ?, ?, ?, ?)`
        ).run(newSubjectId, subjectCode, subjectName, maxMarks, semester);
        subject = {
          id: newSubjectId,
          code: subjectCode,
          name: subjectName,
          max_marks: maxMarks,
          semester,
        };
      }

      // Check duplicate publication for student+exam+subject
      const existing = db
        .prepare(
          `SELECT id FROM results WHERE student_id = ? AND exam_id = ? AND subject_id = ?`
        )
        .get(student.id, exam.id, subject.id) as { id: string } | undefined;

      if (existing) {
        throw new DomainError(
          `Result already published for ${regNo} in ${subjectCode} (${exam.exam_code}). Use the Dual-Authority Correction workflow to modify published marks.`,
          409,
          'DUPLICATE_RESULT'
        );
      }

      createdResultId = `res_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

      const payload: ResultPublishedPayload = {
        schemaVersion: LEDGER_SCHEMA_VERSION,
        resultId: createdResultId,
        studentId: student.id,
        registrationNumber: student.registration_number,
        studentName: student.full_name,
        course: student.course,
        examId: exam.id,
        examCode: exam.exam_code,
        academicSession,
        semester,
        subjectCode: subject.code,
        subjectName: subjectName || subject.name,
        maxMarks,
        obtainedMarks,
        version: 1,
        publishedAt,
      };

      ledgerEntry = this.appendLedgerBlockLocked(
        LedgerEventType.RESULT_PUBLISHED,
        payload as unknown as Record<string, unknown>,
        input.publisherUserId,
        publishedAt
      );

      // Materialize result first (with placeholder receipt id updated immediately below)
      const tempReceiptId = 'pending';
      db.prepare(
        `INSERT INTO results (
          id, student_id, exam_id, subject_id, academic_session, semester,
          max_marks, obtained_marks, version, status, latest_ledger_sequence,
          latest_receipt_id, published_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'PUBLISHED', ?, ?, ?, ?)`
      ).run(
        createdResultId,
        student.id,
        exam.id,
        subject.id,
        academicSession,
        semester,
        maxMarks,
        obtainedMarks,
        ledgerEntry.sequence,
        tempReceiptId,
        publishedAt,
        publishedAt
      );

      receipt = this.createReceiptLocked(createdResultId, 1, ledgerEntry, publishedAt);

      db.prepare(`UPDATE results SET latest_receipt_id = ? WHERE id = ?`).run(
        receipt.receiptId,
        createdResultId
      );

      // Anchor checkpoint INSIDE transaction boundary: if checkpoint write fails,
      // the exception rolls back the SQLite transaction cleanly!
      try {
        checkpoint = this.trustStore.anchorCheckpoint(
          ledgerEntry.sequence,
          ledgerEntry.blockHash
        );
      } catch (cpErr) {
        throw new DomainError(
          `Publication aborted: failed to anchor signed external checkpoint (${
            cpErr instanceof Error ? cpErr.message : 'I/O error'
          }). Database transaction rolled back to prevent unanchored result.`,
          503,
          'CHECKPOINT_ANCHOR_FAILED'
        );
      }
    });

    const result = this.getResultById(createdResultId)!;
    return { result, ledgerEntry, receipt, checkpoint };
  }

  public getResultById(resultId: string): ResultRecord | null {
    const row = this.database.db
      .prepare(
        `SELECT r.*,
                s.registration_number, s.full_name AS student_name, s.course,
                e.exam_code, e.title AS exam_title,
                sub.code AS subject_code, sub.name AS subject_name,
                rc.short_fingerprint
         FROM results r
         JOIN students s ON s.id = r.student_id
         JOIN exams e ON e.id = r.exam_id
         JOIN subjects sub ON sub.id = r.subject_id
         LEFT JOIN result_receipts rc ON rc.receipt_id = r.latest_receipt_id
         WHERE r.id = ?`
      )
      .get(resultId) as Record<string, unknown> | undefined;

    return row ? this.mapResultRow(row) : null;
  }

  public listResults(filters?: {
    studentId?: string;
    search?: string;
    semester?: number;
    course?: string;
  }): ResultRecord[] {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.studentId) {
      where.push('r.student_id = ?');
      params.push(filters.studentId);
    }
    if (filters?.semester) {
      where.push('r.semester = ?');
      params.push(filters.semester);
    }
    if (filters?.course) {
      where.push('s.course = ?');
      params.push(filters.course);
    }
    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim()}%`;
      where.push(
        '(s.registration_number LIKE ? OR s.full_name LIKE ? OR sub.code LIKE ? OR sub.name LIKE ? OR r.latest_receipt_id LIKE ?)'
      );
      params.push(q, q, q, q, q);
    }

    const sql = `
      SELECT r.*,
             s.registration_number, s.full_name AS student_name, s.course,
             e.exam_code, e.title AS exam_title,
             sub.code AS subject_code, sub.name AS subject_name,
             rc.short_fingerprint
      FROM results r
      JOIN students s ON s.id = r.student_id
      JOIN exams e ON e.id = r.exam_id
      JOIN subjects sub ON sub.id = r.subject_id
      LEFT JOIN result_receipts rc ON rc.receipt_id = r.latest_receipt_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.updated_at DESC, r.latest_ledger_sequence DESC
    `;

    const rows = this.database.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.mapResultRow(r));
  }

  private mapResultRow(row: Record<string, unknown>): ResultRecord {
    return {
      id: String(row.id),
      studentId: String(row.student_id),
      registrationNumber: String(row.registration_number),
      studentName: String(row.student_name),
      course: String(row.course),
      examId: String(row.exam_id),
      examCode: String(row.exam_code),
      examTitle: String(row.exam_title),
      academicSession: String(row.academic_session),
      semester: Number(row.semester),
      subjectId: String(row.subject_id),
      subjectCode: String(row.subject_code),
      subjectName: String(row.subject_name),
      maxMarks: Number(row.max_marks),
      obtainedMarks: Number(row.obtained_marks),
      version: Number(row.version),
      status: String(row.status),
      publishedAt: String(row.published_at),
      updatedAt: String(row.updated_at),
      latestLedgerSequence: Number(row.latest_ledger_sequence),
      latestReceiptId: String(row.latest_receipt_id),
      shortFingerprint: String(row.short_fingerprint ?? ''),
    };
  }

  public getResultHistory(resultId: string): {
    result: ResultRecord;
    receipts: ReceiptRecord[];
    ledgerEvents: LedgerEntryRecord[];
    correctionRequests: CorrectionRequestRecord[];
  } {
    const result = this.getResultById(resultId);
    if (!result) {
      throw new DomainError('Result not found', 404, 'RESULT_NOT_FOUND');
    }

    const receiptRows = this.database.db
      .prepare(
        `SELECT * FROM result_receipts WHERE result_id = ? ORDER BY version ASC`
      )
      .all(resultId) as Record<string, unknown>[];

    const receipts: ReceiptRecord[] = receiptRows.map((r) => ({
      receiptId: String(r.receipt_id),
      resultId: String(r.result_id),
      version: Number(r.version),
      ledgerSequence: Number(r.ledger_sequence),
      payloadHash: String(r.payload_hash),
      blockHash: String(r.block_hash),
      fingerprint: String(r.fingerprint),
      shortFingerprint: String(r.short_fingerprint),
      createdAt: String(r.created_at),
    }));

    const allEntries = this.listLedgerEntries();
    const ledgerEvents = allEntries.filter(
      (e) => e.payload && e.payload.resultId === resultId
    );
    const correctionRequests = this.listCorrectionRequests({ resultId });

    return { result, receipts, ledgerEvents, correctionRequests };
  }

  public createCorrectionRequest(input: {
    resultId: string;
    proposedMarks: number;
    reason: string;
    requestedByUserId: string;
  }): CorrectionRequestRecord {
    const reason = (input.reason ?? '').trim();
    const proposedMarks = Number(input.proposedMarks);

    if (!reason || reason.length < 5) {
      throw new DomainError(
        'Correction reason is mandatory (minimum 5 characters explaining the audit basis)'
      );
    }

    const result = this.getResultById(input.resultId);
    if (!result) {
      throw new DomainError('Result not found', 404, 'RESULT_NOT_FOUND');
    }

    if (!Number.isFinite(proposedMarks) || proposedMarks < 0 || proposedMarks > result.maxMarks) {
      throw new DomainError(
        `Proposed marks (${proposedMarks}) must be between 0 and maximum marks (${result.maxMarks})`
      );
    }

    if (proposedMarks === result.obtainedMarks) {
      throw new DomainError(
        'Proposed marks must differ from the current published marks'
      );
    }

    const now = new Date().toISOString();
    const id = `cor_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

    this.database.db
      .prepare(
        `INSERT INTO correction_requests (
          id, result_id, original_version, old_marks, proposed_marks, reason,
          status, requested_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`
      )
      .run(
        id,
        result.id,
        result.version,
        result.obtainedMarks,
        proposedMarks,
        reason,
        input.requestedByUserId,
        now,
        now
      );

    return this.getCorrectionRequestById(id)!;
  }

  public buildSigningPayloadForRequest(reqRow: {
    id: string;
    result_id: string;
    original_version: number;
    old_marks: number;
    proposed_marks: number;
    max_marks: number;
    reason: string;
    registration_number: string;
    subject_code: string;
  }): CorrectionSigningPayload {
    return {
      schemaVersion: LEDGER_SCHEMA_VERSION,
      correctionRequestId: String(reqRow.id),
      resultId: String(reqRow.result_id),
      originalVersion: Number(reqRow.original_version),
      oldMarks: Number(reqRow.old_marks),
      proposedMarks: Number(reqRow.proposed_marks),
      maxMarks: Number(reqRow.max_marks),
      reason: String(reqRow.reason),
      registrationNumber: String(reqRow.registration_number),
      subjectCode: String(reqRow.subject_code),
    };
  }

  public getCorrectionRequestById(id: string): CorrectionRequestRecord | null {
    const row = this.database.db
      .prepare(
        `SELECT cr.*,
                r.version AS current_result_version, r.max_marks, r.academic_session, r.semester,
                s.registration_number, s.full_name AS student_name,
                sub.code AS subject_code, sub.name AS subject_name,
                e.exam_code,
                u.full_name AS requested_by_name
         FROM correction_requests cr
         JOIN results r ON r.id = cr.result_id
         JOIN students s ON s.id = r.student_id
         JOIN subjects sub ON sub.id = r.subject_id
         JOIN exams e ON e.id = r.exam_id
         JOIN users u ON u.id = cr.requested_by_user_id
         WHERE cr.id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.hydrateCorrectionRequest(row);
  }

  public listCorrectionRequests(filters?: {
    status?: string;
    resultId?: string;
  }): CorrectionRequestRecord[] {
    const where: string[] = [];
    const params: string[] = [];

    if (filters?.status) {
      where.push('cr.status = ?');
      params.push(filters.status);
    }
    if (filters?.resultId) {
      where.push('cr.result_id = ?');
      params.push(filters.resultId);
    }

    const rows = this.database.db
      .prepare(
        `SELECT cr.*,
                r.version AS current_result_version, r.max_marks, r.academic_session, r.semester,
                s.registration_number, s.full_name AS student_name,
                sub.code AS subject_code, sub.name AS subject_name,
                e.exam_code,
                u.full_name AS requested_by_name
         FROM correction_requests cr
         JOIN results r ON r.id = cr.result_id
         JOIN students s ON s.id = r.student_id
         JOIN subjects sub ON sub.id = r.subject_id
         JOIN exams e ON e.id = r.exam_id
         JOIN users u ON u.id = cr.requested_by_user_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY cr.created_at DESC`
      )
      .all(...params) as Record<string, unknown>[];

    return rows.map((r) => this.hydrateCorrectionRequest(r));
  }

  private hydrateCorrectionRequest(
    row: Record<string, unknown>
  ): CorrectionRequestRecord {
    const approvalRows = this.database.db
      .prepare(
        `SELECT a.*, u.full_name AS approver_name
         FROM approvals a
         JOIN users u ON u.id = a.approver_user_id
         WHERE a.correction_request_id = ?
         ORDER BY a.signed_at ASC`
      )
      .all(String(row.id)) as Record<string, unknown>[];

    const approvals: ApprovalEvidence[] = approvalRows.map((a) => ({
      approvalId: String(a.id),
      approverUserId: String(a.approver_user_id),
      approverName: String(a.approver_name),
      approverRole: String(a.approver_role) as 'EXAMINER' | 'CONTROLLER',
      keyId: String(a.key_id),
      publicKeyHex: String(a.public_key_hex),
      signatureHex: String(a.signature_hex),
      decision: String(a.decision) as 'APPROVED' | 'REJECTED',
      signedAt: String(a.signed_at),
      comment: a.comment ? String(a.comment) : null,
    }));

    const signingPayload = this.buildSigningPayloadForRequest({
      id: String(row.id),
      result_id: String(row.result_id),
      original_version: Number(row.original_version),
      old_marks: Number(row.old_marks),
      proposed_marks: Number(row.proposed_marks),
      max_marks: Number(row.max_marks),
      reason: String(row.reason),
      registration_number: String(row.registration_number),
      subject_code: String(row.subject_code),
    });

    return {
      id: String(row.id),
      resultId: String(row.result_id),
      registrationNumber: String(row.registration_number),
      studentName: String(row.student_name),
      subjectCode: String(row.subject_code),
      subjectName: String(row.subject_name),
      examCode: String(row.exam_code),
      academicSession: String(row.academic_session),
      semester: Number(row.semester),
      originalVersion: Number(row.original_version),
      currentResultVersion: Number(row.current_result_version),
      oldMarks: Number(row.old_marks),
      proposedMarks: Number(row.proposed_marks),
      maxMarks: Number(row.max_marks),
      reason: String(row.reason),
      status: String(row.status) as CorrectionStatus,
      requestedByUserId: String(row.requested_by_user_id),
      requestedByName: String(row.requested_by_name),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      finalizedLedgerSequence:
        row.finalized_ledger_sequence !== null &&
        row.finalized_ledger_sequence !== undefined
          ? Number(row.finalized_ledger_sequence)
          : null,
      approvals,
      signingPayload,
    };
  }

  /**
   * Validates and records an Examiner or Examination Controller cryptographic approval/rejection.
   * The server NEVER accepts private keys or passphrases — only the Ed25519 signature and keyId,
   * verified against the external trusted key registry outside SQLite.
   */
  public submitApproval(input: SubmitApprovalInput): CorrectionRequestRecord {
    if (
      input.approverRole !== UserRole.EXAMINER &&
      input.approverRole !== UserRole.CONTROLLER
    ) {
      throw new DomainError(
        'Only an Examiner or Examination Controller may approve or reject corrections',
        403,
        'UNAUTHORIZED_APPROVER_ROLE'
      );
    }

    const req = this.getCorrectionRequestById(input.correctionRequestId);
    if (!req) {
      throw new DomainError('Correction request not found', 404, 'CORRECTION_NOT_FOUND');
    }

    if (req.status === CorrectionStatus.FINALIZED) {
      throw new DomainError(
        'Correction request is already finalized',
        409,
        'ALREADY_FINALIZED'
      );
    }
    if (req.status === CorrectionStatus.REJECTED) {
      throw new DomainError(
        'Correction request has already been rejected',
        409,
        'ALREADY_REJECTED'
      );
    }

    if (!req.reason || req.reason.trim().length < 5) {
      throw new DomainError('Correction reason is empty or invalid', 400, 'EMPTY_REASON');
    }

    if (req.originalVersion !== req.currentResultVersion) {
      throw new DomainError(
        `Stale correction request: result is now at version ${req.currentResultVersion}, but request targets version ${req.originalVersion}`,
        409,
        'STALE_RESULT_VERSION'
      );
    }

    if (req.proposedMarks < 0 || req.proposedMarks > req.maxMarks) {
      throw new DomainError(
        'Proposed marks exceed allowed maximum marks limit',
        400,
        'MARKS_OUT_OF_RANGE'
      );
    }

    // Verify user & key binding against external trust store (outside SQLite!)
    const userRow = this.database.db
      .prepare(`SELECT id, email, role, key_id FROM users WHERE id = ?`)
      .get(input.approverUserId) as
      | { id: string; email: string; role: string; key_id: string | null }
      | undefined;

    if (!userRow || userRow.role !== input.approverRole) {
      throw new DomainError(
        'Approver account role mismatch',
        403,
        'ROLE_MISMATCH'
      );
    }

    const trustedKey = this.trustStore.getTrustedKeyById(input.keyId);
    if (!trustedKey || !trustedKey.active) {
      throw new DomainError(
        `Signing key "${input.keyId}" is not enrolled in the external trusted key registry`,
        403,
        'UNTRUSTED_KEY'
      );
    }

    if (trustedKey.role !== input.approverRole) {
      throw new DomainError(
        `Signing key "${input.keyId}" is enrolled for role ${trustedKey.role}, not ${input.approverRole}`,
        403,
        'KEY_ROLE_MISMATCH'
      );
    }

    if (
      userRow.key_id &&
      userRow.key_id !== trustedKey.keyId &&
      trustedKey.ownerEmail.toLowerCase() !== userRow.email.toLowerCase()
    ) {
      throw new DomainError(
        'Signing key does not belong to the authenticated approver',
        403,
        'KEY_OWNER_MISMATCH'
      );
    }

    // Prevent same individual or same signing key from signing twice
    for (const existing of req.approvals) {
      if (existing.approverUserId === input.approverUserId) {
        throw new DomainError(
          'Duplicate signer rejected: the same individual cannot provide multiple approvals for one correction request',
          409,
          'DUPLICATE_SIGNER'
        );
      }
      if (existing.keyId === trustedKey.keyId) {
        throw new DomainError(
          'Duplicate signing key rejected: two distinct keys are required',
          409,
          'DUPLICATE_SIGNING_KEY'
        );
      }
      if (existing.approverRole === input.approverRole) {
        throw new DomainError(
          `${input.approverRole} decision has already been recorded for this request`,
          409,
          'DUPLICATE_ROLE_APPROVAL'
        );
      }
    }

    // Verify cryptographic Ed25519 signature over canonical correction request message
    if (!input.signatureHex || !/^[0-9a-fA-F]{128}$/.test(input.signatureHex)) {
      throw new DomainError(
        'Invalid Ed25519 signature format (expected 128 hex characters)',
        400,
        'INVALID_SIGNATURE'
      );
    }

    // Prevent signature replay across different correction requests
    const replayed = this.database.db
      .prepare(
        `SELECT correction_request_id FROM approvals WHERE signature_hex = ?`
      )
      .get(input.signatureHex) as { correction_request_id: string } | undefined;

    if (replayed) {
      throw new DomainError(
        `Approval signature replay detected (already used for request ${replayed.correction_request_id})`,
        409,
        'APPROVAL_REPLAY'
      );
    }

    const signingMessage = buildCorrectionSigningMessage(req.signingPayload);
    const sigValid = verifyEd25519Hex(
      signingMessage,
      input.signatureHex,
      trustedKey.publicKeyHex
    );

    if (!sigValid) {
      throw new DomainError(
        'Ed25519 digital signature verification failed against canonical correction payload and enrolled public key',
        400,
        'INVALID_SIGNATURE'
      );
    }

    const now = new Date().toISOString();
    const approvalId = `apr_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

    this.database.runInTransaction(() => {
      this.database.db
        .prepare(
          `INSERT INTO approvals (
            id, correction_request_id, approver_user_id, approver_role,
            key_id, public_key_hex, signature_hex, decision, comment, signed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          approvalId,
          req.id,
          input.approverUserId,
          input.approverRole,
          trustedKey.keyId,
          trustedKey.publicKeyHex,
          input.signatureHex,
          input.decision,
          input.comment?.trim() || null,
          now
        );

      const updatedApprovals = this.database.db
        .prepare(
          `SELECT approver_role, decision FROM approvals WHERE correction_request_id = ?`
        )
        .all(req.id) as Array<{ approver_role: string; decision: string }>;

      let newStatus: CorrectionStatus;
      if (updatedApprovals.some((a) => a.decision === 'REJECTED')) {
        newStatus = CorrectionStatus.REJECTED;
      } else {
        const hasExaminer = updatedApprovals.some(
          (a) => a.approver_role === 'EXAMINER' && a.decision === 'APPROVED'
        );
        const hasController = updatedApprovals.some(
          (a) => a.approver_role === 'CONTROLLER' && a.decision === 'APPROVED'
        );
        newStatus =
          hasExaminer && hasController
            ? CorrectionStatus.READY_TO_FINALIZE
            : CorrectionStatus.APPROVED_PARTIAL;
      }

      this.database.db
        .prepare(
          `UPDATE correction_requests SET status = ?, updated_at = ? WHERE id = ?`
        )
        .run(newStatus, now, req.id);
    });

    return this.getCorrectionRequestById(req.id)!;
  }

  /**
   * Finalizes a dual-approved correction request:
   * Re-verifies BOTH independent Ed25519 signatures, distinct individuals, roles,
   * non-stale result version, appends CORRECTION_APPROVED and RESULT_CORRECTED blocks,
   * updates materialized results to version+1, issues a new receipt while preserving the
   * original receipt permanently, and anchors a new external signed checkpoint.
   */
  public finalizeCorrection(
    correctionRequestId: string,
    actorUserId: string
  ): {
    correction: CorrectionRequestRecord;
    result: ResultRecord;
    approvalEvent: LedgerEntryRecord;
    correctionEvent: LedgerEntryRecord;
    newReceipt: ReceiptRecord;
    checkpoint: TrustedCheckpoint;
  } {
    const req = this.getCorrectionRequestById(correctionRequestId);
    if (!req) {
      throw new DomainError('Correction request not found', 404, 'CORRECTION_NOT_FOUND');
    }
    if (req.status === CorrectionStatus.FINALIZED) {
      throw new DomainError('Correction already finalized', 409, 'ALREADY_FINALIZED');
    }
    if (req.status === CorrectionStatus.REJECTED) {
      throw new DomainError('Cannot finalize a rejected correction', 409, 'ALREADY_REJECTED');
    }
    if (!req.reason || req.reason.trim().length < 5) {
      throw new DomainError('Correction reason is empty', 400, 'EMPTY_REASON');
    }
    if (req.proposedMarks < 0 || req.proposedMarks > req.maxMarks) {
      throw new DomainError('Proposed marks exceed allowed limits', 400, 'MARKS_OUT_OF_RANGE');
    }

    const examinerApproval = req.approvals.find(
      (a) => a.approverRole === 'EXAMINER' && a.decision === 'APPROVED'
    );
    const controllerApproval = req.approvals.find(
      (a) => a.approverRole === 'CONTROLLER' && a.decision === 'APPROVED'
    );

    if (!examinerApproval || !controllerApproval) {
      throw new DomainError(
        'Dual-authority requirement not met: BOTH Examiner AND Examination Controller cryptographic signatures are required before finalizing',
        400,
        'INSUFFICIENT_APPROVALS'
      );
    }

    if (
      examinerApproval.approverUserId === controllerApproval.approverUserId ||
      examinerApproval.keyId === controllerApproval.keyId
    ) {
      throw new DomainError(
        'Two distinct authorized individuals with independent signing keys are required',
        400,
        'DUPLICATE_SIGNER'
      );
    }

    // Re-verify BOTH signatures against the exact current canonical request and external trust store!
    const examinerKey = this.trustStore.getTrustedKeyById(examinerApproval.keyId);
    const controllerKey = this.trustStore.getTrustedKeyById(controllerApproval.keyId);

    if (!examinerKey || examinerKey.role !== 'EXAMINER') {
      throw new DomainError(
        'Examiner signing key is not active or not enrolled as EXAMINER',
        403,
        'UNTRUSTED_KEY'
      );
    }
    if (!controllerKey || controllerKey.role !== 'CONTROLLER') {
      throw new DomainError(
        'Controller signing key is not active or not enrolled as CONTROLLER',
        403,
        'UNTRUSTED_KEY'
      );
    }

    const signingMsg = buildCorrectionSigningMessage(req.signingPayload);
    if (
      !verifyEd25519Hex(signingMsg, examinerApproval.signatureHex, examinerKey.publicKeyHex)
    ) {
      throw new DomainError(
        'Examiner signature failed re-verification (request details may have been modified)',
        400,
        'INVALID_SIGNATURE'
      );
    }
    if (
      !verifyEd25519Hex(
        signingMsg,
        controllerApproval.signatureHex,
        controllerKey.publicKeyHex
      )
    ) {
      throw new DomainError(
        'Examination Controller signature failed re-verification (request details may have been modified)',
        400,
        'INVALID_SIGNATURE'
      );
    }

    let approvalEvent!: LedgerEntryRecord;
    let correctionEvent!: LedgerEntryRecord;
    let newReceipt!: ReceiptRecord;
    let checkpoint!: TrustedCheckpoint;

    this.database.runInTransaction(() => {
      const currentResult = this.getResultById(req.resultId);
      if (!currentResult) {
        throw new DomainError('Target result no longer exists', 404, 'RESULT_NOT_FOUND');
      }
      if (currentResult.version !== req.originalVersion) {
        throw new DomainError(
          `Stale correction version: result version changed from v${req.originalVersion} to v${currentResult.version}`,
          409,
          'STALE_RESULT_VERSION'
        );
      }

      const now = new Date().toISOString();
      const newVersion = currentResult.version + 1;

      const approvalPayload: CorrectionApprovedPayload = {
        schemaVersion: LEDGER_SCHEMA_VERSION,
        correctionRequestId: req.id,
        resultId: currentResult.id,
        originalVersion: req.originalVersion,
        oldMarks: req.oldMarks,
        proposedMarks: req.proposedMarks,
        maxMarks: currentResult.maxMarks,
        reason: req.reason,
        registrationNumber: currentResult.registrationNumber,
        subjectCode: currentResult.subjectCode,
        approvals: [examinerApproval, controllerApproval],
        approvedAt: now,
      };

      approvalEvent = this.appendLedgerBlockLocked(
        LedgerEventType.CORRECTION_APPROVED,
        approvalPayload as unknown as Record<string, unknown>,
        actorUserId,
        now
      );

      const correctedPayload: ResultCorrectedPayload = {
        schemaVersion: LEDGER_SCHEMA_VERSION,
        correctionRequestId: req.id,
        resultId: currentResult.id,
        previousVersion: currentResult.version,
        newVersion,
        oldMarks: req.oldMarks,
        newMarks: req.proposedMarks,
        maxMarks: currentResult.maxMarks,
        reason: req.reason,
        studentId: currentResult.studentId,
        registrationNumber: currentResult.registrationNumber,
        studentName: currentResult.studentName,
        course: currentResult.course,
        examId: currentResult.examId,
        examCode: currentResult.examCode,
        academicSession: currentResult.academicSession,
        semester: currentResult.semester,
        subjectCode: currentResult.subjectCode,
        subjectName: currentResult.subjectName,
        examinerKeyId: examinerApproval.keyId,
        examinerSignatureHex: examinerApproval.signatureHex,
        controllerKeyId: controllerApproval.keyId,
        controllerSignatureHex: controllerApproval.signatureHex,
        correctedAt: now,
      };

      correctionEvent = this.appendLedgerBlockLocked(
        LedgerEventType.RESULT_CORRECTED,
        correctedPayload as unknown as Record<string, unknown>,
        actorUserId,
        now
      );

      newReceipt = this.createReceiptLocked(
        currentResult.id,
        newVersion,
        correctionEvent,
        now
      );

      this.database.db
        .prepare(
          `UPDATE results
           SET obtained_marks = ?, version = ?, status = 'CORRECTED',
               latest_ledger_sequence = ?, latest_receipt_id = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          req.proposedMarks,
          newVersion,
          correctionEvent.sequence,
          newReceipt.receiptId,
          now,
          currentResult.id
        );

      this.database.db
        .prepare(
          `UPDATE correction_requests
           SET status = 'FINALIZED', finalized_ledger_sequence = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(correctionEvent.sequence, now, req.id);

      try {
        checkpoint = this.trustStore.anchorCheckpoint(
          correctionEvent.sequence,
          correctionEvent.blockHash
        );
      } catch (cpErr) {
        throw new DomainError(
          `Correction finalization aborted: failed to anchor signed external checkpoint (${
            cpErr instanceof Error ? cpErr.message : 'I/O error'
          }).`,
          503,
          'CHECKPOINT_ANCHOR_FAILED'
        );
      }
    });

    return {
      correction: this.getCorrectionRequestById(req.id)!,
      result: this.getResultById(req.resultId)!,
      approvalEvent,
      correctionEvent,
      newReceipt,
      checkpoint,
    };
  }

  public listLedgerEntries(): LedgerEntryRecord[] {
    const rows = this.database.db
      .prepare(`SELECT * FROM ledger_entries ORDER BY sequence ASC`)
      .all() as Record<string, unknown>[];

    return rows.map((row) => {
      let parsedPayload: Record<string, unknown> = {};
      try {
        parsedPayload = JSON.parse(String(row.payload_json)) as Record<string, unknown>;
      } catch {
        parsedPayload = { _corruptedRawJson: String(row.payload_json) };
      }
      return {
        sequence: Number(row.sequence),
        eventId: String(row.event_id),
        eventType: String(row.event_type) as LedgerEventType,
        previousHash: String(row.previous_hash),
        payloadHash: String(row.payload_hash),
        blockHash: String(row.block_hash),
        publisherId: String(row.publisher_id),
        publisherKeyId: String(row.publisher_key_id),
        signature: String(row.signature),
        timestamp: String(row.timestamp),
        schemaVersion: String(row.schema_version),
        payload: parsedPayload,
      };
    });
  }

  public getLedgerEntryBySequence(sequence: number): LedgerEntryRecord | null {
    const row = this.database.db
      .prepare(`SELECT * FROM ledger_entries WHERE sequence = ?`)
      .get(sequence) as Record<string, unknown> | undefined;

    if (!row) return null;
    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(String(row.payload_json)) as Record<string, unknown>;
    } catch {
      parsedPayload = { _corruptedRawJson: String(row.payload_json) };
    }
    return {
      sequence: Number(row.sequence),
      eventId: String(row.event_id),
      eventType: String(row.event_type) as LedgerEventType,
      previousHash: String(row.previous_hash),
      payloadHash: String(row.payload_hash),
      blockHash: String(row.block_hash),
      publisherId: String(row.publisher_id),
      publisherKeyId: String(row.publisher_key_id),
      signature: String(row.signature),
      timestamp: String(row.timestamp),
      schemaVersion: String(row.schema_version),
      payload: parsedPayload,
    };
  }
}
