import {
  GENESIS_PREVIOUS_HASH,
  buildBlockHashPreimage,
  buildPayloadHashPreimage,
  buildReceiptFingerprintPreimage,
} from '../shared/canonical';
import {
  CorrectionApprovedPayload,
  LedgerEntryRecord,
  LedgerEventType,
  LedgerHeader,
  ReceiptRecord,
  ResultCorrectedPayload,
  ResultPublishedPayload,
  VerificationCheckItem,
  VerificationProof,
  VerificationResponse,
  VerificationStatus,
} from '../shared/types';
import { sha256Hex, verifyEd25519Hex } from './crypto';
import { VeriMarkDatabase } from './db';
import { LedgerService } from './ledgerService';
import { ExternalTrustStore } from './trustStore';

export class VerifyService {
  constructor(
    private readonly database: VeriMarkDatabase,
    private readonly trustStore: ExternalTrustStore,
    private readonly ledgerService: LedgerService
  ) {}

  private getReceiptRow(receiptId: string): ReceiptRecord | null {
    const row = this.database.db
      .prepare(`SELECT * FROM result_receipts WHERE receipt_id = ?`)
      .get(receiptId.trim()) as Record<string, unknown> | undefined;

    if (!row) return null;
    return {
      receiptId: String(row.receipt_id),
      resultId: String(row.result_id),
      version: Number(row.version),
      ledgerSequence: Number(row.ledger_sequence),
      payloadHash: String(row.payload_hash),
      blockHash: String(row.block_hash),
      fingerprint: String(row.fingerprint),
      shortFingerprint: String(row.short_fingerprint),
      createdAt: String(row.created_at),
    };
  }

  /**
   * Cryptographically verifies a printed receipt without trusting any database boolean.
   * Supports optional ?fp= short fingerprint check from scanned QR URLs.
   */
  public verifyReceipt(
    receiptId: string,
    queryFingerprint?: string
  ): VerificationResponse {
    const verifiedAt = new Date().toISOString();
    const receipt = this.getReceiptRow(receiptId);

    if (!receipt) {
      return {
        status: VerificationStatus.RECORD_NOT_FOUND,
        headline: 'Record Not Found',
        summary: `No published receipt matches identifier "${receiptId}". Confirm the receipt code printed on the marksheet.`,
        verifiedAt,
        receipt: null,
        originalRecord: null,
        latestAuthorizedRecord: null,
        checks: [
          {
            name: 'Receipt Lookup',
            passed: false,
            detail: `Receipt ID "${receiptId}" does not exist in VeriMark.`,
          },
        ],
        checkpoint: this.trustStore.getCheckpoint(),
        proofAvailable: false,
      };
    }

    const checks: VerificationCheckItem[] = [];
    const allEntries = this.ledgerService.listLedgerEntries();
    const targetEntry = allEntries.find((e) => e.sequence === receipt.ledgerSequence);

    if (!targetEntry) {
      return {
        status: VerificationStatus.TAMPERING_DETECTED,
        headline: 'Tampering Detected — Ledger Event Missing',
        summary: `Receipt ${receipt.receiptId} references ledger block #${receipt.ledgerSequence}, which has been removed from the ledger.`,
        verifiedAt,
        receipt,
        originalRecord: null,
        latestAuthorizedRecord: null,
        checks: [
          {
            name: 'Historical Ledger Event Presence',
            passed: false,
            detail: `Expected ledger block #${receipt.ledgerSequence} is missing.`,
          },
        ],
        checkpoint: this.trustStore.getCheckpoint(),
        proofAvailable: false,
      };
    }

    let hasTampering = false;
    let hasInvalidSig = false;
    let noCheckpoint = false;

    // 1. Validate optional QR query fingerprint match
    if (queryFingerprint && queryFingerprint.trim()) {
      const normalized = queryFingerprint.trim().toUpperCase();
      const fpMatches =
        receipt.shortFingerprint.toUpperCase() === normalized ||
        receipt.fingerprint.toUpperCase().startsWith(normalized);
      if (!fpMatches) hasTampering = true;
      checks.push({
        name: 'QR Receipt Fingerprint Parameter',
        passed: fpMatches,
        detail: fpMatches
          ? `Printed QR fingerprint (${normalized}) matches anchored receipt.`
          : `Printed QR fingerprint (${normalized}) does NOT match recorded fingerprint (${receipt.shortFingerprint}).`,
      });
    }

    // 2. Recompute payload hash
    const computedPayloadHash = sha256Hex(buildPayloadHashPreimage(targetEntry.payload));
    const payloadOk =
      computedPayloadHash === targetEntry.payloadHash &&
      targetEntry.payloadHash === receipt.payloadHash;
    if (!payloadOk) hasTampering = true;
    checks.push({
      name: 'Canonical Payload Hash',
      passed: payloadOk,
      detail: payloadOk
        ? `SHA-256 matches ${targetEntry.payloadHash.slice(0, 16)}…`
        : 'Published event payload hash mismatch — payload may have been altered.',
    });

    // 3. Recompute receipt fingerprint
    const computedReceiptFp = sha256Hex(
      buildReceiptFingerprintPreimage(
        receipt.receiptId,
        targetEntry.payloadHash,
        targetEntry.blockHash
      )
    );
    const receiptFpOk =
      computedReceiptFp === receipt.fingerprint &&
      targetEntry.blockHash === receipt.blockHash;
    if (!receiptFpOk) hasTampering = true;
    checks.push({
      name: 'Receipt-to-Block Cryptographic Binding',
      passed: receiptFpOk,
      detail: receiptFpOk
        ? `Receipt bound to block #${targetEntry.sequence} (${receipt.shortFingerprint}).`
        : 'Receipt fingerprint or block hash mismatch.',
    });

    // 4. Publisher Ed25519 signature verification
    const pubKey = this.trustStore.getTrustedKeyById(targetEntry.publisherKeyId);
    const sigOk = Boolean(
      pubKey &&
        pubKey.role === 'PUBLISHER' &&
        verifyEd25519Hex(targetEntry.blockHash, targetEntry.signature, pubKey.publicKeyHex)
    );
    if (!sigOk) hasInvalidSig = true;
    checks.push({
      name: 'Publisher Ed25519 Digital Signature',
      passed: sigOk,
      detail: sigOk
        ? `Valid signature by enrolled publisher key ${targetEntry.publisherKeyId}.`
        : `Signature verification failed for key ${targetEntry.publisherKeyId}.`,
    });

    // 5. External trusted checkpoint verification
    const checkpoint = this.trustStore.getCheckpoint();
    const checkpointSigOk = this.trustStore.verifyCheckpointSignature(checkpoint);
    if (!checkpoint) {
      noCheckpoint = true;
      checks.push({
        name: 'External Trusted Checkpoint',
        passed: false,
        detail: 'No independently signed checkpoint is available to anchor this ledger.',
      });
    } else if (!checkpointSigOk) {
      hasInvalidSig = true;
      checks.push({
        name: 'External Trusted Checkpoint',
        passed: false,
        detail: 'Trusted checkpoint Ed25519 signature is invalid.',
      });
    } else {
      checks.push({
        name: 'External Trusted Checkpoint',
        passed: true,
        detail: `Signed checkpoint anchored at sequence #${checkpoint.sequence} (${checkpoint.blockHash.slice(0, 14)}…).`,
      });
    }

    // 6. Full hash-chain continuity from genesis through target up to checkpoint head
    let chainOk = allEntries.length > 0;
    let chainDetail = '';
    let expectedPrev = GENESIS_PREVIOUS_HASH;

    for (let i = 0; i < allEntries.length; i++) {
      const e = allEntries[i];
      if (e.sequence !== i + 1) {
        chainOk = false;
        hasTampering = true;
        chainDetail = `Ledger sequence gap at #${i + 1}`;
        break;
      }
      if (e.previousHash !== expectedPrev) {
        chainOk = false;
        hasTampering = true;
        chainDetail = `Broken hash-chain link at block #${e.sequence}`;
        break;
      }
      const computedBlock = sha256Hex(
        buildBlockHashPreimage({
          sequence: e.sequence,
          eventId: e.eventId,
          eventType: e.eventType,
          previousHash: e.previousHash,
          payloadHash: e.payloadHash,
          publisherId: e.publisherId,
          publisherKeyId: e.publisherKeyId,
          timestamp: e.timestamp,
          schemaVersion: e.schemaVersion,
        })
      );
      if (computedBlock !== e.blockHash) {
        chainOk = false;
        hasTampering = true;
        chainDetail = `Block #${e.sequence} hash mismatch`;
        break;
      }
      const k = this.trustStore.getTrustedKeyById(e.publisherKeyId);
      if (!k || k.role !== 'PUBLISHER' || !verifyEd25519Hex(e.blockHash, e.signature, k.publicKeyHex)) {
        chainOk = false;
        hasInvalidSig = true;
        chainDetail = `Block #${e.sequence} Ed25519 signature invalid`;
        break;
      }
      expectedPrev = e.blockHash;
    }

    if (chainOk && checkpoint && checkpointSigOk) {
      const head = allEntries[allEntries.length - 1];
      if (head.sequence !== checkpoint.sequence || head.blockHash !== checkpoint.blockHash) {
        chainOk = false;
        hasTampering = true;
        chainDetail = `Ledger head (#${head.sequence}) disagrees with external signed checkpoint (#${checkpoint.sequence}).`;
      } else {
        chainDetail = `Verified unbroken signed chain of ${allEntries.length} block(s) to checkpoint #${checkpoint.sequence}.`;
      }
    }

    checks.push({
      name: 'Hash-Chain Continuity & Anchor Match',
      passed: chainOk,
      detail: chainDetail || 'Hash chain check failed.',
    });

    // Extract original published record data from target event
    let originalRecord: VerificationResponse['originalRecord'] = null;
    if (targetEntry.eventType === LedgerEventType.RESULT_PUBLISHED) {
      const p = targetEntry.payload as unknown as ResultPublishedPayload;
      originalRecord = {
        registrationNumber: p.registrationNumber,
        studentName: p.studentName,
        course: p.course,
        academicSession: p.academicSession,
        semester: p.semester,
        examCode: p.examCode,
        subjectCode: p.subjectCode,
        subjectName: p.subjectName,
        obtainedMarks: Number(p.obtainedMarks),
        maxMarks: Number(p.maxMarks),
        version: Number(p.version),
        publishedAt: p.publishedAt,
      };
    } else if (targetEntry.eventType === LedgerEventType.RESULT_CORRECTED) {
      const p = targetEntry.payload as unknown as ResultCorrectedPayload;
      originalRecord = {
        registrationNumber: p.registrationNumber,
        studentName: p.studentName,
        course: p.course,
        academicSession: p.academicSession,
        semester: p.semester,
        examCode: p.examCode,
        subjectCode: p.subjectCode,
        subjectName: p.subjectName,
        obtainedMarks: Number(p.newMarks),
        maxMarks: Number(p.maxMarks),
        version: Number(p.newVersion),
        publishedAt: p.correctedAt,
      };
    }

    // Check if materialized results row was tampered directly in SQLite!
    const laterCorrections = allEntries.filter(
      (e) =>
        e.sequence > targetEntry.sequence &&
        e.eventType === LedgerEventType.RESULT_CORRECTED &&
        e.payload.resultId === receipt.resultId
    );

    const latestAuthoritativeMarks =
      laterCorrections.length > 0
        ? Number(
            (laterCorrections[laterCorrections.length - 1]
              .payload as unknown as ResultCorrectedPayload).newMarks
          )
        : originalRecord?.obtainedMarks;

    const currentDbResult = this.database.db
      .prepare(`SELECT obtained_marks, max_marks, version FROM results WHERE id = ?`)
      .get(receipt.resultId) as
      | { obtained_marks: number; max_marks: number; version: number }
      | undefined;

    if (
      currentDbResult &&
      latestAuthoritativeMarks !== undefined &&
      Number(currentDbResult.obtained_marks) !== latestAuthoritativeMarks
    ) {
      hasTampering = true;
      checks.push({
        name: 'Database Reconciliation Check',
        passed: false,
        detail: `Current database marks (${currentDbResult.obtained_marks}) contradict authoritative ledger marks (${latestAuthoritativeMarks}).`,
      });
    } else {
      checks.push({
        name: 'Database Reconciliation Check',
        passed: true,
        detail: 'Materialized result database matches reconstructed ledger state.',
      });
    }

    // Build latestAuthorizedRecord if later corrections superseded this receipt
    let latestAuthorizedRecord: VerificationResponse['latestAuthorizedRecord'] = null;
    if (laterCorrections.length > 0) {
      const latestCorr = laterCorrections[laterCorrections.length - 1];
      const corrPayload = latestCorr.payload as unknown as ResultCorrectedPayload;
      const approvalEntry = allEntries.find(
        (e) =>
          e.eventType === LedgerEventType.CORRECTION_APPROVED &&
          e.payload.correctionRequestId === corrPayload.correctionRequestId
      );
      const apprPayload = approvalEntry?.payload as
        | CorrectionApprovedPayload
        | undefined;
      const exApproval = apprPayload?.approvals?.find(
        (a) => a.approverRole === 'EXAMINER'
      );
      const coApproval = apprPayload?.approvals?.find(
        (a) => a.approverRole === 'CONTROLLER'
      );
      const newReceiptRow = this.database.db
        .prepare(
          `SELECT receipt_id FROM result_receipts WHERE result_id = ? AND version = ?`
        )
        .get(receipt.resultId, corrPayload.newVersion) as
        | { receipt_id: string }
        | undefined;

      latestAuthorizedRecord = {
        obtainedMarks: Number(corrPayload.newMarks),
        maxMarks: Number(corrPayload.maxMarks),
        version: Number(corrPayload.newVersion),
        correctedAt: corrPayload.correctedAt,
        reason: corrPayload.reason,
        examinerName: exApproval?.approverName ?? corrPayload.examinerKeyId,
        examinerKeyId: corrPayload.examinerKeyId,
        controllerName: coApproval?.approverName ?? corrPayload.controllerKeyId,
        controllerKeyId: corrPayload.controllerKeyId,
        newReceiptId: newReceiptRow?.receipt_id ?? null,
      };
    }

    let status: VerificationStatus;
    let headline: string;
    let summary: string;

    if (noCheckpoint) {
      status = VerificationStatus.NO_TRUSTED_CHECKPOINT;
      headline = 'No Trusted Checkpoint';
      summary =
        'Cannot complete independent verification because no signed external checkpoint is anchored.';
    } else if (hasTampering) {
      status = VerificationStatus.TAMPERING_DETECTED;
      headline = 'Tampering Detected';
      summary =
        'Cryptographic verification detected unauthorized modification in the result database or ledger chain.';
    } else if (hasInvalidSig) {
      status = VerificationStatus.INVALID_SIGNATURE;
      headline = 'Invalid Digital Signature';
      summary =
        'One or more Ed25519 digital signatures failed verification against pinned institutional public keys.';
    } else if (latestAuthorizedRecord) {
      status = VerificationStatus.VERIFIED_SUPERSEDED;
      headline = 'Verified — Superseded by Authorized Correction';
      summary = `This printed receipt is authentic for v${receipt.version} (${originalRecord?.obtainedMarks}/${originalRecord?.maxMarks}), and was later superseded by a dual-signed correction to v${latestAuthorizedRecord.version} (${latestAuthorizedRecord.obtainedMarks}/${latestAuthorizedRecord.maxMarks}).`;
    } else {
      status = VerificationStatus.VERIFIED_ORIGINAL;
      headline = 'Verified — Original';
      summary = `Authentic result anchored in ledger block #${targetEntry.sequence} and verified against the independent signed checkpoint.`;
    }

    return {
      status,
      headline,
      summary,
      verifiedAt,
      receipt,
      originalRecord,
      latestAuthorizedRecord,
      checks,
      checkpoint,
      proofAvailable: true,
    };
  }

  /**
   * Exports a self-contained, privacy-preserving cryptographic verification proof JSON.
   * Unrelated students' personal details are strictly excluded: other blocks appear ONLY
   * as cryptographic headers (sequence, hashes, metadata, signatures).
   */
  public exportVerificationProof(receiptId: string): VerificationProof | null {
    const receipt = this.getReceiptRow(receiptId);
    if (!receipt) return null;

    const allEntries = this.ledgerService.listLedgerEntries();
    const targetEvent = allEntries.find((e) => e.sequence === receipt.ledgerSequence);
    if (!targetEvent) return null;

    const subsequentCorrections: VerificationProof['subsequentCorrections'] = [];
    for (const entry of allEntries) {
      if (
        entry.sequence > targetEvent.sequence &&
        entry.eventType === LedgerEventType.RESULT_CORRECTED &&
        entry.payload.resultId === receipt.resultId
      ) {
        const corrReqId = entry.payload.correctionRequestId;
        const approvalEvent =
          allEntries.find(
            (e) =>
              e.eventType === LedgerEventType.CORRECTION_APPROVED &&
              e.payload.correctionRequestId === corrReqId
          ) ?? null;
        subsequentCorrections.push({
          approvalEvent,
          correctionEvent: entry,
        });
      }
    }

    // Privacy-preserving chain headers ONLY — zero payloads of unrelated students!
    const privacyPreservingChainHeaders: LedgerHeader[] = allEntries.map(
      (e: LedgerEntryRecord) => ({
        sequence: e.sequence,
        eventId: e.eventId,
        eventType: e.eventType,
        previousHash: e.previousHash,
        payloadHash: e.payloadHash,
        blockHash: e.blockHash,
        publisherId: e.publisherId,
        publisherKeyId: e.publisherKeyId,
        signature: e.signature,
        timestamp: e.timestamp,
        schemaVersion: e.schemaVersion,
      })
    );

    return {
      proofVersion: '1.0',
      exportedAt: new Date().toISOString(),
      receipt: {
        receiptId: receipt.receiptId,
        resultId: receipt.resultId,
        version: receipt.version,
        ledgerSequence: receipt.ledgerSequence,
        fingerprint: receipt.fingerprint,
        shortFingerprint: receipt.shortFingerprint,
      },
      targetEvent,
      subsequentCorrections,
      privacyPreservingChainHeaders,
      trustedCheckpoint: this.trustStore.getCheckpoint(),
      pinnedTrustedKeys: this.trustStore.getTrustedKeys(),
    };
  }
}
