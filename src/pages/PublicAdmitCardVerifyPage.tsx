import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Moon,
  Search,
  Sun,
  XCircle,
} from 'lucide-react';
import { ExamMode, PublicAdmitCardVerification } from '../../shared/v2Types';
import { VeriMarkLogo } from '../components/Logo';
import { ExamModeBadge } from '../components/v2/ExamModeAndCountdown';
import { getDefaultRouteForRole, useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../lib/api';

export function PublicAdmitCardVerifyPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [input, setInput] = useState(token ?? '');
  const [result, setResult] = useState<PublicAdmitCardVerification | null>(null);
  const [loading, setLoading] = useState(false);

  const verify = useCallback(async (tok: string) => {
    setLoading(true);
    try {
      const data = await apiRequest<PublicAdmitCardVerification>(
        `/api/admit-cards/verify/${encodeURIComponent(tok)}`
      );
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      setInput(token);
      void verify(token);
    } else {
      setResult(null);
    }
  }, [token, verify]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    navigate(`/admit-card/verify/${encodeURIComponent(input.trim())}`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="sticky top-0 z-30 h-16 px-4 sm:px-8 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-6">
        <Link to="/" className="text-lg shrink-0">
          <VeriMarkLogo size={26} />
        </Link>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/verify"
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline hidden sm:inline"
          >
            Verify Result Receipt Instead
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <Link
            to={user ? getDefaultRouteForRole(user.role) : '/login'}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            {user ? 'Workspace' : 'Sign In'}
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 space-y-6">
        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div>
            <p className="font-mono text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
              EXAMINATION ELIGIBILITY CHECK (SEPARATE FROM RESULT LEDGER)
            </p>
            <h1 className="font-display font-bold text-2xl mt-1">
              Public Digital Admit Card Verification
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Verify an official Demo University admit card token or card number at the exam hall
              gate or online proctoring desk.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter Admit Card Token (ADMIT-…) or Card Number"
              className="flex-1 px-4 py-2.5 text-sm font-mono rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
              <span>Verify Admit Card</span>
            </button>
          </form>
        </section>

        {loading && (
          <div className="p-8 text-center text-sm text-slate-500 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl">
            Verifying admit card eligibility record…
          </div>
        )}

        {!loading && result && (
          <div className="space-y-4">
            <section
              className={`p-5 rounded-xl border flex items-start gap-3 ${
                result.status === 'VALID'
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                  : result.status === 'REISSUED'
                  ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
                  : 'bg-red-50/80 dark:bg-red-950/30 border-red-300 dark:border-red-800'
              }`}
            >
              {result.status === 'VALID' ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : result.status === 'REISSUED' ? (
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="font-mono text-xs font-bold">STATUS: {result.status}</p>
                <p className="text-sm text-slate-800 dark:text-slate-200">
                  {result.status === 'VALID'
                    ? 'Active official admit card verified for this scheduled examination.'
                    : result.status === 'REISSUED'
                    ? 'This older admit card version has been superseded by a newer reissued version.'
                    : 'No valid active admit card matches this token.'}
                </p>
              </div>
            </section>

            {result.card && (
              <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display font-bold text-lg">
                    {result.card.subjectCode} — {result.card.subjectTitle}
                  </h2>
                  <ExamModeBadge mode={result.card.mode} />
                </div>

                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Candidate</dt>
                    <dd className="font-semibold mt-0.5">{result.card.studentName}</dd>
                    <dd className="font-mono text-xs text-slate-500">
                      {result.card.registrationNumber}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Admit Card Number</dt>
                    <dd className="font-mono font-semibold mt-0.5">
                      {result.card.cardNumber} (v{result.card.version})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Date & Time</dt>
                    <dd className="font-mono text-xs mt-1">
                      {result.card.examDate} · {result.card.startTime}–{result.card.endTime} (
                      {result.card.timezone})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">
                      {result.card.mode === ExamMode.ONLINE ? 'Mode' : 'Venue & Seat'}
                    </dt>
                    <dd className="text-xs mt-1">
                      {result.card.mode === ExamMode.ONLINE
                        ? 'Online Authorized Examination Portal'
                        : `${result.card.campus || 'Main Campus'} · ${
                            result.card.building || ''
                          } · Room ${result.card.room || 'TBA'}${
                            result.card.seatNumber ? ` · Seat ${result.card.seatNumber}` : ''
                          }`}
                    </dd>
                  </div>
                </dl>
              </section>
            )}

            <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
              <strong>Disclaimer:</strong> {result.disclaimer}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
