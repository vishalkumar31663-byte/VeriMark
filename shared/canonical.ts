/**
 * Deterministic Canonical JSON & Domain-Separated Hash Construction
 * Shared cleanly between Node.js backend and browser standalone verifier.
 */

export const GENESIS_PREVIOUS_HASH = '0'.repeat(64);
export const LEDGER_SCHEMA_VERSION = '1.0';

export const HASH_DOMAINS = {
  PAYLOAD: 'VERIMARK_PAYLOAD_V1:',
  BLOCK: 'VERIMARK_BLOCK_V1:',
  CORRECTION: 'VERIMARK_CORRECTION_V1:',
  CHECKPOINT: 'VERIMARK_CHECKPOINT_V1:',
  RECEIPT: 'VERIMARK_RECEIPT_V1:',
} as const;

function sortValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      if (obj[key] !== undefined) {
        sorted[key] = sortValue(obj[key]);
      }
    }
    return sorted;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot canonicalize non-finite number');
    }
    return Object.is(value, -0) ? 0 : value;
  }
  return value;
}

/**
 * Produces deterministic UTF-8 canonical JSON with recursively sorted keys and no whitespace variance.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function buildBlockHashPreimage(fields: {
  sequence: number;
  eventId: string;
  eventType: string;
  previousHash: string;
  payloadHash: string;
  publisherId: string;
  publisherKeyId: string;
  timestamp: string;
  schemaVersion: string;
}): string {
  return (
    HASH_DOMAINS.BLOCK +
    canonicalJson({
      sequence: fields.sequence,
      eventId: fields.eventId,
      eventType: fields.eventType,
      previousHash: fields.previousHash,
      payloadHash: fields.payloadHash,
      publisherId: fields.publisherId,
      publisherKeyId: fields.publisherKeyId,
      timestamp: fields.timestamp,
      schemaVersion: fields.schemaVersion,
    })
  );
}

export function buildPayloadHashPreimage(payload: unknown): string {
  return HASH_DOMAINS.PAYLOAD + canonicalJson(payload);
}

export function buildCorrectionSigningMessage(payload: {
  schemaVersion: string;
  correctionRequestId: string;
  resultId: string;
  originalVersion: number;
  oldMarks: number;
  proposedMarks: number;
  maxMarks: number;
  reason: string;
  registrationNumber: string;
  subjectCode: string;
}): string {
  return (
    HASH_DOMAINS.CORRECTION +
    canonicalJson({
      schemaVersion: payload.schemaVersion,
      correctionRequestId: payload.correctionRequestId,
      resultId: payload.resultId,
      originalVersion: payload.originalVersion,
      oldMarks: payload.oldMarks,
      proposedMarks: payload.proposedMarks,
      maxMarks: payload.maxMarks,
      reason: payload.reason,
      registrationNumber: payload.registrationNumber,
      subjectCode: payload.subjectCode,
    })
  );
}

export function buildCheckpointSigningMessage(fields: {
  schemaVersion: string;
  sequence: number;
  blockHash: string;
  timestamp: string;
  authorityKeyId: string;
}): string {
  return (
    HASH_DOMAINS.CHECKPOINT +
    canonicalJson({
      schemaVersion: fields.schemaVersion,
      sequence: fields.sequence,
      blockHash: fields.blockHash,
      timestamp: fields.timestamp,
      authorityKeyId: fields.authorityKeyId,
    })
  );
}

export function buildReceiptFingerprintPreimage(
  receiptId: string,
  payloadHash: string,
  blockHash: string
): string {
  return (
    HASH_DOMAINS.RECEIPT +
    canonicalJson({
      receiptId,
      payloadHash,
      blockHash,
    })
  );
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export async function sha256HexAsync(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(digest));
}
