import {
  CorrectionStatus,
  LedgerEventType,
  UserProfile,
  UserRole,
  VerificationStatus,
} from '../shared/types';
import {
  ControllerAnalyticsResponse,
  ExaminerAnalyticsResponse,
  ResultComparisonResponse,
  RevaluationStatus,
  StudentAnalyticsResponse,
  TicketStatus,
} from '../shared/v2Types';
import { AuditService } from './auditService';
import { VeriMarkDatabase } from './db';
import { DomainError, LedgerService } from './ledgerService';
import { VerifyService } from './verifyService';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export class AnalyticsService {
  constructor(
    private readonly database: VeriMarkDatabase,
    private readonly ledgerService: LedgerService,
    private readonly verifyService: VerifyService,
    private readonly auditService: AuditService
  ) {}

  /**
   * FEATURE 7 — RESULT VERSION COMPARISON
   * Built strictly from immutable ledger events, official receipts, cryptographic verification,
   * and linked tickets/revaluations. Clearly separates pending proposals from finalized versions.
   */
  public getResultComparison(
    resultId: string,
    user: UserProfile
  ): ResultComparisonResponse {
    const history = this.ledgerService.getResultHistory(resultId);
    const { result, receipts, ledgerEvents, correctionRequests } = history;

    if (user.role === UserRole.STUDENT && user.studentId !== result.studentId) {
      throw new DomainError(
        'Students may only compare versions of their own results',
        403,
        'FORBIDDEN'
      );
    }

    const originalEvent = ledgerEvents.find(
      (e) => e.eventType === LedgerEventType.RESULT_PUBLISHED
    );
    const originalReceipt = receipts.find((r) => r.version === 1) ?? receipts[0] ?? null;
    const latestReceipt = receipts[receipts.length - 1] ?? null;

    const originalMarks = originalEvent
      ? Number(originalEvent.payload.obtainedMarks ?? result.obtainedMarks)
      : result.obtainedMarks;
    const originalPublishedAt = originalEvent
      ? String(originalEvent.payload.publishedAt ?? result.publishedAt)
      : result.publishedAt;

    const origVerify = originalReceipt
      ? this.verifyService.verifyReceipt(
          originalReceipt.receiptId,
          originalReceipt.shortFingerprint
        ).status
      : VerificationStatus.RECORD_NOT_FOUND;

    const latestVerify = latestReceipt
      ? this.verifyService.verifyReceipt(
          latestReceipt.receiptId,
          latestReceipt.shortFingerprint
        ).status
      : VerificationStatus.RECORD_NOT_FOUND;

    const correctedEvents = ledgerEvents.filter(
      (e) => e.eventType === LedgerEventType.RESULT_CORRECTED
    );

    const finalizedCorrections = correctedEvents.map((ev) => {
      const corrId = String(ev.payload.correctionRequestId ?? '');
      const matchingReq = correctionRequests.find((c) => c.id === corrId);
      const approvals = matchingReq?.approvals ?? [];
      return {
        correctionRequestId: corrId,
        previousVersion: Number(ev.payload.previousVersion ?? 1),
        newVersion: Number(ev.payload.newVersion ?? 2),
        oldMarks: Number(ev.payload.oldMarks ?? originalMarks),
        newMarks: Number(ev.payload.newMarks ?? result.obtainedMarks),
        reason: String(ev.payload.reason ?? matchingReq?.reason ?? ''),
        correctedAt: String(ev.payload.correctedAt ?? ev.timestamp),
        ledgerSequence: ev.sequence,
        examinerApproval:
          approvals.find((a) => a.approverRole === 'EXAMINER') ?? null,
        controllerApproval:
          approvals.find((a) => a.approverRole === 'CONTROLLER') ?? null,
        approvals,
      };
    });

    const pendingProposals = correctionRequests.filter(
      (c) =>
        c.status === CorrectionStatus.PENDING ||
        c.status === CorrectionStatus.APPROVED_PARTIAL ||
        c.status === CorrectionStatus.READY_TO_FINALIZE
    );

    const linkedTicketRows = this.database.db
      .prepare(
        `SELECT id, ticket_number, status, subject FROM tickets WHERE related_result_id = ? ORDER BY created_at DESC`
      )
      .all(resultId) as Array<{
      id: string;
      ticket_number: string;
      status: string;
      subject: string;
    }>;

    const linkedRevalRows = this.database.db
      .prepare(
        `SELECT id, request_number, status, recommended_marks FROM revaluation_requests WHERE result_id = ? ORDER BY created_at DESC`
      )
      .all(resultId) as Array<{
      id: string;
      request_number: string;
      status: string;
      recommended_marks: number | null;
    }>;

    const latestMarks =
      finalizedCorrections.length > 0
        ? finalizedCorrections[finalizedCorrections.length - 1].newMarks
        : originalMarks;

    return {
      result,
      originalVersion: {
        version: 1,
        obtainedMarks: originalMarks,
        maxMarks: result.maxMarks,
        publishedAt: originalPublishedAt,
        receipt: originalReceipt,
        ledgerSequence: originalEvent?.sequence ?? originalReceipt?.ledgerSequence ?? null,
        verificationStatus: origVerify,
      },
      latestVersion: {
        version: result.version,
        obtainedMarks: latestMarks,
        maxMarks: result.maxMarks,
        updatedAt: result.updatedAt,
        receipt: latestReceipt,
        ledgerSequence: latestReceipt?.ledgerSequence ?? result.latestLedgerSequence,
        verificationStatus: latestVerify,
      },
      hasFinalizedCorrection: finalizedCorrections.length > 0,
      marksDelta: round1(latestMarks - originalMarks),
      finalizedCorrections,
      pendingProposals,
      ledgerEvents,
      receipts,
      linkedTickets: linkedTicketRows.map((t) => ({
        id: String(t.id),
        ticketNumber: String(t.ticket_number),
        status: String(t.status) as TicketStatus,
        subject: String(t.subject),
      })),
      linkedRevaluations: linkedRevalRows.map((rv) => ({
        id: String(rv.id),
        requestNumber: String(rv.request_number),
        status: String(rv.status) as RevaluationStatus,
        recommendedMarks:
          rv.recommended_marks != null ? Number(rv.recommended_marks) : null,
      })),
    };
  }

  /**
   * FEATURE 9 — STUDENT ANALYTICS (latest finalized version per result, no double-counting)
   */
  public getStudentAnalytics(studentId: string): StudentAnalyticsResponse {
    const results = this.ledgerService.listResults({ studentId });
    if (results.length === 0) {
      return {
        hasData: false,
        summary: {
          totalSubjects: 0,
          overallPercentage: 0,
          averageMarks: 0,
          strongestSubject: null,
          lowestSubject: null,
          correctedCount: 0,
          verifiedReceiptsCount: 0,
        },
        subjectPerformance: [],
        examTrend: [],
        versionComparisons: [],
      };
    }

    const subjectPerformance = results.map((r) => {
      const history = this.ledgerService.getResultHistory(r.id);
      const origEvent = history.ledgerEvents.find(
        (e) => e.eventType === LedgerEventType.RESULT_PUBLISHED
      );
      const originalMarks = origEvent
        ? Number(origEvent.payload.obtainedMarks ?? r.obtainedMarks)
        : r.obtainedMarks;
      const pct = round1((r.obtainedMarks / r.maxMarks) * 100);
      return {
        resultId: r.id,
        subjectCode: r.subjectCode,
        subjectName: r.subjectName,
        obtainedMarks: r.obtainedMarks,
        maxMarks: r.maxMarks,
        percentage: pct,
        version: r.version,
        originalMarks,
      };
    });

    const totalObtained = subjectPerformance.reduce((a, b) => a + b.obtainedMarks, 0);
    const totalMax = subjectPerformance.reduce((a, b) => a + b.maxMarks, 0);
    const overallPercentage = totalMax > 0 ? round1((totalObtained / totalMax) * 100) : 0;
    const averageMarks = round1(totalObtained / subjectPerformance.length);

    const sortedByPct = [...subjectPerformance].sort((a, b) => b.percentage - a.percentage);
    const strongest = sortedByPct[0];
    const lowest = sortedByPct[sortedByPct.length - 1];

    // Group by exam for trend
    const examGroups = new Map<
      string,
      { examCode: string; examDate: string; pctSum: number; count: number }
    >();
    for (const r of results) {
      const examRow = this.database.db
        .prepare(`SELECT exam_date FROM exams WHERE id = ?`)
        .get(r.examId) as { exam_date: string } | undefined;
      const key = r.examCode;
      const existing = examGroups.get(key) ?? {
        examCode: r.examCode,
        examDate: examRow?.exam_date ?? r.publishedAt.slice(0, 10),
        pctSum: 0,
        count: 0,
      };
      existing.pctSum += (r.obtainedMarks / r.maxMarks) * 100;
      existing.count += 1;
      examGroups.set(key, existing);
    }

    const examTrend = Array.from(examGroups.values())
      .sort((a, b) => a.examDate.localeCompare(b.examDate))
      .map((g) => ({
        examCode: g.examCode,
        examDate: g.examDate,
        averagePercentage: round1(g.pctSum / g.count),
        subjectsCount: g.count,
      }));

    // Count verified latest receipts via real VerifyService
    let verifiedReceiptsCount = 0;
    for (const r of results) {
      const v = this.verifyService.verifyReceipt(r.latestReceiptId, r.shortFingerprint);
      if (
        v.status === VerificationStatus.VERIFIED_ORIGINAL ||
        v.status === VerificationStatus.VERIFIED_SUPERSEDED
      ) {
        verifiedReceiptsCount += 1;
      }
    }

    const versionComparisons = subjectPerformance
      .filter((s) => s.version > 1)
      .map((s) => ({
        subjectCode: s.subjectCode,
        originalMarks: s.originalMarks,
        currentMarks: s.obtainedMarks,
        maxMarks: s.maxMarks,
        version: s.version,
      }));

    return {
      hasData: true,
      summary: {
        totalSubjects: subjectPerformance.length,
        overallPercentage,
        averageMarks,
        strongestSubject: strongest
          ? {
              subjectCode: strongest.subjectCode,
              subjectName: strongest.subjectName,
              percentage: strongest.percentage,
              marks: strongest.obtainedMarks,
              maxMarks: strongest.maxMarks,
            }
          : null,
        lowestSubject: lowest
          ? {
              subjectCode: lowest.subjectCode,
              subjectName: lowest.subjectName,
              percentage: lowest.percentage,
              marks: lowest.obtainedMarks,
              maxMarks: lowest.maxMarks,
            }
          : null,
        correctedCount: versionComparisons.length,
        verifiedReceiptsCount,
      },
      subjectPerformance,
      examTrend,
      versionComparisons,
    };
  }

  /**
   * FEATURE 9 — EXAMINER ANALYTICS (strictly scoped to assigned exams/subjects)
   */
  public getExaminerAnalytics(examinerUserId: string): ExaminerAnalyticsResponse {
    const scopeRows = this.database.db
      .prepare(
        `SELECT DISTINCT es.subject_id, es.subject_code, es.subject_title
         FROM exam_assignments ea
         JOIN exam_schedules es ON es.id = ea.schedule_id
         WHERE ea.examiner_user_id = ?
         ORDER BY es.subject_code ASC`
      )
      .all(examinerUserId) as Array<{
      subject_id: string;
      subject_code: string;
      subject_title: string;
    }>;

    const scopeSubjects = scopeRows.map((s) => ({
      subjectCode: String(s.subject_code),
      subjectName: String(s.subject_title),
    }));
    const subjectIds = scopeRows.map((s) => String(s.subject_id));

    const pendingTicketsRow = this.database.db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM tickets
         WHERE assigned_examiner_id = ? AND status NOT IN ('RESOLVED', 'REJECTED', 'CLOSED')`
      )
      .get(examinerUserId) as { cnt: number };

    const pendingApprovals = this.ledgerService
      .listCorrectionRequests()
      .filter(
        (c) =>
          (c.status === CorrectionStatus.PENDING ||
            c.status === CorrectionStatus.APPROVED_PARTIAL) &&
          !c.approvals.some((a) => a.approverRole === 'EXAMINER')
      ).length;

    if (subjectIds.length === 0) {
      return {
        hasData: false,
        scopeSubjects: [],
        summary: {
          evaluatedStudents: 0,
          publishedResultsCount: 0,
          averagePercentage: 0,
          highestMarks: 0,
          lowestMarks: 0,
          revaluationRequestsReceived: 0,
          pendingTicketsCount: Number(pendingTicketsRow.cnt),
          pendingCorrectionApprovals: pendingApprovals,
        },
        subjectDistribution: [],
        scoreBands: [],
      };
    }

    const placeholders = subjectIds.map(() => '?').join(', ');
    const rows = this.database.db
      .prepare(
        `SELECT r.id, r.student_id, r.obtained_marks, r.max_marks, sub.code AS subject_code, sub.name AS subject_name
         FROM results r
         JOIN subjects sub ON sub.id = r.subject_id
         WHERE r.subject_id IN (${placeholders})`
      )
      .all(...subjectIds) as Array<{
      id: string;
      student_id: string;
      obtained_marks: number;
      max_marks: number;
      subject_code: string;
      subject_name: string;
    }>;

    const revalRow = this.database.db
      .prepare(
        `SELECT COUNT(*) AS cnt
         FROM revaluation_requests rv
         JOIN results r ON r.id = rv.result_id
         WHERE rv.assigned_examiner_id = ? OR r.subject_id IN (${placeholders})`
      )
      .get(examinerUserId, ...subjectIds) as { cnt: number };

    if (rows.length === 0) {
      return {
        hasData: false,
        scopeSubjects,
        summary: {
          evaluatedStudents: 0,
          publishedResultsCount: 0,
          averagePercentage: 0,
          highestMarks: 0,
          lowestMarks: 0,
          revaluationRequestsReceived: Number(revalRow.cnt),
          pendingTicketsCount: Number(pendingTicketsRow.cnt),
          pendingCorrectionApprovals: pendingApprovals,
        },
        subjectDistribution: [],
        scoreBands: [],
      };
    }

    const uniqueStudents = new Set(rows.map((r) => String(r.student_id))).size;
    const pcts = rows.map((r) => (Number(r.obtained_marks) / Number(r.max_marks)) * 100);
    const marks = rows.map((r) => Number(r.obtained_marks));

    const bySub = new Map<
      string,
      { subjectCode: string; subjectName: string; pcts: number[]; marks: number[] }
    >();
    for (const r of rows) {
      const code = String(r.subject_code);
      const entry = bySub.get(code) ?? {
        subjectCode: code,
        subjectName: String(r.subject_name),
        pcts: [],
        marks: [],
      };
      entry.pcts.push((Number(r.obtained_marks) / Number(r.max_marks)) * 100);
      entry.marks.push(Number(r.obtained_marks));
      bySub.set(code, entry);
    }

    const subjectDistribution = Array.from(bySub.values()).map((s) => ({
      subjectCode: s.subjectCode,
      subjectName: s.subjectName,
      count: s.marks.length,
      avgPercentage: round1(s.pcts.reduce((a, b) => a + b, 0) / s.pcts.length),
      highestMarks: Math.max(...s.marks),
      lowestMarks: Math.min(...s.marks),
    }));

    const bands = [
      { band: '90–100%', min: 90, max: 101 },
      { band: '75–89%', min: 75, max: 90 },
      { band: '60–74%', min: 60, max: 75 },
      { band: '40–59%', min: 40, max: 60 },
      { band: '<40%', min: -1, max: 40 },
    ];
    const scoreBands = bands.map((b) => ({
      band: b.band,
      count: pcts.filter((p) => p >= b.min && p < b.max).length,
    }));

    return {
      hasData: true,
      scopeSubjects,
      summary: {
        evaluatedStudents: uniqueStudents,
        publishedResultsCount: rows.length,
        averagePercentage: round1(pcts.reduce((a, b) => a + b, 0) / pcts.length),
        highestMarks: Math.max(...marks),
        lowestMarks: Math.min(...marks),
        revaluationRequestsReceived: Number(revalRow.cnt),
        pendingTicketsCount: Number(pendingTicketsRow.cnt),
        pendingCorrectionApprovals: pendingApprovals,
      },
      subjectDistribution,
      scoreBands,
    };
  }

  /**
   * FEATURE 9 — EXAMINATION CONTROLLER ANALYTICS (real institution-wide SQL & verification metrics)
   */
  public getControllerAnalytics(): ControllerAnalyticsResponse {
    const db = this.database.db;
    const audit = this.auditService.runAudit(false);
    const results = this.ledgerService.listResults();
    const todayIso = new Date().toISOString().slice(0, 10);

    const counts = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM students) AS total_students,
          (SELECT COUNT(*) FROM exam_schedules WHERE status = 'PUBLISHED' AND exam_date >= ?) AS upcoming_exams,
          (SELECT COUNT(*) FROM correction_requests WHERE status IN ('PENDING', 'APPROVED_PARTIAL', 'READY_TO_FINALIZE')) AS pending_corr,
          (SELECT COUNT(*) FROM correction_requests WHERE status = 'FINALIZED') AS finalized_corr,
          (SELECT COUNT(*) FROM tickets) AS total_tickets,
          (SELECT COUNT(*) FROM tickets WHERE status IN ('RESOLVED', 'CLOSED')) AS resolved_tickets,
          (SELECT COUNT(*) FROM tickets WHERE status NOT IN ('RESOLVED', 'REJECTED', 'CLOSED')) AS active_disputes,
          (SELECT COUNT(*) FROM revaluation_requests) AS total_revals,
          (SELECT COUNT(*) FROM revaluation_requests WHERE status NOT IN ('COMPLETED', 'REJECTED')) AS pending_revals`
      )
      .get(todayIso) as Record<string, unknown>;

    const totalTickets = Number(counts.total_tickets);
    const resolvedTickets = Number(counts.resolved_tickets);
    const ticketResolutionRate =
      totalTickets > 0 ? round1((resolvedTickets / totalTickets) * 100) : 0;

    // Examination-wise performance (using latest results table — 1 row per student+exam+subject)
    const examRows = db
      .prepare(
        `SELECT e.exam_code, e.title,
                COUNT(r.id) AS cnt,
                AVG((r.obtained_marks * 100.0) / r.max_marks) AS avg_pct
         FROM exams e
         LEFT JOIN results r ON r.exam_id = e.id
         GROUP BY e.id
         ORDER BY e.exam_date DESC`
      )
      .all() as Array<{ exam_code: string; title: string; cnt: number; avg_pct: number | null }>;

    const courseRows = db
      .prepare(
        `SELECT s.course,
                COUNT(DISTINCT s.id) AS stu_cnt,
                COUNT(r.id) AS res_cnt,
                AVG((r.obtained_marks * 100.0) / r.max_marks) AS avg_pct
         FROM students s
         LEFT JOIN results r ON r.student_id = s.id
         GROUP BY s.course
         ORDER BY s.course ASC`
      )
      .all() as Array<{
      course: string;
      stu_cnt: number;
      res_cnt: number;
      avg_pct: number | null;
    }>;

    // Real cryptographic receipt verification outcome distribution across latest receipts
    const outcomeCounts = new Map<string, number>();
    for (const r of results) {
      const v = this.verifyService.verifyReceipt(r.latestReceiptId, r.shortFingerprint);
      outcomeCounts.set(v.status, (outcomeCounts.get(v.status) ?? 0) + 1);
    }

    const ticketCatRows = db
      .prepare(
        `SELECT category, COUNT(*) AS cnt,
                SUM(CASE WHEN status IN ('RESOLVED', 'CLOSED') THEN 1 ELSE 0 END) AS resolved_cnt
         FROM tickets
         GROUP BY category
         ORDER BY cnt DESC`
      )
      .all() as Array<{ category: string; cnt: number; resolved_cnt: number }>;

    const revalStatusRows = db
      .prepare(
        `SELECT status, COUNT(*) AS cnt FROM revaluation_requests GROUP BY status ORDER BY cnt DESC`
      )
      .all() as Array<{ status: string; cnt: number }>;

    return {
      hasData: results.length > 0 || totalTickets > 0,
      summary: {
        totalPublishedResults: results.length,
        totalStudents: Number(counts.total_students),
        upcomingExamsCount: Number(counts.upcoming_exams),
        pendingCorrectionApprovals: Number(counts.pending_corr),
        finalizedCorrections: Number(counts.finalized_corr),
        activeDisputes: Number(counts.active_disputes),
        pendingRevaluations: Number(counts.pending_revals),
        totalRevaluations: Number(counts.total_revals),
        totalTickets,
        resolvedTickets,
        ticketResolutionRate,
        ledgerIntegrityStatus: audit.status,
      },
      examPerformance: examRows.map((e) => ({
        examCode: String(e.exam_code),
        title: String(e.title),
        resultsCount: Number(e.cnt),
        avgPercentage: e.avg_pct != null ? round1(Number(e.avg_pct)) : 0,
      })),
      courseAggregates: courseRows.map((c) => ({
        course: String(c.course),
        studentsCount: Number(c.stu_cnt),
        resultsCount: Number(c.res_cnt),
        avgPercentage: c.avg_pct != null ? round1(Number(c.avg_pct)) : 0,
      })),
      verificationOutcomes: Array.from(outcomeCounts.entries()).map(([status, count]) => ({
        status,
        count,
      })),
      ticketCategories: ticketCatRows.map((t) => ({
        category: String(t.category),
        count: Number(t.cnt),
        resolved: Number(t.resolved_cnt),
      })),
      revaluationStatuses: revalStatusRows.map((rv) => ({
        status: String(rv.status),
        count: Number(rv.cnt),
      })),
    };
  }
}
