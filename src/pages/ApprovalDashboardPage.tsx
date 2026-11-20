import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Lock,
  ShieldCheck,
  Unlock,
  XCircle,
} from 'lucide-react';
import { buildCorrectionSigningMessage } from '../../shared/canonical';
import {
  CorrectionRequestRecord,
  CorrectionStatus,
  EncryptedDemoKeyBundle,
  TrustedKeyEntry,
  UserRole,
} from '../../shared/types';
import { AppShell } from '../components/AppShell';
import { StatusLabel } from '../components/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError, apiRequest } from '../lib/api';
import {
  UnlockedSigningKey,
  signCorrectionClientSide,
  unlockEncryptedKeyBundle,
} from '../lib/clientCrypto';

export function ApprovalDashboardPage({
  deskRole,
}: {
  deskRole: 'EXAMINER' | 'CONTROLLER';
}) {
  const { user, tamperLabEnabled } = useAuth();
  const { pushToast } = useToast();

  const [requests, setRequests] = useState<CorrectionRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Browser-Side AES-256-GCM Signing Vault State
  const [encryptedBundle, setEncryptedBundle] =
    useState<EncryptedDemoKeyBundle | null>(null);
  const [enrolledKey, setEnrolledKey] = useState<TrustedKeyEntry | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [unlockedKey, setUnlockedKey] = useState<UnlockedSigningKey | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // Signing action state
  const [comments, setComments] = useState<Record<string, string>>({});
  const [signingId, setSigningId] = useState<string | null>(null);
  const [expandedPayloadId, setExpandedPayloadId] = useState<string | null>(null);

  const isRoleMatch =
    (deskRole === 'EXAMINER' && user?.role === UserRole.EXAMINER) ||
    (deskRole === 'CONTROLLER' && user?.role === UserRole.CONTROLLER);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const corrRes = await apiRequest<{ corrections: CorrectionRequestRecord[] }>(
        '/api/corrections'
      );
      setRequests(corrRes.corrections);

      if (isRoleMatch) {
        const vaultRes = await apiRequest<{
          encryptedBundle: EncryptedDemoKeyBundle | null;
          enrolledKey: TrustedKeyEntry | null;
        }>('/api/auth/signing-vault');
        setEncryptedBundle(vaultRes.encryptedBundle);
        setEnrolledKey(vaultRes.enrolledKey);
      }
    } catch (err) {
      pushToast(
        'error',
        'Failed to load approval queue',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [isRoleMatch, pushToast]);

  useEffect(() => {
    setUnlockedKey(null);
    setPassphrase('');
    setUnlockError(null);
    void loadData();
  }, [deskRole, loadData]);

  const handleUnlockVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encryptedBundle) return;
    setUnlockError(null);
    setUnlocking(true);
    try {
      const unlocked = await unlockEncryptedKeyBundle(encryptedBundle, passphrase);
      setUnlockedKey(unlocked);
      setPassphrase('');
      pushToast(
        'success',
        'Ed25519 Signing Key Unlocked Locally',
        `Decrypted in browser memory via Web Crypto AES-256-GCM (${unlocked.keyId}).`
      );
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setUnlocking(false);
    }
  };

  const handleSignDecision = async (
    req: CorrectionRequestRecord,
    decision: 'APPROVED' | 'REJECTED'
  ) => {
    if (!unlockedKey) {
      pushToast(
        'warning',
        'Unlock Your Signing Key First',
        'Decrypt your browser-side Ed25519 signing key before approving or rejecting.'
      );
      return;
    }

    setSigningId(req.id);
    try {
      // Cryptographically sign the exact canonical correction payload CLIENT-SIDE!
      const { signatureHex } = await signCorrectionClientSide(
        req.signingPayload,
        unlockedKey
      );

      await apiRequest(`/api/corrections/${req.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          keyId: unlockedKey.keyId,
          signatureHex,
          decision,
          comment: comments[req.id] || undefined,
        }),
      });

      pushToast(
        'success',
        decision === 'APPROVED'
          ? 'Cryptographic Approval Recorded'
          : 'Correction Request Rejected',
        `Ed25519 signature verified by server against external trusted key ${unlockedKey.keyId}.`
      );
      await loadData();
    } catch (err) {
      pushToast(
        'error',
        'Signature Submission Rejected',
        err instanceof ApiError ? err.message : 'Could not submit decision'
      );
    } finally {
      setSigningId(null);
    }
  };

  const handleFinalizeFromController = async (req: CorrectionRequestRecord) => {
    setSigningId(req.id);
    try {
      const res = await apiRequest<{
        correctionEvent: { sequence: number };
        newReceipt: { receiptId: string };
      }>(`/api/corrections/${req.id}/finalize`, { method: 'POST' });
      pushToast(
        'success',
        `Finalized in Block #${res.correctionEvent.sequence}`,
        `Corrected marks anchored and receipt ${res.newReceipt.receiptId} issued.`
      );
      await loadData();
    } catch (err) {
      pushToast(
        'error',
        'Finalization Failed',
        err instanceof ApiError ? err.message : 'Could not finalize'
      );
    } finally {
      setSigningId(null);
    }
  };

  const otherRoleKey = deskRole === 'EXAMINER' ? 'CONTROLLER' : 'EXAMINER';
  const actionable = requests
    .filter(
      (r) =>
        r.status === CorrectionStatus.PENDING ||
        r.status === CorrectionStatus.APPROVED_PARTIAL ||
        r.status === CorrectionStatus.READY_TO_FINALIZE
    )
    .sort((a, b) => {
      const score = (req: CorrectionRequestRecord) => {
        if (req.status === CorrectionStatus.READY_TO_FINALIZE) return 0;
        const mySigned = req.approvals.some((ap) => ap.approverRole === deskRole);
        const peerSigned = req.approvals.some(
          (ap) => ap.approverRole === otherRoleKey
        );
        if (!mySigned && peerSigned) return 1;
        if (!mySigned) return 2;
        return 3;
      };
      return score(a) - score(b);
    });

  const demoPassphraseHint =
    deskRole === 'EXAMINER' ? 'ExaminerSign#2026' : 'ControllerSign#2026';

  return (
    <AppShell
      title={
        deskRole === 'EXAMINER'
          ? 'Examiner Approval Dashboard'
          : 'Examination Controller Approval Dashboard'
      }
      breadcrumb={`VeriMark / Approvals / ${
        deskRole === 'EXAMINER' ? 'Examiner Desk' : 'Controller Desk'
      }`}
    >
      <div className="space-y-6">
        {/* Browser-Side AES-256-GCM Encrypted Ed25519 Key Vault */}
        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              {unlockedKey ? (
                <Unlock
                  className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <KeyRound
                  className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
              )}
              <div>
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Browser-Side Ed25519 Signing Key Vault
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Private keys are encrypted with PBKDF2-SHA256 + AES-256-GCM and
                  decrypted strictly inside your browser memory. The server never
                  receives your passphrase or private key.
                </p>
              </div>
            </div>
            <StatusLabel
              tone={unlockedKey ? 'verified' : isRoleMatch ? 'warning' : 'neutral'}
              label={
                unlockedKey
                  ? 'Key Unlocked in Browser'
                  : isRoleMatch
                  ? 'Key Locked'
                  : 'Read-Only Observer'
              }
            />
          </div>

          {!isRoleMatch ? (
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
              You are viewing this desk as <strong className="text-slate-900 dark:text-white">{user?.role}</strong>. Sign in as{' '}
              <strong className="text-slate-900 dark:text-white">
                {deskRole === 'EXAMINER'
                  ? 'examiner@demouniversity.edu'
                  : 'controller@demouniversity.edu'}
              </strong>{' '}
              to unlock the independent {deskRole.toLowerCase()} Ed25519 key and sign
              proposals. Even Super Admins cannot forge or bypass {deskRole.toLowerCase()} signatures.
            </div>
          ) : unlockedKey ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900">
              <div className="text-xs space-y-1 font-mono min-w-0">
                <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                  Active Key ID: {unlockedKey.keyId}
                </p>
                <p className="text-emerald-800 dark:text-emerald-300 truncate">
                  Enrolled Public Key: {unlockedKey.publicKeyHex}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  unlockedKey.privateKeyBytes.fill(0);
                  setUnlockedKey(null);
                  pushToast('info', 'Signing Key Wiped from Browser Memory');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-[#0F172A] text-emerald-800 dark:text-emerald-300 whitespace-nowrap shrink-0"
              >
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Lock Key</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleUnlockVault} className="space-y-3">
              {unlockError && (
                <p
                  role="alert"
                  className="text-xs text-red-600 dark:text-red-400 font-medium"
                >
                  {unlockError}
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label htmlFor="vault-passphrase" className="sr-only">
                    Signing Key Passphrase
                  </label>
                  <input
                    id="vault-passphrase"
                    type="password"
                    required
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder={`Enter ${deskRole.toLowerCase()} key passphrase to decrypt locally…`}
                    className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                  />
                </div>
                <button
                  type="submit"
                  disabled={unlocking || !encryptedBundle}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white whitespace-nowrap"
                >
                  <Unlock className="w-4 h-4" aria-hidden="true" />
                  <span>{unlocking ? 'Decrypting…' : 'Unlock Ed25519 Key'}</span>
                </button>
                {tamperLabEnabled && (
                  <button
                    type="button"
                    onClick={() => setPassphrase(demoPassphraseHint)}
                    className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Fill Demo Passphrase
                  </button>
                )}
              </div>
              {enrolledKey && (
                <p className="text-[11px] font-mono text-slate-500 truncate">
                  Enrolled Key: {enrolledKey.keyId} · PubKey {enrolledKey.publicKeyHex.slice(0, 28)}…
                </p>
              )}
            </form>
          )}
        </section>

        {/* Actionable Queue */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
              Active Correction Proposals ({actionable.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl">
              Loading proposals…
            </div>
          ) : actionable.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl">
              No pending correction proposals require review right now.
            </div>
          ) : (
            actionable.map((req) => {
              const myRoleSigned = req.approvals.find(
                (a) => a.approverRole === deskRole
              );
              const otherRole = deskRole === 'EXAMINER' ? 'CONTROLLER' : 'EXAMINER';
              const otherSigned = req.approvals.find(
                (a) => a.approverRole === otherRole
              );
              const canonicalMsg = buildCorrectionSigningMessage(req.signingPayload);

              return (
                <article
                  key={req.id}
                  className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                        {req.studentName} ({req.registrationNumber}) · {req.subjectCode} —{' '}
                        {req.subjectName}
                      </h3>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        Request {req.id} · Exam {req.examCode} · Target v{req.originalVersion}
                      </p>
                    </div>
                    <div className="font-mono font-bold text-lg tabular-nums shrink-0">
                      <span className="text-slate-400 line-through mr-2">
                        {req.oldMarks}
                      </span>
                      <span className="text-indigo-600 dark:text-indigo-400">
                        → {req.proposedMarks}
                      </span>
                      <span className="text-xs font-normal text-slate-500">
                        {' '}
                        / {req.maxMarks}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                    <strong className="block text-xs text-slate-500 mb-0.5">
                      Correction Justification
                    </strong>
                    {req.reason}
                  </p>

                  {/* Peer Signature Status */}
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <StatusLabel
                      tone={myRoleSigned ? 'verified' : 'warning'}
                      label={
                        myRoleSigned
                          ? `${deskRole}: Signed (${myRoleSigned.decision})`
                          : `${deskRole}: Awaiting Your Signature`
                      }
                    />
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <StatusLabel
                      tone={otherSigned ? 'verified' : 'neutral'}
                      label={
                        otherSigned
                          ? `${otherRole}: Signed by ${otherSigned.approverName}`
                          : `${otherRole}: Not Yet Signed`
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedPayloadId(
                          expandedPayloadId === req.id ? null : req.id
                        )
                      }
                      className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline ml-auto"
                    >
                      {expandedPayloadId === req.id
                        ? 'Hide Exact Signed Bytes'
                        : 'Inspect Exact Canonical Message'}
                    </button>
                  </div>

                  {expandedPayloadId === req.id && (
                    <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                      {canonicalMsg}
                    </pre>
                  )}

                  {/* Signing Controls */}
                  {isRoleMatch && !myRoleSigned && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                      <div>
                        <label
                          htmlFor={`comment-${req.id}`}
                          className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                        >
                          Verification Remark (Optional)
                        </label>
                        <input
                          id={`comment-${req.id}`}
                          type="text"
                          value={comments[req.id] ?? ''}
                          onChange={(e) =>
                            setComments((prev) => ({
                              ...prev,
                              [req.id]: e.target.value,
                            }))
                          }
                          placeholder="e.g. Verified answer booklet re-totaling sheet"
                          className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          disabled={!unlockedKey || signingId === req.id}
                          onClick={() => void handleSignDecision(req, 'APPROVED')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {signingId === req.id
                              ? 'Signing with Ed25519…'
                              : 'Sign & Approve with Ed25519'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={!unlockedKey || signingId === req.id}
                          onClick={() => void handleSignDecision(req, 'REJECTED')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-red-300 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Sign & Reject</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Controller can finalize immediately once both signatures are present */}
                  {deskRole === 'CONTROLLER' &&
                    isRoleMatch &&
                    req.status === CorrectionStatus.READY_TO_FINALIZE && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                          Both Examiner and Controller Ed25519 signatures verified.
                          Ready to append to ledger.
                        </p>
                        <button
                          type="button"
                          disabled={signingId === req.id}
                          onClick={() => void handleFinalizeFromController(req)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Finalize & Anchor Correction</span>
                        </button>
                      </div>
                    )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </AppShell>
  );
}
