import { UserProfile, UserRole } from '../shared/types';
import {
  ExamMode,
  NotificationCategory,
  NotificationPriority,
  TicketCategory,
} from '../shared/v2Types';
import { AdmitCardService } from './admitCardService';
import { hashPassword } from './crypto';
import { VeriMarkDatabase } from './db';
import { ExamScheduleService } from './examScheduleService';
import { LedgerService } from './ledgerService';
import { NotificationService } from './notificationService';
import { RevaluationService } from './revaluationService';
import { TicketService } from './ticketService';

function futureDateIso(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Idempotently seeds VeriMark 2.0 examination schedules, examiner assignments,
 * digital admit cards, tickets, revaluation requests, and notifications.
 * Safe to run on both fresh databases and existing VeriMark 1.0 databases.
 */
export function seedV2DataIfEmpty(deps: {
  database: VeriMarkDatabase;
  ledgerService: LedgerService;
  notificationService: NotificationService;
  examScheduleService: ExamScheduleService;
  admitCardService: AdmitCardService;
  ticketService: TicketService;
  revaluationService: RevaluationService;
}): void {
  const {
    database,
    ledgerService,
    notificationService,
    examScheduleService,
    admitCardService,
    ticketService,
    revaluationService,
  } = deps;
  const db = database.db;

  // Ensure a second demo student account exists for privacy-isolation demos & tests
  const student2Exists = db
    .prepare(`SELECT id FROM users WHERE email = ?`)
    .get('ananya.verma@demouniversity.edu');
  if (!student2Exists) {
    const stu2 = db
      .prepare(`SELECT id FROM students WHERE id = 'stu_002'`)
      .get();
    if (stu2) {
      db.prepare(
        `INSERT OR IGNORE INTO users (id, email, full_name, password_hash, role, key_id, student_id, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
      ).run(
        'usr_student_02',
        'ananya.verma@demouniversity.edu',
        'Ananya Verma',
        hashPassword('Student@VeriMark2026'),
        UserRole.STUDENT,
        'stu_002',
        new Date().toISOString()
      );
    }
  }

  const existingSchedules = db
    .prepare(`SELECT COUNT(*) AS cnt FROM exam_schedules`)
    .get() as { cnt: number };
  if (Number(existingSchedules.cnt) > 0) {
    return;
  }

  const controllerRow = db
    .prepare(`SELECT id, email, full_name, role, key_id, student_id, created_at FROM users WHERE role = 'CONTROLLER' LIMIT 1`)
    .get() as Record<string, unknown> | undefined;
  const examinerRow = db
    .prepare(`SELECT id, email, full_name, role, key_id, student_id, created_at FROM users WHERE role = 'EXAMINER' LIMIT 1`)
    .get() as Record<string, unknown> | undefined;
  const studentRow = db
    .prepare(`SELECT id, email, full_name, role, key_id, student_id, created_at FROM users WHERE id = 'usr_student_01' LIMIT 1`)
    .get() as Record<string, unknown> | undefined;

  if (!controllerRow || !examinerRow || !studentRow) {
    return;
  }

  const mapUser = (r: Record<string, unknown>): UserProfile => ({
    id: String(r.id),
    email: String(r.email),
    fullName: String(r.full_name),
    role: String(r.role) as UserRole,
    keyId: r.key_id ? String(r.key_id) : null,
    studentId: r.student_id ? String(r.student_id) : null,
    createdAt: String(r.created_at),
  });

  const controller = mapUser(controllerRow);
  const examiner = mapUser(examinerRow);
  const student1 = mapUser(studentRow);

  // 1. Seed 4 Examination Schedules (3 PUBLISHED upcoming — mix of OFFLINE & ONLINE — + 1 DRAFT)
  const sch1 = examScheduleService.createSchedule(
    {
      examinationId: 'EXM-2026-CSE301-ET',
      subjectId: 'sub_cs301',
      academicSession: '2025-2026',
      course: 'B.Tech Computer Science',
      semester: 6,
      category: 'End-Term Theory',
      examDate: futureDateIso(3),
      startTime: '09:30',
      endTime: '12:30',
      timezone: 'Asia/Kolkata',
      mode: ExamMode.OFFLINE,
      campus: 'Main Academic Campus',
      building: 'Block 34 — School of Computing',
      room: 'LH-304',
      reportingTime: '09:00',
      requiredDocuments: 'Demo University Photo ID & VeriMark Digital/Printed Admit Card',
      instructions:
        'Non-programmable scientific calculators permitted. Electronic communication devices must remain outside the hall.',
      admitCardAvailable: true,
      examinerUserIds: [examiner.id],
      publishImmediately: true,
    },
    controller
  );

  const sch2 = examScheduleService.createSchedule(
    {
      examinationId: 'EXM-2026-CSE302-LAB',
      subjectId: 'sub_cs302',
      academicSession: '2025-2026',
      course: 'B.Tech Computer Science',
      semester: 6,
      category: 'Online Practical Assessment',
      examDate: futureDateIso(6),
      startTime: '14:00',
      endTime: '16:30',
      timezone: 'Asia/Kolkata',
      mode: ExamMode.ONLINE,
      onlineUrl: 'https://exam-portal.demouniversity.edu/session/cse302-spring26',
      accessInstructions:
        'Sign in with your university SSO credentials 10 minutes before start. Portal access window unlocks at scheduled start time.',
      reportingTime: '13:45',
      instructions:
        'Ensure stable broadband connection and updated browser. Submissions are auto-timestamped on the university portal.',
      admitCardAvailable: true,
      examinerUserIds: [examiner.id],
      publishImmediately: true,
    },
    controller
  );

  const sch3 = examScheduleService.createSchedule(
    {
      examinationId: 'EXM-2026-CSE304-ET',
      subjectId: 'sub_cs304',
      academicSession: '2025-2026',
      course: 'B.Tech Computer Science',
      semester: 6,
      category: 'End-Term Theory',
      examDate: futureDateIso(10),
      startTime: '10:00',
      endTime: '13:00',
      timezone: 'Asia/Kolkata',
      mode: ExamMode.OFFLINE,
      campus: 'Main Academic Campus',
      building: 'Block 38 — Engineering Wing',
      room: 'LH-210',
      reportingTime: '09:30',
      requiredDocuments: 'University ID Card & VeriMark Digital Admit Card',
      instructions: 'Answer booklets are barcoded; verify registration number on cover page.',
      admitCardAvailable: true,
      examinerUserIds: [examiner.id],
      publishImmediately: true,
    },
    controller
  );

  // Draft schedule visible only to Controller/Admin
  examScheduleService.createSchedule(
    {
      examinationId: 'EXM-2026-AIM201-DRAFT',
      subjectId: 'sub_ai201',
      academicSession: '2025-2026',
      course: 'B.Tech Artificial Intelligence',
      semester: 4,
      category: 'End-Term Theory',
      examDate: futureDateIso(14),
      startTime: '09:30',
      endTime: '12:30',
      timezone: 'Asia/Kolkata',
      mode: ExamMode.OFFLINE,
      campus: 'Main Academic Campus',
      building: 'Block 29 — AI Research Center',
      room: 'LH-105',
      reportingTime: '09:00',
      instructions: 'Draft schedule awaiting final room confirmation before publication.',
      admitCardAvailable: false,
      examinerUserIds: [],
      publishImmediately: false,
    },
    controller
  );

  // 2. Publish Digital Admit Cards + Seat Assignments for sch1 & sch2
  admitCardService.publishAdmitCardsForSchedule(sch1.id, controller);
  admitCardService.publishAdmitCardsForSchedule(sch2.id, controller);
  admitCardService.publishAdmitCardsForSchedule(sch3.id, controller);

  // 3. Seed Realistic Tickets & Revaluation Requests linked to real published results
  const student1Results = ledgerService.listResults({ studentId: 'stu_001' });
  const cse304Res = student1Results.find((r) => r.subjectCode === 'CSE304');
  const cse301Res = student1Results.find((r) => r.subjectCode === 'CSE301');

  if (cse304Res) {
    const t1 = ticketService.createTicket(
      {
        category: TicketCategory.INCORRECT_MARKS,
        subject: 'Question 3(c) totaling check requested for CSE304',
        description:
          'My published score in Database Internals & Indexing (CSE304) is 86/100, however Section B subtotal during paper viewing appeared to add up to 90. Kindly verify the physical answer script tally.',
        relatedExamId: cse304Res.examId,
        relatedResultId: cse304Res.id,
        priority: 'HIGH',
      },
      student1
    );

    ticketService.addMessage(
      t1.id,
      'Retrieved answer script bundle #CS304-B2 from records vault. Checking Question 3(c) rubric allocation.',
      true,
      examiner
    );
    ticketService.addMessage(
      t1.id,
      'Hello Aarav, I have pulled your CSE304 answer script for verification and will update you once the tally check is complete.',
      false,
      examiner
    );
  }

  // Second ticket: Online exam access question (escalated to Controller for demo visibility)
  const t2 = ticketService.createTicket(
    {
      category: TicketCategory.ONLINE_EXAM,
      subject: 'Clarification on browser requirements for CSE302 Online Practical',
      description:
        'For the upcoming CSE302 Online Practical Assessment, can we use Linux Chromium or is a specific browser profile required for the university portal?',
      relatedScheduleId: sch2.id,
      priority: 'MEDIUM',
    },
    student1
  );
  ticketService.escalateTicket(
    t2.id,
    'Escalating to Examination Controller to issue official browser compatibility guidance for the CSE302 online practical.',
    null,
    examiner
  );

  // 4. Seed 1 active Revaluation Request for Aarav Sharma's CSE301 (91 -> review)
  if (cse301Res) {
    revaluationService.submitRevaluation(
      {
        resultId: cse301Res.id,
        reason:
          'Requesting re-evaluation of Question 5 (Elliptic Curve Cryptography proof) where partial step marks may not have been awarded.',
      },
      student1
    );
  }

  // 5. Notify Controller about pending second-signature correction already in seeded DB
  const pendingCorrs = ledgerService.listCorrectionRequests();
  const awaitingCtrl = pendingCorrs.find(
    (c) =>
      c.approvals.some((a) => a.approverRole === 'EXAMINER') &&
      !c.approvals.some((a) => a.approverRole === 'CONTROLLER')
  );
  if (awaitingCtrl) {
    notificationService.notifyUsersByRole([UserRole.CONTROLLER], {
      category: NotificationCategory.CORRECTION,
      priority: NotificationPriority.HIGH,
      title: `Pending Second-Signature Approval (${awaitingCtrl.subjectCode})`,
      message: `Examiner signed correction ${awaitingCtrl.id} (${awaitingCtrl.oldMarks} → ${awaitingCtrl.proposedMarks}). Your independent Ed25519 co-signature is required.`,
      linkPath: '/approvals/controller',
      entityType: 'correction_request',
      entityId: awaitingCtrl.id,
    });
  }
}
