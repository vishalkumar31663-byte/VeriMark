import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import {
  CorrectionRequestRecord,
  CorrectionStatus,
  UserRole,
} from '../../shared/types';
import { AppShell } from '../components/AppShell';
import { StatusLabel } from '../components/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError, apiRequest } from '../lib/api';

const STATUS_TABS = [
  { key: 'ALL', label: 'All Requests' },
  { key: CorrectionStatus.PENDING, label: 'Pending' },
  { key: CorrectionStatus.APPROVED_PARTIAL, label: '1 of 2 Signed' },
  { key: CorrectionStatus.READY_TO_FINALIZE, label: 'Ready to Finalize' },
  { key: CorrectionStatus.FINALIZED, label: 'Finalized' },
  { key: CorrectionStatus.REJECTED, label: 'Rejected' },
];

export function CorrectionRequestsPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [requests, setRequests] = useState<CorrectionRequestRecord[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);

  const loadCorrections = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter !== 'ALL' ? `?status=${encodeURIComponent(filter)}` : '';
      const res = await apiRequest<{ corrections: CorrectionRequestRecord[] }>(
        `/api/corrections${qs}`
      );
      setRequests(res.corrections);
    } catch (err) {
      pushToast(
        'error',
        'Failed to load correction requests',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [filter, pushToast]);

  useEffect(() => {
    void loadCorrections();
  }, [loadCorrections]);

  const handleFinalize = async (req: CorrectionRequestRecord) => {
    setFinalizingId(req.id);
    try {
      const res = await apiRequest<{
        correctionEvent: { sequence: number };
        newReceipt: { receiptId: string };
      }>(`/api/corrections/${req.id}/finalize`, { method: 'POST' });

      pushToast(
        'success',
        `Correction Anchored in Block #${res.correctionEvent.sequence}`,
        `New receipt ${res.newReceipt.receiptId} issued; original receipt preserved as superseded.`
      );
      await loadCorrections();
    } catch (err) {
      pushToast(
        'error',
        'Finalization Rejected',
        err instanceof ApiError ? err.message : 'Unable to finalize correction'
      );
    } finally {
      setFinalizingId(null);
    }
  };

  const canFinalize =
    user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.CONTROLLER;

  const statusTone = (status: CorrectionStatus) => {
    switch (status) {
      case CorrectionStatus.FINALIZED:
        return { tone: 'verified' as const, label: 'Finalized on Ledger' };
      case CorrectionStatus.READY_TO_FINALIZE:
        return { tone: 'accent' as const, label: 'Dual-Signed · Ready' };
      case CorrectionStatus.APPROVED_PARTIAL:
        return { tone: 'warning' as const, label: '1 of 2 Approvals' };
      case CorrectionStatus.REJECTED:
        return { tone: 'danger' as const, label: 'Rejected' };
      default:
        return { tone: 'warning' as const, label: 'Pending Approvals' };
    }
  };

  return (
    <AppShell
      title="Two-Authority Correction Requests"
      breadcrumb="VeriMark / Corrections / Audit Queue"
      actions={
        <div className="flex items-center gap-2">
          {user?.role === UserRole.EXAMINER && (
            <Link
              to="/approvals/examiner"
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 whitespace-nowrap"
            >
              Examiner Signing Desk
            </Link>
          )}
          {user?.role === UserRole.CONTROLLER && (
            <Link
              to="/approvals/controller"
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 whitespace-nowrap"
            >
              Controller Signing Desk
            </Link>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {/* Segmented Filter Control */}
        <div
          role="tablist"
          aria-label="Filter correction requests by status"
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
        >
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={filter === t.key}
              onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === t.key
                  ? 'bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl">
            Loading correction requests…
          </div>
        ) : requests.length === 0 ? (
          <div className="p-10 text-center space-y-2 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              No correction requests in this filter
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              To propose a marks correction, open Published Results and select any
              subject record.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => {
              const badge = statusTone(req.status);
              const examinerApproval = req.approvals.find(
                (a) => a.approverRole === 'EXAMINER'
              );
              const controllerApproval = req.approvals.find(
                (a) => a.approverRole === 'CONTROLLER'
              );
              const isStale = req.currentResultVersion !== req.originalVersion && req.status !== CorrectionStatus.FINALIZED;

              return (
                <article
                  key={req.id}
                  className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                          {req.studentName} ({req.registrationNumber}) · {req.subjectCode}
                        </h2>
                        <StatusLabel tone={badge.tone} label={badge.label} />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {req.subjectName} · Request <span className="font-mono">{req.id}</span>{' '}
                        · Target v{req.originalVersion} · Proposed by {req.requestedByName}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-[11px] text-slate-500">Marks Change</p>
                        <p className="font-mono font-bold text-base tabular-nums">
                          <span className="text-slate-500 line-through mr-1.5">
                            {req.oldMarks}
                          </span>
                          <span className="text-indigo-600 dark:text-indigo-400">
                            → {req.proposedMarks}
                          </span>
                          <span className="text-xs font-normal text-slate-500">
                            {' '}
                            / {req.maxMarks}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300">
                    <span className="text-xs font-semibold text-slate-500 block mb-0.5">
                      Audit Reason
                    </span>
                    {req.reason}
                  </div>

                  {/* Cryptographic Dual-Signature Evidence Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { title: 'Examiner Signature', record: examinerApproval },
                      {
                        title: 'Examination Controller Signature',
                        record: controllerApproval,
                      },
                    ].map((slot) => (
                      <div
                        key={slot.title}
                        className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5">
                            <KeyRound className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
                            <span>{slot.title}</span>
                          </span>
                          {slot.record ? (
                            <StatusLabel
                              tone={
                                slot.record.decision === 'APPROVED'
                                  ? 'verified'
                                  : 'danger'
                              }
                              label={slot.record.decision}
                            />
                          ) : (
                            <StatusLabel tone="warning" label="Awaiting Signature" />
                          )}
                        </div>
                        {slot.record ? (
                          <div className="text-xs space-y-0.5 text-slate-600 dark:text-slate-400">
                            <p className="font-medium text-slate-900 dark:text-slate-200">
                              {slot.record.approverName}
                            </p>
                            <p className="font-mono text-[11px] truncate">
                              Key: {slot.record.keyId}
                            </p>
                            <p className="font-mono text-[11px] truncate">
                              Ed25519: {slot.record.signatureHex.slice(0, 32)}…
                            </p>
                            {slot.record.comment && (
                              <p className="italic pt-0.5">"{slot.record.comment}"</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">
                            Requires independent client-side Ed25519 signature over canonical request JSON.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Footer actions */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500 font-mono">
                      {req.finalizedLedgerSequence
                        ? `Anchored in Ledger Block #${req.finalizedLedgerSequence}`
                        : isStale
                        ? `Warning: Result moved to v${req.currentResultVersion} (stale)`
                        : `Locked to Result Version v${req.originalVersion}`}
                    </div>

                    <div className="flex items-center gap-2">
                      {req.status === CorrectionStatus.FINALIZED && (
                        <Link
                          to={`/marksheet/${req.resultId}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                          <span>View Updated Marksheet</span>
                        </Link>
                      )}
                      {canFinalize &&
                        req.status === CorrectionStatus.READY_TO_FINALIZE && (
                          <button
                            type="button"
                            disabled={finalizingId === req.id}
                            onClick={() => void handleFinalize(req)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60 transition-colors"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              {finalizingId === req.id
                                ? 'Verifying & Anchoring…'
                                : 'Finalize Dual-Signed Correction'}
                            </span>
                          </button>
                        )}
                      {canFinalize &&
                        (req.status === CorrectionStatus.PENDING ||
                          req.status === CorrectionStatus.APPROVED_PARTIAL) && (
                          <button
                            type="button"
                            disabled={finalizingId === req.id}
                            onClick={() => void handleFinalize(req)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                            title="Backend enforces dual signatures and will reject premature finalization"
                          >
                            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Test Finalize Gate</span>
                          </button>
                        )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
