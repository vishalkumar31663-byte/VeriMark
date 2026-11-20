import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { AuditReport, UserRole } from '../../shared/types';
import { AppShell } from '../components/AppShell';
import { StatusLabel } from '../components/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

interface AuditHistoryRow {
  id: string;
  status: string;
  totalLedgerEntries: number;
  validLedgerEntries: number;
  issuesCount: number;
  firstInvalidBlock: number | null;
  checkpointSequence: number | null;
  checkedAt: string;
}

export function SecurityAuditPage() {
  const { user, tamperLabEnabled } = useAuth();
  const { pushToast } = useToast();

  const [report, setReport] = useState<AuditReport | null>(null);
  const [history, setHistory] = useState<AuditHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const runAudit = useCallback(
    async (persist = true) => {
      setRunning(true);
      try {
        const res = await apiRequest<{
          report: AuditReport;
          history: AuditHistoryRow[];
        }>(`/api/security/audit?persist=${persist ? '1' : '0'}`);
        setReport(res.report);
        setHistory(res.history);
      } catch (err) {
        pushToast(
          'error',
          'Audit execution failed',
          err instanceof Error ? err.message : undefined
        );
      } finally {
        setLoading(false);
        setRunning(false);
      }
    },
    [pushToast]
  );

  useEffect(() => {
    void runAudit(false);
  }, [runAudit]);

  const isClean = report?.status === 'VERIFIED';

  return (
    <AppShell
      title="Security Audit Engine"
      breadcrumb="VeriMark / Security / Cryptographic Integrity Audit"
      actions={
        <div className="flex items-center gap-2.5">
          {tamperLabEnabled && user?.role === UserRole.SUPER_ADMIN && (
            <Link
              to="/tamper-lab"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 whitespace-nowrap"
            >
              <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Tamper Lab</span>
            </Link>
          )}
          <button
            type="button"
            disabled={running}
            onClick={() => void runAudit(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white whitespace-nowrap"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{running ? 'Running Full Audit…' : 'Run Cryptographic Audit'}</span>
          </button>
        </div>
      }
    >
      {loading || !report ? (
        <div className="p-12 text-center text-sm text-slate-500 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl">
          Recalculating SHA-256 hashes, validating Ed25519 signatures, and reconciling
          SQLite results…
        </div>
      ) : (
        <div className="space-y-6">
          {/* Primary Audit Result Banner */}
          <section
            className={`p-6 rounded-xl border ${
              isClean
                ? 'bg-emerald-50/75 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-900'
                : 'bg-red-50/85 dark:bg-red-950/35 border-red-300 dark:border-red-800'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                {isClean ? (
                  <ShieldCheck
                    className="w-7 h-7 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldAlert
                    className="w-7 h-7 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                    {isClean
                      ? 'All Integrity Checks Passed — Zero Tampering Detected'
                      : `Tampering Detected — ${report.issues.length} Integrity Violation${
                          report.issues.length === 1 ? '' : 's'
                        } Pinpointed`}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    Checked {report.totalLedgerEntries} ledger blocks (
                    {report.validLedgerEntries} valid), {report.totalMaterializedResults}{' '}
                    materialized results, and external signed checkpoint #
                    {report.checkpointSequence ?? '—'} at{' '}
                    {new Date(report.checkedAt).toLocaleString()}.
                  </p>
                </div>
              </div>
              <div className="font-mono text-xs text-slate-600 dark:text-slate-300 shrink-0">
                <p>Audit ID: {report.id}</p>
                <p>
                  First Invalid Block:{' '}
                  {report.firstInvalidBlock !== null
                    ? `#${report.firstInvalidBlock}`
                    : 'None'}
                </p>
              </div>
            </div>
          </section>

          {/* Detected Issues Pinpoint Table */}
          <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display font-bold text-base">
                Pinpointed Integrity Findings ({report.issues.length})
              </h3>
              <span className="text-xs text-slate-500">
                Computed live from database + external trust store (never auto-repaired)
              </span>
            </div>

            {report.issues.length === 0 ? (
              <div className="p-10 text-center space-y-1.5">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  Zero discrepancies found across hashes, Ed25519 signatures, external
                  checkpoint, and materialized marks.
                </p>
                <p className="text-xs text-slate-500">
                  Every student result row matches its cryptographically reconstructed
                  ledger state.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-3 px-4 font-semibold">Severity / Issue Type</th>
                      <th className="py-3 px-4 font-semibold">Affected Entity</th>
                      <th className="py-3 px-4 font-semibold">Expected Value</th>
                      <th className="py-3 px-4 font-semibold">Database Value</th>
                      <th className="py-3 px-4 font-semibold text-right">
                        First Invalid Block
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {report.issues.map((iss) => (
                      <tr
                        key={iss.id}
                        className="hover:bg-red-50/40 dark:hover:bg-red-950/20"
                      >
                        <td className="py-3.5 px-4 align-top">
                          <StatusLabel
                            tone={iss.severity === 'CRITICAL' ? 'danger' : 'warning'}
                            label={`${iss.severity} · ${iss.type}`}
                          />
                          <p className="text-slate-600 dark:text-slate-300 mt-1 max-w-sm leading-relaxed">
                            {iss.message}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 align-top font-semibold text-slate-900 dark:text-white">
                          {iss.affectedEntity}
                        </td>
                        <td className="py-3.5 px-4 align-top font-mono text-emerald-700 dark:text-emerald-400 break-words max-w-[230px]">
                          {iss.expectedValue}
                        </td>
                        <td className="py-3.5 px-4 align-top font-mono text-red-700 dark:text-red-400 break-words max-w-[230px]">
                          {iss.databaseValue}
                        </td>
                        <td className="py-3.5 px-4 align-top text-right font-mono tabular-nums font-bold">
                          {iss.firstInvalidBlock !== null
                            ? `#${iss.firstInvalidBlock}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Historical Audit Runs */}
          <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display font-bold text-base">
                Audit Execution Log
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-3 px-4 font-semibold">Audit ID</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Valid Blocks</th>
                    <th className="py-3 px-4 font-semibold text-right">Issues</th>
                    <th className="py-3 px-4 font-semibold text-right">Checkpoint</th>
                    <th className="py-3 px-4 font-semibold">Checked At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2.5 px-4 font-mono">{h.id}</td>
                      <td className="py-2.5 px-4">
                        <StatusLabel
                          tone={h.status === 'VERIFIED' ? 'verified' : 'danger'}
                          label={h.status.replace(/_/g, ' ')}
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {h.validLedgerEntries}/{h.totalLedgerEntries}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                        {h.issuesCount}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {h.checkpointSequence ? `#${h.checkpointSequence}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-500">
                        {new Date(h.checkedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
