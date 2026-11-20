import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ChevronDown, ChevronUp, KeyRound, Lock } from 'lucide-react';
import { VeriMarkLogo } from '../components/Logo';
import { getDefaultRouteForRole, useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../lib/api';

const DEV_DEMO_ACCOUNTS = [
  {
    roleLabel: 'Super Admin',
    name: 'Dr. Vikramaditya Sen',
    email: 'admin@demouniversity.edu',
    pass: 'Admin@VeriMark2026',
    note: 'Publish results, manage students, audit & Tamper Lab',
  },
  {
    roleLabel: 'Examiner',
    name: 'Dr. Meera Kulkarni',
    email: 'examiner@demouniversity.edu',
    pass: 'Examiner@VeriMark2026',
    note: 'Browser-side Ed25519 signing (Key passphrase: ExaminerSign#2026)',
  },
  {
    roleLabel: 'Examination Controller',
    name: 'Prof. Rajeshwar Nair',
    email: 'controller@demouniversity.edu',
    pass: 'Controller@VeriMark2026',
    note: 'Independent Ed25519 co-signing (Key passphrase: ControllerSign#2026)',
  },
  {
    roleLabel: 'Student',
    name: 'Aarav Sharma (DU2026CS001)',
    email: 'student@demouniversity.edu',
    pass: 'Student@VeriMark2026',
    note: 'View personal marks, history & download PDF marksheets',
  },
];

export function LoginPage() {
  const { login, tamperLabEnabled } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDemoHelper, setShowDemoHelper] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier.trim() || !password) {
      setError('Please enter your User ID or email address and password.');
      return;
    }

    setSubmitting(true);
    try {
      const loggedInUser = await login(identifier.trim(), password);
      pushToast('success', `Signed in as ${loggedInUser.fullName}`);
      navigate(getDefaultRouteForRole(loggedInUser.role), { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to sign in. Please verify your credentials.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="h-16 px-4 sm:px-8 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
        <Link to="/" className="text-lg">
          <VeriMarkLogo size={26} />
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back to Home</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="space-y-1.5">
              <h1 className="font-display font-bold text-2xl tracking-tight text-slate-900 dark:text-white">
                Sign in to VeriMark
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Role-authenticated access for Demo University staff and students.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label
                  htmlFor="login-identifier"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  User ID or Email
                </label>
                <input
                  id="login-identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="admin@demouniversity.edu"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white transition-colors"
              >
                <Lock className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? 'Authenticating…' : 'Sign In'}</span>
              </button>
            </form>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verifying a printed marksheet?{' '}
                <Link
                  to="/verify"
                  className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Open Public Verification Portal
                </Link>
              </p>
            </div>
          </div>

          {/* Development / Hackathon Demo Accounts Helper (excluded in production) */}
          {tamperLabEnabled && (
            <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDemoHelper((v) => !v)}
                aria-expanded={showDemoHelper}
                className="w-full px-5 py-3.5 flex items-center justify-between text-left text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
                  <span>Hackathon Fictional Seed Accounts (Dev Only)</span>
                </span>
                {showDemoHelper ? (
                  <ChevronUp className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                )}
              </button>

              {showDemoHelper && (
                <div className="px-5 pb-4 pt-1 border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                  {DEV_DEMO_ACCOUNTS.map((acc) => (
                    <div
                      key={acc.email}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          {acc.roleLabel} · {acc.name}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {acc.email}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {acc.note}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIdentifier(acc.email);
                          setPassword(acc.pass);
                          setError(null);
                        }}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 whitespace-nowrap shrink-0"
                      >
                        Fill
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
