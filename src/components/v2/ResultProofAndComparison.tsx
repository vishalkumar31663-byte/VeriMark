import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  QrCode,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  ReceiptRecord,
  ResultRecord,
  VerificationResponse,
  VerificationStatus,
} from '../../../shared/types';
import { ResultComparisonResponse } from '../../../shared/v2Types';
import { StatusLabel } from '../StatusLabel';

export function explainVerificationStatus(status: VerificationStatus): {
  tone: 'verified' | 'warning' | 'danger' | 'neutral';
  label: string;
  explanation: string;
} {
  switch (status) {
    case VerificationStatus.VERIFIED_ORIGINAL:
      return {
        tone: 'verified',
        label: 'Verified Original',
        explanation:
          'This receipt matches the latest unaltered cryptographic ledger record and external signed checkpoint.',
      };
    case VerificationStatus.VERIFIED_SUPERSEDED:
      return {
        tone: 'warning',
        label: 'Verified — Superseded by Authorized Correction',
        explanation:
          'This original receipt is cryptographically authentic, and a later dual-signed correction superseded these marks.',
      };
    case VerificationStatus.TAMPERING_DETECTED:
      return {
        tone: 'danger',
        label: 'Tampering Detected',
        explanation:
          'Hash-chain, payload digest, database value, or external checkpoint mismatch detected. Do not trust altered records.',
      };
    case VerificationStatus.INVALID_SIGNATURE:
      return {
        tone: 'danger',
        label: 'Invalid Signature',
        explanation:
          'Ed25519 digital signature failed verification against pinned institutional public keys.',
      };
    case VerificationStatus.RECORD_NOT_FOUND:
      return {
        tone: 'neutral',
        label: 'Record Not Found',
        explanation: 'No published ledger receipt exists for this identifier.',
      };
    case VerificationStatus.NO_TRUSTED_CHECKPOINT:
      return {
        tone: 'warning',
        label: 'No Trusted Checkpoint',
        explanation:
          'No external signed checkpoint is available to anchor the verification proof.',
      };
    default:
      return {
        tone: 'neutral',
        label: 'Verification Unavailable',
        explanation: 'Verification service could not complete this check.',
      };
  }
}

export function ResultProofCard({
  result,
  receipt,
  verification,
  qrDataUrl,
  verifyUrl,
  onCopyUrl,
}: {
  result: ResultRecord;
  receipt: ReceiptRecord;
  verification: VerificationResponse;
  qrDataUrl: string;
  verifyUrl: string;
  onCopyUrl: () => void;
}) {
  const statusInfo = explainVerificationStatus(verification.status);

  return (
    <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-6 py-4 bg-slate-50 dark:bg-[#0B1120] border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
            CRYPTOGRAPHIC PROOF OF RESULT · VERSION v{receipt.version}
          </p>
          <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
            {result.subjectCode} — {result.subjectName}
          </h3>
        </div>
        <StatusLabel tone={statusInfo.tone} label={statusInfo.label} />
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-5">
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {statusInfo.explanation}
          </p>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Student</dt>
              <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                {result.studentName}
              </dd>
              <dd className="font-mono text-xs text-slate-500">
                {result.registrationNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Marks (v{receipt.version})</dt>
              <dd className="font-mono font-bold text-2xl tabular-nums text-indigo-600 dark:text-indigo-400">
                {verification.originalRecord?.obtainedMarks ?? result.obtainedMarks}
                <span className="text-xs font-normal text-slate-500">
                  {' '}
                  / {result.maxMarks}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Ledger Block</dt>
              <dd className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                Block #{receipt.ledgerSequence}
              </dd>
              <dd className="text-xs text-slate-500">
                {new Date(receipt.createdAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>

          <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 space-y-2 text-xs font-mono">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-slate-500">Receipt ID:</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {receipt.receiptId}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-slate-500">Short Fingerprint:</span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {receipt.shortFingerprint}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-slate-500">Payload SHA-256:</span>
              <span className="text-slate-700 dark:text-slate-300 break-all">
                {receipt.payloadHash}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-slate-500">Block SHA-256:</span>
              <span className="text-slate-700 dark:text-slate-300 break-all">
                {receipt.blockHash}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <a
              href={`/api/marksheets/${result.id}/pdf?version=${receipt.version}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download PDF Marksheet (v{receipt.version})</span>
            </a>
            <a
              href={`/api/verify/${encodeURIComponent(receipt.receiptId)}/proof?download=1`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export JSON Proof Bundle</span>
            </a>
            <button
              type="button"
              onClick={onCopyUrl}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Copy Public Verify URL</span>
            </button>
            <Link
              to={`/verify/${encodeURIComponent(receipt.receiptId)}?fp=${encodeURIComponent(
                receipt.shortFingerprint
              )}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Open Public Verification</span>
            </Link>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col items-center justify-center p-5 rounded-xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <div className="p-2.5 bg-white rounded-xl border border-slate-200">
            <img
              src={qrDataUrl}
              alt={`Verification QR code for ${receipt.receiptId}`}
              className="w-40 h-40"
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold inline-flex items-center gap-1.5 text-slate-900 dark:text-white">
              <QrCode className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
              <span>Scan to Verify Authenticity</span>
            </p>
            <p className="text-[11px] font-mono text-slate-500 break-all">
              {verifyUrl}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ResultComparisonPanel({
  comparison,
}: {
  comparison: ResultComparisonResponse;
}) {
  const origStatus = explainVerificationStatus(
    comparison.originalVersion.verificationStatus
  );
  const latestStatus = explainVerificationStatus(
    comparison.latestVersion.verificationStatus
  );
  const lastCorrection =
    comparison.finalizedCorrections[comparison.finalizedCorrections.length - 1] ?? null;

  return (
    <div className="space-y-6">
      {/* Side-by-Side Original -> Corrected Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-11 gap-4 items-stretch">
        {/* Original Version Card */}
        <div className="lg:col-span-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500">
                Original Published Result · v1
              </span>
              <StatusLabel tone={origStatus.tone} label={origStatus.label} />
            </div>

            <div className="flex items-baseline gap-2">
              <span className="font-mono font-bold text-4xl tabular-nums text-slate-900 dark:text-white">
                {comparison.originalVersion.obtainedMarks}
              </span>
              <span className="font-mono text-sm text-slate-500">
                / {comparison.originalVersion.maxMarks}
              </span>
            </div>

            <dl className="space-y-1.5 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Published At</dt>
                <dd className="font-mono text-slate-700 dark:text-slate-300">
                  {new Date(comparison.originalVersion.publishedAt).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Original Receipt</dt>
                <dd className="font-mono text-indigo-600 dark:text-indigo-400">
                  {comparison.originalVersion.receipt?.receiptId ?? 'N/A'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Ledger Block</dt>
                <dd className="font-mono">
                  #{comparison.originalVersion.ledgerSequence ?? '—'}
                </dd>
              </div>
            </dl>
          </div>

          {comparison.originalVersion.receipt && (
            <Link
              to={`/verify/${encodeURIComponent(
                comparison.originalVersion.receipt.receiptId
              )}?fp=${encodeURIComponent(
                comparison.originalVersion.receipt.shortFingerprint
              )}`}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
            >
              <span>Verify Original v1 Receipt</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {/* Center Delta Indicator */}
        <div className="lg:col-span-1 flex flex-row lg:flex-col items-center justify-center gap-2 py-2">
          <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </div>
          <span
            className={`font-mono text-xs font-bold tabular-nums ${
              comparison.marksDelta > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : comparison.marksDelta < 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-500'
            }`}
          >
            {comparison.marksDelta > 0
              ? `+${comparison.marksDelta}`
              : comparison.marksDelta}
          </span>
        </div>

        {/* Latest / Corrected Version Card */}
        <div
          className={`lg:col-span-5 bg-white dark:bg-[#0F172A] border rounded-xl p-6 flex flex-col justify-between space-y-4 ${
            comparison.hasFinalizedCorrection
              ? 'border-emerald-300 dark:border-emerald-800'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                {comparison.hasFinalizedCorrection
                  ? `Finalized Corrected Result · v${comparison.latestVersion.version}`
                  : 'No Finalized Corrections (Original v1 Active)'}
              </span>
              <StatusLabel tone={latestStatus.tone} label={latestStatus.label} />
            </div>

            <div className="flex items-baseline gap-2">
              <span className="font-mono font-bold text-4xl tabular-nums text-emerald-600 dark:text-emerald-400">
                {comparison.latestVersion.obtainedMarks}
              </span>
              <span className="font-mono text-sm text-slate-500">
                / {comparison.latestVersion.maxMarks}
              </span>
            </div>

            {lastCorrection ? (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <p className="text-slate-700 dark:text-slate-300">
                  <strong className="text-slate-900 dark:text-white">Audit Reason:</strong>{' '}
                  {lastCorrection.reason}
                </p>
                <div className="font-mono text-[11px] text-slate-500 space-y-0.5">
                  <p>
                    Examiner Sig:{' '}
                    {lastCorrection.examinerApproval
                      ? `${lastCorrection.examinerApproval.approverName} (${lastCorrection.examinerApproval.keyId})`
                      : 'Verified on ledger'}
                  </p>
                  <p>
                    Controller Sig:{' '}
                    {lastCorrection.controllerApproval
                      ? `${lastCorrection.controllerApproval.approverName} (${lastCorrection.controllerApproval.keyId})`
                      : 'Verified on ledger'}
                  </p>
                  <p>
                    Receipt: {comparison.latestVersion.receipt?.receiptId} · Block #
                    {comparison.latestVersion.ledgerSequence}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                This result has not been modified since initial cryptographic publication.
              </p>
            )}
          </div>

          {comparison.latestVersion.receipt && (
            <Link
              to={`/verify/${encodeURIComponent(
                comparison.latestVersion.receipt.receiptId
              )}?fp=${encodeURIComponent(
                comparison.latestVersion.receipt.shortFingerprint
              )}`}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
            >
              <span>Verify Latest v{comparison.latestVersion.version} Receipt</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Pending Proposals (Clearly Separated from Finalized Corrections) */}
      {comparison.pendingProposals.length > 0 && (
        <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800 p-5 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <h4 className="font-display font-bold text-sm text-amber-900 dark:text-amber-200">
                Pending Correction Proposal (NOT Finalized)
              </h4>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/90">
                Pending proposals do not alter official marks until both independent Examiner and
                Examination Controller Ed25519 signatures are verified and finalized onto the ledger.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {comparison.pendingProposals.map((p) => (
              <div
                key={p.id}
                className="p-3 rounded-lg bg-white/90 dark:bg-[#0F172A] border border-amber-200 dark:border-amber-900 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-mono font-semibold">{p.id}</span> · Proposed:{' '}
                  <strong className="font-mono">
                    {p.oldMarks} → {p.proposedMarks}
                  </strong>{' '}
                  · {p.reason}
                </div>
                <span className="font-mono text-amber-700 dark:text-amber-400 font-semibold">
                  {p.status} ({p.approvals.length}/2 signatures)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Finalized Correction Trail + Linked Workflows */}
      {(comparison.finalizedCorrections.length > 0 ||
        comparison.linkedTickets.length > 0 ||
        comparison.linkedRevaluations.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h4 className="font-display font-bold text-sm text-slate-900 dark:text-white">
              Cryptographic Correction History ({comparison.finalizedCorrections.length})
            </h4>
            {comparison.finalizedCorrections.length === 0 ? (
              <p className="text-xs text-slate-500">No finalized ledger corrections yet.</p>
            ) : (
              <div className="space-y-2.5">
                {comparison.finalizedCorrections.map((fc) => (
                  <div
                    key={fc.correctionRequestId}
                    className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        v{fc.previousVersion} → v{fc.newVersion} ({fc.oldMarks} → {fc.newMarks})
                      </span>
                      <span className="font-mono text-slate-500">
                        Block #{fc.ledgerSequence}
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">{fc.reason}</p>
                    <div className="flex flex-wrap gap-3 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Examiner: {fc.examinerApproval?.approverName ?? 'Verified'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Controller: {fc.controllerApproval?.approverName ?? 'Verified'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h4 className="font-display font-bold text-sm text-slate-900 dark:text-white">
              Linked Tickets & Revaluation Requests
            </h4>
            {comparison.linkedTickets.length === 0 &&
            comparison.linkedRevaluations.length === 0 ? (
              <p className="text-xs text-slate-500">
                No support tickets or revaluation requests linked to this result.
              </p>
            ) : (
              <div className="space-y-2 text-xs">
                {comparison.linkedTickets.map((t) => (
                  <Link
                    key={t.id}
                    to={`/tickets?id=${t.id}`}
                    className="block p-3 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 hover:border-indigo-400"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {t.ticketNumber}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">{t.status}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 mt-0.5 truncate">
                      {t.subject}
                    </p>
                  </Link>
                ))}
                {comparison.linkedRevaluations.map((rv) => (
                  <Link
                    key={rv.id}
                    to="/revaluations"
                    className="block p-3 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 hover:border-indigo-400"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {rv.requestNumber}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">{rv.status}</span>
                    </div>
                    {rv.recommendedMarks != null && (
                      <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                        Recommended Marks: {rv.recommendedMarks}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tamper Integrity Notice if compromised */}
      {(comparison.originalVersion.verificationStatus ===
        VerificationStatus.TAMPERING_DETECTED ||
        comparison.latestVersion.verificationStatus ===
          VerificationStatus.TAMPERING_DETECTED) && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 flex items-start gap-3 text-xs text-red-800 dark:text-red-300">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            <strong>Integrity Warning:</strong> Cryptographic verification detected tampering on one
            or more ledger records for this result. Run the Security Audit immediately.
          </p>
        </div>
      )}
    </div>
  );
}
