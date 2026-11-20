import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class VeriMarkDatabase {
  public readonly db: DatabaseSync;
  public readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.initSchema();
  }

  public initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'EXAMINER', 'CONTROLLER', 'STUDENT')),
        key_id TEXT,
        student_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS revoked_tokens (
        jti TEXT PRIMARY KEY,
        revoked_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        registration_number TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        course TEXT NOT NULL,
        semester INTEGER NOT NULL CHECK (semester >= 1 AND semester <= 12),
        academic_session TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_students_reg ON students(registration_number);
      CREATE INDEX IF NOT EXISTS idx_students_course_sem ON students(course, semester);

      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        max_marks INTEGER NOT NULL CHECK (max_marks > 0 AND max_marks <= 1000),
        semester INTEGER NOT NULL CHECK (semester >= 1 AND semester <= 12)
      );

      CREATE TABLE IF NOT EXISTS exams (
        id TEXT PRIMARY KEY,
        exam_code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        academic_session TEXT NOT NULL,
        semester INTEGER NOT NULL,
        exam_date TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_entries (
        sequence INTEGER PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL CHECK (event_type IN ('RESULT_PUBLISHED', 'CORRECTION_APPROVED', 'RESULT_CORRECTED')),
        previous_hash TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        block_hash TEXT NOT NULL,
        publisher_id TEXT NOT NULL,
        publisher_key_id TEXT NOT NULL,
        signature TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        schema_version TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ledger_event_type ON ledger_entries(event_type);

      CREATE TABLE IF NOT EXISTS results (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL REFERENCES students(id),
        exam_id TEXT NOT NULL REFERENCES exams(id),
        subject_id TEXT NOT NULL REFERENCES subjects(id),
        academic_session TEXT NOT NULL,
        semester INTEGER NOT NULL,
        max_marks REAL NOT NULL CHECK (max_marks > 0),
        obtained_marks REAL NOT NULL CHECK (obtained_marks >= 0),
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'PUBLISHED',
        latest_ledger_sequence INTEGER NOT NULL,
        latest_receipt_id TEXT NOT NULL,
        published_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(student_id, exam_id, subject_id)
      );

      CREATE INDEX IF NOT EXISTS idx_results_student ON results(student_id);
      CREATE INDEX IF NOT EXISTS idx_results_exam ON results(exam_id);

      CREATE TABLE IF NOT EXISTS result_receipts (
        receipt_id TEXT PRIMARY KEY,
        result_id TEXT NOT NULL REFERENCES results(id),
        version INTEGER NOT NULL,
        ledger_sequence INTEGER NOT NULL,
        payload_hash TEXT NOT NULL,
        block_hash TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        short_fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(result_id, version)
      );

      CREATE INDEX IF NOT EXISTS idx_receipts_result ON result_receipts(result_id);
      CREATE INDEX IF NOT EXISTS idx_receipts_seq ON result_receipts(ledger_sequence);

      CREATE TABLE IF NOT EXISTS correction_requests (
        id TEXT PRIMARY KEY,
        result_id TEXT NOT NULL REFERENCES results(id),
        original_version INTEGER NOT NULL,
        old_marks REAL NOT NULL,
        proposed_marks REAL NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED_PARTIAL', 'READY_TO_FINALIZE', 'FINALIZED', 'REJECTED')),
        requested_by_user_id TEXT NOT NULL REFERENCES users(id),
        finalized_ledger_sequence INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_corrections_result ON correction_requests(result_id);
      CREATE INDEX IF NOT EXISTS idx_corrections_status ON correction_requests(status);

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        correction_request_id TEXT NOT NULL REFERENCES correction_requests(id),
        approver_user_id TEXT NOT NULL REFERENCES users(id),
        approver_role TEXT NOT NULL CHECK (approver_role IN ('EXAMINER', 'CONTROLLER')),
        key_id TEXT NOT NULL,
        public_key_hex TEXT NOT NULL,
        signature_hex TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
        comment TEXT,
        signed_at TEXT NOT NULL,
        UNIQUE(correction_request_id, approver_role),
        UNIQUE(correction_request_id, approver_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_approvals_request ON approvals(correction_request_id);

      CREATE TABLE IF NOT EXISTS audit_records (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        total_ledger_entries INTEGER NOT NULL,
        valid_ledger_entries INTEGER NOT NULL,
        issues_count INTEGER NOT NULL,
        first_invalid_block INTEGER,
        checkpoint_sequence INTEGER,
        report_json TEXT NOT NULL,
        checked_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_checked_at ON audit_records(checked_at);

      -- ============================================================
      -- VERIMARK 2.0 SAFE VERSIONED MIGRATIONS
      -- ============================================================
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS exam_schedules (
        id TEXT PRIMARY KEY,
        examination_id TEXT NOT NULL UNIQUE,
        subject_id TEXT NOT NULL REFERENCES subjects(id),
        subject_code TEXT NOT NULL,
        subject_title TEXT NOT NULL,
        academic_session TEXT NOT NULL,
        course TEXT NOT NULL,
        semester INTEGER NOT NULL CHECK (semester >= 1 AND semester <= 12),
        category TEXT NOT NULL DEFAULT 'End-Term',
        exam_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
        mode TEXT NOT NULL CHECK (mode IN ('ONLINE', 'OFFLINE')),
        online_url TEXT,
        access_instructions TEXT,
        campus TEXT,
        building TEXT,
        room TEXT,
        reporting_time TEXT,
        required_documents TEXT,
        instructions TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED')) DEFAULT 'DRAFT',
        admit_card_available INTEGER NOT NULL DEFAULT 0,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_exam_schedules_status_date ON exam_schedules(status, exam_date);
      CREATE INDEX IF NOT EXISTS idx_exam_schedules_course_sem ON exam_schedules(course, semester);
      CREATE INDEX IF NOT EXISTS idx_exam_schedules_subject ON exam_schedules(subject_id);

      CREATE TABLE IF NOT EXISTS exam_assignments (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
        examiner_user_id TEXT NOT NULL REFERENCES users(id),
        assigned_by_user_id TEXT NOT NULL REFERENCES users(id),
        role_label TEXT NOT NULL DEFAULT 'Primary Examiner',
        assigned_at TEXT NOT NULL,
        UNIQUE(schedule_id, examiner_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_exam_assignments_examiner ON exam_assignments(examiner_user_id);

      CREATE TABLE IF NOT EXISTS exam_schedule_history (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
        actor_user_id TEXT NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        change_summary TEXT NOT NULL,
        previous_json TEXT,
        next_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_exam_sched_hist_sched ON exam_schedule_history(schedule_id);

      CREATE TABLE IF NOT EXISTS schedule_change_requests (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
        requested_by_user_id TEXT NOT NULL REFERENCES users(id),
        requested_changes TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
        reviewed_by_user_id TEXT REFERENCES users(id),
        review_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sched_change_req_status ON schedule_change_requests(status);

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL CHECK (category IN ('EXAM_SCHEDULE', 'ADMIT_CARD', 'RESULT', 'REVALUATION', 'TICKET', 'CORRECTION', 'SECURITY')),
        priority TEXT NOT NULL CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')) DEFAULT 'NORMAL',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        link_path TEXT,
        entity_type TEXT,
        entity_id TEXT,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        read_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at);

      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        ticket_number TEXT NOT NULL UNIQUE,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        student_id TEXT REFERENCES students(id),
        assigned_examiner_id TEXT REFERENCES users(id),
        category TEXT NOT NULL CHECK (category IN ('INCORRECT_MARKS', 'MISSING_RESULT', 'RESULT_VERIFICATION', 'EXAM_TIMETABLE', 'ONLINE_EXAM', 'OFFLINE_EXAM', 'ADMIT_CARD', 'REVALUATION_QUERY', 'OTHER_ACADEMIC')),
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        related_exam_id TEXT REFERENCES exams(id),
        related_schedule_id TEXT REFERENCES exam_schedules(id),
        related_result_id TEXT REFERENCES results(id),
        related_result_version INTEGER,
        status TEXT NOT NULL CHECK (status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_STUDENT', 'ESCALATED', 'RESOLVED', 'REJECTED', 'CLOSED', 'REOPENED')) DEFAULT 'OPEN',
        priority TEXT NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')) DEFAULT 'MEDIUM',
        recommended_marks REAL,
        recommendation_note TEXT,
        resolution_reason TEXT,
        linked_correction_id TEXT REFERENCES correction_requests(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        due_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_student ON tickets(student_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_examiner ON tickets(assigned_examiner_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_result ON tickets(related_result_id);

      CREATE TABLE IF NOT EXISTS ticket_messages (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        sender_user_id TEXT NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        is_internal_note INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id, created_at);

      CREATE TABLE IF NOT EXISTS ticket_events (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        actor_user_id TEXT NOT NULL REFERENCES users(id),
        event_type TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events(ticket_id, created_at);

      CREATE TABLE IF NOT EXISTS revaluation_requests (
        id TEXT PRIMARY KEY,
        request_number TEXT NOT NULL UNIQUE,
        student_id TEXT NOT NULL REFERENCES students(id),
        result_id TEXT NOT NULL REFERENCES results(id),
        result_version INTEGER NOT NULL,
        original_marks REAL NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('SUBMITTED', 'UNDER_REVIEW', 'EVIDENCE_REQUIRED', 'RECOMMENDED', 'APPROVED_FOR_CORRECTION', 'REJECTED', 'CORRECTION_IN_PROGRESS', 'COMPLETED')) DEFAULT 'SUBMITTED',
        assigned_examiner_id TEXT REFERENCES users(id),
        examiner_recommendation TEXT CHECK (examiner_recommendation IN ('APPROVE', 'REJECT', 'EVIDENCE_REQUIRED') OR examiner_recommendation IS NULL),
        recommended_marks REAL,
        examiner_notes TEXT,
        controller_decision TEXT CHECK (controller_decision IN ('APPROVED_FOR_CORRECTION', 'REJECTED') OR controller_decision IS NULL),
        controller_notes TEXT,
        reviewed_by_controller_id TEXT REFERENCES users(id),
        linked_correction_id TEXT REFERENCES correction_requests(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_reval_student ON revaluation_requests(student_id);
      CREATE INDEX IF NOT EXISTS idx_reval_result ON revaluation_requests(result_id);
      CREATE INDEX IF NOT EXISTS idx_reval_status ON revaluation_requests(status);

      CREATE TABLE IF NOT EXISTS ticket_attachments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
        revaluation_id TEXT REFERENCES revaluation_requests(id) ON DELETE CASCADE,
        uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 2097152),
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON ticket_attachments(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_reval ON ticket_attachments(revaluation_id);

      CREATE TABLE IF NOT EXISTS exam_seat_assignments (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL REFERENCES students(id),
        campus TEXT,
        building TEXT,
        room TEXT NOT NULL,
        seat_number TEXT NOT NULL,
        assigned_by_user_id TEXT NOT NULL REFERENCES users(id),
        assigned_at TEXT NOT NULL,
        UNIQUE(schedule_id, student_id),
        UNIQUE(schedule_id, room, seat_number)
      );

      CREATE INDEX IF NOT EXISTS idx_seat_assign_schedule ON exam_seat_assignments(schedule_id);
      CREATE INDEX IF NOT EXISTS idx_seat_assign_student ON exam_seat_assignments(student_id);

      CREATE TABLE IF NOT EXISTS admit_cards (
        id TEXT PRIMARY KEY,
        card_number TEXT NOT NULL UNIQUE,
        verification_token TEXT NOT NULL UNIQUE,
        student_id TEXT NOT NULL REFERENCES students(id),
        schedule_id TEXT NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REISSUED', 'REVOKED')) DEFAULT 'ACTIVE',
        seat_number TEXT,
        room_override TEXT,
        issued_by_user_id TEXT NOT NULL REFERENCES users(id),
        issued_at TEXT NOT NULL,
        revoked_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_admit_cards_student ON admit_cards(student_id);
      CREATE INDEX IF NOT EXISTS idx_admit_cards_schedule ON admit_cards(schedule_id);
      CREATE INDEX IF NOT EXISTS idx_admit_cards_token ON admit_cards(verification_token);
    `);

    // Safe idempotent additive columns on correction_requests (preserving existing data)
    const corrCols = this.db
      .prepare(`PRAGMA table_info(correction_requests)`)
      .all() as Array<{ name: string }>;
    const corrColNames = new Set(corrCols.map((c) => c.name));
    if (!corrColNames.has('linked_ticket_id')) {
      this.db.exec(`ALTER TABLE correction_requests ADD COLUMN linked_ticket_id TEXT;`);
    }
    if (!corrColNames.has('linked_revaluation_id')) {
      this.db.exec(`ALTER TABLE correction_requests ADD COLUMN linked_revaluation_id TEXT;`);
    }

    // Record migration version 2 safely
    this.db
      .prepare(
        `INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`
      )
      .run(2, 'verimark_2_0_exam_ops_notifications_tickets_reval_admit', new Date().toISOString());
  }

  public runInTransaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // Already rolled back
      }
      throw err;
    }
  }

  public close(): void {
    this.db.close();
  }
}
