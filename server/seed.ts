import { buildCorrectionSigningMessage } from '../shared/canonical';
import { UserRole } from '../shared/types';
import { AuditService } from './auditService';
import { hashPassword, signEd25519Hex } from './crypto';
import { VeriMarkDatabase } from './db';
import { LedgerService } from './ledgerService';
import { ExternalTrustStore } from './trustStore';

export interface SeedResult {
  seeded: boolean;
  sampleOriginalReceiptId?: string;
  sampleSupersededReceiptId?: string;
  sampleCorrectedReceiptId?: string;
}

export async function seedDemoDataIfEmpty(
  database: VeriMarkDatabase,
  trustStore: ExternalTrustStore,
  ledgerService: LedgerService,
  auditService: AuditService
): Promise<SeedResult> {
  const init = await trustStore.ensureInitialized();
  const existingUsers = database.db
    .prepare(`SELECT COUNT(*) AS cnt FROM users`)
    .get() as { cnt: number };

  if (Number(existingUsers.cnt) > 0) {
    return { seeded: false };
  }

  const now = new Date().toISOString();
  const db = database.db;

  // 1. Fictional Students (8 students across B.Tech programs — zero real student data)
  const students = [
    {
      id: 'stu_001',
      reg: 'DU2026CS001',
      name: 'Aarav Sharma',
      course: 'B.Tech Computer Science',
      semester: 6,
      session: '2025-2026',
      email: 'student@demouniversity.edu',
    },
    {
      id: 'stu_002',
      reg: 'DU2026CS002',
      name: 'Ananya Verma',
      course: 'B.Tech Computer Science',
      semester: 6,
      session: '2025-2026',
      email: 'ananya.verma@demouniversity.edu',
    },
    {
      id: 'stu_003',
      reg: 'DU2026CS003',
      name: 'Rohan Deshmukh',
      course: 'B.Tech Computer Science',
      semester: 6,
      session: '2025-2026',
      email: 'rohan.d@demouniversity.edu',
    },
    {
      id: 'stu_004',
      reg: 'DU2026AI014',
      name: 'Kavya Iyer',
      course: 'B.Tech Artificial Intelligence',
      semester: 4,
      session: '2025-2026',
      email: 'kavya.iyer@demouniversity.edu',
    },
    {
      id: 'stu_005',
      reg: 'DU2026AI019',
      name: 'Devansh Patel',
      course: 'B.Tech Artificial Intelligence',
      semester: 4,
      session: '2025-2026',
      email: 'devansh.p@demouniversity.edu',
    },
    {
      id: 'stu_006',
      reg: 'DU2026CY007',
      name: 'Neha Gill',
      course: 'B.Tech Cybersecurity',
      semester: 6,
      session: '2025-2026',
      email: 'neha.gill@demouniversity.edu',
    },
    {
      id: 'stu_007',
      reg: 'DU2026CY011',
      name: 'Siddharth Menon',
      course: 'B.Tech Cybersecurity',
      semester: 6,
      session: '2025-2026',
      email: 'siddharth.m@demouniversity.edu',
    },
    {
      id: 'stu_008',
      reg: 'DU2026CS028',
      name: 'Priya Chatterjee',
      course: 'B.Tech Computer Science',
      semester: 4,
      session: '2025-2026',
      email: 'priya.c@demouniversity.edu',
    },
  ];

  const insertStudent = db.prepare(
    `INSERT INTO students (id, registration_number, full_name, course, semester, academic_session, email, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const s of students) {
    insertStudent.run(
      s.id,
      s.reg,
      s.name,
      s.course,
      s.semester,
      s.session,
      s.email,
      now,
      now
    );
  }

  // 2. Fictional System Users covering all authenticated roles
  const users = [
    {
      id: 'usr_admin_01',
      email: 'admin@demouniversity.edu',
      name: 'Dr. Vikramaditya Sen',
      password: hashPassword('Admin@VeriMark2026'),
      role: UserRole.SUPER_ADMIN,
      keyId: 'pub-registrar-ed25519-01',
      studentId: null,
    },
    {
      id: 'usr_examiner_01',
      email: 'examiner@demouniversity.edu',
      name: 'Dr. Meera Kulkarni',
      password: hashPassword('Examiner@VeriMark2026'),
      role: UserRole.EXAMINER,
      keyId: 'examiner-dr-meera-ed25519-01',
      studentId: null,
    },
    {
      id: 'usr_controller_01',
      email: 'controller@demouniversity.edu',
      name: 'Prof. Rajeshwar Nair',
      password: hashPassword('Controller@VeriMark2026'),
      role: UserRole.CONTROLLER,
      keyId: 'controller-prof-rajesh-ed25519-01',
      studentId: null,
    },
    {
      id: 'usr_student_01',
      email: 'student@demouniversity.edu',
      name: 'Aarav Sharma',
      password: hashPassword('Student@VeriMark2026'),
      role: UserRole.STUDENT,
      keyId: null,
      studentId: 'stu_001',
    },
  ];

  const insertUser = db.prepare(
    `INSERT INTO users (id, email, full_name, password_hash, role, key_id, student_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const u of users) {
    insertUser.run(
      u.id,
      u.email,
      u.name,
      u.password,
      u.role,
      u.keyId,
      u.studentId,
      now
    );
  }

  // 3. Subjects & Exams
  const subjects = [
    { id: 'sub_cs301', code: 'CSE301', name: 'Applied Cryptography & Network Security', maxMarks: 100, semester: 6 },
    { id: 'sub_cs302', code: 'CSE302', name: 'Distributed Systems Architecture', maxMarks: 100, semester: 6 },
    { id: 'sub_cs304', code: 'CSE304', name: 'Database Internals & Indexing', maxMarks: 100, semester: 6 },
    { id: 'sub_ai201', code: 'AIM201', name: 'Statistical Machine Learning', maxMarks: 100, semester: 4 },
    { id: 'sub_cy305', code: 'CYB305', name: 'Digital Forensics & Incident Response', maxMarks: 100, semester: 6 },
    { id: 'sub_cs205', code: 'CSE205', name: 'Operating Systems Design', maxMarks: 100, semester: 4 },
  ];

  const insertSubject = db.prepare(
    `INSERT INTO subjects (id, code, name, max_marks, semester) VALUES (?, ?, ?, ?, ?)`
  );
  for (const sub of subjects) {
    insertSubject.run(sub.id, sub.code, sub.name, sub.maxMarks, sub.semester);
  }

  const exams = [
    {
      id: 'exm_2026_s6',
      code: 'ET-2026-S6',
      title: 'End-Term Examination Spring 2026 (Sem 6)',
      session: '2025-2026',
      semester: 6,
      date: '2026-05-18',
    },
    {
      id: 'exm_2026_s4',
      code: 'ET-2026-S4',
      title: 'End-Term Examination Spring 2026 (Sem 4)',
      session: '2025-2026',
      semester: 4,
      date: '2026-05-20',
    },
  ];

  const insertExam = db.prepare(
    `INSERT INTO exams (id, exam_code, title, academic_session, semester, exam_date) VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const e of exams) {
    insertExam.run(e.id, e.code, e.title, e.session, e.semester, e.date);
  }

  // 4. Publish 10 real signed results through LedgerService
  const seedPublications = [
    { reg: 'DU2026CS001', examId: 'exm_2026_s6', sem: 6, code: 'CSE301', name: 'Applied Cryptography & Network Security', max: 100, marks: 91, ts: '2026-06-01T09:15:00.000Z' },
    { reg: 'DU2026CS001', examId: 'exm_2026_s6', sem: 6, code: 'CSE302', name: 'Distributed Systems Architecture', max: 100, marks: 74, ts: '2026-06-01T09:18:00.000Z' },
    { reg: 'DU2026CS001', examId: 'exm_2026_s6', sem: 6, code: 'CSE304', name: 'Database Internals & Indexing', max: 100, marks: 86, ts: '2026-06-01T09:21:00.000Z' },
    { reg: 'DU2026CS002', examId: 'exm_2026_s6', sem: 6, code: 'CSE301', name: 'Applied Cryptography & Network Security', max: 100, marks: 94, ts: '2026-06-01T09:24:00.000Z' },
    { reg: 'DU2026CS003', examId: 'exm_2026_s6', sem: 6, code: 'CSE302', name: 'Distributed Systems Architecture', max: 100, marks: 68, ts: '2026-06-01T09:27:00.000Z' },
    { reg: 'DU2026AI014', examId: 'exm_2026_s4', sem: 4, code: 'AIM201', name: 'Statistical Machine Learning', max: 100, marks: 89, ts: '2026-06-01T09:30:00.000Z' },
    { reg: 'DU2026AI019', examId: 'exm_2026_s4', sem: 4, code: 'AIM201', name: 'Statistical Machine Learning', max: 100, marks: 77, ts: '2026-06-01T09:33:00.000Z' },
    { reg: 'DU2026CY007', examId: 'exm_2026_s6', sem: 6, code: 'CYB305', name: 'Digital Forensics & Incident Response', max: 100, marks: 96, ts: '2026-06-01T09:36:00.000Z' },
    { reg: 'DU2026CY011', examId: 'exm_2026_s6', sem: 6, code: 'CYB305', name: 'Digital Forensics & Incident Response', max: 100, marks: 82, ts: '2026-06-01T09:39:00.000Z' },
    { reg: 'DU2026CS028', examId: 'exm_2026_s4', sem: 4, code: 'CSE205', name: 'Operating Systems Design', max: 100, marks: 84, ts: '2026-06-01T09:42:00.000Z' },
  ];

  const published = seedPublications.map((p) =>
    ledgerService.publishResult({
      registrationNumber: p.reg,
      examId: p.examId,
      academicSession: '2025-2026',
      semester: p.sem,
      subjectCode: p.code,
      subjectName: p.name,
      maxMarks: p.max,
      obtainedMarks: p.marks,
      publishedAt: p.ts,
      publisherUserId: 'usr_admin_01',
    })
  );

  // 5. Execute 1 genuine dual-signed correction on Aarav Sharma's CSE302 (74 -> 82)
  // so judges immediately see both VERIFIED — ORIGINAL and VERIFIED — SUPERSEDED receipts!
  let sampleCorrectedReceiptId: string | undefined;
  const targetForCorrection = published[1]; // DU2026CS001 CSE302 (74 -> 82)
  if (init.demoApproverRawKeys) {
    const corrReq = ledgerService.createCorrectionRequest({
      resultId: targetForCorrection.result.id,
      proposedMarks: 82,
      reason:
        'Re-evaluation script audit confirmed Question 4(b) carrying 8 marks was omitted during initial totaling.',
      requestedByUserId: 'usr_admin_01',
    });

    const msg = buildCorrectionSigningMessage(corrReq.signingPayload);
    const examinerSig = signEd25519Hex(
      msg,
      init.demoApproverRawKeys.examinerPrivateKeyHex
    );
    const controllerSig = signEd25519Hex(
      msg,
      init.demoApproverRawKeys.controllerPrivateKeyHex
    );

    ledgerService.submitApproval({
      correctionRequestId: corrReq.id,
      approverUserId: 'usr_examiner_01',
      approverRole: UserRole.EXAMINER,
      keyId: init.demoApproverRawKeys.examinerKeyId,
      signatureHex: examinerSig,
      decision: 'APPROVED',
      comment: 'Verified physical answer booklet page 14; 8 marks confirmed.',
    });

    ledgerService.submitApproval({
      correctionRequestId: corrReq.id,
      approverUserId: 'usr_controller_01',
      approverRole: UserRole.CONTROLLER,
      keyId: init.demoApproverRawKeys.controllerKeyId,
      signatureHex: controllerSig,
      decision: 'APPROVED',
      comment: 'Re-evaluation board tally matches; authorized for ledger amendment.',
    });

    const finalized = ledgerService.finalizeCorrection(corrReq.id, 'usr_admin_01');
    sampleCorrectedReceiptId = finalized.newReceipt.receiptId;
  }

  // 6. Create 2 pending correction requests for live Examiner + Controller signing demo
  const pending1 = ledgerService.createCorrectionRequest({
    resultId: published[4].result.id, // DU2026CS003 CSE302 (68 -> 75)
    proposedMarks: 75,
    reason:
      'Moderation review approved 7 marks for Question 6 after answer key clarification.',
    requestedByUserId: 'usr_admin_01',
  });

  // Pre-approve pending1 with Examiner only so Controller dashboard has a ready-to-cosign item too!
  if (init.demoApproverRawKeys) {
    const msg1 = buildCorrectionSigningMessage(pending1.signingPayload);
    const exSig1 = signEd25519Hex(
      msg1,
      init.demoApproverRawKeys.examinerPrivateKeyHex
    );
    ledgerService.submitApproval({
      correctionRequestId: pending1.id,
      approverUserId: 'usr_examiner_01',
      approverRole: UserRole.EXAMINER,
      keyId: init.demoApproverRawKeys.examinerKeyId,
      signatureHex: exSig1,
      decision: 'APPROVED',
      comment: 'Answer key rubric adjustment verified for Section B.',
    });
  }

  // Second pending request with zero approvals yet (for Examiner dashboard live signing!)
  ledgerService.createCorrectionRequest({
    resultId: published[6].result.id, // DU2026AI019 AIM201 (77 -> 83)
    proposedMarks: 83,
    reason:
      'Re-checking confirmed lab evaluation score of 6 marks was left unmerged during upload.',
    requestedByUserId: 'usr_admin_01',
  });

  // Run initial baseline audit so dashboard has a real verified audit record
  auditService.runAudit(true);

  return {
    seeded: true,
    sampleOriginalReceiptId: published[0].receipt.receiptId,
    sampleSupersededReceiptId: targetForCorrection.receipt.receiptId,
    sampleCorrectedReceiptId,
  };
}
