import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Download,
  Moon,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sun,
  XCircle,
} from 'lucide-react';
import {
  VerificationProof,
  VerificationResponse,
  VerificationStatus,
} from '../../shared/types';
import {
  StandaloneVerificationResult,
  verifyProofIndependently,
} from '../../shared/verifier';
import { VeriMarkLogo } from '../components/Logo';
import { StatusLabel } from '../components/StatusLabel';
import { getDefaultRouteForRole, useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

export function PublicVerifyPage() {
  const { receiptId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { pushToast } = useToast();

  const fpParam = searchParams.get('fp') ?? undefined;

  const [lookupInput, setLookupInput] = useState(receiptId ?? '');
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [sampleReceipts, setSampleReceipts] = useState<
    Array<{
      receiptId: string;
      version: number;
      shortFingerprint: string;
      registrationNumber: string;
      subjectCode: string;
    }>
  >([]);

  // Independent standalone browser-side cryptographic verifier state
  const [proof, setProof] = useState<VerificationProof | null>(null);
  const [standaloneResult, setStandaloneResult] =
    useState<StandaloneVerificationResult | null>(null);
  const [verifyingLocally, setVerifyingLocally] = useState(false);

  useEffect(() => {
    apiRequest<{
      sampleReceipts: Array<{
        receiptId: string;
        version: number;
        shortFingerprint: string;
        registrationNumber: string;
        subjectCode: string;
      }>;
    }>('/api/system/info')
      .then((info) => setSampleReceipts(info.sampleReceipts))
      .catch(() => {
        // optional
      });
  }, []);

  const runServerVerify = useCallback(
    async (id: string, fp?: string) => {
      setLoading(true);
      setResult(null);
      setProof(null);
      setStandaloneResult(null);
      try {
        const qs = fp ? `?fp=${encodeURIComponent(fp)}` : '';
        const res = await apiRequest<VerificationResponse>(
          `/api/verify/${encodeURIComponent(id)}${qs}`
        );
        setResult(res);
      } catch {
        setResult({
          status: VerificationStatus.VERIFICATION_UNAVAILABLE,
          headline: 'Verification Unavailable',
          summary:
            'Could not reach the VeriMark verification service. Retry shortly or verify a previously downloaded JSON proof offline.',
          verifiedAt: new Date().toISOString(),
          receipt: null,
          originalRecord: null,
          latestAuthorizedRecord: null,
          checks: [],
          checkpoint: null,
          proofAvailable: false,
        });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (receiptId) {
      setLookupInput(receiptId);
      void runServerVerify(receiptId, fpParam);
    } else {
      setResult(null);
    }
  }, [receiptId, fpParam, runServerVerify]);

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = lookupInput.trim();
    if (!cleaned) return;
    navigate(`/verify/${encodeURIComponent(cleaned)}`);
  };

  const handleRunStandaloneVerification = async () => {
    if (!receiptId) return;
    setVerifyingLocally(true);
    try {
      const fetchedProof = await apiRequest<VerificationProof>(
        `/api/verify/${encodeURIComponent(receiptId)}/proof`
      );
      setProof(fetchedProof);
      const localOutcome = await verifyProofIndependently(fetchedProof);
      setStandaloneResult(localOutcome);
      if (localOutcome.valid) {
        pushToast(
          'success',
          'Independent Browser Verification Passed',
          `Verified ${fetchedProof.privacyPreservingChainHeaders.length} signed block headers and external checkpoint locally with @noble/ed25519.`
        );
      } else {
        pushToast(
          'error',
          `Local Verifier Flagged ${localOutcome.status}`,
          'Cryptographic proof did not validate against pinned public keys.'
        );
      }
    } catch (err) {
      pushToast(
        'error',
        'Standalone verification failed',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setVerifyingLocally(false);
    }
  };

  const statusBannerStyle = (status: VerificationStatus) => {
    switch (status) {
      case VerificationStatus.VERIFIED_ORIGINAL:
        return {
          container:
            'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800',
          icon: (
            <ShieldCheck
              className="w-7 h-7 text-emerald-600 dark:text-emerald-400 shrink-0"
              aria-hidden="true"
            />
          ),
          label: 'VERIFIED — ORIGINAL',
        };
      case VerificationStatus.VERIFIED_SUPERSEDED:
        return {
          container:
            'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800',
          icon: (
            <AlertTriangle
              className="w-7 h-7 text-amber-600 dark:text-amber-400 shrink-0"
              aria-hidden="true"
            />
          ),
          label: 'VERIFIED — SUPERSEDED BY AUTHORIZED CORRECTION',
        };
      case VerificationStatus.TAMPERING_DETECTED:
      case VerificationStatus.INVALID_SIGNATURE:
        return {
          container:
            'bg-red-50/85 dark:bg-red-950/35 border-red-300 dark:border-red-800',
          icon: (
            <ShieldAlert
              className="w-7 h-7 text-red-600 dark:text-red-400 shrink-0"
              aria-hidden="true"
            />
          ),
          label:
            status === VerificationStatus.TAMPERING_DETECTED
              ? 'TAMPERING DETECTED'
              : 'INVALID SIGNATURE',
        };
      default:
        return {
          container:
            'bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-700',
          icon: (
            <XCircle
              className="w-7 h-7 text-slate-600 dark:text-slate-400 shrink-0"
              aria-hidden="true"
            />
          ),
          label: status.replace(/_/g, ' '),
        };
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Public Portal Header */}
      <header className="sticky top-0 z-30 h-16 px-4 sm:px-8 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-6">
        <Link to="/" className="text-lg shrink-0">
          <VeriMarkLogo size={26} />
        </Link>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
          <Link
            to={user ? getDefaultRouteForRole(user.role) : '/login'}
            className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white whitespace-nowrap"
          >
            {user ? 'Workspace' : 'Sign In'}
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        {/* Search Form */}
        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div>
            <h1 className="font-display font-bold text-2xl tracking-tight text-slate-900 dark:text-white">
              Public QR & Receipt Verification Portal
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Verify any Demo University examination receipt without signing in. All
              hashes, Ed25519 signatures, and external checkpoints are checked live—and
              can be re-verified directly inside your browser.
            </p>
          </div>

          <form onSubmit={handleLookupSubmit} className="flex flex-col sm:flex-row gap-3">
            <label htmlFor="verify-receipt-input" className="sr-only">
              Receipt Identifier
            </label>
            <input
              id="verify-receipt-input"
              type="text"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder="Enter Receipt ID (e.g. VMK-2026-0001-…)"
              className="flex-1 px-4 py-2.5 text-sm font-mono rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white whitespace-nowrap"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
              <span>Verify Receipt</span>
            </button>
          </form>

          {!receiptId && sampleReceipts.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Sample Anchored Receipts (Click to Verify)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {sampleReceipts.map((rec) => (
                  <Link
                    key={rec.receiptId}
                    to={`/verify/${encodeURIComponent(
                      rec.receiptId
                    )}?fp=${encodeURIComponent(rec.shortFingerprint)}`}
                    className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                        {rec.receiptId}
                      </p>
                      <p className="text-xs text-slate-500">
                        {rec.registrationNumber} · {rec.subjectCode} · v{rec.version}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {loading && (
          <div className="p-12 text-center text-sm text-slate-500 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl">
            Recomputing payload SHA-256, validating Ed25519 signatures, and checking
            external signed checkpoint…
          </div>
        )}

        {!loading && result && (
          <div className="space-y-6">
            {/* Verification Outcome Banner */}
            {(() => {
              const s = statusBannerStyle(result.status);
              return (
                <section className={`p-6 rounded-xl border ${s.container} space-y-3`}>
                  <div className="flex items-start gap-4">
                    {s.icon}
                    <div className="space-y-1">
                      <p className="font-mono text-xs font-bold tracking-wide text-slate-700 dark:text-slate-300">
                        {s.label}
                      </p>
                      <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">
                        {result.headline}
                      </h2>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {result.summary}
                      </p>
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* Original & Superseding Authorized Record Details */}
            {result.originalRecord && (
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div
                  className={`${
                    result.latestAuthorizedRecord ? 'lg:col-span-6' : 'lg:col-span-12'
                  } bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display font-bold text-base">
                      Receipt Publication Record (v{result.originalRecord.version})
                    </h3>
                    <span className="font-mono text-xs text-slate-500">
                      {result.receipt?.receiptId}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Student Name</dt>
                      <dd className="font-semibold mt-0.5">
                        {result.originalRecord.studentName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Registration No.</dt>
                      <dd className="font-mono font-semibold mt-0.5">
                        {result.originalRecord.registrationNumber}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Subject</dt>
                      <dd className="font-medium mt-0.5">
                        {result.originalRecord.subjectCode} —{' '}
                        {result.originalRecord.subjectName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Course & Session</dt>
                      <dd className="text-xs mt-1">
                        {result.originalRecord.course} · Sem{' '}
                        {result.originalRecord.semester} (
                        {result.originalRecord.academicSession})
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Published Marks</dt>
                      <dd className="font-mono font-bold text-2xl tabular-nums text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {result.originalRecord.obtainedMarks}
                        <span className="text-sm font-normal text-slate-500">
                          {' '}
                          / {result.originalRecord.maxMarks}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Published At</dt>
                      <dd className="font-mono text-xs mt-1">
                        {new Date(result.originalRecord.publishedAt).toUTCString()}
                      </dd>
                    </div>
                  </dl>
                </div>

                {result.latestAuthorizedRecord && (
                  <div className="lg:col-span-6 bg-white dark:bg-[#0F172A] border border-amber-300 dark:border-amber-800 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display font-bold text-base">
                        Superseding Dual-Signed Correction (v
                        {result.latestAuthorizedRecord.version})
                      </h3>
                      <StatusLabel tone="verified" label="Dual Ed25519 Signed" />
                    </div>

                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-lg text-slate-400 line-through tabular-nums">
                        {result.originalRecord.obtainedMarks}
                      </span>
                      <span className="font-mono font-bold text-2xl text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {result.latestAuthorizedRecord.obtainedMarks} /{' '}
                        {result.latestAuthorizedRecord.maxMarks}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                      <p className="font-semibold text-slate-500">Audit Reason</p>
                      <p className="text-slate-800 dark:text-slate-200">
                        {result.latestAuthorizedRecord.reason}
                      </p>
                    </div>

                    <div className="text-xs space-y-1 font-mono text-slate-600 dark:text-slate-400">
                      <p>
                        Examiner: {result.latestAuthorizedRecord.examinerName} (
                        {result.latestAuthorizedRecord.examinerKeyId})
                      </p>
                      <p>
                        Controller: {result.latestAuthorizedRecord.controllerName} (
                        {result.latestAuthorizedRecord.controllerKeyId})
                      </p>
                    </div>

                    {result.latestAuthorizedRecord.newReceiptId && (
                      <Link
                        to={`/verify/${encodeURIComponent(
                          result.latestAuthorizedRecord.newReceiptId
                        )}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        <span>
                          Verify Latest v{result.latestAuthorizedRecord.version} Receipt (
                          {result.latestAuthorizedRecord.newReceiptId})
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Cryptographic Verification Breakdown + Independent Client-Side Verifier */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <h3 className="font-display font-bold text-base">
                  Cryptographic Evidence Checks
                </h3>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {result.checks.map((c) => (
                    <li key={c.name} className="py-3 flex items-start gap-3">
                      {c.passed ? (
                        <CheckCircle2
                          className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <XCircle
                          className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {c.name}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 break-words">
                          {c.detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Independent Client-Side Standalone Proof Verifier */}
              <div className="lg:col-span-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Cpu
                    className="w-4 h-4 text-indigo-600 dark:text-indigo-400"
                    aria-hidden="true"
                  />
                  <h3 className="font-display font-bold text-base">
                    Independent Browser-Side Verifier
                  </h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Do not blindly trust the server’s status banner. Fetch the
                  privacy-preserving proof bundle (containing only cryptographic block
                  headers for other records—zero unrelated student PII) and verify
                  every SHA-256 hash and Ed25519 signature right inside your browser
                  using pinned institutional public keys.
                </p>

                {result.proofAvailable && receiptId && (
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      disabled={verifyingLocally}
                      onClick={() => void handleRunStandaloneVerification()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {verifyingLocally
                          ? 'Verifying in Browser…'
                          : 'Run Independent Client Verification'}
                      </span>
                    </button>
                    <a
                      href={`/api/verify/${encodeURIComponent(
                        receiptId
                      )}/proof?download=1`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Download Proof JSON</span>
                    </a>
                  </div>
                )}

                {standaloneResult && proof && (
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <StatusLabel
                        tone={standaloneResult.valid ? 'verified' : 'danger'}
                        label={`Local Verifier: ${standaloneResult.status.replace(
                          /_/g,
                          ' '
                        )}`}
                      />
                      <span className="font-mono text-[11px] text-slate-500">
                        {proof.privacyPreservingChainHeaders.length} headers
                      </span>
                    </div>
                    <ul className="space-y-1.5 text-xs">
                      {standaloneResult.checks.map((c) => (
                        <li key={c.name} className="flex items-start gap-2">
                          {c.passed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                          )}
                          <span className="text-slate-700 dark:text-slate-300">
                            <strong>{c.name}:</strong> {c.detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
