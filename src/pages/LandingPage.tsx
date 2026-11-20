import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  KeyRound,
  Lock,
  Moon,
  QrCode,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { TrustedCheckpoint } from '../../shared/types';
import { VeriMarkLogo } from '../components/Logo';
import { StatusLabel } from '../components/StatusLabel';
import { getDefaultRouteForRole, useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../lib/api';

interface SystemInfoResponse {
  appName: string;
  institution: string;
  tamperLabEnabled: boolean;
  isProduction: boolean;
  stats: {
    totalStudents: number;
    totalResults: number;
    totalLedgerEntries: number;
    totalReceipts: number;
  };
  checkpoint: TrustedCheckpoint | null;
  checkpointValid: boolean;
  sampleReceipts: Array<{
    receiptId: string;
    version: number;
    shortFingerprint: string;
    registrationNumber: string;
    studentName: string;
    subjectCode: string;
  }>;
}

export function LandingPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [info, setInfo] = useState<SystemInfoResponse | null>(null);
  const [receiptInput, setReceiptInput] = useState('');

  useEffect(() => {
    apiRequest<SystemInfoResponse>('/api/system/info')
      .then(setInfo)
      .catch(() => {
        // Handled cleanly if unavailable
      });
  }, []);

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = receiptInput.trim();
    if (!cleaned) return;
    navigate(`/verify/${encodeURIComponent(cleaned)}`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
      {/* Top Bar Contract: strict 3-zone header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#0B1120]/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <Link to="/" className="text-lg whitespace-nowrap shrink-0">
            <VeriMarkLogo size={26} />
          </Link>

          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            <a
              href="#architecture"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Architecture
            </a>
            <a
              href="#workflow"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Dual Approval
            </a>
            <Link
              to="/verify"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Public Verify
            </Link>
            <a
              href="#threat-model"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Threat Model
            </a>
            <Link
              to="/pitch-deck"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Judge Pitch Deck
            </Link>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <Link
                to={getDefaultRouteForRole(user.role)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors whitespace-nowrap shrink-0"
              >
                Open Workspace
              </Link>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-16 lg:pt-20 lg:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
              <div className="space-y-5">
                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  Demo University Examination Ledger · Code Fuzion 2026
                </p>
                <h1 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white text-4xl sm:text-5xl lg:text-[3.35rem] leading-[1.08] text-balance">
                  Every Mark Verified. Every Change Accountable.
                </h1>
                <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                  VeriMark anchors university examination marks into a signed SHA-256
                  hash-chain ledger backed by external Ed25519 checkpoints. Direct
                  database edits are pinpointed immediately, and legitimate corrections
                  require independent cryptographic signatures from both the Examiner
                  and the Examination Controller.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Link
                  to={user ? getDefaultRouteForRole(user.role) : '/login'}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors whitespace-nowrap"
                >
                  <span>{user ? 'Go to Dashboard' : 'Access Role Portal'}</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/verify"
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors whitespace-nowrap"
                >
                  <QrCode className="w-4 h-4" aria-hidden="true" />
                  <span>Verify Printed Receipt</span>
                </Link>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="inline-flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                >
                  {theme === 'dark' ? (
                    <>
                      <Sun className="w-4 h-4" aria-hidden="true" />
                      <span>Light Theme</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-4 h-4" aria-hidden="true" />
                      <span>Dark Theme</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Focal Card: Instant Public Receipt Verifier */}
            <div className="lg:col-span-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-7 flex flex-col justify-between space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                    Public Receipt Verification
                  </h2>
                  {info?.checkpoint && (
                    <StatusLabel
                      tone={info.checkpointValid ? 'verified' : 'danger'}
                      label={
                        info.checkpointValid
                          ? `Checkpoint #${info.checkpoint.sequence}`
                          : 'Checkpoint Alert'
                      }
                      icon="shield"
                    />
                  )}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Enter any printed receipt ID to verify marks, publisher signatures,
                  hash-chain continuity, and dual-signed corrections—no login required.
                </p>
              </div>

              <form onSubmit={handleVerifySubmit} className="space-y-3">
                <label
                  htmlFor="landing-receipt-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Receipt Identifier
                </label>
                <div className="flex gap-2">
                  <input
                    id="landing-receipt-input"
                    type="text"
                    value={receiptInput}
                    onChange={(e) => setReceiptInput(e.target.value)}
                    placeholder="e.g. VMK-2026-0001-..."
                    className="flex-1 min-w-0 px-3.5 py-2.5 text-sm font-mono rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-lg bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    <Search className="w-4 h-4" aria-hidden="true" />
                    <span>Verify</span>
                  </button>
                </div>
              </form>

              {info && info.sampleReceipts.length > 0 && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Anchored Receipts Available for Instant Check
                  </p>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {info.sampleReceipts.slice(0, 3).map((rec) => (
                      <Link
                        key={rec.receiptId}
                        to={`/verify/${encodeURIComponent(rec.receiptId)}?fp=${encodeURIComponent(
                          rec.shortFingerprint
                        )}`}
                        className="py-2 flex items-center justify-between gap-3 group"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 group-hover:underline truncate">
                            {rec.receiptId}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {rec.registrationNumber} · {rec.subjectCode} · v{rec.version}
                          </p>
                        </div>
                        <ArrowRight
                          className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 shrink-0"
                          aria-hidden="true"
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4-Column Real Database-Backed Ledger Summary Strip */}
          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Enrolled Students
              </p>
              <p className="mt-2 text-2xl font-display font-bold tabular-nums text-slate-900 dark:text-white">
                {info ? info.stats.totalStudents : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Demo University registry
              </p>
            </div>
            <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Published Results
              </p>
              <p className="mt-2 text-2xl font-display font-bold tabular-nums text-slate-900 dark:text-white">
                {info ? info.stats.totalResults : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Materialized marks records
              </p>
            </div>
            <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Signed Ledger Blocks
              </p>
              <p className="mt-2 text-2xl font-display font-bold tabular-nums text-slate-900 dark:text-white">
                {info ? info.stats.totalLedgerEntries : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Ed25519 + SHA-256 chain
              </p>
            </div>
            <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Anchored Checkpoint
              </p>
              <p className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {info?.checkpoint ? `#${info.checkpoint.sequence}` : '—'}
              </p>
              <p className="mt-1 text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                {info?.checkpoint
                  ? `${info.checkpoint.blockHash.slice(0, 14)}…`
                  : 'External signed head'}
              </p>
            </div>
          </div>
        </section>

        {/* Architecture Section */}
        <section
          id="architecture"
          className="border-t border-slate-200 dark:border-slate-800 py-16 bg-white dark:bg-[#0F172A]/60"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="max-w-2xl space-y-2">
              <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-slate-900 dark:text-white">
                Cryptographic Safeguards Built Into Every Operation
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
                No simulated blockchains or decorative indicators. Every publication,
                correction, and verification runs deterministic cryptography end-to-end.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-xl bg-[#F8FAFC] dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 space-y-3">
                <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                <h3 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                  Append-Only Signed Hash Chain
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Each published result is serialized as deterministic canonical JSON,
                  domain-separated SHA-256 hashed, linked to the previous block hash,
                  and signed with the registrar’s Ed25519 key.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-[#F8FAFC] dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 space-y-3">
                <KeyRound className="w-5 h-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                <h3 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                  Two-Authority Browser Signing
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Examiner and Examination Controller keys are encrypted client-side
                  with Web Crypto AES-256-GCM. Private keys never reach the server;
                  corrections finalize only with two independent valid signatures.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-[#F8FAFC] dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 space-y-3">
                <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                <h3 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                  Independent External Checkpoint
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Signed ledger-head checkpoints and pinned approver public keys live
                  outside SQLite. Even rewriting the entire SQLite hash chain or
                  truncating the tail is caught immediately by the Audit Engine.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Dual Approval Workflow Section */}
        <section id="workflow" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div className="space-y-4">
              <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-slate-900 dark:text-white">
                How Legitimate Corrections Preserve Full Accountability
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                Printed marksheets from earlier versions are never silently overwritten.
                When a re-evaluation updates a student’s marks, both the original
                publication receipt and the new v2 receipt remain cryptographically
                verifiable with full signer evidence.
              </p>
            </div>

            <ol className="space-y-4">
              {[
                {
                  step: '01. Proposal & Version Lock',
                  text: 'Authorized staff proposes new marks with a mandatory written audit reason locked to the current result version.',
                },
                {
                  step: '02. Examiner Ed25519 Signature',
                  text: 'Examiner unlocks their AES-GCM key in-browser and signs the exact canonical correction JSON.',
                },
                {
                  step: '03. Examination Controller Co-Signature',
                  text: 'Controller independently verifies the proposal and signs the identical canonical payload with a distinct enrolled key.',
                },
                {
                  step: '04. Append-Only Amendment & Re-Anchor',
                  text: 'Backend verifies both signatures, appends CORRECTION_APPROVED and RESULT_CORRECTED blocks, updates version to v2, and anchors a new external checkpoint.',
                },
              ].map((item) => (
                <li
                  key={item.step}
                  className="p-4 rounded-lg bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800"
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {item.step}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {item.text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Honest Threat Model Boundaries */}
        <section
          id="threat-model"
          className="border-t border-slate-200 dark:border-slate-800 py-14 bg-white dark:bg-[#0F172A]/60"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>What VeriMark Defends Against</span>
              </div>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li>· Direct SQL modification of current student marks or grades</li>
                <li>· Post-publication payload tampering or broken hash links</li>
                <li>· Full SQLite hash-chain rewrites using rogue keys</li>
                <li>· Ledger tail deletion or missing historical blocks</li>
                <li>· Single-authority silent edits, duplicate signers, and signature replays</li>
              </ul>
            </div>
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-semibold">
                <ShieldAlert className="w-4 h-4" aria-hidden="true" />
                <span>Honest Security Boundaries (Tamper-Evident Design)</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                VeriMark is tamper-evident, not physically unmodifiable. Storing signed
                checkpoints and pinned public keys outside SQLite detects database-only
                compromise. Production deployment should additionally replicate signed
                checkpoints to immutable WORM storage or hardware security modules (HSM)
                to defend against full host + key + checkpoint compromise.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <FileCheck2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <span>VeriMark · Demo University Examination Ledger · Code Fuzion 2026</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/pitch-deck" className="hover:text-slate-900 dark:hover:text-white">
              Judge Pitch Deck (.pptx)
            </Link>
            <Link to="/verify" className="hover:text-slate-900 dark:hover:text-white">
              Public Verification Portal
            </Link>
            <Link to="/login" className="hover:text-slate-900 dark:hover:text-white">
              Staff & Student Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
