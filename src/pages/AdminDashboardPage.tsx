import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  FilePlus2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { AuditReport, LedgerEntryRecord, ResultRecord, UserRole } from '../../shared/types';
import { AppShell } from '../components/AppShell';
import { StatusLabel } from '../components/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

interface OverviewResponse {
  metrics: {
    totalStudents: number;
    totalPublishedResults: number;
    totalLedgerEntries: number;
    validLedgerEntries: number;
    pendingCorrections: number;
    approvedCorrections: number;
    rejectedCorrections: number;
    tamperingAlerts: number;
  };
  integrity: AuditReport;
  recentPublications: ResultRecord[];
  recentLedger: LedgerEntryRecord[];
  auditHistory: Array<{
    id: string;
    status: string;
    totalLedgerEntries: number;
    validLedgerEntries: number;
    issuesCount: number;
    checkedAt: string;
  }>;
  subjectStats: Array<{
    subjectCode: string;
    subjectName: string;
    count: number;
    avgMarks: number;
  }>;
}

export function AdminDashboardPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      const res = await apiRequest<OverviewResponse>('/api/dashboard/overview');
      setData(res);
    } catch (err) {
      pushToast(
        'error',
        'Failed to load dashboard',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleRunLiveAudit = async () => {
    setAuditing(true);
    try {
      const res = await apiRequest<{ report: AuditReport }>('/api/security/audit');
      await loadOverview();
      if (res.report.status === 'VERIFIED') {
        pushToast(
          'success',
          'Ledger Integrity Verified',
          `All ${res.report.validLedgerEntries} blocks and materialized marks match the external signed checkpoint.`
        );
      } else {
        pushToast(
          'error',
          `Tampering Detected (${res.report.issues.length} issue${
            res.report.issues.length === 1 ? '' : 's'
          })`,
          'Inspect Security Audit immediately for exact pinpointed mismatches.'
        );
      }
    } catch (err) {
      pushToast(
        'error',
        'Audit failed',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setAuditing(false);
    }
  };

  const isHealthy = data?.integrity.status === 'VERIFIED';

  return (
    <AppShell
      title="Administration Dashboard"
      breadcrumb="VeriMark / Overview"
      actions={
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleRunLiveAudit}
            disabled={auditing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${auditing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{auditing ? 'Auditing…' : 'Verify Integrity'}</span>
          </button>
          {user?.role === UserRole.SUPER_ADMIN && (
            <Link
              to="/publish"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors whitespace-nowrap"
            >
              <FilePlus2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Publish Result</span>
            </Link>
          )}
        </div>
      }
    >
      {loading || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-24 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Interactive Ledger Integrity Banner */}
          <section
            aria-label="Ledger Integrity Status"
            className={`p-5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
              isHealthy
                ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-900/60'
                : 'bg-red-50/80 dark:bg-red-950/35 border-red-200 dark:border-red-900'
            }`}
          >
            <div className="flex items-start gap-3.5">
              {isHealthy ? (
                <ShieldCheck
                  className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <ShieldAlert
                  className="w-6 h-6 text-red-600 dark:text-red-400 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
              )}
              <div>
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  {isHealthy
                    ? 'Cryptographic Ledger Integrity: VERIFIED'
                    : `Integrity Alert: ${data.integrity.issues.length} Tampering Issue${
                        data.integrity.issues.length === 1 ? '' : 's'
                      } Detected`}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                  {isHealthy
                    ? `${data.metrics.validLedgerEntries} of ${data.metrics.totalLedgerEntries} ledger blocks verified against external checkpoint #${data.integrity.checkpointSequence ?? '—'}. All materialized results match.`
                    : `First invalid block: ${
                        data.integrity.firstInvalidBlock !== null
                          ? `#${data.integrity.firstInvalidBlock}`
                          : 'Materialized DB mismatch'
                      }. Open Security Audit to inspect exact expected vs. database values.`}
                </p>
              </div>
            </div>
            <Link
              to="/audit"
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                isHealthy
                  ? 'bg-white dark:bg-[#0F172A] border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                  : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
            >
              <span>Inspect Security Audit</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </section>

          {/* 8 Real Database-Derived Metric Cards */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Total Students',
                value: data.metrics.totalStudents,
                sub: 'Enrolled records',
              },
              {
                label: 'Published Results',
                value: data.metrics.totalPublishedResults,
                sub: 'Materialized marks',
              },
              {
                label: 'Valid Ledger Entries',
                value: `${data.metrics.validLedgerEntries} / ${data.metrics.totalLedgerEntries}`,
                sub: 'Signed hash chain',
              },
              {
                label: 'Tampering Alerts',
                value: data.metrics.tamperingAlerts,
                sub: data.metrics.tamperingAlerts === 0 ? 'Zero mismatches' : 'Action required',
                danger: data.metrics.tamperingAlerts > 0,
              },
              {
                label: 'Pending Corrections',
                value: data.metrics.pendingCorrections,
                sub: 'Awaiting dual sign-off',
              },
              {
                label: 'Approved Corrections',
                value: data.metrics.approvedCorrections,
                sub: 'Finalized on ledger',
              },
              {
                label: 'Rejected Corrections',
                value: data.metrics.rejectedCorrections,
                sub: 'Declined proposals',
              },
              {
                label: 'External Checkpoint',
                value: data.integrity.checkpointSequence
                  ? `#${data.integrity.checkpointSequence}`
                  : 'None',
                sub: data.integrity.checkpointValid
                  ? 'Ed25519 signature valid'
                  : 'Signature invalid',
                danger: !data.integrity.checkpointValid,
              },
            ].map((m) => (
              <div
                key={m.label}
                className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5"
              >
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {m.label}
                </p>
                <p
                  className={`mt-2 text-2xl font-display font-bold tabular-nums ${
                    m.danger
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {m.value}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{m.sub}</p>
              </div>
            ))}
          </section>

          {/* Subject Performance Chart (Real DB Data) + Recent Audit Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-7 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Average Published Marks by Subject
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Computed directly from current materialized SQLite results
                </p>
              </div>
              {data.subjectStats.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">
                  No published subject results yet.
                </p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.subjectStats}
                      margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(148,163,184,0.2)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="subjectCode"
                        tick={{ fontSize: 12, fill: '#94A3B8' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 12, fill: '#94A3B8' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0F172A',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          color: '#F8FAFC',
                          fontSize: '12px',
                        }}
                      />
                      <Bar
                        dataKey="avgMarks"
                        name="Average Marks"
                        fill="#4F46E5"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={44}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="lg:col-span-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Recent Audit Logs
                </h2>
                <Link
                  to="/audit"
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  View Full Audit
                </Link>
              </div>
              {data.auditHistory.length === 0 ? (
                <p className="text-sm text-slate-500">No audit runs recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.auditHistory.slice(0, 6).map((a) => (
                    <div
                      key={a.id}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <StatusLabel
                          tone={a.status === 'VERIFIED' ? 'verified' : 'danger'}
                          label={
                            a.status === 'VERIFIED'
                              ? 'Verified'
                              : `Tampering (${a.issuesCount})`
                          }
                        />
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          {a.validLedgerEntries}/{a.totalLedgerEntries} blocks ·{' '}
                          {new Date(a.checkedAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="text-xs font-mono text-slate-400 shrink-0">
                        {a.id}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Recent Publications & Recent Ledger Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-7 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Recent Publications
                </h2>
                <Link
                  to="/results"
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  All Results
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4 font-semibold">Student</th>
                      <th className="py-3 px-4 font-semibold">Subject</th>
                      <th className="py-3 px-4 font-semibold text-right">Marks</th>
                      <th className="py-3 px-4 font-semibold">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.recentPublications.slice(0, 6).map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {r.studentName}
                          </p>
                          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {r.registrationNumber}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {r.subjectCode}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                            {r.subjectName}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                          {r.obtainedMarks}/{r.maxMarks}
                          <span className="block text-[11px] font-normal text-slate-500">
                            v{r.version}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <Link
                            to={`/marksheet/${r.id}`}
                            className="text-xs font-mono text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                          >
                            {r.latestReceiptId}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="lg:col-span-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Recent Ledger Activity
                </h2>
                <Link
                  to="/ledger"
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Open Explorer
                </Link>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 px-6">
                {data.recentLedger.slice(0, 6).map((e) => (
                  <div key={e.sequence} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Block #{e.sequence} · {e.eventType.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        Hash {e.blockHash.slice(0, 18)}…
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap shrink-0">
                      {new Date(e.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}
