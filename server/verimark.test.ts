import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  GENESIS_PREVIOUS_HASH,
  buildBlockHashPreimage,
  buildCorrectionSigningMessage,
  buildPayloadHashPreimage,
  canonicalJson,
} from '../shared/canonical';
import { UserRole, VerificationStatus } from '../shared/types';
import { verifyProofIndependently } from '../shared/verifier';
import { AuditService } from './auditService';
import {
  generateEd25519Keypair,
  hashPassword,
  sha256Hex,
  signEd25519Hex,
} from './crypto';
import { VeriMarkDatabase } from './db';
import { DomainError, LedgerService } from './ledgerService';
import { generateMarksheetPdf } from './pdfService';
import { ExternalTrustStore } from './trustStore';
import { VerifyService } from './verifyService';

interface TestHarness {
  tmpDir: string;
  db: VeriMarkDatabase;
  trustStore: ExternalTrustStore;
  ledgerService: LedgerService;
  auditService: AuditService;
  verifyService: VerifyService;
  examinerPriv: string;
  examinerKeyId: string;
  controllerPriv: string;
  controllerKeyId: string;
  cleanup: () => void;
}

async function createHarness(): Promise<TestHarness> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verimark-test-'));
  const dbPath = path.join(tmpDir, 'db', 'verimark.sqlite');
  const trustDir = path.join(tmpDir, 'trust');

  const db = new VeriMarkDatabase(dbPath);
  const trustStore = new ExternalTrustStore(trustDir);
  const init = await trustStore.ensureInitialized();

  const ledgerService = new LedgerService(db, trustStore);
  const auditService = new AuditService(db, trustStore);
  const verifyService = new VerifyService(db, trustStore, ledgerService);

  const now = new Date().toISOString();

  // Seed 2 students + 4 role users + 1 exam + 2 subjects
  db.db
    .prepare(
      `INSERT INTO students (id, registration_number, full_name, course, semester, academic_session, email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('stu_1', 'TEST001', 'Aarav Test', 'B.Tech CSE', 6, '2025-2026', 'aarav@test.edu', now, now);

  db.db
    .prepare(
      `INSERT INTO students (id, registration_number, full_name, course, semester, academic_session, email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('stu_2', 'TEST002', 'Secret Private Student', 'B.Tech AI', 4, '2025-2026', 'secret@test.edu', now, now);

  const users = [
    ['usr_admin', 'admin@test.edu', 'Admin One', UserRole.SUPER_ADMIN, 'pub-registrar-ed25519-01', null],
    ['usr_examiner', 'examiner@test.edu', 'Examiner One', UserRole.EXAMINER, init.demoApproverRawKeys!.examinerKeyId, null],
    ['usr_controller', 'controller@test.edu', 'Controller One', UserRole.CONTROLLER, init.demoApproverRawKeys!.controllerKeyId, null],
    ['usr_student', 'student@test.edu', 'Aarav Test', UserRole.STUDENT, null, 'stu_1'],
  ] as const;

  const insUser = db.db.prepare(
    `INSERT INTO users (id, email, full_name, password_hash, role, key_id, student_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const u of users) {
    insUser.run(u[0], u[1], u[2], hashPassword('TestPass#123'), u[3], u[4], u[5], now);
  }

  db.db
    .prepare(
      `INSERT INTO exams (id, exam_code, title, academic_session, semester, exam_date) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run('exm_1', 'ET-2026', 'End Term 2026', '2025-2026', 6, '2026-05-15');

  return {
    tmpDir,
    db,
    trustStore,
    ledgerService,
    auditService,
    verifyService,
    examinerPriv: init.demoApproverRawKeys!.examinerPrivateKeyHex,
    examinerKeyId: init.demoApproverRawKeys!.examinerKeyId,
    controllerPriv: init.demoApproverRawKeys!.controllerPrivateKeyHex,
    controllerKeyId: init.demoApproverRawKeys!.controllerKeyId,
    cleanup: () => {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

test('1 & 2. Publish a normal result, verify authentic receipt, and generate PDF marksheet', async () => {
  const h = await createHarness();
  try {
    const pub = h.ledgerService.publishResult({
      registrationNumber: 'TEST001',
      examId: 'exm_1',
      academicSession: '2025-2026',
      semester: 6,
      subjectCode: 'CSE301',
      subjectName: 'Applied Cryptography',
      maxMarks: 100,
      obtainedMarks: 88,
      publisherUserId: 'usr_admin',
    });

    assert.equal(pub.ledgerEntry.sequence, 1);
    assert.equal(pub.checkpoint.sequence, 1);
    assert.equal(pub.result.obtainedMarks, 88);

    const verification = h.verifyService.verifyReceipt(
      pub.receipt.receiptId,
      pub.receipt.shortFingerprint
    );
    assert.equal(verification.status, VerificationStatus.VERIFIED_ORIGINAL);
    assert.equal(verification.originalRecord?.obtainedMarks, 88);

    const pdf = await generateMarksheetPdf({
      result: pub.result,
      receipt: pub.receipt,
      verifyUrl: `http://localhost:3000/verify/${pub.receipt.receiptId}`,
    });
    assert.equal(Buffer.from(pdf.subarray(0, 5)).toString('ascii'), '%PDF-');

    const audit = h.auditService.runAudit(true);
    assert.equal(audit.status, 'VERIFIED');
    assert.equal(audit.issues.length, 0);
  } finally {
    h.cleanup();
  }
});

test('3. Reject invalid marks and rollback when checkpoint anchoring fails', async () => {
  const h = await createHarness();
  try {
    assert.throws(
      () =>
        h.ledgerService.publishResult({
          registrationNumber: 'TEST001',
          examId: 'exm_1',
          academicSession: '2025-2026',
          semester: 6,
          subjectCode: 'CSE301',
          subjectName: 'Applied Cryptography',
          maxMarks: 100,
          obtainedMarks: 105,
          publisherUserId: 'usr_admin',
        }),
      (err: unknown) => err instanceof DomainError && err.statusCode === 400
    );

    assert.throws(
      () =>
        h.ledgerService.publishResult({
          registrationNumber: 'TEST001',
          examId: 'exm_1',
          academicSession: '2025-2026',
          semester: 6,
          subjectCode: 'CSE301',
          subjectName: 'Applied Cryptography',
          maxMarks: 100,
          obtainedMarks: -5,
          publisherUserId: 'usr_admin',
        }),
      (err: unknown) => err instanceof DomainError && err.statusCode === 400
    );

    // Checkpoint anchoring failure must roll back DB transaction completely!
    h.trustStore.setSimulateCheckpointFailure(true);
    assert.throws(
      () =>
        h.ledgerService.publishResult({
          registrationNumber: 'TEST001',
          examId: 'exm_1',
          academicSession: '2025-2026',
          semester: 6,
          subjectCode: 'CSE301',
          subjectName: 'Applied Cryptography',
          maxMarks: 100,
          obtainedMarks: 80,
          publisherUserId: 'usr_admin',
        }),
      (err: unknown) =>
        err instanceof DomainError && err.code === 'CHECKPOINT_ANCHOR_FAILED'
    );
    assert.equal(h.ledgerService.listLedgerEntries().length, 0);
    assert.equal(h.ledgerService.listResults().length, 0);
  } finally {
    h.cleanup();
  }
});

test('4. Detect direct SQL modification of current marks', async () => {
  const h = await createHarness();
  try {
    const pub = h.ledgerService.publishResult({
      registrationNumber: 'TEST001',
      examId: 'exm_1',
      academicSession: '2025-2026',
      semester: 6,
      subjectCode: 'CSE301',
      subjectName: 'Applied Cryptography',
      maxMarks: 100,
      obtainedMarks: 72,
      publisherUserId: 'usr_admin',
    });

    h.db.db
      .prepare(`UPDATE results SET obtained_marks = 95 WHERE id = ?`)
      .run(pub.result.id);

    const audit = h.auditService.runAudit(true);
    assert.equal(audit.status, 'TAMPERING_DETECTED');
    assert.ok(audit.issues.some((i) => i.type === 'DIRECT_MARKS_TAMPERING'));

    const verify = h.verifyService.verifyReceipt(pub.receipt.receiptId);
    assert.equal(verify.status, VerificationStatus.TAMPERING_DETECTED);
  } finally {
    h.cleanup();
  }
});

test('5. Detect a modified ledger payload', async () => {
  const h = await createHarness();
  try {
    const pub = h.ledgerService.publishResult({
      registrationNumber: 'TEST001',
      examId: 'exm_1',
      academicSession: '2025-2026',
      semester: 6,
      subjectCode: 'CSE301',
      subjectName: 'Applied Cryptography',
      maxMarks: 100,
      obtainedMarks: 70,
      publisherUserId: 'usr_admin',
    });

    const tampered = { ...pub.ledgerEntry.payload, obtainedMarks: 99 };
    h.db.db
      .prepare(`UPDATE ledger_entries SET payload_json = ? WHERE sequence = 1`)
      .run(canonicalJson(tampered));

    const audit = h.auditService.runAudit(true);
    assert.equal(audit.status, 'TAMPERING_DETECTED');
    assert.ok(audit.issues.some((i) => i.type === 'MODIFIED_LEDGER_PAYLOAD'));
    assert.equal(audit.firstInvalidBlock, 1);
  } finally {
    h.cleanup();
  }
});

test('6. Detect a broken hash-chain link', async () => {
  const h = await createHarness();
  try {
    h.ledgerService.publishResult({
      registrationNumber: 'TEST001',
      examId: 'exm_1',
      academicSession: '2025-2026',
      semester: 6,
      subjectCode: 'CSE301',
      subjectName: 'Applied Cryptography',
      maxMarks: 100,
      obtainedMarks: 75,
      publisherUserId: 'usr_admin',
    });
    h.ledgerService.publishResult({
      registrationNumber: 'TEST002',
      examId: 'exm_1',
      academicSession: '2025-2026',
      semester: 6,
      subjectCode: 'CSE302',
      subjectName: 'Distributed Systems',
      maxMarks: 100,
      obtainedMarks: 82,
      publisherUserId: 'usr_admin',
    });

    h.db.db
      .prepare(`UPDATE ledger_entries SET previous_hash = ? WHERE sequence = 2`)
      .run('f'.repeat(64));

    const audit = h.auditService.runAudit(true);
    assert.equal(audit.status, 'TAMPERING_DETECTED');
    assert.ok(audit.issues.some((i) => i.type === 'BROKEN_HASH_CHAIN'));
    assert.equal(audit.firstInvalidBlock, 2);
  } finally {
    h.cleanup();
  }
});

test('7. Detect a forged chain with recalculated hashes', async () => {
  const h = await createHarness();
  try {
    const pub1 = h.ledgerService.publishResult({
      registrationNumber: 'TEST001',
      examId: 'exm_1',
      academicSession: '2025-2026',
      semester: 6,
      subjectCode: 'CSE301',
      subjectName: 'Applied Cryptography',
      maxMarks: 100,
      obtainedMarks: 60,
      publisherUserId: 'usr_admin',
    });

    const rogue = generateEd25519Keypair();
    const forgedPayload = { ...pub1.ledgerEntry.payload, obtainedMarks: 98 };
    const newPayloadHash = sha256Hex(buildPayloadHashPreimage(forgedPayload));
    const newBlockHash = sha256Hex(
      buildBlockHashPreimage({
        sequence: 1,
        eventId: pub1.ledgerEntry.eventId,
        eventType: pub1.ledgerEntry.eventType,
        previousHash: GENESIS_PREVIOUS_HASH,
        payloadHash: newPayloadHash,
        publisherId: pub1.ledgerEntry.publisherId,
        publisherKeyId: pub1.ledgerEntry.publisherKeyId,
        timestamp: pub1.ledgerEntry.timestamp,
        schemaVersion: pub1.ledgerEntry.schemaVersion,
      })
    );
    const rogueSig = signEd25519Hex(newBlockHash, rogue.privateKeyHex);

    h.db.db
      .prepare(
        `UPDATE ledger_entries SET payload_hash = ?, block_hash = ?, signature = ?, payload_json = ? WHERE sequence = 1`
      )
      .run(newPayloadHash, newBlockHash, rogueSig, canonicalJson(forgedPayload));

    const audit = h.auditService.runAudit(true);
    assert.equal(audit.status, 'TAMPERING_DETECTED');
    assert.ok(audit.issues.some((i) => i.type === 'INVALID_LEDGER_SIGNATURE'));
    assert.ok(audit.issues.some((i) => i.type === 'CHECKPOINT_HASH_MISMATCH'));
  } finally {
    h.cleanup();
  }
});

test('8 & 9. Detect missing middle ledger entry AND truncated ledger tail', async () => {
  const h = await createHarness();
  try {
    h.ledgerService.publishResult({
      registrationNumber: 'TEST001',
      examId: 'exm_1',
      academicSession: '2025-2026',
      semester: 6,
      subjectCode: 'CSE301',
      subjectName: 'Applied Cryptography',
      maxMarks: 100,
      obtainedMarks: 80,
      publisherUserId: 'usr_admin',
    });
    h.ledgerService.publishResult({
      registrationNumber: 'TEST001',
      examId: 'exm_1',
      academicSession: '2025-2026',
      semester: 6,
      subjectCode: 'CSE302',
      subjectName: 'Distributed Systems',
      maxMarks: 100,
      obtainedMarks: 84,
      publisherUserId: 'usr_admin',
    });
    h.ledgerService.publishResult({
      registrationNumber: 'TEST002',
      examId: 'exm_1',
      academicSession: '2025-2026',
      semester: 6,
      subjectCode: 'CSE301',
      subjectName: 'Applied Cryptography',
      maxMarks: 100,
      obtainedMarks: 91,
      publisherUserId: 'usr_admin',
    });

    // Test 8: delete middle block #2
    h.db.db.prepare(`DELETE FROM ledger_entries WHERE sequence = 2`).run();
    const auditGap = h.auditService.runAudit(false);
    assert.equal(auditGap.status, 'TAMPERING_DETECTED');
    assert.ok(auditGap.issues.some((i) => i.type === 'SEQUENCE_GAP'));

    // Test 9: delete tail block #3
    h.db.db.prepare(`DELETE FROM ledger_entries WHERE sequence = 3`).run();
    const auditTail = h.auditService.runAudit(false);
    assert.equal(auditTail.status, 'TAMPERING_DETECTED');
    assert.ok(auditTail.issues.some((i) => i.type === 'LEDGER_TAIL_TRUNCATED'));
  } finally {
    h.cleanup();
  }
});

test('10, 11, 12, 13, 14, 15. Enforce two-authority correction security rules', async () => {
  const h = await createHarness();
  try {
    const pub = h.ledgerService.publishResult({
      registrationNumber: 'TEST001',
      examId: 'exm_1',
      academicSession: '2025-2026',
      semester: 6,
      subjectCode: 'CSE301',
      subjectName: 'Applied Cryptography',
      maxMarks: 100,
      obtainedMarks: 65,
      publisherUserId: 'usr_admin',
    });

    const req = h.ledgerService.createCorrectionRequest({
      resultId: pub.result.id,
      proposedMarks: 78,
      reason: 'Re-evaluation totaling adjustment confirmed.',
      requestedByUserId: 'usr_admin',
    });

    const msg = buildCorrectionSigningMessage(req.signingPayload);
    const examinerSig = signEd25519Hex(msg, h.examinerPriv);

    // 14. Reject invalid signature
    assert.throws(
      () =>
        h.ledgerService.submitApproval({
          correctionRequestId: req.id,
          approverUserId: 'usr_examiner',
          approverRole: UserRole.EXAMINER,
          keyId: h.examinerKeyId,
          signatureHex: '00'.repeat(64),
          decision: 'APPROVED',
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'INVALID_SIGNATURE'
    );

    // 15. Reject unauthorized role (Student or Admin trying to approve)
    assert.throws(
      () =>
        h.ledgerService.submitApproval({
          correctionRequestId: req.id,
          approverUserId: 'usr_student',
          approverRole: UserRole.STUDENT,
          keyId: h.examinerKeyId,
          signatureHex: examinerSig,
          decision: 'APPROVED',
        }),
      (err: unknown) =>
        err instanceof DomainError && err.code === 'UNAUTHORIZED_APPROVER_ROLE'
    );

    // Submit legitimate Examiner signature
    h.ledgerService.submitApproval({
      correctionRequestId: req.id,
      approverUserId: 'usr_examiner',
      approverRole: UserRole.EXAMINER,
      keyId: h.examinerKeyId,
      signatureHex: examinerSig,
      decision: 'APPROVED',
    });

    // 10. Reject one-signature finalization
    assert.throws(
      () => h.ledgerService.finalizeCorrection(req.id, 'usr_admin'),
      (err: unknown) =>
        err instanceof DomainError && err.code === 'INSUFFICIENT_APPROVALS'
    );

    // 11. Reject duplicate signer
    assert.throws(
      () =>
        h.ledgerService.submitApproval({
          correctionRequestId: req.id,
          approverUserId: 'usr_examiner',
          approverRole: UserRole.CONTROLLER,
          keyId: h.examinerKeyId,
          signatureHex: examinerSig,
          decision: 'APPROVED',
        }),
      (err: unknown) => err instanceof DomainError && err.statusCode >= 400
    );

    // 12. Reject altered correction reason (tamper reason in DB after examiner signed)
    const controllerSig = signEd25519Hex(msg, h.controllerPriv);
    h.ledgerService.submitApproval({
      correctionRequestId: req.id,
      approverUserId: 'usr_controller',
      approverRole: UserRole.CONTROLLER,
      keyId: h.controllerKeyId,
      signatureHex: controllerSig,
      decision: 'APPROVED',
    });

    const originalReason = req.reason;
    h.db.db
      .prepare(`UPDATE correction_requests SET reason = ? WHERE id = ?`)
      .run('Tampered fake reason after signatures', req.id);

    assert.throws(
      () => h.ledgerService.finalizeCorrection(req.id, 'usr_admin'),
      (err: unknown) => err instanceof DomainError && err.code === 'INVALID_SIGNATURE'
    );

    // Restore original reason, then test 13. stale correction version
    h.db.db
      .prepare(`UPDATE correction_requests SET reason = ? WHERE id = ?`)
      .run(originalReason, req.id);
    h.db.db
      .prepare(`UPDATE results SET version = 2 WHERE id = ?`)
      .run(pub.result.id);

    assert.throws(
      () => h.ledgerService.finalizeCorrection(req.id, 'usr_admin'),
      (err: unknown) => err instanceof DomainError && err.code === 'STALE_RESULT_VERSION'
    );
  } finally {
    h.cleanup();
  }
});

test('16, 17, 18, 19, 20. Dual-signed correction, original+new receipt verification, standalone proof verification, and zero unrelated student PII', async () => {
  const h = await createHarness();
  try {
    // Publish two different students to test privacy-preserving proof isolation (Test 20)
    const pubA = h.ledgerService.publishResult({
      registrationNumber: 'TEST001',
      examId: 'exm_1',
      academicSession: '2025-2026',
      semester: 6,
      subjectCode: 'CSE301',
      subjectName: 'Applied Cryptography',
      maxMarks: 100,
      obtainedMarks: 70,
      publisherUserId: 'usr_admin',
    });

    h.ledgerService.publishResult({
      registrationNumber: 'TEST002',
      examId: 'exm_1',
      academicSession: '2025-2026',
      semester: 6,
      subjectCode: 'CSE302',
      subjectName: 'Distributed Systems',
      maxMarks: 100,
      obtainedMarks: 93,
      publisherUserId: 'usr_admin',
    });

    // 16. Genuine dual-signed correction for TEST001
    const req = h.ledgerService.createCorrectionRequest({
      resultId: pubA.result.id,
      proposedMarks: 81,
      reason: 'Re-evaluation board awarded 11 omitted marks on Question 5.',
      requestedByUserId: 'usr_admin',
    });

    const msg = buildCorrectionSigningMessage(req.signingPayload);
    h.ledgerService.submitApproval({
      correctionRequestId: req.id,
      approverUserId: 'usr_examiner',
      approverRole: UserRole.EXAMINER,
      keyId: h.examinerKeyId,
      signatureHex: signEd25519Hex(msg, h.examinerPriv),
      decision: 'APPROVED',
    });
    h.ledgerService.submitApproval({
      correctionRequestId: req.id,
      approverUserId: 'usr_controller',
      approverRole: UserRole.CONTROLLER,
      keyId: h.controllerKeyId,
      signatureHex: signEd25519Hex(msg, h.controllerPriv),
      decision: 'APPROVED',
    });

    const fin = h.ledgerService.finalizeCorrection(req.id, 'usr_admin');
    assert.equal(fin.result.obtainedMarks, 81);
    assert.equal(fin.result.version, 2);

    // 17. Verify original receipt after valid correction -> VERIFIED_SUPERSEDED
    const verifyOld = h.verifyService.verifyReceipt(
      pubA.receipt.receiptId,
      pubA.receipt.shortFingerprint
    );
    assert.equal(verifyOld.status, VerificationStatus.VERIFIED_SUPERSEDED);
    assert.equal(verifyOld.originalRecord?.obtainedMarks, 70);
    assert.equal(verifyOld.latestAuthorizedRecord?.obtainedMarks, 81);

    // 18. Verify new corrected receipt -> VERIFIED_ORIGINAL
    const verifyNew = h.verifyService.verifyReceipt(
      fin.newReceipt.receiptId,
      fin.newReceipt.shortFingerprint
    );
    assert.equal(verifyNew.status, VerificationStatus.VERIFIED_ORIGINAL);
    assert.equal(verifyNew.originalRecord?.obtainedMarks, 81);
    assert.equal(verifyNew.originalRecord?.version, 2);

    // 19. Export proof and verify independently using pinned keys
    const proof = h.verifyService.exportVerificationProof(pubA.receipt.receiptId);
    assert.ok(proof);
    const pinnedKeys = h.trustStore.getTrustedKeys();
    const standalone = await verifyProofIndependently(proof, pinnedKeys);
    assert.equal(standalone.valid, true);
    assert.equal(standalone.status, VerificationStatus.VERIFIED_SUPERSEDED);
    assert.equal(standalone.supersededByVersion, 2);

    // 20. Confirm unrelated student PII ("Secret Private Student", "TEST002") is completely excluded from public proof JSON!
    const serializedProof = JSON.stringify(proof);
    assert.equal(serializedProof.includes('Secret Private Student'), false);
    assert.equal(serializedProof.includes('TEST002'), false);
    assert.equal(proof.privacyPreservingChainHeaders.length, 4);
  } finally {
    h.cleanup();
  }
});
