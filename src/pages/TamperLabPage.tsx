import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  DatabaseZap,
  FlaskConical,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { AuditReport } from '../../shared/types';
import { AppShell } from '../components/AppShell';
import { StatusLabel } from '../components/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError, apiRequest } from '../lib/api';

interface TamperActionResult {
  attackType: string;
  category: 'DATABASE_ATTACK' | 'AUTHORIZATION_ATTACK';
  executed: boolean;
  blockedByDefense: boolean;
  title: string;
  description: string;
  technicalDetail: string;
  rejectionCode?: string;
  auditReport: AuditReport;
}

const DB_ATTACKS = [
  {
    type: 'alter_marks',
    title: 'Alter Published Marks in SQLite',
    desc: 'Runs a raw SQL UPDATE on the results table without touching the append-only ledger.',
  },
  {
    type: 'modify_payload',
    title: 'Modify a Ledger Payload',
    desc: 'Mutates payload_json directly inside block #1 to trigger a canonical SHA-256 mismatch.',
  },
  {
    type: 'break_chain',
    title: 'Break a Hash-Chain Link',
    desc: 'Overwrites previous_hash on block #2, severing cryptographic continuity with block #1.',
  },
  {
    type: 'delete_tail',
    title: 'Delete the Final Ledger Entry',
    desc: 'Deletes the newest ledger block from SQLite; caught immediately by external checkpoint.json.',
  },
  {
    type: 'forge_chain',
    title: 'Rewrite Entire Hash Chain',
    desc: 'Alters block #1 and recalculates all subsequent hashes in SQLite using a rogue key.',
  },
];

const AUTH_ATTACKS = [
  {
    type: 'attempt_single_approval',
    title: 'Attempt Correction with One Approval',
    desc: 'Attempts to finalize a correction with only one signature—verifying dual-authority enforcement.',
  },
  {
    type: 'attempt_duplicate_signer',
    title: 'Attempt Two Approvals from Same Signer',
    desc: 'Attempts to use the same individual and key for both Examiner and Controller roles.',
  },
  {
    type: 'attempt_approval_replay',
    title: 'Attempt Approval Signature Replay',
    desc: 'Replays a valid Ed25519 approval signature from one request onto a different request.',
  },
];

export function TamperLabPage() {
  const { tamperLabEnabled } = useAuth();
  const { pushToast } = useToast();

  const [runningType, setRunningType] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<TamperActionResult | null>(null);

  if (!tamperLabEnabled) {
    return (
      <AppShell title="Tamper Lab Unavailable" breadcrumb="VeriMark / Development">
        <div className="p-10 text-center bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
          <p className="font-display font-bold text-lg">
            Tamper Lab is Disabled in Production
          </p>
          <p className="text-sm text-slate-500">
            Attack simulation routes are strictly compiled out of production mode.
          </p>
        </div>
      </AppShell>
    );
  }

  const triggerAttack = async (attackType: string) => {
    setRunningType(attackType);
    try {
      const res = await apiRequest<TamperActionResult>('/api/demo/tamper', {
        method: 'POST',
        body: JSON.stringify({ attackType }),
      });
      setLastOutcome(res);
      if (res.blockedByDefense) {
        pushToast('success', res.title, res.technicalDetail);
      } else {
        pushToast(
          'warning',
          res.title,
          `Audit Engine immediately detected ${res.auditReport.issues.length} integrity violation(s).`
        );
      }
    } catch (err) {
      pushToast(
        'error',
        'Simulation Error',
        err instanceof ApiError ? err.message : 'Unable to execute simulation'
      );
    } finally {
      setRunningType(null);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await apiRequest<{ reset: boolean; auditReport: AuditReport }>(
        '/api/demo/reset',
        { method: 'POST' }
      );
      setLastOutcome(null);
      pushToast(
        'success',
        'Demo Database & Trust Store Reset',
        `Restored clean signed baseline (${res.auditReport.validLedgerEntries} verified blocks).`
      );
    } catch (err) {
      pushToast(
        'error',
        'Reset failed',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setResetting(false);
    }
  };

  return (
    <AppShell
      title="Tamper Lab (Development Only)"
      breadcrumb="VeriMark / Dev Tools / Controlled Attack Simulator"
      actions={
        <button
          type="button"
          disabled={resetting}
          onClick={() => void handleReset()}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white whitespace-nowrap"
        >
          <RotateCcw
            className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>{resetting ? 'Resetting Demo DB…' : 'Reset Demo Database'}</span>
        </button>
      }
    >
      <div className="space-y-6">
        <section className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex items-start gap-3">
          <AlertTriangle
            className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <div className="text-xs sm:text-sm text-amber-900 dark:text-amber-200">
            <strong>Genuine Attack Execution:</strong> Every button below performs a
            real raw SQL mutation on the disposable SQLite database or executes a real
            rejected cryptographic API call—then invokes the genuine{' '}
            <code className="font-mono">AuditService</code>. Nothing here toggles a
            fake UI flag. Use <strong>Reset Demo Database</strong> anytime to restore a
            clean signed baseline.
          </div>
        </section>

        {/* Latest Execution Result */}
        {lastOutcome && (
          <section
            className={`p-6 rounded-xl border space-y-4 ${
              lastOutcome.blockedByDefense
                ? 'bg-emerald-50/75 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-900'
                : 'bg-red-50/85 dark:bg-red-950/35 border-red-300 dark:border-red-800'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                {lastOutcome.blockedByDefense ? (
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
                <div className="space-y-1">
                  <StatusLabel
                    tone={lastOutcome.blockedByDefense ? 'verified' : 'danger'}
                    label={
                      lastOutcome.blockedByDefense
                        ? `PREVENTED (${lastOutcome.rejectionCode ?? 'REJECTED'})`
                        : `DETECTED BY AUDIT ENGINE (${lastOutcome.auditReport.issues.length} VIOLATIONS)`
                    }
                  />
                  <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                    {lastOutcome.title}
                  </h2>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {lastOutcome.description}
                  </p>
                  <p className="text-xs font-mono text-slate-600 dark:text-slate-400 pt-1">
                    {lastOutcome.technicalDetail}
                  </p>
                </div>
              </div>
              <Link
                to="/audit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 whitespace-nowrap shrink-0"
              >
                <span>Open Security Audit</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>

            {lastOutcome.auditReport.issues.length > 0 && (
              <div className="pt-3 border-t border-red-200 dark:border-red-900/60 space-y-1.5">
                <p className="text-xs font-semibold text-red-800 dark:text-red-300">
                  Live Audit Findings Pinpointed Immediately:
                </p>
                {lastOutcome.auditReport.issues.slice(0, 4).map((iss) => (
                  <p
                    key={iss.id}
                    className="text-xs font-mono text-red-700 dark:text-red-300"
                  >
                    · [{iss.type}] {iss.affectedEntity}: expected {iss.expectedValue.slice(0, 32)} vs DB{' '}
                    {iss.databaseValue.slice(0, 32)}
                  </p>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Database Tampering Attacks */}
        <section className="space-y-3">
          <h2 className="font-display font-bold text-base inline-flex items-center gap-2">
            <DatabaseZap className="w-4 h-4 text-red-500" aria-hidden="true" />
            <span>Direct SQLite Tampering Simulations (Bypassing Application API)</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {DB_ATTACKS.map((atk) => (
              <div
                key={atk.type}
                className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                    {atk.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {atk.desc}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={runningType !== null}
                  onClick={() => void triggerAttack(atk.type)}
                  className="w-full py-2 px-3 text-xs font-semibold rounded-lg border border-red-300 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                >
                  {runningType === atk.type ? 'Executing Attack…' : 'Execute Attack'}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Cryptographic & Dual-Authority Bypass Attempts */}
        <section className="space-y-3">
          <h2 className="font-display font-bold text-base inline-flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-indigo-500" aria-hidden="true" />
            <span>Dual-Authority & Cryptographic Policy Attack Tests</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {AUTH_ATTACKS.map((atk) => (
              <div
                key={atk.type}
                className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                    {atk.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {atk.desc}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={runningType !== null}
                  onClick={() => void triggerAttack(atk.type)}
                  className="w-full py-2 px-3 text-xs font-semibold rounded-lg border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-50 transition-colors"
                >
                  {runningType === atk.type ? 'Testing Defense…' : 'Attempt Attack'}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
