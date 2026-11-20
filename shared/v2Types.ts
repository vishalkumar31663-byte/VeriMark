import {
  ApprovalEvidence,
  CorrectionRequestRecord,
  LedgerEntryRecord,
  ReceiptRecord,
  ResultRecord,
  VerificationStatus,
} from './types';

// ============================================================
// FEATURE 1 — SMART NOTIFICATIONS
// ============================================================
export enum NotificationCategory {
  EXAM_SCHEDULE = 'EXAM_SCHEDULE',
  ADMIT_CARD = 'ADMIT_CARD',
  RESULT = 'RESULT',
  REVALUATION = 'REVALUATION',
  TICKET = 'TICKET',
  CORRECTION = 'CORRECTION',
  SECURITY = 'SECURITY',
}

export enum NotificationPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface NotificationRecord {
  id: string;
  userId: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  linkPath: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

// ============================================================
// FEATURE 3 & 4 — EXAMINATION SCHEDULE & ONLINE/OFFLINE MODE
// ============================================================
export enum ExamMode {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
}

export enum ExamScheduleStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CANCELLED = 'CANCELLED',
}

export interface ExamAssignmentRecord {
  id: string;
  scheduleId: string;
  examinerUserId: string;
  examinerName: string;
  examinerEmail: string;
  assignedByUserId: string;
  roleLabel: string;
  assignedAt: string;
}

export interface ExamScheduleRecord {
  id: string;
  examinationId: string;
  subjectId: string;
  subjectCode: string;
  subjectTitle: string;
  academicSession: string;
  course: string;
  semester: number;
  category: string;
  examDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  timezone: string; // e.g., Asia/Kolkata
  mode: ExamMode;
  onlineUrl: string | null;
  accessInstructions: string | null;
  campus: string | null;
  building: string | null;
  room: string | null;
  reportingTime: string | null;
  requiredDocuments: string | null;
  instructions: string;
  status: ExamScheduleStatus;
  admitCardAvailable: boolean;
  createdByUserId: string;
  createdByName: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignments: ExamAssignmentRecord[];
  studentSeatNumber?: string | null;
  studentRoom?: string | null;
}

export interface ExamScheduleHistoryRecord {
  id: string;
  scheduleId: string;
  actorUserId: string;
  actorName: string;
  action: string;
  changeSummary: string;
  createdAt: string;
}

export interface ScheduleChangeRequestRecord {
  id: string;
  scheduleId: string;
  examinationId: string;
  subjectCode: string;
  subjectTitle: string;
  requestedByUserId: string;
  requestedByName: string;
  requestedChanges: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// FEATURE 5 & 11 — RAISE & TRACK TICKET + TICKET-TO-CORRECTION
// ============================================================
export enum TicketCategory {
  INCORRECT_MARKS = 'INCORRECT_MARKS',
  MISSING_RESULT = 'MISSING_RESULT',
  RESULT_VERIFICATION = 'RESULT_VERIFICATION',
  EXAM_TIMETABLE = 'EXAM_TIMETABLE',
  ONLINE_EXAM = 'ONLINE_EXAM',
  OFFLINE_EXAM = 'OFFLINE_EXAM',
  ADMIT_CARD = 'ADMIT_CARD',
  REVALUATION_QUERY = 'REVALUATION_QUERY',
  OTHER_ACADEMIC = 'OTHER_ACADEMIC',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  WAITING_FOR_STUDENT = 'WAITING_FOR_STUDENT',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
  CLOSED = 'CLOSED',
  REOPENED = 'REOPENED',
}

export interface TicketAttachmentRecord {
  id: string;
  ticketId: string | null;
  revaluationId: string | null;
  uploadedByUserId: string;
  uploadedByName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TicketMessageRecord {
  id: string;
  ticketId: string;
  senderUserId: string;
  senderName: string;
  senderRole: string;
  body: string;
  isInternalNote: boolean;
  createdAt: string;
}

export interface TicketEventRecord {
  id: string;
  ticketId: string;
  actorUserId: string;
  actorName: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  detail: string;
  createdAt: string;
}

export interface TicketRecord {
  id: string;
  ticketNumber: string;
  createdByUserId: string;
  createdByName: string;
  createdByRole: string;
  studentId: string | null;
  studentName: string | null;
  registrationNumber: string | null;
  assignedExaminerId: string | null;
  assignedExaminerName: string | null;
  category: TicketCategory;
  subject: string;
  description: string;
  relatedExamId: string | null;
  relatedScheduleId: string | null;
  relatedResultId: string | null;
  relatedResultVersion: number | null;
  relatedSubjectCode: string | null;
  status: TicketStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  recommendedMarks: number | null;
  recommendationNote: string | null;
  resolutionReason: string | null;
  linkedCorrectionId: string | null;
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  isOverdue: boolean;
  messagesCount?: number;
}

export interface TicketDetailRecord extends TicketRecord {
  messages: TicketMessageRecord[];
  events: TicketEventRecord[];
  attachments: TicketAttachmentRecord[];
  linkedResult: ResultRecord | null;
  linkedCorrection: CorrectionRequestRecord | null;
}

// ============================================================
// FEATURE 8 — REVALUATION REQUESTS
// ============================================================
export enum RevaluationStatus {
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  EVIDENCE_REQUIRED = 'EVIDENCE_REQUIRED',
  RECOMMENDED = 'RECOMMENDED',
  APPROVED_FOR_CORRECTION = 'APPROVED_FOR_CORRECTION',
  REJECTED = 'REJECTED',
  CORRECTION_IN_PROGRESS = 'CORRECTION_IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export interface RevaluationRecord {
  id: string;
  requestNumber: string;
  studentId: string;
  studentName: string;
  registrationNumber: string;
  resultId: string;
  resultVersion: number;
  subjectCode: string;
  subjectName: string;
  examCode: string;
  maxMarks: number;
  originalMarks: number;
  currentMarks: number;
  currentVersion: number;
  reason: string;
  status: RevaluationStatus;
  assignedExaminerId: string | null;
  assignedExaminerName: string | null;
  examinerRecommendation: 'APPROVE' | 'REJECT' | 'EVIDENCE_REQUIRED' | null;
  recommendedMarks: number | null;
  examinerNotes: string | null;
  controllerDecision: 'APPROVED_FOR_CORRECTION' | 'REJECTED' | null;
  controllerNotes: string | null;
  reviewedByControllerId: string | null;
  reviewedByControllerName: string | null;
  linkedCorrectionId: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: TicketAttachmentRecord[];
}

// ============================================================
// FEATURE 7 — RESULT VERSION COMPARISON
// ============================================================
export interface ResultComparisonResponse {
  result: ResultRecord;
  originalVersion: {
    version: number;
    obtainedMarks: number;
    maxMarks: number;
    publishedAt: string;
    receipt: ReceiptRecord | null;
    ledgerSequence: number | null;
    verificationStatus: VerificationStatus;
  };
  latestVersion: {
    version: number;
    obtainedMarks: number;
    maxMarks: number;
    updatedAt: string;
    receipt: ReceiptRecord | null;
    ledgerSequence: number | null;
    verificationStatus: VerificationStatus;
  };
  hasFinalizedCorrection: boolean;
  marksDelta: number;
  finalizedCorrections: Array<{
    correctionRequestId: string;
    previousVersion: number;
    newVersion: number;
    oldMarks: number;
    newMarks: number;
    reason: string;
    correctedAt: string;
    ledgerSequence: number;
    examinerApproval: ApprovalEvidence | null;
    controllerApproval: ApprovalEvidence | null;
    approvals: ApprovalEvidence[];
  }>;
  pendingProposals: CorrectionRequestRecord[];
  ledgerEvents: LedgerEntryRecord[];
  receipts: ReceiptRecord[];
  linkedTickets: Array<{
    id: string;
    ticketNumber: string;
    status: TicketStatus;
    subject: string;
  }>;
  linkedRevaluations: Array<{
    id: string;
    requestNumber: string;
    status: RevaluationStatus;
    recommendedMarks: number | null;
  }>;
}

// ============================================================
// FEATURE 10 — DIGITAL ADMIT CARD
// ============================================================
export enum AdmitCardStatus {
  ACTIVE = 'ACTIVE',
  REISSUED = 'REISSUED',
  REVOKED = 'REVOKED',
}

export interface AdmitCardRecord {
  id: string;
  cardNumber: string;
  verificationToken: string;
  studentId: string;
  studentName: string;
  registrationNumber: string;
  course: string;
  semester: number;
  academicSession: string;
  scheduleId: string;
  examinationId: string;
  subjectCode: string;
  subjectTitle: string;
  examCategory: string;
  examDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  reportingTime: string | null;
  mode: ExamMode;
  campus: string | null;
  building: string | null;
  room: string | null;
  seatNumber: string | null;
  onlineUrl: string | null;
  accessInstructions: string | null;
  requiredDocuments: string | null;
  instructions: string;
  version: number;
  status: AdmitCardStatus;
  issuedByUserId: string;
  issuedAt: string;
  revokedAt: string | null;
}

export interface PublicAdmitCardVerification {
  valid: boolean;
  status: 'VALID' | 'REISSUED' | 'REVOKED' | 'NOT_FOUND';
  disclaimer: string;
  verifiedAt: string;
  card: {
    cardNumber: string;
    version: number;
    studentName: string;
    registrationNumber: string;
    course: string;
    semester: number;
    academicSession: string;
    examinationId: string;
    subjectCode: string;
    subjectTitle: string;
    examDate: string;
    startTime: string;
    endTime: string;
    timezone: string;
    mode: ExamMode;
    campus: string | null;
    building: string | null;
    room: string | null;
    seatNumber: string | null;
    issuedAt: string;
  } | null;
}

// ============================================================
// FEATURE 9 — ANALYTICS
// ============================================================
export interface StudentAnalyticsResponse {
  hasData: boolean;
  summary: {
    totalSubjects: number;
    overallPercentage: number;
    averageMarks: number;
    strongestSubject: { subjectCode: string; subjectName: string; percentage: number; marks: number; maxMarks: number } | null;
    lowestSubject: { subjectCode: string; subjectName: string; percentage: number; marks: number; maxMarks: number } | null;
    correctedCount: number;
    verifiedReceiptsCount: number;
  };
  subjectPerformance: Array<{
    resultId: string;
    subjectCode: string;
    subjectName: string;
    obtainedMarks: number;
    maxMarks: number;
    percentage: number;
    version: number;
    originalMarks: number;
  }>;
  examTrend: Array<{
    examCode: string;
    examDate: string;
    averagePercentage: number;
    subjectsCount: number;
  }>;
  versionComparisons: Array<{
    subjectCode: string;
    originalMarks: number;
    currentMarks: number;
    maxMarks: number;
    version: number;
  }>;
}

export interface ExaminerAnalyticsResponse {
  hasData: boolean;
  scopeSubjects: Array<{ subjectCode: string; subjectName: string }>;
  summary: {
    evaluatedStudents: number;
    publishedResultsCount: number;
    averagePercentage: number;
    highestMarks: number;
    lowestMarks: number;
    revaluationRequestsReceived: number;
    pendingTicketsCount: number;
    pendingCorrectionApprovals: number;
  };
  subjectDistribution: Array<{
    subjectCode: string;
    subjectName: string;
    count: number;
    avgPercentage: number;
    highestMarks: number;
    lowestMarks: number;
  }>;
  scoreBands: Array<{
    band: string;
    count: number;
  }>;
}

export interface ControllerAnalyticsResponse {
  hasData: boolean;
  summary: {
    totalPublishedResults: number;
    totalStudents: number;
    upcomingExamsCount: number;
    pendingCorrectionApprovals: number;
    finalizedCorrections: number;
    activeDisputes: number;
    pendingRevaluations: number;
    totalRevaluations: number;
    totalTickets: number;
    resolvedTickets: number;
    ticketResolutionRate: number;
    ledgerIntegrityStatus: string;
  };
  examPerformance: Array<{
    examCode: string;
    title: string;
    resultsCount: number;
    avgPercentage: number;
  }>;
  courseAggregates: Array<{
    course: string;
    studentsCount: number;
    resultsCount: number;
    avgPercentage: number;
  }>;
  verificationOutcomes: Array<{
    status: string;
    count: number;
  }>;
  ticketCategories: Array<{
    category: string;
    count: number;
    resolved: number;
  }>;
  revaluationStatuses: Array<{
    status: string;
    count: number;
  }>;
}
