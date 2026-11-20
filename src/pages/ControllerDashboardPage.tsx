import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  IdCard,
  KeyRound,
  LifeBuoy,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { AuditReport, CorrectionRequestRecord } from '../../shared/types';
import { ExamScheduleRecord, TicketRecord } from '../../shared/v2Types';
import { AppShell } from '../components/AppShell';
import { ExamCountdownCard } from '../components/v2/ExamModeAndCountdown';
import { LoadingSkeleton, formatEnumLabel } from '../components/v2/UiPrimitives';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

interface ControllerSummaryResponse {
  cards: {
    publishedExamsCount: number;
    draftExamsCount: number;
    admitCardsIssuedCount: number;
    pendingCorrectionsCount: number;
    escalatedTicketsCount: number;
    pendingRevaluationsCount: number;
    ledgerIntegrityStatus: string;
    ledgerIssuesCount: number;
    unreadNotificationsCount: number;
  };
  audit: AuditReport;
  upcomingExams: ExamScheduleRecord[];
  pendingCorrections: CorrectionRequestRecord[];
  escalatedTickets: TicketRecord[];
}

export function ControllerDashboardPage() {
  const { pushToast } = useToast();
  const [data, setData] = useState<ControllerSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest<ControllerSummaryResponse>('/api/dashboard/controller-summary')
      .then(setData)
      .catch((err) =>
        pushToast(
          'error',
          'Could not load Controller dashboard',
          err instanceof Error ? err.message : undefined
        )
      )
      .finally(() => setLoading(false));
  }, [pushToast]);

  const intact = data?.cards.ledgerIntegrityStatus === 'VERIFIED';

  return (
    <AppShell
      title="Examination Controller Dashboard"
      breadcrumb="VeriMark 2.0 / Controller / Operations & Integrity"
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/exam-management"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <CalendarClock className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
            <span>Manage Timetable</span>
          </Link>
          <Link
            to="/approvals/controller"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Co-Sign Corrections</span>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {loading || !data ? (
          <LoadingSkeleton rows={4} />
        ) : (
          <>
            {/* Real Cryptographic Ledger Integrity Banner */}
            <section
              className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                intact
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50/80 dark:bg-red-950/35 border-red-300 dark:border-red-800'
              }`}
            >
              <div className="flex items-start gap-3">
                {intact ? (
                  <ShieldCheck
                    className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldAlert
                    className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                    Ledger Integrity Status: {data.cards.ledgerIntegrityStatus}
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">
                    {intact
                      ? `All ${data.audit.totalLedgerEntries} cryptographic ledger blocks and external signed checkpoint verified with zero anomalies.`
                      : `${data.audit.issues.length} ledger integrity issue(s) detected${
                          data.audit.firstInvalidBlock != null
                            ? ` starting at Block #${data.audit.firstInvalidBlock}`
                            : ''
                        }.`}
                  </p>
                </div>
              </div>
              <Link
                to="/audit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 hover:border-indigo-400 shrink-0"
              >
                <span>Open Security Audit</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </section>

            {/* 6 Operational KPI Cards (+ Integrity Banner above = 7 total) */}
            <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                {
                  label: 'Published Exams',
                  value: data.cards.publishedExamsCount,
                  sub: `${data.cards.draftExamsCount} draft`,
                  to: '/exam-management',
                  icon: CalendarClock,
                  accent: 'text-indigo-600 dark:text-indigo-400',
                },
                {
                  label: 'Active Admit Cards',
                  value: data.cards.admitCardsIssuedCount,
                  sub: 'QR verified',
                  to: '/admit-cards',
                  icon: IdCard,
                  accent: 'text-sky-600 dark:text-sky-400',
                },
                {
                  label: 'Pending 2-Sig Corr.',
                  value: data.cards.pendingCorrectionsCount,
                  sub: 'Ed25519 required',
                  to: '/approvals/controller',
                  icon: KeyRound,
                  accent: 'text-emerald-600 dark:text-emerald-400',
                },
                {
                  label: 'Escalated / Overdue',
                  value: data.cards.escalatedTicketsCount,
                  sub: 'Ticket queue',
                  to: '/tickets',
                  icon: LifeBuoy,
                  accent: 'text-amber-600 dark:text-amber-400',
                },
                {
                  label: 'Active Revaluations',
                  value: data.cards.pendingRevaluationsCount,
                  sub: 'Needs decision',
                  to: '/revaluations',
                  icon: RefreshCcw,
                  accent: 'text-violet-600 dark:text-violet-400',
                },
                {
                  label: 'Unread Alerts',
                  value: data.cards.unreadNotificationsCount,
                  sub: 'Live stream',
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
                    className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 rounded-xl p-4 space-y-1.5 transition-colors"
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
                    <p className="text-[11px] text-slate-500">{card.sub}</p>
                  </Link>
                );
              })}
            </section>

            {/* Next Scheduled Exam Countdown + Escalated Tickets */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Next Published Examination
                  </h2>
                  <Link
                    to="/analytics"
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                  >
                    <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Institution Analytics</span>
                  </Link>
                </div>
                {data.upcomingExams[0] ? (
                  <ExamCountdownCard schedule={data.upcomingExams[0]} />
                ) : (
                  <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
                    No upcoming published examinations. Create one in Exam Management.
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-base text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" aria-hidden="true" />
                    <span>Escalated & Overdue Tickets</span>
                  </h2>
                  <Link
                    to="/tickets"
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    All Tickets →
                  </Link>
                </div>
                {data.escalatedTickets.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">
                    Zero escalated or overdue tickets at this time.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.escalatedTickets.map((t) => (
                      <Link
                        key={t.id}
                        to={`/tickets?id=${t.id}`}
                        className="block py-3 first:pt-0 last:pb-0 space-y-1 hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {t.ticketNumber}
                          </span>
                          <span className="font-mono text-amber-600 dark:text-amber-400 font-semibold">
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
            </section>

            {/* Pending Cryptographic Corrections Queue */}
            <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Pending Two-Signature Correction Requests
                </h2>
                <Link
                  to="/approvals/controller"
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Open Controller Approval Desk →
                </Link>
              </div>
              {data.pendingCorrections.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">
                  No pending correction requests awaiting signatures or finalization.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.pendingCorrections.map((c) => (
                    <div
                      key={c.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <p className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {c.id} · {c.registrationNumber} · {c.subjectCode} ({c.oldMarks} →{' '}
                          {c.proposedMarks})
                        </p>
                        <p className="text-slate-600 dark:text-slate-400">{c.reason}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                          {c.status} ({c.approvals.length}/2 sigs)
                        </span>
                        <Link
                          to="/approvals/controller"
                          className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                        >
                          Review
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
