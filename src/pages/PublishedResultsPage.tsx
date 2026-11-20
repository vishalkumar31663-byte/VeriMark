import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileCheck2,
  GitPullRequest,
  History,
  QrCode,
  Search,
  X,
} from 'lucide-react';
import {
  CorrectionRequestRecord,
  LedgerEntryRecord,
  ReceiptRecord,
  ResultRecord,
} from '../../shared/types';
import { AppShell } from '../components/AppShell';
import { StatusLabel } from '../components/StatusLabel';
import { useToast } from '../context/ToastContext';
import { ApiError, apiRequest } from '../lib/api';

interface ResultHistoryResponse {
  result: ResultRecord;
  receipts: ReceiptRecord[];
  ledgerEvents: LedgerEntryRecord[];
  correctionRequests: CorrectionRequestRecord[];
}

export function PublishedResultsPage() {
  const { pushToast } = useToast();
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [search, setSearch] = useState('');
  const [semester, setSemester] = useState('');
  const [loading, setLoading] = useState(true);

  // History Modal
  const [historyData, setHistoryData] = useState<ResultHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Propose Correction Modal
  const [correctTarget, setCorrectTarget] = useState<ResultRecord | null>(null);
  const [proposedMarks, setProposedMarks] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadResults = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (semester) qs.set('semester', semester);
      const res = await apiRequest<{ results: ResultRecord[] }>(
        `/api/results?${qs.toString()}`
      );
      setResults(res.results);
    } catch (err) {
      pushToast(
        'error',
        'Could not load published results',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [search, semester, pushToast]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  const openHistory = async (resultId: string) => {
    setHistoryLoading(true);
    setHistoryData(null);
    try {
      const res = await apiRequest<ResultHistoryResponse>(
        `/api/results/${resultId}/history`
      );
      setHistoryData(res);
    } catch (err) {
      pushToast(
        'error',
        'Failed to load result history',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctTarget) return;
    setSubmitting(true);
    try {
      await apiRequest('/api/corrections', {
        method: 'POST',
        body: JSON.stringify({
          resultId: correctTarget.id,
          proposedMarks: Number(proposedMarks),
          reason,
        }),
      });
      pushToast(
        'success',
        'Correction Proposal Created',
        `Awaiting independent Ed25519 signatures from both Examiner and Controller.`
      );
      setCorrectTarget(null);
      setProposedMarks('');
      setReason('');
    } catch (err) {
      pushToast(
        'error',
        'Proposal Rejected',
        err instanceof ApiError ? err.message : 'Unable to submit correction request'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Published Results"
      breadcrumb="VeriMark / Results / Registry"
      actions={
        <Link
          to="/corrections"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <GitPullRequest className="w-4 h-4" aria-hidden="true" />
          <span>Correction Queue</span>
        </Link>
      }
    >
      <div className="space-y-5">
        <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search published results"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, registration number, subject code, or receipt ID…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            aria-label="Filter results by semester"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
          >
            <option value="">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
              <option key={sem} value={String(sem)}>
                Semester {sem}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 font-semibold">Student</th>
                  <th className="py-3 px-4 font-semibold">Subject</th>
                  <th className="py-3 px-4 font-semibold text-right">Marks</th>
                  <th className="py-3 px-4 font-semibold">Version / State</th>
                  <th className="py-3 px-4 font-semibold">Latest Receipt</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      Loading published results…
                    </td>
                  </tr>
                ) : results.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      No published results match your filters.
                    </td>
                  </tr>
                ) : (
                  results.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {r.studentName}
                        </p>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          {r.registrationNumber} · Sem {r.semester}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-mono text-xs font-semibold">
                          {r.subjectCode}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                          {r.subjectName}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">
                        {r.obtainedMarks}/{r.maxMarks}
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel
                          tone={r.version > 1 ? 'accent' : 'verified'}
                          label={
                            r.version > 1
                              ? `Corrected · v${r.version}`
                              : `Original · v${r.version}`
                          }
                        />
                        <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                          Block #{r.latestLedgerSequence}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <Link
                          to={`/verify/${encodeURIComponent(
                            r.latestReceiptId
                          )}?fp=${encodeURIComponent(r.shortFingerprint)}`}
                          className="inline-flex items-center gap-1 text-xs font-mono text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                        >
                          <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{r.latestReceiptId}</span>
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            to={`/marksheet/${r.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Marksheet</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => void openHistory(r.id)}
                            aria-label={`View history for ${r.registrationNumber} ${r.subjectCode}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <History className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>History</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCorrectTarget(r);
                              setProposedMarks(String(r.obtainedMarks));
                              setReason('');
                            }}
                            aria-label={`Propose correction for ${r.registrationNumber} ${r.subjectCode}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-500 text-white"
                          >
                            <GitPullRequest className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Correct</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Propose Correction Modal */}
      {correctTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Propose marks correction"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
        >
          <div className="w-full max-w-lg bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display font-bold text-lg">
                  Propose Authorized Correction
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {correctTarget.studentName} ({correctTarget.registrationNumber}) ·{' '}
                  {correctTarget.subjectCode} · Current v{correctTarget.version}:{' '}
                  {correctTarget.obtainedMarks}/{correctTarget.maxMarks}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCorrectTarget(null)}
                aria-label="Close correction dialog"
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
              The published marks will remain unchanged until BOTH an Examiner AND the
              Examination Controller independently sign this exact proposal with their
              Ed25519 keys.
            </p>

            <form onSubmit={handleSubmitCorrection} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="cor-marks" className="text-xs font-semibold">
                  Proposed New Marks (Max {correctTarget.maxMarks})
                </label>
                <input
                  id="cor-marks"
                  type="number"
                  min={0}
                  max={correctTarget.maxMarks}
                  step="0.5"
                  required
                  value={proposedMarks}
                  onChange={(e) => setProposedMarks(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="cor-reason" className="text-xs font-semibold">
                  Mandatory Audit Reason
                </label>
                <textarea
                  id="cor-reason"
                  rows={3}
                  required
                  minLength={5}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe the re-evaluation docket, answer booklet reference, or totaling audit finding…"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCorrectTarget(null)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60"
                >
                  {submitting ? 'Submitting…' : 'Create Correction Proposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Result Cryptographic History Modal */}
      {(historyLoading || historyData) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Result cryptographic history"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
        >
          <div className="w-full max-w-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display font-bold text-lg">
                  Auditable Ledger History
                </h2>
                {historyData && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {historyData.result.studentName} (
                    {historyData.result.registrationNumber}) ·{' '}
                    {historyData.result.subjectCode} — {historyData.result.subjectName}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setHistoryData(null)}
                aria-label="Close history modal"
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {historyLoading || !historyData ? (
              <p className="text-sm text-slate-500 py-8 text-center">
                Loading cryptographic timeline…
              </p>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Anchored Receipts (All Versions Remain Verifiable)
                  </h3>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {historyData.receipts.map((rec) => (
                      <div
                        key={rec.receiptId}
                        className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <p className="font-mono font-semibold text-slate-900 dark:text-white">
                            v{rec.version} · {rec.receiptId}
                          </p>
                          <p className="font-mono text-slate-500">
                            Block #{rec.ledgerSequence} · FP {rec.shortFingerprint}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/marksheet/${historyData.result.id}?version=${rec.version}`}
                            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Preview v{rec.version}
                          </Link>
                          <Link
                            to={`/verify/${encodeURIComponent(
                              rec.receiptId
                            )}?fp=${encodeURIComponent(rec.shortFingerprint)}`}
                            className="px-2.5 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500"
                          >
                            Verify
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Immutable Ledger Events ({historyData.ledgerEvents.length})
                  </h3>
                  <div className="space-y-2.5">
                    {historyData.ledgerEvents.map((ev) => (
                      <div
                        key={ev.sequence}
                        className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            Block #{ev.sequence} · {ev.eventType.replace(/_/g, ' ')}
                          </span>
                          <span className="font-mono text-slate-500">
                            {new Date(ev.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-slate-500 truncate">
                          Block Hash: {ev.blockHash}
                        </p>
                        {ev.payload.reason ? (
                          <p className="text-slate-700 dark:text-slate-300 pt-1">
                            Reason: {String(ev.payload.reason)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
