import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createVeriMarkApp } from '../server';
import {
  buildCorrectionSigningMessage,
  bytesToHex,
  hexToBytes,
} from '../shared/canonical';
import { EncryptedDemoKeyBundle } from '../shared/types';
import { ExamMode, TicketCategory, TicketStatus } from '../shared/v2Types';
import { signEd25519Hex } from './crypto';

async function decryptDemoKeyHex(
  bundle: EncryptedDemoKeyBundle,
  passphrase: string
): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const aesKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: hexToBytes(bundle.saltHex) as BufferSource,
      iterations: bundle.iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plainBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv: hexToBytes(bundle.ivHex) as BufferSource },
    aesKey,
    hexToBytes(bundle.ciphertextHex) as BufferSource
  );
  return bytesToHex(new Uint8Array(plainBuf));
}

interface HttpTestHarness {
  baseUrl: string;
  tmpDir: string;
  close: () => Promise<void>;
  appCtx: Awaited<ReturnType<typeof createVeriMarkApp>>;
  login: (email: string, password: string) => Promise<string>;
  api: (
    method: string,
    urlPath: string,
    opts?: { token?: string; body?: unknown }
  ) => Promise<{ status: number; json: any; raw: Buffer; headers: Headers }>;
}

async function startTestServer(): Promise<HttpTestHarness> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verimark-v2-test-'));
  const appCtx = await createVeriMarkApp({
    dbPath: path.join(tmpDir, 'data', 'verimark.sqlite'),
    trustDir: path.join(tmpDir, 'trust'),
    enableTamperLab: true,
    nodeEnv: 'development',
    isProduction: false,
  });

  const server = http.createServer(appCtx.app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const api: HttpTestHarness['api'] = async (method, urlPath, opts = {}) => {
    const headers: Record<string, string> = {};
    if (opts.token) {
      headers['Authorization'] = `Bearer ${opts.token}`;
    }
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const raw = Buffer.from(await res.arrayBuffer());
    let json: any = null;
    try {
      json = JSON.parse(raw.toString('utf8'));
    } catch {
      json = null;
    }
    return { status: res.status, json, raw, headers: res.headers };
  };

  const login = async (email: string, password: string): Promise<string> => {
    const r = await api('POST', '/api/auth/login', {
      body: { email, password },
    });
    assert.equal(r.status, 200, `Login failed for ${email}: ${JSON.stringify(r.json)}`);
    assert.ok(r.json.token);
    return r.json.token as string;
  };

  return {
    baseUrl,
    tmpDir,
    appCtx,
    login,
    api,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      appCtx.database.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

function futureDateIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test('V2-1. Strict RBAC & Student Ownership Isolation (Tickets, Admit Cards, Schedules)', async () => {
  const h = await startTestServer();
  try {
    const student1Token = await h.login('student@demouniversity.edu', 'Student@VeriMark2026');
    const student2Token = await h.login('ananya.verma@demouniversity.edu', 'Student@VeriMark2026');
    const examinerToken = await h.login('examiner@demouniversity.edu', 'Examiner@VeriMark2026');

    // Student 1 sees their own seeded tickets & admit cards
    const s1Tickets = await h.api('GET', '/api/tickets', { token: student1Token });
    assert.equal(s1Tickets.status, 200);
    assert.ok(s1Tickets.json.tickets.length >= 1);
    const s1TicketId = s1Tickets.json.tickets[0].id;

    // Student 2 MUST get 403 accessing Student 1's ticket
    const s2ViewS1Ticket = await h.api('GET', `/api/tickets/${s1TicketId}`, {
      token: student2Token,
    });
    assert.equal(s2ViewS1Ticket.status, 403);

    // Student 1 has admit cards; Student 2 MUST get 403 accessing Student 1's admit card & PDF
    const s1Cards = await h.api('GET', '/api/admit-cards', { token: student1Token });
    assert.equal(s1Cards.status, 200);
    assert.ok(s1Cards.json.admitCards.length >= 1);
    const s1CardId = s1Cards.json.admitCards[0].id;

    const s2Card = await h.api('GET', `/api/admit-cards/${s1CardId}`, {
      token: student2Token,
    });
    assert.equal(s2Card.status, 403);

    const s2CardPdf = await h.api('GET', `/api/admit-cards/${s1CardId}/pdf`, {
      token: student2Token,
    });
    assert.equal(s2CardPdf.status, 403);

    // Student CANNOT create an exam schedule or publish admit cards
    const studentCreateSched = await h.api('POST', '/api/exam-schedules', {
      token: student1Token,
      body: {
        subjectId: 'sub_cs301',
        course: 'B.Tech Computer Science',
        semester: 6,
        examDate: futureDateIso(20),
        startTime: '09:00',
        endTime: '12:00',
        mode: ExamMode.OFFLINE,
      },
    });
    assert.equal(studentCreateSched.status, 403);

    // Examiner CANNOT publish admit cards
    const examinerPublishAdmit = await h.api('POST', '/api/admit-cards/publish', {
      token: examinerToken,
      body: { scheduleId: 'any' },
    });
    assert.equal(examinerPublishAdmit.status, 403);
  } finally {
    await h.close();
  }
});

test('V2-2. Exam Schedule Conflict Checks, Mode Change Notifications, URL Validation & Timetable PDF', async () => {
  const h = await startTestServer();
  try {
    const controllerToken = await h.login('controller@demouniversity.edu', 'Controller@VeriMark2026');
    const student1Token = await h.login('student@demouniversity.edu', 'Student@VeriMark2026');
    const examinerToken = await h.login('examiner@demouniversity.edu', 'Examiner@VeriMark2026');

    const examDate = futureDateIso(25);

    // Reject dangerous javascript: URL in ONLINE mode
    const badUrlRes = await h.api('POST', '/api/exam-schedules', {
      token: controllerToken,
      body: {
        subjectId: 'sub_cs301',
        academicSession: '2025-2026',
        course: 'B.Tech Computer Science',
        semester: 6,
        examDate,
        startTime: '10:00',
        endTime: '12:00',
        mode: ExamMode.ONLINE,
        onlineUrl: 'javascript:alert(1)',
      },
    });
    assert.equal(badUrlRes.status, 400);

    // Create & publish a valid OFFLINE exam schedule
    const createRes = await h.api('POST', '/api/exam-schedules', {
      token: controllerToken,
      body: {
        subjectId: 'sub_cs301',
        academicSession: '2025-2026',
        course: 'B.Tech Computer Science',
        semester: 6,
        category: 'Special Viva',
        examDate,
        startTime: '10:00',
        endTime: '12:00',
        mode: ExamMode.OFFLINE,
        campus: 'Main Campus',
        building: 'Block 34',
        room: 'LH-412',
        reportingTime: '09:30',
        examinerUserIds: ['usr_examiner_01'],
        publishImmediately: true,
      },
    });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.json));
    const scheduleId = createRes.json.schedule.id as string;

    // Overlapping cohort/room/examiner schedule MUST be rejected with 409
    const conflictRes = await h.api('POST', '/api/exam-schedules', {
      token: controllerToken,
      body: {
        subjectId: 'sub_cs302',
        academicSession: '2025-2026',
        course: 'B.Tech Computer Science',
        semester: 6,
        examDate,
        startTime: '11:00',
        endTime: '13:00',
        mode: ExamMode.OFFLINE,
        room: 'LH-412',
        examinerUserIds: ['usr_examiner_01'],
      },
    });
    assert.equal(conflictRes.status, 409);

    // Switch exam mode OFFLINE -> ONLINE and verify history + student & examiner notifications
    const s1NotifBefore = await h.api('GET', '/api/notifications', { token: student1Token });
    const exNotifBefore = await h.api('GET', '/api/notifications', { token: examinerToken });

    const modeChangeRes = await h.api('PATCH', `/api/exam-schedules/${scheduleId}`, {
      token: controllerToken,
      body: {
        mode: ExamMode.ONLINE,
        onlineUrl: 'https://exam-portal.demouniversity.edu/session/viva-412',
        accessInstructions: 'Join 10 minutes before start with university SSO.',
      },
    });
    assert.equal(modeChangeRes.status, 200, JSON.stringify(modeChangeRes.json));
    assert.equal(modeChangeRes.json.schedule.mode, ExamMode.ONLINE);

    const histRes = await h.api('GET', `/api/exam-schedules/${scheduleId}/history`, {
      token: controllerToken,
    });
    assert.equal(histRes.status, 200);
    assert.ok(histRes.json.history.length >= 2);

    const s1NotifAfter = await h.api('GET', '/api/notifications', { token: student1Token });
    const exNotifAfter = await h.api('GET', '/api/notifications', { token: examinerToken });
    assert.ok(s1NotifAfter.json.notifications.length > s1NotifBefore.json.notifications.length);
    assert.ok(exNotifAfter.json.notifications.length > exNotifBefore.json.notifications.length);

    // Download timetable PDF -> must be valid %PDF-
    const pdfRes = await h.api('GET', '/api/exam-schedules/pdf', { token: student1Token });
    assert.equal(pdfRes.status, 200);
    assert.equal(pdfRes.raw.subarray(0, 5).toString('ascii'), '%PDF-');
  } finally {
    await h.close();
  }
});

test('V2-3. Evidence Attachment Validation (MIME Allowlist, Magic Bytes, Size Limit & Ownership)', async () => {
  const h = await startTestServer();
  try {
    const student1Token = await h.login('student@demouniversity.edu', 'Student@VeriMark2026');
    const student2Token = await h.login('ananya.verma@demouniversity.edu', 'Student@VeriMark2026');

    // 1. Disallowed MIME type (text/html) -> 400
    const badMime = await h.api('POST', '/api/tickets', {
      token: student1Token,
      body: {
        category: TicketCategory.OTHER_ACADEMIC,
        subject: 'Bad MIME attachment test',
        description: 'Testing MIME allowlist rejection.',
        attachment: {
          originalName: 'evil.html',
          mimeType: 'text/html',
          contentBase64: Buffer.from('<script>alert(1)</script>').toString('base64'),
        },
      },
    });
    assert.equal(badMime.status, 400);

    // 2. Spoofed PDF magic bytes -> 400
    const spoofedPdf = await h.api('POST', '/api/tickets', {
      token: student1Token,
      body: {
        category: TicketCategory.OTHER_ACADEMIC,
        subject: 'Spoofed PDF test',
        description: 'Plain text masquerading as PDF must be rejected.',
        attachment: {
          originalName: 'fake.pdf',
          mimeType: 'application/pdf',
          contentBase64: Buffer.from('NOT_A_REAL_PDF_HEADER').toString('base64'),
        },
      },
    });
    assert.equal(spoofedPdf.status, 400);

    // 3. Oversized payload (> 2 MB decoded) -> 400
    const bigBuf = Buffer.alloc(2 * 1024 * 1024 + 256, 0x41);
    const oversized = await h.api('POST', '/api/tickets', {
      token: student1Token,
      body: {
        category: TicketCategory.OTHER_ACADEMIC,
        subject: 'Oversized attachment test',
        description: 'Testing exact 2MB attachment limit.',
        attachment: {
          originalName: 'huge.txt',
          mimeType: 'text/plain',
          contentBase64: bigBuf.toString('base64'),
        },
      },
    });
    assert.equal(oversized.status, 400);

    // 4. Valid text/plain attachment -> 201, downloadable by Student 1, 403 for Student 2
    const validTicket = await h.api('POST', '/api/tickets', {
      token: student1Token,
      body: {
        category: TicketCategory.OTHER_ACADEMIC,
        subject: 'Valid evidence note upload',
        description: 'Attaching plain text evidence summary.',
        attachment: {
          originalName: 'evidence-note.txt',
          mimeType: 'text/plain',
          contentBase64: Buffer.from('Answer script tally note: Section B = 45/50').toString('base64'),
        },
      },
    });
    assert.equal(validTicket.status, 201, JSON.stringify(validTicket.json));
    const attachmentId = validTicket.json.ticket.attachments[0].id as string;

    const dlOwner = await h.api('GET', `/api/attachments/${attachmentId}`, {
      token: student1Token,
    });
    assert.equal(dlOwner.status, 200);
    assert.ok(dlOwner.raw.toString('utf8').includes('Section B = 45/50'));

    const dlOtherStudent = await h.api('GET', `/api/attachments/${attachmentId}`, {
      token: student2Token,
    });
    assert.equal(dlOtherStudent.status, 403);
  } finally {
    await h.close();
  }
});

test('V2-4. End-to-End Ticket-to-Correction Workflow with Staff-Only Notes & Dual Ed25519 Finalization', async () => {
  const h = await startTestServer();
  try {
    const student1Token = await h.login('student@demouniversity.edu', 'Student@VeriMark2026');
    const examinerToken = await h.login('examiner@demouniversity.edu', 'Examiner@VeriMark2026');
    const controllerToken = await h.login('controller@demouniversity.edu', 'Controller@VeriMark2026');

    // Pick Student 1's CSE304 result (originally 86, v1)
    const resultsRes = await h.api('GET', '/api/results', { token: student1Token });
    assert.equal(resultsRes.status, 200);
    const cse304 = resultsRes.json.results.find((r: any) => r.subjectCode === 'CSE304');
    assert.ok(cse304, 'Seeded CSE304 result should exist');
    const originalMarks = cse304.obtainedMarks;
    const originalVersion = cse304.version;
    const proposedMarks = Math.min(100, originalMarks + 4);

    // 1. Student raises INCORRECT_MARKS ticket
    const ticketCreate = await h.api('POST', '/api/tickets', {
      token: student1Token,
      body: {
        category: TicketCategory.INCORRECT_MARKS,
        subject: 'CSE304 Section B totaling discrepancy',
        description: 'Section B marks sum to 4 points higher than recorded total.',
        relatedResultId: cse304.id,
        priority: 'HIGH',
      },
    });
    assert.equal(ticketCreate.status, 201);
    const ticketId = ticketCreate.json.ticket.id as string;

    // 2. Examiner adds a staff-only internal note & escalates to Controller
    const internalSecret = 'CONFIDENTIAL_STAFF_NOTE_SCRIPT_BOX_77';
    const noteRes = await h.api('POST', `/api/tickets/${ticketId}/messages`, {
      token: examinerToken,
      body: { body: internalSecret, isInternalNote: true },
    });
    assert.equal(noteRes.status, 201);

    // Student MUST NOT see the internal note!
    const studentView = await h.api('GET', `/api/tickets/${ticketId}`, {
      token: student1Token,
    });
    assert.equal(studentView.status, 200);
    assert.equal(
      JSON.stringify(studentView.json.ticket.messages).includes(internalSecret),
      false,
      'Internal staff note leaked to student!'
    );

    // Controller DOES see the internal note
    const controllerView = await h.api('GET', `/api/tickets/${ticketId}`, {
      token: controllerToken,
    });
    assert.equal(
      JSON.stringify(controllerView.json.ticket.messages).includes(internalSecret),
      true
    );

    // Examiner escalates with recommendation
    const escRes = await h.api('POST', `/api/tickets/${ticketId}/escalate`, {
      token: examinerToken,
      body: {
        reason: 'Verified physical answer booklet; 4 marks were omitted in subtotal.',
        recommendedMarks: proposedMarks,
      },
    });
    assert.equal(escRes.status, 200);
    assert.equal(escRes.json.ticket.status, TicketStatus.ESCALATED);

    // 3. Controller initiates formal CorrectionRequest from ticket
    const initCorrRes = await h.api('POST', `/api/tickets/${ticketId}/initiate-correction`, {
      token: controllerToken,
      body: {
        proposedMarks,
        reason: 'Confirmed 4 omitted marks in Section B via Ticket-to-Correction workflow.',
      },
    });
    assert.equal(initCorrRes.status, 201, JSON.stringify(initCorrRes.json));
    const correction = initCorrRes.json.ticket.linkedCorrection;
    assert.ok(correction?.id);
    assert.equal(initCorrRes.json.correctionId, correction.id);
    assert.equal(initCorrRes.json.ticket.status, TicketStatus.IN_PROGRESS);

    // CRITICAL SECURITY CHECK: marks must NOT have changed before dual Ed25519 finalization!
    const resultsBeforeSig = await h.api('GET', '/api/results', { token: student1Token });
    const cse304BeforeSig = resultsBeforeSig.json.results.find((r: any) => r.id === cse304.id);
    assert.equal(cse304BeforeSig.obtainedMarks, originalMarks);
    assert.equal(cse304BeforeSig.version, originalVersion);

    // 4. Decrypt real browser AES-256-GCM demo keys and sign independently with Ed25519
    const vault = h.appCtx.trustStore.getEncryptedDemoVault();
    const examinerBundle = vault.find((b: EncryptedDemoKeyBundle) => b.role === 'EXAMINER')!;
    const controllerBundle = vault.find((b: EncryptedDemoKeyBundle) => b.role === 'CONTROLLER')!;
    const examinerPrivHex = await decryptDemoKeyHex(examinerBundle, 'ExaminerSign#2026');
    const controllerPrivHex = await decryptDemoKeyHex(controllerBundle, 'ControllerSign#2026');

    const signingMsg = buildCorrectionSigningMessage(correction.signingPayload);
    const examinerSig = signEd25519Hex(signingMsg, examinerPrivHex);
    const controllerSig = signEd25519Hex(signingMsg, controllerPrivHex);

    const exApprove = await h.api('POST', `/api/corrections/${correction.id}/approve`, {
      token: examinerToken,
      body: { keyId: examinerBundle.keyId, signatureHex: examinerSig, decision: 'APPROVED' },
    });
    assert.equal(exApprove.status, 200, JSON.stringify(exApprove.json));

    const ctrlApprove = await h.api('POST', `/api/corrections/${correction.id}/approve`, {
      token: controllerToken,
      body: { keyId: controllerBundle.keyId, signatureHex: controllerSig, decision: 'APPROVED' },
    });
    assert.equal(ctrlApprove.status, 200, JSON.stringify(ctrlApprove.json));

    // 5. Controller finalizes correction -> anchors new ledger block + checkpoint + auto-resolves ticket!
    const finRes = await h.api('POST', `/api/corrections/${correction.id}/finalize`, {
      token: controllerToken,
    });
    assert.equal(finRes.status, 200, JSON.stringify(finRes.json));
    assert.equal(finRes.json.result.obtainedMarks, proposedMarks);
    assert.equal(finRes.json.result.version, originalVersion + 1);

    // Linked ticket must have auto-transitioned to RESOLVED
    const ticketAfterFin = await h.api('GET', `/api/tickets/${ticketId}`, {
      token: student1Token,
    });
    assert.equal(ticketAfterFin.status, 200);
    assert.equal(ticketAfterFin.json.ticket.status, TicketStatus.RESOLVED);

    // Ledger audit must remain VERIFIED
    const auditRes = await h.api('GET', '/api/security/audit', { token: controllerToken });
    assert.equal(auditRes.status, 200);
    assert.equal(auditRes.json.report.status, 'VERIFIED');
    assert.equal(auditRes.json.report.issues.length, 0);

    // Result Comparison endpoint shows Original -> Corrected cards + delta + signers
    const cmpRes = await h.api('GET', `/api/results/${cse304.id}/comparison`, {
      token: student1Token,
    });
    assert.equal(cmpRes.status, 200, JSON.stringify(cmpRes.json));
    assert.equal(cmpRes.json.hasFinalizedCorrection, true);
    assert.equal(cmpRes.json.originalVersion.obtainedMarks, originalMarks);
    assert.equal(cmpRes.json.latestVersion.obtainedMarks, proposedMarks);
    assert.equal(cmpRes.json.marksDelta, proposedMarks - originalMarks);
    assert.ok(cmpRes.json.finalizedCorrections.length >= 1);
    assert.equal(cmpRes.json.finalizedCorrections[0].approvals.length, 2);
  } finally {
    await h.close();
  }
});

test('V2-5. Revaluation Duplicate Guard & Non-Mutation Security Rule', async () => {
  const h = await startTestServer();
  try {
    const student1Token = await h.login('student@demouniversity.edu', 'Student@VeriMark2026');
    const examinerToken = await h.login('examiner@demouniversity.edu', 'Examiner@VeriMark2026');
    const controllerToken = await h.login('controller@demouniversity.edu', 'Controller@VeriMark2026');

    const resultsRes = await h.api('GET', '/api/results', { token: student1Token });
    // CSE304 has no seeded revaluation yet (CSE301 has the seeded one)
    const cse304 = resultsRes.json.results.find((r: any) => r.subjectCode === 'CSE304');
    assert.ok(cse304);
    const marksBefore = cse304.obtainedMarks;

    // Submit revaluation
    const rev1 = await h.api('POST', '/api/revaluations', {
      token: student1Token,
      body: {
        resultId: cse304.id,
        reason: 'Requesting formal revaluation of Question 4 B+ tree derivation.',
      },
    });
    assert.equal(rev1.status, 201, JSON.stringify(rev1.json));
    const revalId = rev1.json.revaluation.id as string;

    // Duplicate active revaluation on same result MUST return 409
    const dup = await h.api('POST', '/api/revaluations', {
      token: student1Token,
      body: {
        resultId: cse304.id,
        reason: 'Duplicate revaluation attempt must be blocked.',
      },
    });
    assert.equal(dup.status, 409);

    // Examiner recommends mark increase
    const recRes = await h.api('POST', `/api/revaluations/${revalId}/recommendation`, {
      token: examinerToken,
      body: {
        recommendation: 'APPROVE',
        recommendedMarks: marksBefore + 3,
        notes: 'Partial derivation credit of 3 marks warranted on Question 4.',
      },
    });
    assert.equal(recRes.status, 200);

    // Controller approves revaluation for correction & initiates correction request
    const decRes = await h.api('POST', `/api/revaluations/${revalId}/decision`, {
      token: controllerToken,
      body: {
        decision: 'APPROVED_FOR_CORRECTION',
        notes: 'Approved; routing to dual-signature Ed25519 correction workflow.',
        proposedMarks: marksBefore + 3,
        initiateCorrection: true,
      },
    });
    assert.equal(decRes.status, 200, JSON.stringify(decRes.json));
    assert.ok(decRes.json.correctionId);

    // CRITICAL: Published marks MUST STILL BE UNCHANGED until two Ed25519 signatures finalize!
    const resultsAfter = await h.api('GET', '/api/results', { token: student1Token });
    const cse304After = resultsAfter.json.results.find((r: any) => r.id === cse304.id);
    assert.equal(cse304After.obtainedMarks, marksBefore);
  } finally {
    await h.close();
  }
});

test('V2-6. Digital Admit Card Reissue, Public Token Verification & PDF Generation', async () => {
  const h = await startTestServer();
  try {
    const controllerToken = await h.login('controller@demouniversity.edu', 'Controller@VeriMark2026');
    const student1Token = await h.login('student@demouniversity.edu', 'Student@VeriMark2026');

    const cardsV1 = await h.api('GET', '/api/admit-cards', { token: student1Token });
    assert.equal(cardsV1.status, 200);
    assert.ok(cardsV1.json.admitCards.length >= 1);
    const oldCard = cardsV1.json.admitCards[0];
    const oldToken = oldCard.verificationToken as string;

    // Public verification of active v1 card (NO auth header)
    const pubV1 = await h.api('GET', `/api/admit-cards/verify/${encodeURIComponent(oldToken)}`);
    assert.equal(pubV1.status, 200);
    assert.equal(pubV1.json.status, 'VALID');
    const disc = String(pubV1.json.disclaimer ?? '').toLowerCase();
    assert.ok(disc.includes('attendance') && disc.includes('marks'));

    // Reissue admit cards for the same schedule
    const reissueRes = await h.api('POST', '/api/admit-cards/publish', {
      token: controllerToken,
      body: { scheduleId: oldCard.scheduleId, reissueExisting: true },
    });
    assert.equal(reissueRes.status, 201);

    // Old token must now verify as REISSUED
    const pubOldAfter = await h.api('GET', `/api/admit-cards/verify/${encodeURIComponent(oldToken)}`);
    assert.equal(pubOldAfter.status, 200);
    assert.equal(pubOldAfter.json.status, 'REISSUED');

    // New v2 card must verify as VALID and generate real %PDF-
    const cardsV2 = await h.api('GET', `/api/admit-cards?scheduleId=${encodeURIComponent(oldCard.scheduleId)}`, {
      token: student1Token,
    });
    const newCard = cardsV2.json.admitCards.find((c: any) => c.status === 'ACTIVE');
    assert.ok(newCard);
    assert.equal(newCard.version, oldCard.version + 1);

    const pubNew = await h.api('GET', `/api/admit-cards/verify/${encodeURIComponent(newCard.verificationToken)}`);
    assert.equal(pubNew.status, 200);
    assert.equal(pubNew.json.status, 'VALID');

    const pdfRes = await h.api('GET', `/api/admit-cards/${newCard.id}/pdf`, {
      token: student1Token,
    });
    assert.equal(pdfRes.status, 200);
    assert.equal(pdfRes.raw.subarray(0, 5).toString('ascii'), '%PDF-');
  } finally {
    await h.close();
  }
});

test('V2-7. Role-Scoped Analytics & Dashboard Summaries Compute Accurate Latest-Version Metrics', async () => {
  const h = await startTestServer();
  try {
    const student1Token = await h.login('student@demouniversity.edu', 'Student@VeriMark2026');
    const examinerToken = await h.login('examiner@demouniversity.edu', 'Examiner@VeriMark2026');
    const controllerToken = await h.login('controller@demouniversity.edu', 'Controller@VeriMark2026');

    const [sAnalytics, eAnalytics, cAnalytics, sDash, eDash, cDash] = await Promise.all([
      h.api('GET', '/api/analytics/student', { token: student1Token }),
      h.api('GET', '/api/analytics/examiner', { token: examinerToken }),
      h.api('GET', '/api/analytics/controller', { token: controllerToken }),
      h.api('GET', '/api/dashboard/student-summary', { token: student1Token }),
      h.api('GET', '/api/dashboard/examiner-summary', { token: examinerToken }),
      h.api('GET', '/api/dashboard/controller-summary', { token: controllerToken }),
    ]);

    assert.equal(sAnalytics.status, 200);
    assert.equal(eAnalytics.status, 200);
    assert.equal(cAnalytics.status, 200);
    assert.equal(sDash.status, 200);
    assert.equal(eDash.status, 200);
    assert.equal(cDash.status, 200);

    // Student analytics subject count matches exact distinct published results (no double-counting v1+v2)
    const studentResults = await h.api('GET', '/api/results', { token: student1Token });
    assert.equal(sAnalytics.json.summary.totalSubjects, studentResults.json.results.length);

    // Examiner analytics are strictly scoped to examiner's assigned subjects
    const scopeCodes = (eAnalytics.json.scopeSubjects as Array<{ subjectCode: string }>).map(
      (s) => s.subjectCode
    );
    assert.ok(scopeCodes.length >= 1);
    for (const sub of eAnalytics.json.subjectDistribution) {
      assert.ok(scopeCodes.includes(sub.subjectCode));
    }

    // Controller summary includes live ledger integrity status
    assert.equal(cDash.json.cards.ledgerIntegrityStatus, 'VERIFIED');
    assert.ok(cAnalytics.json.summary.totalPublishedResults >= studentResults.json.results.length);
  } finally {
    await h.close();
  }
});
