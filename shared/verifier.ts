/**
 * Standalone Cryptographic Proof Verifier
 * Runs independently in the browser OR Node.js using pinned trusted public keys
 * and @noble/ed25519 + Web Crypto SHA-256. Never trusts server verification booleans.
 */
import * as ed from '@noble/ed25519';
import {
  GENESIS_PREVIOUS_HASH,
  buildBlockHashPreimage,
  buildCheckpointSigningMessage,
  buildCorrectionSigningMessage,
  buildPayloadHashPreimage,
  buildReceiptFingerprintPreimage,
  hexToBytes,
  sha256HexAsync,
} from './canonical';
import {
  CorrectionApprovedPayload,
  LedgerEventType,
  ResultCorrectedPayload,
  TrustedKeyEntry,
  VerificationCheckItem,
  VerificationProof,
  VerificationStatus,
} from './types';

export interface StandaloneVerificationResult {
  valid: boolean;
  status: VerificationStatus;
  checks: VerificationCheckItem[];
  verifiedBlockSequence: number | null;
  anchoredCheckpointSequence: number | null;
  supersededByVersion: number | null;
}

async function verifyEd25519Hex(
  messageUtf8: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    const msgBytes = new TextEncoder().encode(messageUtf8);
    const sigBytes = hexToBytes(signatureHex);
    const pubBytes = hexToBytes(publicKeyHex);
    if (sigBytes.length !== 64 || pubBytes.length !== 32) {
      return false;
    }
    return await ed.verifyAsync(sigBytes, msgBytes, pubBytes);
  } catch {
    return false;
  }
}

export async function verifyProofIndependently(
  proof: VerificationProof,
  externalPinnedKeys?: TrustedKeyEntry[]
): Promise<StandaloneVerificationResult> {
  const checks: VerificationCheckItem[] = [];
  const trustedKeys = externalPinnedKeys ?? proof.pinnedTrustedKeys ?? [];
  const keyMap = new Map<string, TrustedKeyEntry>();
  for (const k of trustedKeys) {
    if (k.active) {
      keyMap.set(k.keyId, k);
    }
  }

  let hasTampering = false;
  let hasInvalidSig = false;
  let noCheckpoint = false;

  const target = proof.targetEvent;

  // 1. Verify target payload hash
  const recomputedPayloadHash = await sha256HexAsync(
    buildPayloadHashPreimage(target.payload)
  );
  const payloadHashValid = recomputedPayloadHash === target.payloadHash;
  if (!payloadHashValid) hasTampering = true;
  checks.push({
    name: 'Canonical Payload SHA-256',
    passed: payloadHashValid,
    detail: payloadHashValid
      ? `Payload hash matches ${target.payloadHash.slice(0, 16)}…`
      : `Payload hash mismatch: computed ${recomputedPayloadHash.slice(0, 16)}… vs recorded ${target.payloadHash.slice(0, 16)}…`,
  });

  // 2. Verify target block hash
  const recomputedBlockHash = await sha256HexAsync(
    buildBlockHashPreimage({
      sequence: target.sequence,
      eventId: target.eventId,
      eventType: target.eventType,
      previousHash: target.previousHash,
      payloadHash: target.payloadHash,
      publisherId: target.publisherId,
      publisherKeyId: target.publisherKeyId,
      timestamp: target.timestamp,
      schemaVersion: target.schemaVersion,
    })
  );
  const blockHashValid = recomputedBlockHash === target.blockHash;
  if (!blockHashValid) hasTampering = true;
  checks.push({
    name: 'Deterministic Block Hash',
    passed: blockHashValid,
    detail: blockHashValid
      ? `Block #${target.sequence} hash verified (${target.blockHash.slice(0, 16)}…)`
      : `Block #${target.sequence} hash mismatch`,
  });

  // 3. Verify receipt fingerprint
  const recomputedFingerprint = await sha256HexAsync(
    buildReceiptFingerprintPreimage(
      proof.receipt.receiptId,
      target.payloadHash,
      target.blockHash
    )
  );
  const fingerprintValid = recomputedFingerprint === proof.receipt.fingerprint;
  if (!fingerprintValid) hasTampering = true;
  checks.push({
    name: 'Receipt Cryptographic Fingerprint',
    passed: fingerprintValid,
    detail: fingerprintValid
      ? `Receipt ${proof.receipt.receiptId} binds cleanly to block #${target.sequence}`
      : 'Receipt fingerprint does not match published event hash',
  });

  // 4. Verify publisher Ed25519 signature against pinned key
  const pubKey = keyMap.get(target.publisherKeyId);
  let targetSigValid = false;
  if (pubKey && pubKey.role === 'PUBLISHER') {
    targetSigValid = await verifyEd25519Hex(
      target.blockHash,
      target.signature,
      pubKey.publicKeyHex
    );
  }
  if (!targetSigValid) hasInvalidSig = true;
  checks.push({
    name: 'Publisher Ed25519 Signature',
    passed: targetSigValid,
    detail: targetSigValid
      ? `Signed by pinned key ${target.publisherKeyId} (${pubKey?.ownerName})`
      : `Invalid or untrusted publisher signature for key ${target.publisherKeyId}`,
  });

  // 5. Verify external trusted checkpoint signature
  const cp = proof.trustedCheckpoint;
  let checkpointSigValid = false;
  if (!cp) {
    noCheckpoint = true;
    checks.push({
      name: 'External Trusted Checkpoint',
      passed: false,
      detail: 'No independently signed checkpoint is anchored',
    });
  } else {
    const cpKey = keyMap.get(cp.authorityKeyId);
    if (cpKey && cpKey.role === 'CHECKPOINT_AUTHORITY') {
      const cpMessage = buildCheckpointSigningMessage({
        schemaVersion: cp.schemaVersion,
        sequence: cp.sequence,
        blockHash: cp.blockHash,
        timestamp: cp.timestamp,
        authorityKeyId: cp.authorityKeyId,
      });
      checkpointSigValid = await verifyEd25519Hex(
        cpMessage,
        cp.signature,
        cpKey.publicKeyHex
      );
    }
    if (!checkpointSigValid) hasInvalidSig = true;
    checks.push({
      name: 'External Checkpoint Ed25519 Anchor',
      passed: checkpointSigValid,
      detail: checkpointSigValid
        ? `Checkpoint #${cp.sequence} signed by ${cp.authorityKeyId}`
        : `Checkpoint signature verification failed for ${cp.authorityKeyId}`,
    });
  }

  // 6. Verify full privacy-preserving hash-chain header continuity up to checkpoint
  const headers = [...proof.privacyPreservingChainHeaders].sort(
    (a, b) => a.sequence - b.sequence
  );
  let chainValid = headers.length > 0;
  let chainDetail = '';

  if (headers.length === 0) {
    chainDetail = 'No chain proof headers provided';
    hasTampering = true;
  } else {
    let expectedPrev = GENESIS_PREVIOUS_HASH;
    let foundTargetInChain = false;

    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      const expectedSeq = i + 1;
      if (h.sequence !== expectedSeq) {
        chainValid = false;
        hasTampering = true;
        chainDetail = `Sequence gap at expected #${expectedSeq} (found #${h.sequence})`;
        break;
      }
      if (h.previousHash !== expectedPrev) {
        chainValid = false;
        hasTampering = true;
        chainDetail = `Broken hash link at block #${h.sequence}`;
        break;
      }
      const computedH = await sha256HexAsync(
        buildBlockHashPreimage({
          sequence: h.sequence,
          eventId: h.eventId,
          eventType: h.eventType,
          previousHash: h.previousHash,
          payloadHash: h.payloadHash,
          publisherId: h.publisherId,
          publisherKeyId: h.publisherKeyId,
          timestamp: h.timestamp,
          schemaVersion: h.schemaVersion,
        })
      );
      if (computedH !== h.blockHash) {
        chainValid = false;
        hasTampering = true;
        chainDetail = `Block #${h.sequence} header hash mismatch`;
        break;
      }
      const hPubKey = keyMap.get(h.publisherKeyId);
      if (!hPubKey || hPubKey.role !== 'PUBLISHER') {
        chainValid = false;
        hasInvalidSig = true;
        chainDetail = `Block #${h.sequence} uses untrusted key ${h.publisherKeyId}`;
        break;
      }
      const sigOk = await verifyEd25519Hex(
        h.blockHash,
        h.signature,
        hPubKey.publicKeyHex
      );
      if (!sigOk) {
        chainValid = false;
        hasInvalidSig = true;
        chainDetail = `Block #${h.sequence} Ed25519 signature invalid`;
        break;
      }
      if (
        h.sequence === target.sequence &&
        h.blockHash === target.blockHash &&
        h.payloadHash === target.payloadHash
      ) {
        foundTargetInChain = true;
      }
      expectedPrev = h.blockHash;
    }

    if (chainValid && !foundTargetInChain) {
      chainValid = false;
      hasTampering = true;
      chainDetail = `Target block #${target.sequence} not anchored in chain headers`;
    }

    if (chainValid && cp) {
      const head = headers[headers.length - 1];
      if (head.sequence !== cp.sequence || head.blockHash !== cp.blockHash) {
        chainValid = false;
        hasTampering = true;
        chainDetail = `Ledger head (#${head.sequence}) does not match trusted checkpoint (#${cp.sequence})`;
      } else {
        chainDetail = `Verified contiguous signed chain of ${headers.length} block headers anchored to checkpoint #${cp.sequence}`;
      }
    }
  }

  checks.push({
    name: 'Privacy-Preserving Hash-Chain Continuity',
    passed: chainValid,
    detail: chainDetail,
  });

  // 7. Verify subsequent dual-authority corrections if any
  let supersededByVersion: number | null = null;
  if (proof.subsequentCorrections.length > 0) {
    let allCorrectionsValid = true;
    for (const item of proof.subsequentCorrections) {
      const corrEvent = item.correctionEvent;
      const corrPayload = corrEvent.payload as unknown as ResultCorrectedPayload;
      const corrPayloadHash = await sha256HexAsync(
        buildPayloadHashPreimage(corrEvent.payload)
      );
      if (corrPayloadHash !== corrEvent.payloadHash) {
        allCorrectionsValid = false;
        hasTampering = true;
      }
      const headerMatch = headers.find(
        (h) =>
          h.sequence === corrEvent.sequence &&
          h.blockHash === corrEvent.blockHash &&
          h.payloadHash === corrEvent.payloadHash
      );
      if (!headerMatch) {
        allCorrectionsValid = false;
        hasTampering = true;
      }

      if (item.approvalEvent) {
        const apprPayload = item.approvalEvent
          .payload as unknown as CorrectionApprovedPayload;
        const msg = buildCorrectionSigningMessage({
          schemaVersion: apprPayload.schemaVersion,
          correctionRequestId: apprPayload.correctionRequestId,
          resultId: apprPayload.resultId,
          originalVersion: apprPayload.originalVersion,
          oldMarks: apprPayload.oldMarks,
          proposedMarks: apprPayload.proposedMarks,
          maxMarks: apprPayload.maxMarks,
          reason: apprPayload.reason,
          registrationNumber: apprPayload.registrationNumber,
          subjectCode: apprPayload.subjectCode,
        });
        const examiner = apprPayload.approvals.find(
          (a) => a.approverRole === 'EXAMINER' && a.decision === 'APPROVED'
        );
        const controller = apprPayload.approvals.find(
          (a) => a.approverRole === 'CONTROLLER' && a.decision === 'APPROVED'
        );
        if (
          !examiner ||
          !controller ||
          examiner.approverUserId === controller.approverUserId ||
          examiner.keyId === controller.keyId
        ) {
          allCorrectionsValid = false;
          hasInvalidSig = true;
        } else {
          const exKey = keyMap.get(examiner.keyId);
          const coKey = keyMap.get(controller.keyId);
          const exOk =
            exKey?.role === 'EXAMINER' &&
            (await verifyEd25519Hex(msg, examiner.signatureHex, exKey.publicKeyHex));
          const coOk =
            coKey?.role === 'CONTROLLER' &&
            (await verifyEd25519Hex(msg, controller.signatureHex, coKey.publicKeyHex));
          if (!exOk || !coOk) {
            allCorrectionsValid = false;
            hasInvalidSig = true;
          }
        }
      }

      if (corrEvent.eventType === LedgerEventType.RESULT_CORRECTED) {
        supersededByVersion = corrPayload.newVersion;
      }
    }

    checks.push({
      name: 'Dual-Authority Correction Signatures',
      passed: allCorrectionsValid,
      detail: allCorrectionsValid
        ? `Verified ${proof.subsequentCorrections.length} dual-signed correction(s) with distinct Examiner + Controller keys`
        : 'One or more subsequent correction signatures failed verification',
    });
  }

  let status: VerificationStatus;
  if (noCheckpoint) {
    status = VerificationStatus.NO_TRUSTED_CHECKPOINT;
  } else if (hasTampering) {
    status = VerificationStatus.TAMPERING_DETECTED;
  } else if (hasInvalidSig) {
    status = VerificationStatus.INVALID_SIGNATURE;
  } else if (supersededByVersion !== null) {
    status = VerificationStatus.VERIFIED_SUPERSEDED;
  } else {
    status = VerificationStatus.VERIFIED_ORIGINAL;
  }

  return {
    valid:
      status === VerificationStatus.VERIFIED_ORIGINAL ||
      status === VerificationStatus.VERIFIED_SUPERSEDED,
    status,
    checks,
    verifiedBlockSequence: target.sequence,
    anchoredCheckpointSequence: cp?.sequence ?? null,
    supersededByVersion,
  };
}
