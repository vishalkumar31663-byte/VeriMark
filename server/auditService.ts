import crypto from 'node:crypto';
import {
  GENESIS_PREVIOUS_HASH,
  buildBlockHashPreimage,
  buildCorrectionSigningMessage,
  buildPayloadHashPreimage,
} from '../shared/canonical';
import {
  AuditIssue,
  AuditReport,
  CorrectionApprovedPayload,
  LedgerEventType,
  ResultCorrectedPayload,
  ResultPublishedPayload,
} from '../shared/types';
import { sha256Hex, verifyEd25519Hex } from './crypto';
import { VeriMarkDatabase } from './db';
import { ExternalTrustStore } from './trustStore';

interface ReconstructedResultState {
  resultId: string;
  studentId: string;
  registrationNumber: string;
  studentName: string;
  subjectCode: string;
  obtainedMarks: number;
  maxMarks: number;
  version: number;
  latestSequence: number;
}

export class AuditService {
  constructor(
    private readonly database: VeriMarkDatabase,
    private readonly trustStore: ExternalTrustStore
  ) {}

  /**
   * Executes a full cryptographic integrity audit:
   * 1. Verifies external signed checkpoint anchor.
   * 2. Recalculates every payload hash, block hash, sequence number, and previous_hash link.
   * 3. Validates every publisher Ed25519 signature against external trusted_keys.json.
   * 4. Re-verifies dual-authority Examiner + Controller Ed25519 signatures on correction events.
   * 5. Compares ledger head against independently signed external checkpoint.
   * 6. Reconstructs authoritative latest marks from valid ledger blocks and diffs against results table.
   * Never auto-repairs or declares a tampered ledger valid.
   */
  public runAudit(persistRecord = true): AuditReport {
    const checkedAt = new Date().toISOString();
    const auditId = `aud_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const issues: AuditIssue[] = [];

    const addIssue = (
      type: string,
      severity: 'CRITICAL' | 'HIGH' | 'MEDIUM',
      message: string,
      affectedEntity: string,
      expectedValue: string,
      databaseValue: string,
      firstInvalidBlock: number | null
    ) => {
      issues.push({
        id: `iss_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
        type,
        severity,
        message,
        affectedEntity,
        expectedValue,
        databaseValue,
        firstInvalidBlock,
        detectedAt: checkedAt,
      });
    };

    const checkpoint = this.trustStore.getCheckpoint();
    const checkpointValid = this.trustStore.verifyCheckpointSignature(checkpoint);

    const rawEntries = this.database.db
      .prepare(`SELECT * FROM ledger_entries ORDER BY sequence ASC`)
      .all() as Record<string, unknown>[];

    if (!checkpoint) {
      if (rawEntries.length > 0) {
        addIssue(
          'MISSING_TRUSTED_CHECKPOINT',
          'CRITICAL',
          'No independently signed ledger-head checkpoint exists outside SQLite.',
          'External Checkpoint Store',
          `Signed checkpoint at sequence #${rawEntries.length}`,
          'Missing checkpoint.json',
          1
        );
      }
    } else if (!checkpointValid) {
      addIssue(
        'INVALID_CHECKPOINT_SIGNATURE',
        'CRITICAL',
        'External trusted checkpoint Ed25519 signature failed verification.',
        `Checkpoint #${checkpoint.sequence}`,
        `Valid Ed25519 signature from ${checkpoint.authorityKeyId}`,
        'Invalid signature',
        checkpoint.sequence
      );
    }

    let validLedgerEntries = 0;
    let firstInvalidBlock: number | null = null;
    let expectedPreviousHash = GENESIS_PREVIOUS_HASH;
    let expectedSequence = 1;

    const reconstructed = new Map<string, ReconstructedResultState>();
    const approvedCorrectionIds = new Set<string>();

    for (const row of rawEntries) {
      const seq = Number(row.sequence);
      const eventId = String(row.event_id);
      const eventType = String(row.event_type) as LedgerEventType;
      const prevHash = String(row.previous_hash);
      const payloadHash = String(row.payload_hash);
      const blockHash = String(row.block_hash);
      const publisherId = String(row.publisher_id);
      const publisherKeyId = String(row.publisher_key_id);
      const signature = String(row.signature);
      const timestamp = String(row.timestamp);
      const schemaVersion = String(row.schema_version);
      const rawPayloadJson = String(row.payload_json);

      let entryValid = true;
      const markInvalid = () => {
        entryValid = false;
        if (firstInvalidBlock === null) {
          firstInvalidBlock = seq;
        }
      };

      // 1. Sequence continuity
      if (seq !== expectedSequence) {
        markInvalid();
        addIssue(
          'SEQUENCE_GAP',
          'CRITICAL',
          `Ledger sequence discontinuity detected (missing block #${expectedSequence}).`,
          `Ledger Block #${seq} (${eventId})`,
          `Sequence #${expectedSequence}`,
          `Sequence #${seq}`,
          expectedSequence
        );
      }

      // 2. Previous hash link
      if (prevHash !== expectedPreviousHash) {
        markInvalid();
        addIssue(
          'BROKEN_HASH_CHAIN',
          'CRITICAL',
          `Hash-chain link broken at block #${seq}: previous_hash does not match preceding block hash.`,
          `Ledger Block #${seq} (${eventId})`,
          expectedPreviousHash,
          prevHash,
          seq
        );
      }

      // 3. Payload JSON & SHA-256 verification
      let parsedPayload: Record<string, unknown> | null = null;
      try {
        parsedPayload = JSON.parse(rawPayloadJson) as Record<string, unknown>;
        const computedPayloadHash = sha256Hex(buildPayloadHashPreimage(parsedPayload));
        if (computedPayloadHash !== payloadHash) {
          markInvalid();
          const studentLabel = parsedPayload.registrationNumber
            ? `${String(parsedPayload.registrationNumber)} (${String(parsedPayload.subjectCode ?? '')})`
            : `Ledger Block #${seq}`;
          addIssue(
            'MODIFIED_LEDGER_PAYLOAD',
            'CRITICAL',
            `Ledger payload at block #${seq} was altered after publication; canonical SHA-256 mismatch.`,
            studentLabel,
            payloadHash,
            computedPayloadHash,
            seq
          );
        }
      } catch {
        markInvalid();
        addIssue(
          'CORRUPTED_PAYLOAD_JSON',
          'CRITICAL',
          `Ledger block #${seq} contains malformed JSON payload.`,
          `Ledger Block #${seq}`,
          'Valid canonical JSON',
          rawPayloadJson.slice(0, 80),
          seq
        );
      }

      // 4. Deterministic block hash verification
      const computedBlockHash = sha256Hex(
        buildBlockHashPreimage({
          sequence: seq,
          eventId,
          eventType,
          previousHash: prevHash,
          payloadHash,
          publisherId,
          publisherKeyId,
          timestamp,
          schemaVersion,
        })
      );

      if (computedBlockHash !== blockHash) {
        markInvalid();
        addIssue(
          'INVALID_BLOCK_HASH',
          'CRITICAL',
          `Block #${seq} deterministic hash does not match header fields.`,
          `Ledger Block #${seq} (${eventId})`,
          computedBlockHash,
          blockHash,
          seq
        );
      }

      // 5. Publisher Ed25519 signature against external trusted key store
      const pubKey = this.trustStore.getTrustedKeyById(publisherKeyId);
      if (!pubKey || pubKey.role !== 'PUBLISHER') {
        markInvalid();
        addIssue(
          'UNTRUSTED_PUBLISHER_KEY',
          'CRITICAL',
          `Block #${seq} references an unrecognized or unauthorized publisher key.`,
          `Ledger Block #${seq}`,
          'Enrolled PUBLISHER key in external trust store',
          publisherKeyId,
          seq
        );
      } else {
        const sigOk = verifyEd25519Hex(blockHash, signature, pubKey.publicKeyHex);
        if (!sigOk) {
          markInvalid();
          addIssue(
            'INVALID_LEDGER_SIGNATURE',
            'CRITICAL',
            `Block #${seq} Ed25519 signature failed verification (possible forged hash chain).`,
            `Ledger Block #${seq} (${eventId})`,
            `Valid Ed25519 signature from ${publisherKeyId}`,
            `${signature.slice(0, 24)}… (INVALID)`,
            seq
          );
        }
      }

      // 6. Verify correction approval cryptographic signatures
      if (parsedPayload && eventType === LedgerEventType.CORRECTION_APPROVED) {
        const p = parsedPayload as unknown as CorrectionApprovedPayload;
        const msg = buildCorrectionSigningMessage({
          schemaVersion: p.schemaVersion,
          correctionRequestId: p.correctionRequestId,
          resultId: p.resultId,
          originalVersion: p.originalVersion,
          oldMarks: p.oldMarks,
          proposedMarks: p.proposedMarks,
          maxMarks: p.maxMarks,
          reason: p.reason,
          registrationNumber: p.registrationNumber,
          subjectCode: p.subjectCode,
        });

        const examiner = p.approvals?.find(
          (a) => a.approverRole === 'EXAMINER' && a.decision === 'APPROVED'
        );
        const controller = p.approvals?.find(
          (a) => a.approverRole === 'CONTROLLER' && a.decision === 'APPROVED'
        );

        if (
          !examiner ||
          !controller ||
          examiner.approverUserId === controller.approverUserId ||
          examiner.keyId === controller.keyId
        ) {
          markInvalid();
          addIssue(
            'INVALID_DUAL_APPROVAL',
            'CRITICAL',
            `Correction approval block #${seq} lacks two distinct authorized approvers.`,
            `Correction ${p.correctionRequestId}`,
            'Distinct Examiner + Controller approvals',
            `Approvals count: ${p.approvals?.length ?? 0}`,
            seq
          );
        } else {
          const exKey = this.trustStore.getTrustedKeyById(examiner.keyId);
          const coKey = this.trustStore.getTrustedKeyById(controller.keyId);
          const exOk =
            exKey?.role === 'EXAMINER' &&
            verifyEd25519Hex(msg, examiner.signatureHex, exKey.publicKeyHex);
          const coOk =
            coKey?.role === 'CONTROLLER' &&
            verifyEd25519Hex(msg, controller.signatureHex, coKey.publicKeyHex);

          if (!exOk || !coOk) {
            markInvalid();
            addIssue(
              'INVALID_APPROVAL_SIGNATURE',
              'CRITICAL',
              `One or more approver Ed25519 signatures in block #${seq} failed verification.`,
              `Correction ${p.correctionRequestId}`,
              'Valid Examiner + Controller Ed25519 signatures',
              `Examiner=${exOk ? 'OK' : 'FAIL'}, Controller=${coOk ? 'OK' : 'FAIL'}`,
              seq
            );
          } else {
            approvedCorrectionIds.add(p.correctionRequestId);
          }
        }
      }

      if (entryValid) {
        validLedgerEntries++;
      }

      // Reconstruct authoritative state from ledger entries
      if (parsedPayload) {
        if (eventType === LedgerEventType.RESULT_PUBLISHED) {
          const p = parsedPayload as unknown as ResultPublishedPayload;
          reconstructed.set(p.resultId, {
            resultId: p.resultId,
            studentId: p.studentId,
            registrationNumber: p.registrationNumber,
            studentName: p.studentName,
            subjectCode: p.subjectCode,
            obtainedMarks: Number(p.obtainedMarks),
            maxMarks: Number(p.maxMarks),
            version: Number(p.version),
            latestSequence: seq,
          });
        } else if (eventType === LedgerEventType.RESULT_CORRECTED) {
          const p = parsedPayload as unknown as ResultCorrectedPayload;
          if (!approvedCorrectionIds.has(p.correctionRequestId)) {
            markInvalid();
            addIssue(
              'UNAPPROVED_CORRECTION_EVENT',
              'CRITICAL',
              `RESULT_CORRECTED block #${seq} has no matching verified CORRECTION_APPROVED event.`,
              `${p.registrationNumber} (${p.subjectCode})`,
              'Preceding verified dual-approval block',
              'Missing approval block',
              seq
            );
          }
          reconstructed.set(p.resultId, {
            resultId: p.resultId,
            studentId: p.studentId,
            registrationNumber: p.registrationNumber,
            studentName: p.studentName,
            subjectCode: p.subjectCode,
            obtainedMarks: Number(p.newMarks),
            maxMarks: Number(p.maxMarks),
            version: Number(p.newVersion),
            latestSequence: seq,
          });
        }
      }

      expectedPreviousHash = blockHash;
      expectedSequence = seq + 1;
    }

    // 7. Compare ledger head against external signed checkpoint (detects tail deletion & rewritten chain!)
    if (checkpoint && checkpointValid) {
      const head = rawEntries.length > 0 ? rawEntries[rawEntries.length - 1] : null;
      if (!head) {
        addIssue(
          'LEDGER_TRUNCATED',
          'CRITICAL',
          `Ledger table is empty, but external signed checkpoint expects ${checkpoint.sequence} block(s).`,
          'Ledger Head',
          `Sequence #${checkpoint.sequence} (${checkpoint.blockHash.slice(0, 16)}…)`,
          '0 blocks in SQLite',
          1
        );
        if (firstInvalidBlock === null) firstInvalidBlock = 1;
      } else {
        const headSeq = Number(head.sequence);
        const headHash = String(head.block_hash);
        if (headSeq < checkpoint.sequence) {
          const missingStart = headSeq + 1;
          addIssue(
            'LEDGER_TAIL_TRUNCATED',
            'CRITICAL',
            `Ledger tail deletion detected: SQLite stops at block #${headSeq}, but trusted external checkpoint is anchored at block #${checkpoint.sequence}.`,
            `Ledger Tail (Blocks #${missingStart}–#${checkpoint.sequence})`,
            `Sequence #${checkpoint.sequence} (${checkpoint.blockHash.slice(0, 16)}…)`,
            `Sequence #${headSeq} (${headHash.slice(0, 16)}…)`,
            missingStart
          );
          if (firstInvalidBlock === null) firstInvalidBlock = missingStart;
        } else if (headSeq > checkpoint.sequence) {
          const unanchoredSeq = checkpoint.sequence + 1;
          addIssue(
            'UNANCHORED_LEDGER_BLOCKS',
            'HIGH',
            `SQLite contains blocks beyond the last trusted checkpoint (#${checkpoint.sequence}).`,
            `Ledger Block #${unanchoredSeq}`,
            `Head sequence #${checkpoint.sequence}`,
            `Head sequence #${headSeq}`,
            unanchoredSeq
          );
          if (firstInvalidBlock === null) firstInvalidBlock = unanchoredSeq;
        } else if (headHash !== checkpoint.blockHash) {
          addIssue(
            'CHECKPOINT_HASH_MISMATCH',
            'CRITICAL',
            `Ledger head block hash at #${headSeq} diverges from the independently signed external checkpoint (entire chain may have been rewritten).`,
            `Ledger Head #${headSeq}`,
            checkpoint.blockHash,
            headHash,
            firstInvalidBlock ?? 1
          );
          if (firstInvalidBlock === null) firstInvalidBlock = 1;
        }
      }
    }

    // 8. Check correction_requests & approvals integrity in SQLite
    const dbCorrections = this.database.db
      .prepare(
        `SELECT cr.*, r.max_marks, s.registration_number, sub.code AS subject_code
         FROM correction_requests cr
         JOIN results r ON r.id = cr.result_id
         JOIN students s ON s.id = r.student_id
         JOIN subjects sub ON sub.id = r.subject_id`
      )
      .all() as Record<string, unknown>[];

    for (const cr of dbCorrections) {
      const approvals = this.database.db
        .prepare(`SELECT * FROM approvals WHERE correction_request_id = ?`)
        .all(String(cr.id)) as Record<string, unknown>[];

      const signingMsg = buildCorrectionSigningMessage({
        schemaVersion: '1.0',
        correctionRequestId: String(cr.id),
        resultId: String(cr.result_id),
        originalVersion: Number(cr.original_version),
        oldMarks: Number(cr.old_marks),
        proposedMarks: Number(cr.proposed_marks),
        maxMarks: Number(cr.max_marks),
        reason: String(cr.reason),
        registrationNumber: String(cr.registration_number),
        subjectCode: String(cr.subject_code),
      });

      for (const ap of approvals) {
        const key = this.trustStore.getTrustedKeyById(String(ap.key_id));
        const ok =
          key &&
          key.role === String(ap.approver_role) &&
          verifyEd25519Hex(signingMsg, String(ap.signature_hex), key.publicKeyHex);
        if (!ok) {
          addIssue(
            'TAMPERED_CORRECTION_OR_APPROVAL',
            'CRITICAL',
            `Approval signature for correction ${String(cr.id)} (${String(ap.approver_role)}) no longer matches stored correction details.`,
            `${String(cr.registration_number)} · ${String(cr.subject_code)} (${String(cr.id)})`,
            `Valid ${String(ap.approver_role)} Ed25519 signature for key ${String(ap.key_id)}`,
            'Signature verification FAILED (correction details or signature altered)',
            null
          );
        }
      }
    }

    // 9. Compare reconstructed authoritative results against materialized results table
    const dbResults = this.database.db
      .prepare(
        `SELECT r.*, s.registration_number, s.full_name AS student_name, sub.code AS subject_code
         FROM results r
         JOIN students s ON s.id = r.student_id
         JOIN subjects sub ON sub.id = r.subject_id`
      )
      .all() as Record<string, unknown>[];

    const seenResultIds = new Set<string>();

    for (const row of dbResults) {
      const id = String(row.id);
      seenResultIds.add(id);
      const regNo = String(row.registration_number);
      const studentName = String(row.student_name);
      const subjectCode = String(row.subject_code);
      const dbMarks = Number(row.obtained_marks);
      const dbMaxMarks = Number(row.max_marks);
      const dbVersion = Number(row.version);

      const expected = reconstructed.get(id);
      if (!expected) {
        addIssue(
          'UNANCHORED_MATERIALIZED_RESULT',
          'CRITICAL',
          `Result row for ${studentName} (${regNo}, ${subjectCode}) exists in SQLite without a matching ledger publication event.`,
          `${studentName} (${regNo}) · ${subjectCode}`,
          'No ledger publication exists',
          `obtained_marks=${dbMarks}/${dbMaxMarks} (v${dbVersion})`,
          null
        );
        continue;
      }

      if (dbMarks !== expected.obtainedMarks) {
        addIssue(
          'DIRECT_MARKS_TAMPERING',
          'CRITICAL',
          `Direct SQL modification detected: materialized marks for ${studentName} (${regNo}) in ${subjectCode} do not match the cryptographic ledger.`,
          `${studentName} (${regNo}) · ${subjectCode}`,
          `${expected.obtainedMarks} / ${expected.maxMarks} (Ledger Block #${expected.latestSequence})`,
          `${dbMarks} / ${dbMaxMarks} (SQLite results table)`,
          expected.latestSequence
        );
      }

      if (dbMaxMarks !== expected.maxMarks) {
        addIssue(
          'DIRECT_MAX_MARKS_TAMPERING',
          'HIGH',
          `Maximum marks for ${studentName} (${regNo}, ${subjectCode}) altered in results table.`,
          `${studentName} (${regNo}) · ${subjectCode}`,
          String(expected.maxMarks),
          String(dbMaxMarks),
          expected.latestSequence
        );
      }

      if (dbVersion !== expected.version) {
        addIssue(
          'RESULT_VERSION_MISMATCH',
          'HIGH',
          `Result version for ${studentName} (${regNo}, ${subjectCode}) does not match ledger state.`,
          `${studentName} (${regNo}) · ${subjectCode}`,
          `v${expected.version}`,
          `v${dbVersion}`,
          expected.latestSequence
        );
      }
    }

    for (const [id, exp] of reconstructed.entries()) {
      if (!seenResultIds.has(id)) {
        addIssue(
          'MISSING_MATERIALIZED_RESULT',
          'HIGH',
          `Published result for ${exp.studentName} (${exp.registrationNumber}, ${exp.subjectCode}) is present in the ledger but deleted from the results table.`,
          `${exp.studentName} (${exp.registrationNumber}) · ${exp.subjectCode}`,
          `${exp.obtainedMarks} / ${exp.maxMarks} (v${exp.version})`,
          'Row deleted from SQLite results table',
          exp.latestSequence
        );
      }
    }

    const status: AuditReport['status'] =
      !checkpoint && rawEntries.length > 0
        ? 'NO_TRUSTED_CHECKPOINT'
        : issues.length > 0
        ? 'TAMPERING_DETECTED'
        : 'VERIFIED';

    const report: AuditReport = {
      id: auditId,
      status,
      checkedAt,
      totalLedgerEntries: rawEntries.length,
      validLedgerEntries,
      totalMaterializedResults: dbResults.length,
      firstInvalidBlock,
      checkpointSequence: checkpoint?.sequence ?? null,
      checkpointBlockHash: checkpoint?.blockHash ?? null,
      checkpointValid,
      issues,
    };

    if (persistRecord) {
      try {
        this.database.db
          .prepare(
            `INSERT INTO audit_records (
              id, status, total_ledger_entries, valid_ledger_entries,
              issues_count, first_invalid_block, checkpoint_sequence, report_json, checked_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            report.id,
            report.status,
            report.totalLedgerEntries,
            report.validLedgerEntries,
            report.issues.length,
            report.firstInvalidBlock,
            report.checkpointSequence,
            JSON.stringify(report),
            report.checkedAt
          );
      } catch {
        // Do not mask audit detection if audit log write fails
      }
    }

    return report;
  }

  public getAuditHistory(limit = 15): Array<{
    id: string;
    status: string;
    totalLedgerEntries: number;
    validLedgerEntries: number;
    issuesCount: number;
    firstInvalidBlock: number | null;
    checkpointSequence: number | null;
    checkedAt: string;
  }> {
    const rows = this.database.db
      .prepare(
        `SELECT id, status, total_ledger_entries, valid_ledger_entries,
                issues_count, first_invalid_block, checkpoint_sequence, checked_at
         FROM audit_records
         ORDER BY checked_at DESC
         LIMIT ?`
      )
      .all(limit) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: String(r.id),
      status: String(r.status),
      totalLedgerEntries: Number(r.total_ledger_entries),
      validLedgerEntries: Number(r.valid_ledger_entries),
      issuesCount: Number(r.issues_count),
      firstInvalidBlock:
        r.first_invalid_block !== null && r.first_invalid_block !== undefined
          ? Number(r.first_invalid_block)
          : null,
      checkpointSequence:
        r.checkpoint_sequence !== null && r.checkpoint_sequence !== undefined
          ? Number(r.checkpoint_sequence)
          : null,
      checkedAt: String(r.checked_at),
    }));
  }
}
