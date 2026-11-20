export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  EXAMINER = 'EXAMINER',
  CONTROLLER = 'CONTROLLER',
  STUDENT = 'STUDENT',
}

export enum LedgerEventType {
  RESULT_PUBLISHED = 'RESULT_PUBLISHED',
  CORRECTION_APPROVED = 'CORRECTION_APPROVED',
  RESULT_CORRECTED = 'RESULT_CORRECTED',
}

export enum CorrectionStatus {
  PENDING = 'PENDING',
  APPROVED_PARTIAL = 'APPROVED_PARTIAL',
  READY_TO_FINALIZE = 'READY_TO_FINALIZE',
  FINALIZED = 'FINALIZED',
  REJECTED = 'REJECTED',
}

export enum VerificationStatus {
  VERIFIED_ORIGINAL = 'VERIFIED_ORIGINAL',
  VERIFIED_SUPERSEDED = 'VERIFIED_SUPERSEDED',
  TAMPERING_DETECTED = 'TAMPERING_DETECTED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  NO_TRUSTED_CHECKPOINT = 'NO_TRUSTED_CHECKPOINT',
  RECORD_NOT_FOUND = 'RECORD_NOT_FOUND',
  VERIFICATION_UNAVAILABLE = 'VERIFICATION_UNAVAILABLE',
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  keyId: string | null;
  studentId: string | null;
  createdAt: string;
}

export interface StudentRecord {
  id: string;
  registrationNumber: string;
  fullName: string;
  course: string;
  semester: number;
  academicSession: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  publishedCount?: number;
}

export interface SubjectRecord {
  id: string;
  code: string;
  name: string;
  maxMarks: number;
  semester: number;
}

export interface ExamRecord {
  id: string;
  examCode: string;
  title: string;
  academicSession: string;
  semester: number;
  examDate: string;
}

export interface ResultRecord {
  id: string;
  studentId: string;
  registrationNumber: string;
  studentName: string;
  course: string;
  examId: string;
  examCode: string;
  examTitle: string;
  academicSession: string;
  semester: number;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  maxMarks: number;
  obtainedMarks: number;
  version: number;
  status: string;
  publishedAt: string;
  updatedAt: string;
  latestLedgerSequence: number;
  latestReceiptId: string;
  shortFingerprint: string;
}

export interface ResultPublishedPayload {
  schemaVersion: string;
  resultId: string;
  studentId: string;
  registrationNumber: string;
  studentName: string;
  course: string;
  examId: string;
  examCode: string;
  academicSession: string;
  semester: number;
  subjectCode: string;
  subjectName: string;
  maxMarks: number;
  obtainedMarks: number;
  version: number;
  publishedAt: string;
}

export interface CorrectionSigningPayload {
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
}

export interface ApprovalEvidence {
  approvalId: string;
  approverUserId: string;
  approverName: string;
  approverRole: 'EXAMINER' | 'CONTROLLER';
  keyId: string;
  publicKeyHex: string;
  signatureHex: string;
  decision: 'APPROVED' | 'REJECTED';
  signedAt: string;
  comment: string | null;
}

export interface CorrectionApprovedPayload {
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
  approvals: ApprovalEvidence[];
  approvedAt: string;
}

export interface ResultCorrectedPayload {
  schemaVersion: string;
  correctionRequestId: string;
  resultId: string;
  previousVersion: number;
  newVersion: number;
  oldMarks: number;
  newMarks: number;
  maxMarks: number;
  reason: string;
  studentId: string;
  registrationNumber: string;
  studentName: string;
  course: string;
  examId: string;
  examCode: string;
  academicSession: string;
  semester: number;
  subjectCode: string;
  subjectName: string;
  examinerKeyId: string;
  examinerSignatureHex: string;
  controllerKeyId: string;
  controllerSignatureHex: string;
  correctedAt: string;
}

export interface LedgerEntryRecord {
  sequence: number;
  eventId: string;
  eventType: LedgerEventType;
  previousHash: string;
  payloadHash: string;
  blockHash: string;
  publisherId: string;
  publisherKeyId: string;
  signature: string;
  timestamp: string;
  schemaVersion: string;
  payload: Record<string, unknown>;
}

export interface LedgerHeader {
  sequence: number;
  eventId: string;
  eventType: LedgerEventType;
  previousHash: string;
  payloadHash: string;
  blockHash: string;
  publisherId: string;
  publisherKeyId: string;
  signature: string;
  timestamp: string;
  schemaVersion: string;
}

export interface TrustedKeyEntry {
  keyId: string;
  ownerName: string;
  ownerEmail: string;
  role: 'PUBLISHER' | 'CHECKPOINT_AUTHORITY' | 'EXAMINER' | 'CONTROLLER';
  publicKeyHex: string;
  enrolledAt: string;
  active: boolean;
}

export interface TrustedCheckpoint {
  schemaVersion: string;
  sequence: number;
  blockHash: string;
  timestamp: string;
  authorityKeyId: string;
  signature: string;
}

export interface CorrectionRequestRecord {
  id: string;
  resultId: string;
  registrationNumber: string;
  studentName: string;
  subjectCode: string;
  subjectName: string;
  examCode: string;
  academicSession: string;
  semester: number;
  originalVersion: number;
  currentResultVersion: number;
  oldMarks: number;
  proposedMarks: number;
  maxMarks: number;
  reason: string;
  status: CorrectionStatus;
  requestedByUserId: string;
  requestedByName: string;
  createdAt: string;
  updatedAt: string;
  finalizedLedgerSequence: number | null;
  approvals: ApprovalEvidence[];
  signingPayload: CorrectionSigningPayload;
}

export interface ReceiptRecord {
  receiptId: string;
  resultId: string;
  version: number;
  ledgerSequence: number;
  payloadHash: string;
  blockHash: string;
  fingerprint: string;
  shortFingerprint: string;
  createdAt: string;
}

export interface AuditIssue {
  id: string;
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  message: string;
  affectedEntity: string;
  expectedValue: string;
  databaseValue: string;
  firstInvalidBlock: number | null;
  detectedAt: string;
}

export interface AuditReport {
  id: string;
  status: 'VERIFIED' | 'TAMPERING_DETECTED' | 'NO_TRUSTED_CHECKPOINT';
  checkedAt: string;
  totalLedgerEntries: number;
  validLedgerEntries: number;
  totalMaterializedResults: number;
  firstInvalidBlock: number | null;
  checkpointSequence: number | null;
  checkpointBlockHash: string | null;
  checkpointValid: boolean;
  issues: AuditIssue[];
}

export interface VerificationCheckItem {
  name: string;
  passed: boolean;
  detail: string;
}

export interface VerificationProof {
  proofVersion: string;
  exportedAt: string;
  receipt: {
    receiptId: string;
    resultId: string;
    version: number;
    ledgerSequence: number;
    fingerprint: string;
    shortFingerprint: string;
  };
  targetEvent: LedgerEntryRecord;
  subsequentCorrections: Array<{
    approvalEvent: LedgerEntryRecord | null;
    correctionEvent: LedgerEntryRecord;
  }>;
  privacyPreservingChainHeaders: LedgerHeader[];
  trustedCheckpoint: TrustedCheckpoint | null;
  pinnedTrustedKeys: TrustedKeyEntry[];
}

export interface VerificationResponse {
  status: VerificationStatus;
  headline: string;
  summary: string;
  verifiedAt: string;
  receipt: ReceiptRecord | null;
  originalRecord: {
    registrationNumber: string;
    studentName: string;
    course: string;
    academicSession: string;
    semester: number;
    examCode: string;
    subjectCode: string;
    subjectName: string;
    obtainedMarks: number;
    maxMarks: number;
    version: number;
    publishedAt: string;
  } | null;
  latestAuthorizedRecord: {
    obtainedMarks: number;
    maxMarks: number;
    version: number;
    correctedAt: string;
    reason: string;
    examinerName: string;
    examinerKeyId: string;
    controllerName: string;
    controllerKeyId: string;
    newReceiptId: string | null;
  } | null;
  checks: VerificationCheckItem[];
  checkpoint: TrustedCheckpoint | null;
  proofAvailable: boolean;
}

export interface EncryptedDemoKeyBundle {
  keyId: string;
  role: 'EXAMINER' | 'CONTROLLER';
  ownerName: string;
  ownerEmail: string;
  publicKeyHex: string;
  saltHex: string;
  ivHex: string;
  ciphertextHex: string;
  iterations: number;
}
