import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  Download,
  FileCheck2,
  GitCompareArrows,
  IdCard,
  LifeBuoy,
  QrCode,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import { ResultRecord, StudentRecord } from '../../shared/types';
import { ExamScheduleRecord, TicketRecord } from '../../shared/v2Types';
import { AppShell } from '../components/AppShell';
import { StatusLabel } from '../components/StatusLabel';
import { ExamCountdownCard, ExamModeBadge } from '../components/v2/ExamModeAndCountdown';
import { LoadingSkeleton, formatEnumLabel } from '../components/v2/UiPrimitives';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

interface StudentSummaryResponse {
  cards: {
    upcomingExamsCount: number;
    nextExam: ExamScheduleRecord | null;
    admitCardsAvailable: number;
    publishedResultsCount: number;
    activeTicketsCount: number;
    activeRevaluationsCount: number;
    unreadNotificationsCount: number;
  };
  upcomingExams: ExamScheduleRecord[];
  recentResults: ResultRecord[];
  recentTickets: TicketRecord[];
}

export function StudentDashboardPage({ resultsOnly = false }: { resultsOnly?: boolean }) {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [student, setStudent] = useState<StudentRecord | null>(null);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [summary, setSummary] = useState<StudentSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [stuData, sumData] = await Promise.all([
          user?.studentId
            ? apiRequest<{ student: StudentRecord; results: ResultRecord[] }>(
                `/api/students/${user.studentId}`
              )
            : apiRequest<{ results: ResultRecord[] }>('/api/results').then((r) => ({
                student: null,
                results: r.results,
              })),
          apiRequest<StudentSummaryResponse>('/api/dashboard/student-summary'),
        ]);
        setStudent(stuData.student);
        setResults(stuData.results);
        setSummary(sumData);
      } catch (err) {
        pushToast(
          'error',
          'Unable to load student portal data',
          err instanceof Error ? err.message : undefined
        );
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user, pushToast]);

  const avgPct =
    results.length > 0
      ? Math.round(
          (results.reduce((acc, r) => acc + (r.obtainedMarks / r.maxMarks) * 100, 0) /
            results.length) *
            10
        ) / 10
      : 0;

  return (
    <AppShell
      title={resultsOnly ? 'My Published Results' : 'Student Dashboard'}
      breadcrumb={
        resultsOnly
          ? 'VeriMark 2.0 / Student / My Results'
          : 'VeriMark 2.0 / Student / Overview'
      }
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/tickets/new"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <LifeBuoy className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Raise Ticket</span>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : (
          <>
            {/* Student Identity Banner */}
            {student && (
              <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                    {student.registrationNumber} · {student.academicSession}
                  </p>
                  <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">
                    {student.fullName}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {student.course} · Semester {student.semester}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <p className="text-xs text-slate-500">Published Results</p>
                    <p className="text-2xl font-display font-bold tabular-nums">
                      {results.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Overall Aggregate</p>
                    <p className="text-2xl font-display font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {avgPct}%
                    </p>
                  </div>
                  <Link
                    to="/analytics"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
                    <span>View Analytics</span>
                  </Link>
                </div>
              </section>
            )}

            {/* 6 Real Student Summary Cards (Dashboard View) */}
            {!resultsOnly && summary && (
              <>
                <section className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                  {[
                    {
                      label: 'Upcoming Exams',
                      value: summary.cards.upcomingExamsCount,
                      to: '/exam-schedule',
                      icon: CalendarClock,
                      accent: 'text-indigo-600 dark:text-indigo-400',
                    },
                    {
                      label: 'Admit Cards',
                      value: summary.cards.admitCardsAvailable,
                      to: '/admit-cards',
                      icon: IdCard,
                      accent: 'text-sky-600 dark:text-sky-400',
                    },
                    {
                      label: 'Published Results',
                      value: summary.cards.publishedResultsCount,
                      to: '/student/results',
                      icon: FileCheck2,
                      accent: 'text-emerald-600 dark:text-emerald-400',
                    },
                    {
                      label: 'Active Tickets',
                      value: summary.cards.activeTicketsCount,
                      to: '/tickets',
                      icon: LifeBuoy,
                      accent: 'text-amber-600 dark:text-amber-400',
                    },
                    {
                      label: 'Revaluations',
                      value: summary.cards.activeRevaluationsCount,
                      to: '/revaluations',
                      icon: RefreshCcw,
                      accent: 'text-violet-600 dark:text-violet-400',
                    },
                    {
                      label: 'Unread Alerts',
                      value: summary.cards.unreadNotificationsCount,
                      to: '/notifications',
                      icon: Bell,
                      accent: 'text-rose-600 dark:text-rose-400',
                    },
                  ].map((card) => {
                    const Icon = card.icon;
                    return (
                      <Link
                        key={card.label}
                        to={card.to}
                        className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-xl p-4 space-y-2 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {card.label}
                          </span>
                          <Icon className={`w-4 h-4 ${card.accent}`} aria-hidden="true" />
                        </div>
                        <p className="font-display font-bold text-2xl tabular-nums text-slate-900 dark:text-white">
                          {card.value}
                        </p>
                      </Link>
                    );
                  })}
                </section>

                {/* Next Exam Live Countdown + Quick Actions */}
                <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-7 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                        Next Examination Countdown
                      </h2>
                      <Link
                        to="/exam-countdown"
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                      >
                        <span>All Countdowns</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                    {summary.cards.nextExam ? (
                      <ExamCountdownCard schedule={summary.cards.nextExam} />
                    ) : (
                      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
                        No upcoming published examinations scheduled for your semester yet.
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                        Upcoming Schedule & Mode
                      </h2>
                      <Link
                        to="/exam-schedule"
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Full Timetable
                      </Link>
                    </div>
                    {summary.upcomingExams.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">
                        No upcoming examinations found.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {summary.upcomingExams.map((ex) => (
                          <div key={ex.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                {ex.subjectCode}
                              </span>
                              <ExamModeBadge mode={ex.mode} />
                            </div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {ex.subjectTitle}
                            </p>
                            <p className="text-xs text-slate-500 font-mono">
                              {ex.examDate} · {ex.startTime}–{ex.endTime}
                              {ex.studentSeatNumber ? ` · Seat ${ex.studentSeatNumber}` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
                      <Link
                        to="/admit-cards"
                        className="text-center px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-800 dark:text-slate-200"
                      >
                        Download Admit Card
                      </Link>
                      <Link
                        to="/proof-of-result"
                        className="text-center px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-800 dark:text-slate-200"
                      >
                        Proof of Result
                      </Link>
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* Published Results Section */}
            <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    My Cryptographically Anchored Results
                  </h2>
                  <p className="text-xs text-slate-500">
                    Every score is backed by an append-only SHA-256 hash chain and Ed25519 signature
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to="/result-comparison"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <GitCompareArrows className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
                    <span>Compare Versions</span>
                  </Link>
                  <Link
                    to="/revaluations"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <RefreshCcw className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
                    <span>Revaluation</span>
                  </Link>
                </div>
              </div>

              {results.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  No examination results have been published for your registration yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {results.map((r) => (
                    <div
                      key={r.id}
                      className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            {r.subjectCode}
                          </span>
                          <h3 className="font-semibold text-slate-900 dark:text-white">
                            {r.subjectName}
                          </h3>
                          <StatusLabel
                            tone={r.version > 1 ? 'accent' : 'verified'}
                            label={
                              r.version > 1
                                ? `Authorized Correction · v${r.version}`
                                : 'Original Publication · v1'
                            }
                          />
                        </div>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          Exam {r.examCode} · Block #{r.latestLedgerSequence} · Receipt{' '}
                          {r.latestReceiptId}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="mr-2 text-right">
                          <span className="font-mono font-bold text-xl tabular-nums text-slate-900 dark:text-white">
                            {r.obtainedMarks}
                          </span>
                          <span className="font-mono text-xs text-slate-500">
                            /{r.maxMarks}
                          </span>
                        </div>
                        <Link
                          to={`/proof-of-result?resultId=${encodeURIComponent(r.id)}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Proof</span>
                        </Link>
                        <Link
                          to={`/result-comparison?resultId=${encodeURIComponent(r.id)}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <GitCompareArrows className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Compare</span>
                        </Link>
                        <a
                          href={`/api/marksheets/${r.id}/pdf`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Download className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>PDF</span>
                        </a>
                        <Link
                          to={`/verify/${encodeURIComponent(
                            r.latestReceiptId
                          )}?fp=${encodeURIComponent(r.shortFingerprint)}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Verify</span>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Recent Support Tickets Preview */}
            {!resultsOnly && summary && summary.recentTickets.length > 0 && (
              <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    My Recent Support Tickets
                  </h2>
                  <Link
                    to="/tickets"
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Manage All Tickets →
                  </Link>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {summary.recentTickets.map((t) => (
                    <Link
                      key={t.id}
                      to={`/tickets?id=${t.id}`}
                      className="py-3 flex flex-wrap items-center justify-between gap-2 hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 mr-2">
                          {t.ticketNumber}
                        </span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          {t.subject}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-slate-500">
                        {formatEnumLabel(t.status)}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
