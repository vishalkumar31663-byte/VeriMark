import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  KeyRound,
  LifeBuoy,
  RefreshCcw,
} from 'lucide-react';
import { CorrectionRequestRecord } from '../../shared/types';
import {
  ExamScheduleRecord,
  RevaluationRecord,
  TicketRecord,
} from '../../shared/v2Types';
import { AppShell } from '../components/AppShell';
import { ExamCountdownCard } from '../components/v2/ExamModeAndCountdown';
import { LoadingSkeleton, formatEnumLabel } from '../components/v2/UiPrimitives';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

interface ExaminerSummaryResponse {
  cards: {
    assignedExamsCount: number;
    nextAssignedExam: ExamScheduleRecord | null;
    pendingRevaluationsCount: number;
    assignedOpenTicketsCount: number;
    pendingCorrectionApprovalsCount: number;
    unreadNotificationsCount: number;
  };
  upcomingAssigned: ExamScheduleRecord[];
  pendingCorrections: CorrectionRequestRecord[];
  openTickets: TicketRecord[];
  pendingRevaluations: RevaluationRecord[];
}

export function ExaminerDashboardPage() {
  const { pushToast } = useToast();
  const [data, setData] = useState<ExaminerSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest<ExaminerSummaryResponse>('/api/dashboard/examiner-summary')
      .then(setData)
      .catch((err) =>
        pushToast(
          'error',
          'Could not load Examiner workspace',
          err instanceof Error ? err.message : undefined
        )
      )
      .finally(() => setLoading(false));
  }, [pushToast]);

  return (
    <AppShell
      title="Examiner Workspace"
      breadcrumb="VeriMark 2.0 / Examiner / Dashboard"
      actions={
        <Link
          to="/approvals/examiner"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Sign Pending Corrections</span>
        </Link>
      }
    >
      <div className="space-y-6">
        {loading || !data ? (
          <LoadingSkeleton rows={4} />
        ) : (
          <>
            {/* 5 Examiner Summary Cards */}
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                {
                  label: 'Assigned Exams',
                  value: data.cards.assignedExamsCount,
                  to: '/assigned-exams',
                  icon: CalendarClock,
                  accent: 'text-indigo-600 dark:text-indigo-400',
                },
                {
                  label: 'Pending Revaluations',
                  value: data.cards.pendingRevaluationsCount,
                  to: '/revaluations',
                  icon: RefreshCcw,
                  accent: 'text-violet-600 dark:text-violet-400',
                },
                {
                  label: 'Assigned Tickets',
                  value: data.cards.assignedOpenTicketsCount,
                  to: '/tickets',
                  icon: LifeBuoy,
                  accent: 'text-amber-600 dark:text-amber-400',
                },
                {
                  label: 'Awaiting Ed25519 Sig',
                  value: data.cards.pendingCorrectionApprovalsCount,
                  to: '/approvals/examiner',
                  icon: KeyRound,
                  accent: 'text-emerald-600 dark:text-emerald-400',
                },
                {
                  label: 'Unread Alerts',
                  value: data.cards.unreadNotificationsCount,
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
                    className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 rounded-xl p-4 space-y-2 transition-colors"
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

            {/* Next Assigned Exam Countdown + Action Queue */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Next Assigned Examination
                  </h2>
                  <Link
                    to="/assigned-exams"
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                  >
                    <span>All Assigned Exams</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                {data.cards.nextAssignedExam ? (
                  <ExamCountdownCard schedule={data.cards.nextAssignedExam} />
                ) : (
                  <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
                    No upcoming examinations are currently assigned to you.
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Corrections Awaiting Your Signature
                  </h2>
                  <Link
                    to="/approvals/examiner"
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Signing Desk →
                  </Link>
                </div>
                {data.pendingCorrections.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">
                    All correction requests currently awaiting Examiner signature have been processed.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.pendingCorrections.map((c) => (
                      <Link
                        key={c.id}
                        to="/approvals/examiner"
                        className="block py-3 first:pt-0 last:pb-0 hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {c.subjectCode} · {c.registrationNumber}
                          </span>
                          <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                            {c.oldMarks} → {c.proposedMarks}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                          {c.reason}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <Link
                    to="/analytics"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>View Scoped Subject Analytics</span>
                  </Link>
                </div>
              </div>
            </section>

            {/* Tickets & Revaluations Side by Side */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Assigned Student Tickets
                  </h2>
                  <Link
                    to="/tickets"
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Open Queue →
                  </Link>
                </div>
                {data.openTickets.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">No open tickets assigned to you.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.openTickets.map((t) => (
                      <Link
                        key={t.id}
                        to={`/tickets?id=${t.id}`}
                        className="block py-3 first:pt-0 last:pb-0 space-y-1 hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {t.ticketNumber}
                          </span>
                          <span className="font-mono text-slate-500">
                            {formatEnumLabel(t.status)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {t.subject}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Pending Revaluation Reviews
                  </h2>
                  <Link
                    to="/revaluations"
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Review Queue →
                  </Link>
                </div>
                {data.pendingRevaluations.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">
                    No revaluation requests pending your review.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.pendingRevaluations.map((rv) => (
                      <Link
                        key={rv.id}
                        to="/revaluations"
                        className="block py-3 first:pt-0 last:pb-0 space-y-1 hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {rv.requestNumber} · {rv.subjectCode}
                          </span>
                          <span className="font-mono text-slate-500">
                            {rv.currentMarks}/{rv.maxMarks}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                          {rv.studentName} ({rv.registrationNumber}) — {rv.reason}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
