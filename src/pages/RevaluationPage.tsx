import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, KeyRound, Plus, RefreshCcw, ShieldCheck } from 'lucide-react';
import { ResultRecord, UserRole } from '../../shared/types';
import { RevaluationRecord, RevaluationStatus } from '../../shared/v2Types';
import { AppShell } from '../components/AppShell';
import {
  EmptyState,
  FileAttachmentInput,
  LoadingSkeleton,
  SelectedAttachment,
  formatBytes,
  formatEnumLabel,
} from '../components/v2/UiPrimitives';
import { RevaluationTracker } from '../components/v2/WorkflowComponents';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

export function RevaluationPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();

  const isStudent = user?.role === UserRole.STUDENT;
  const isExaminer = user?.role === UserRole.EXAMINER;
  const isController =
    user?.role === UserRole.CONTROLLER || user?.role === UserRole.SUPER_ADMIN;

  const [items, setItems] = useState<RevaluationRecord[]>([]);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);

  // Student submit form
  const [resultId, setResultId] = useState('');
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState<SelectedAttachment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Per-card review form states
  const [activeId, setActiveId] = useState<string | null>(null);
  const [exRecommendation, setExRecommendation] = useState<
    'APPROVE' | 'REJECT' | 'EVIDENCE_REQUIRED'
  >('APPROVE');
  const [exMarks, setExMarks] = useState('');
  const [exNotes, setExNotes] = useState('');

  const [ctrlDecision, setCtrlDecision] = useState<'APPROVED_FOR_CORRECTION' | 'REJECTED'>(
    'APPROVED_FOR_CORRECTION'
  );
  const [ctrlMarks, setCtrlMarks] = useState('');
  const [ctrlNotes, setCtrlNotes] = useState('');
  const [initiateCorrection, setInitiateCorrection] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [revRes, resList] = await Promise.all([
        apiRequest<{ revaluations: RevaluationRecord[] }>('/api/revaluations'),
        isStudent
          ? apiRequest<{ results: ResultRecord[] }>('/api/results')
          : Promise.resolve({ results: [] }),
      ]);
      setItems(revRes.revaluations);
      setResults(resList.results);
      if (resList.results.length > 0 && !resultId) {
        setResultId(resList.results[0].id);
      }
    } catch (err) {
      pushToast(
        'error',
        'Could not load revaluation requests',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [isStudent, pushToast, resultId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('/api/revaluations', {
        method: 'POST',
        body: JSON.stringify({
          resultId,
          reason,
          attachment: attachment
            ? {
                originalName: attachment.originalName,
                mimeType: attachment.mimeType,
                contentBase64: attachment.contentBase64,
              }
            : null,
        }),
      });
      pushToast(
        'success',
        'Revaluation application submitted',
        'Assigned Examiner and Examination Controller have been notified.'
      );
      setReason('');
      setAttachment(null);
      setShowApply(false);
      await loadAll();
    } catch (err) {
      pushToast(
        'error',
        'Revaluation submission rejected',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleExaminerSubmit = async (rec: RevaluationRecord) => {
    try {
      await apiRequest(`/api/revaluations/${rec.id}/recommendation`, {
        method: 'POST',
        body: JSON.stringify({
          recommendation: exRecommendation,
          recommendedMarks:
            exRecommendation === 'APPROVE' && exMarks ? Number(exMarks) : null,
          notes: exNotes,
        }),
      });
      pushToast(
        'success',
        `Recommendation recorded for ${rec.requestNumber}`,
        'Forwarded to Examination Controller. Published marks remain unchanged.'
      );
      setActiveId(null);
      setExNotes('');
      setExMarks('');
      await loadAll();
    } catch (err) {
      pushToast(
        'error',
        'Recommendation failed',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleControllerSubmit = async (rec: RevaluationRecord) => {
    try {
      const outcome = await apiRequest<{
        revaluation: RevaluationRecord;
        correctionId: string | null;
      }>(`/api/revaluations/${rec.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision: ctrlDecision,
          notes: ctrlNotes,
          proposedMarks:
            ctrlDecision === 'APPROVED_FOR_CORRECTION' && ctrlMarks
              ? Number(ctrlMarks)
              : rec.recommendedMarks ?? undefined,
          initiateCorrection:
            ctrlDecision === 'APPROVED_FOR_CORRECTION' ? initiateCorrection : false,
        }),
      });
      pushToast(
        'success',
        outcome.correctionId
          ? `Authorized & Created Dual-Signature Correction ${outcome.correctionId}`
          : `Decision recorded (${formatEnumLabel(ctrlDecision)})`,
        outcome.correctionId
          ? 'Published marks stay immutable until both Examiner and Controller Ed25519 sign and finalize.'
          : undefined
      );
      setActiveId(null);
      setCtrlNotes('');
      setCtrlMarks('');
      await loadAll();
    } catch (err) {
      pushToast(
        'error',
        'Decision failed',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  return (
    <AppShell
      title="Revaluation Requests"
      breadcrumb="VeriMark 2.0 / Revaluation Workflow"
      actions={
        isStudent && (
          <button
            type="button"
            onClick={() => setShowApply((s) => !s)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Apply for Revaluation</span>
          </button>
        )
      }
    >
      <div className="space-y-6">
        {/* Cryptographic Security Guarantee Callout */}
        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
          <ShieldCheck
            className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p>
            <strong className="text-slate-900 dark:text-white">
              Cryptographic Separation of Duties:
            </strong>{' '}
            Submitting, recommending, or authorizing a revaluation NEVER modifies published marks
            directly. Approved revaluations initiate a formal two-authority{' '}
            <strong>Correction Request</strong> requiring independent Examiner and Examination
            Controller Ed25519 signatures before the ledger appends a new version.
          </p>
        </section>

        {/* Student Application Form */}
        {isStudent && showApply && (
          <form
            onSubmit={handleSubmitApplication}
            className="bg-white dark:bg-[#0F172A] border border-indigo-200 dark:border-indigo-900 rounded-xl p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                Submit Formal Revaluation Application
              </h2>
              <button
                type="button"
                onClick={() => setShowApply(false)}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <label className="block space-y-1">
              <span className="font-semibold">Published Examination Result</span>
              <select
                required
                value={resultId}
                onChange={(e) => setResultId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
              >
                {results.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.subjectCode} — {r.subjectName} ({r.obtainedMarks}/{r.maxMarks} · v
                    {r.version})
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="font-semibold">Grounds for Revaluation</span>
              <textarea
                required
                minLength={10}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain which section or question subtotal requires re-checking..."
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
              />
            </label>

            <FileAttachmentInput
              value={attachment}
              onChange={setAttachment}
              label="Attach Supporting Evidence (PDF/PNG/JPEG/TXT, max 2 MB)"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowApply(false)}
                className="px-4 py-2 font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Submit Revaluation'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <LoadingSkeleton rows={3} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={RefreshCcw}
            title="No revaluation requests found"
            description="Students can request formal re-evaluation of any published subject result. Active requests cannot be duplicated."
          />
        ) : (
          <div className="space-y-4">
            {items.map((rv) => (
              <article
                key={rv.id}
                className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {rv.requestNumber}
                      </span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {rv.subjectCode} ({rv.examCode})
                      </span>
                      <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                        {formatEnumLabel(rv.status)}
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                      {rv.subjectName} — {rv.studentName} ({rv.registrationNumber})
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Original Published: <strong className="font-mono">{rv.originalMarks}/{rv.maxMarks}</strong>{' '}
                      · Current Ledger Score:{' '}
                      <strong className="font-mono">
                        {rv.currentMarks}/{rv.maxMarks} (v{rv.currentVersion})
                      </strong>
                      {rv.recommendedMarks != null && (
                        <>
                          {' '}
                          · Examiner Recommended:{' '}
                          <strong className="font-mono text-indigo-600 dark:text-indigo-400">
                            {rv.recommendedMarks}/{rv.maxMarks}
                          </strong>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {rv.linkedCorrectionId && !isStudent && (
                      <Link
                        to={isExaminer ? '/approvals/examiner' : '/approvals/controller'}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                      >
                        <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Sign {rv.linkedCorrectionId}</span>
                      </Link>
                    )}

                    {isExaminer &&
                      rv.status !== RevaluationStatus.COMPLETED &&
                      rv.status !== RevaluationStatus.REJECTED &&
                      rv.status !== RevaluationStatus.CORRECTION_IN_PROGRESS && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveId(activeId === rv.id ? null : rv.id);
                            setExMarks(String(rv.recommendedMarks ?? rv.currentMarks + 2));
                          }}
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          Review & Recommend
                        </button>
                      )}

                    {isController &&
                      rv.status !== RevaluationStatus.COMPLETED &&
                      rv.status !== RevaluationStatus.REJECTED &&
                      !rv.linkedCorrectionId && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveId(activeId === rv.id ? null : rv.id);
                            setCtrlMarks(String(rv.recommendedMarks ?? rv.currentMarks + 2));
                          }}
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          Issue Controller Decision
                        </button>
                      )}
                  </div>
                </div>

                <p className="text-sm text-slate-700 dark:text-slate-300">{rv.reason}</p>

                <RevaluationTracker record={rv} />

                {(rv.examinerNotes || rv.controllerNotes) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {rv.examinerNotes && (
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800">
                        <p className="font-semibold text-slate-500">
                          Examiner Review ({rv.examinerRecommendation})
                        </p>
                        <p className="text-slate-800 dark:text-slate-200 mt-1">
                          {rv.examinerNotes}
                        </p>
                      </div>
                    )}
                    {rv.controllerNotes && (
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800">
                        <p className="font-semibold text-slate-500">
                          Controller Decision ({rv.controllerDecision})
                        </p>
                        <p className="text-slate-800 dark:text-slate-200 mt-1">
                          {rv.controllerNotes}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {rv.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {rv.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={`/api/attachments/${att.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {att.originalName} ({formatBytes(att.sizeBytes)})
                        </span>
                      </a>
                    ))}
                  </div>
                )}

                {/* Examiner Recommendation Inline Drawer */}
                {activeId === rv.id && isExaminer && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B1120] border border-indigo-200 dark:border-indigo-800 space-y-3 text-xs">
                    <p className="font-bold text-slate-900 dark:text-white">
                      Examiner Academic Recommendation
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <select
                        value={exRecommendation}
                        onChange={(e) =>
                          setExRecommendation(
                            e.target.value as 'APPROVE' | 'REJECT' | 'EVIDENCE_REQUIRED'
                          )
                        }
                        className="px-3 py-2 rounded-lg bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700"
                      >
                        <option value="APPROVE">Recommend Approval (Change Marks)</option>
                        <option value="REJECT">Recommend Rejection (Marks Accurate)</option>
                        <option value="EVIDENCE_REQUIRED">Request Supporting Evidence</option>
                      </select>
                      {exRecommendation === 'APPROVE' && (
                        <input
                          type="number"
                          min={0}
                          max={rv.maxMarks}
                          value={exMarks}
                          onChange={(e) => setExMarks(e.target.value)}
                          placeholder="Recommended Marks"
                          className="px-3 py-2 rounded-lg bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 font-mono"
                        />
                      )}
                      <input
                        type="text"
                        value={exNotes}
                        onChange={(e) => setExNotes(e.target.value)}
                        placeholder="Examiner script re-evaluation notes (min 8 chars)..."
                        className={`${
                          exRecommendation === 'APPROVE' ? '' : 'sm:col-span-2'
                        } px-3 py-2 rounded-lg bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700`}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleExaminerSubmit(rv)}
                        className="px-4 py-2 font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                      >
                        Submit Recommendation to Controller
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveId(null)}
                        className="px-4 py-2 font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Controller Decision Inline Drawer */}
                {activeId === rv.id && isController && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B1120] border border-indigo-200 dark:border-indigo-800 space-y-3 text-xs">
                    <p className="font-bold text-slate-900 dark:text-white">
                      Examination Controller Decision (Does NOT Directly Mutate Marks)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <select
                        value={ctrlDecision}
                        onChange={(e) =>
                          setCtrlDecision(
                            e.target.value as 'APPROVED_FOR_CORRECTION' | 'REJECTED'
                          )
                        }
                        className="px-3 py-2 rounded-lg bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700"
                      >
                        <option value="APPROVED_FOR_CORRECTION">
                          Approve for Two-Signature Correction
                        </option>
                        <option value="REJECTED">Reject Revaluation</option>
                      </select>
                      {ctrlDecision === 'APPROVED_FOR_CORRECTION' && (
                        <input
                          type="number"
                          min={0}
                          max={rv.maxMarks}
                          value={ctrlMarks}
                          onChange={(e) => setCtrlMarks(e.target.value)}
                          placeholder="Proposed Corrected Marks"
                          className="px-3 py-2 rounded-lg bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 font-mono"
                        />
                      )}
                      <input
                        type="text"
                        value={ctrlNotes}
                        onChange={(e) => setCtrlNotes(e.target.value)}
                        placeholder="Controller decision notes (min 8 chars)..."
                        className={`${
                          ctrlDecision === 'APPROVED_FOR_CORRECTION' ? '' : 'sm:col-span-2'
                        } px-3 py-2 rounded-lg bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700`}
                      />
                    </div>
                    {ctrlDecision === 'APPROVED_FOR_CORRECTION' && (
                      <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={initiateCorrection}
                          onChange={(e) => setInitiateCorrection(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <span>
                          Immediately open formal Two-Signature Correction Request (requires
                          Examiner & Controller Ed25519 signing)
                        </span>
                      </label>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleControllerSubmit(rv)}
                        className="px-4 py-2 font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                      >
                        Record Decision
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveId(null)}
                        className="px-4 py-2 font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
