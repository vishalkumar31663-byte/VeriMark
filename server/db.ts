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
    `);
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
