import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { VeriMarkLogo } from '../components/Logo';

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-5">
        <div className="flex justify-center">
          <VeriMarkLogo size={32} />
        </div>
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            <span>HTTP 404 · ROUTE NOT FOUND</span>
          </div>
          <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-white">
            Page Not Found
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            The requested VeriMark page does not exist or you may not have permission
            to access this route.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Return Home</span>
          </Link>
          <Link
            to="/verify"
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
          >
            Verify Receipt
          </Link>
        </div>
      </div>
    </div>
  );
}
