import { useEffect, useState } from 'react';
import { BarChart3, ShieldCheck } from 'lucide-react';
import { UserRole } from '../../shared/types';
import {
  ControllerAnalyticsResponse,
  ExaminerAnalyticsResponse,
  StudentAnalyticsResponse,
} from '../../shared/v2Types';
import { AppShell } from '../components/AppShell';
import { EmptyState, LoadingSkeleton, formatEnumLabel } from '../components/v2/UiPrimitives';
import {
  SimpleBarMetricChart,
  SimpleLineTrendChart,
} from '../components/v2/WorkflowComponents';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

export function ResultAnalyticsPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();

  const [studentData, setStudentData] = useState<StudentAnalyticsResponse | null>(null);
  const [examinerData, setExaminerData] = useState<ExaminerAnalyticsResponse | null>(null);
  const [controllerData, setControllerData] =
    useState<ControllerAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const load = async () => {
      try {
        if (user.role === UserRole.STUDENT) {
          setStudentData(
            await apiRequest<StudentAnalyticsResponse>('/api/analytics/student')
          );
        } else if (user.role === UserRole.EXAMINER) {
          setExaminerData(
            await apiRequest<ExaminerAnalyticsResponse>('/api/analytics/examiner')
          );
        } else {
          setControllerData(
            await apiRequest<ControllerAnalyticsResponse>('/api/analytics/controller')
          );
        }
      } catch (err) {
        pushToast(
          'error',
          'Could not load analytics',
          err instanceof Error ? err.message : undefined
        );
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user, pushToast]);

  return (
    <AppShell
      title="Result Analytics & Insights"
      breadcrumb={`VeriMark 2.0 / ${user?.role ?? ''} / Analytics`}
    >
      <div className="space-y-6">
        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : user?.role === UserRole.STUDENT && studentData ? (
          !studentData.hasData ? (
            <EmptyState
              icon={BarChart3}
              title="No published results for analytics yet"
              description="Subject-wise percentages, exam trends, and version comparisons will compute automatically once your results are published."
            />
          ) : (
            <>
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Overall Percentage',
                    value: `${studentData.summary.overallPercentage}%`,
                    sub: `Across ${studentData.summary.totalSubjects} subjects`,
                  },
                  {
                    label: 'Strongest Subject',
                    value: studentData.summary.strongestSubject?.subjectCode ?? '—',
                    sub: studentData.summary.strongestSubject
                      ? `${studentData.summary.strongestSubject.percentage}% (${studentData.summary.strongestSubject.marks}/${studentData.summary.strongestSubject.maxMarks})`
                      : '',
                  },
                  {
                    label: 'Lowest Subject',
                    value: studentData.summary.lowestSubject?.subjectCode ?? '—',
                    sub: studentData.summary.lowestSubject
                      ? `${studentData.summary.lowestSubject.percentage}% (${studentData.summary.lowestSubject.marks}/${studentData.summary.lowestSubject.maxMarks})`
                      : '',
                  },
                  {
                    label: 'Verified Receipts',
                    value: `${studentData.summary.verifiedReceiptsCount}/${studentData.summary.totalSubjects}`,
                    sub: `${studentData.summary.correctedCount} dual-signed correction(s)`,
                  },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1"
                  >
                    <p className="text-xs text-slate-500">{k.label}</p>
                    <p className="font-display font-bold text-2xl tabular-nums text-slate-900 dark:text-white">
                      {k.value}
                    </p>
                    <p className="text-xs text-slate-500">{k.sub}</p>
                  </div>
                ))}
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SimpleBarMetricChart
                  title="Subject-Wise Percentage Breakdown"
                  subtitle="Computed from latest finalized ledger versions (respecting max marks)"
                  data={studentData.subjectPerformance as unknown as Array<Record<string, unknown>>}
                  xKey="subjectCode"
                  yKey="percentage"
                  yLabel="Percentage (%)"
                  color="#4F46E5"
                />
                <SimpleLineTrendChart
                  title="Examination Trend"
                  subtitle="Average percentage across published examinations"
                  data={studentData.examTrend as unknown as Array<Record<string, unknown>>}
                  xKey="examCode"
                  yKey="averagePercentage"
                  yLabel="Avg Percentage (%)"
                  color="#10B981"
                />
              </section>

              {studentData.versionComparisons.length > 0 && (
                <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="font-display font-bold text-base">
                    Original vs. Corrected Marks Summary
                  </h3>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {studentData.versionComparisons.map((vc) => (
                      <div
                        key={vc.subjectCode}
                        className="py-2.5 flex items-center justify-between gap-4"
                      >
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {vc.subjectCode} (v{vc.version})
                        </span>
                        <span className="font-mono tabular-nums">
                          Original: {vc.originalMarks}/{vc.maxMarks} → Finalized:{' '}
                          <strong className="text-emerald-600 dark:text-emerald-400">
                            {vc.currentMarks}/{vc.maxMarks}
                          </strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )
        ) : user?.role === UserRole.EXAMINER && examinerData ? (
          !examinerData.hasData ? (
            <EmptyState
              icon={BarChart3}
              title="No published results in your assigned examination scope"
              description="Examiner analytics are strictly scoped to examinations and subjects assigned to you by the Examination Controller."
            />
          ) : (
            <>
              <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Authorized Examiner Scope:{' '}
                  <span className="font-mono text-indigo-600 dark:text-indigo-400">
                    {examinerData.scopeSubjects.map((s) => s.subjectCode).join(', ')}
                  </span>
                </span>
                <span className="text-slate-500">
                  Only assigned subjects are included in these metrics
                </span>
              </section>

              <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Evaluated Students',
                    value: examinerData.summary.evaluatedStudents,
                    sub: `${examinerData.summary.publishedResultsCount} results`,
                  },
                  {
                    label: 'Average Percentage',
                    value: `${examinerData.summary.averagePercentage}%`,
                    sub: `Range ${examinerData.summary.lowestMarks}–${examinerData.summary.highestMarks}`,
                  },
                  {
                    label: 'Revaluations Received',
                    value: examinerData.summary.revaluationRequestsReceived,
                    sub: 'Within assigned scope',
                  },
                  {
                    label: 'Pending Actions',
                    value:
                      examinerData.summary.pendingTicketsCount +
                      examinerData.summary.pendingCorrectionApprovals,
                    sub: `${examinerData.summary.pendingTicketsCount} tickets · ${examinerData.summary.pendingCorrectionApprovals} approvals`,
                  },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1"
                  >
                    <p className="text-xs text-slate-500">{k.label}</p>
                    <p className="font-display font-bold text-2xl tabular-nums">
                      {k.value}
                    </p>
                    <p className="text-xs text-slate-500">{k.sub}</p>
                  </div>
                ))}
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SimpleBarMetricChart
                  title="Assigned Subject Average (%)"
                  subtitle="Latest finalized marks per assigned subject"
                  data={
                    examinerData.subjectDistribution as unknown as Array<
                      Record<string, unknown>
                    >
                  }
                  xKey="subjectCode"
                  yKey="avgPercentage"
                  yLabel="Average (%)"
                  color="#4F46E5"
                />
                <SimpleBarMetricChart
                  title="Score Band Distribution"
                  subtitle="Student count by percentage bracket in assigned subjects"
                  data={examinerData.scoreBands as unknown as Array<Record<string, unknown>>}
                  xKey="band"
                  yKey="count"
                  yLabel="Students"
                  color="#0EA5E9"
                />
              </section>
            </>
          )
        ) : controllerData ? (
          !controllerData.hasData ? (
            <EmptyState
              icon={BarChart3}
              title="No examination metrics recorded yet"
              description="Institution-wide result analytics, verification statistics, and ticket resolution metrics will appear once examinations and results exist."
            />
          ) : (
            <>
              <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Published Results',
                    value: controllerData.summary.totalPublishedResults,
                    sub: `${controllerData.summary.totalStudents} enrolled students`,
                  },
                  {
                    label: 'Finalized Corrections',
                    value: controllerData.summary.finalizedCorrections,
                    sub: `${controllerData.summary.pendingCorrectionApprovals} pending 2-sig`,
                  },
                  {
                    label: 'Ticket Resolution Rate',
                    value: `${controllerData.summary.ticketResolutionRate}%`,
                    sub: `${controllerData.summary.resolvedTickets}/${controllerData.summary.totalTickets} resolved · ${controllerData.summary.activeDisputes} active`,
                  },
                  {
                    label: 'Ledger Integrity',
                    value: controllerData.summary.ledgerIntegrityStatus,
                    sub: `${controllerData.summary.pendingRevaluations} active revaluations`,
                  },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1"
                  >
                    <p className="text-xs text-slate-500">{k.label}</p>
                    <p className="font-display font-bold text-2xl tabular-nums">
                      {k.value}
                    </p>
                    <p className="text-xs text-slate-500">{k.sub}</p>
                  </div>
                ))}
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SimpleBarMetricChart
                  title="Course-Wise Performance Aggregate (%)"
                  subtitle="Latest finalized versions without double-counting historical versions"
                  data={
                    controllerData.courseAggregates as unknown as Array<
                      Record<string, unknown>
                    >
                  }
                  xKey="course"
                  yKey="avgPercentage"
                  yLabel="Average (%)"
                  color="#4F46E5"
                />
                <SimpleBarMetricChart
                  title="Support Tickets by Category"
                  subtitle="Real ticket volume across operational and marks-dispute categories"
                  data={controllerData.ticketCategories.map((t) => ({
                    ...t,
                    label: formatEnumLabel(t.category),
                  }))}
                  xKey="label"
                  yKey="count"
                  yLabel="Tickets"
                  color="#F59E0B"
                />
              </section>

              <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                  <h3 className="font-display font-bold text-base">
                    Cryptographic Verification Outcomes Across Latest Receipts
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {controllerData.verificationOutcomes.map((vo) => (
                    <div
                      key={vo.status}
                      className="p-4 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                    >
                      <span className="font-mono text-xs font-semibold">
                        {formatEnumLabel(vo.status)}
                      </span>
                      <span className="font-mono font-bold text-lg tabular-nums text-indigo-600 dark:text-indigo-400">
                        {vo.count}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )
        ) : null}
      </div>
    </AppShell>
  );
}
