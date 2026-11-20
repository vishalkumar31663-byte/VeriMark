import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileCheck2, History, QrCode, ShieldCheck } from 'lucide-react';
import {
  CorrectionRequestRecord,
  LedgerEntryRecord,
  ReceiptRecord,
  ResultRecord,
  StudentRecord,
} from '../../shared/types';
import { AppShell } from '../components/AppShell';
import { StatusLabel } from '../components/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

interface HistoryPayload {
  result: ResultRecord;
  receipts: ReceiptRecord[];
  ledgerEvents: LedgerEntryRecord[];
  correctionRequests: CorrectionRequestRecord[];
}

export function StudentDashboardPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [student, setStudent] = useState<StudentRecord | null>(null);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (user?.studentId) {
          const data = await apiRequest<{
            student: StudentRecord;
            results: ResultRecord[];
          }>(`/api/students/${user.studentId}`);
          setStudent(data.student);
          setResults(data.results);
        } else {
          const res = await apiRequest<{ results: ResultRecord[] }>('/api/results');
          setResults(res.results);
        }
      } catch (err) {
        pushToast(
          'error',
          'Unable to load your results',
          err instanceof Error ? err.message : undefined
        );
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user, pushToast]);

  const loadHistory = async (resultId: string) => {
    try {
      const h = await apiRequest<HistoryPayload>(`/api/results/${resultId}/history`);
      setSelectedHistory(h);
    } catch (err) {
      pushToast(
        'error',
        'Could not load history',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const avgPct =
    results.length > 0
      ? Math.round(
          (results.reduce((acc, r) => acc + (r.obtainedMarks / r.maxMarks) * 100, 0) /
            results.length) *
            10
        ) / 10
      : 0;

  return (
    <AppShell
      title="Student Result Portal"
      breadcrumb="VeriMark / Student / My Results"
    >
      <div className="space-y-6">
        {student && (
          <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                {student.registrationNumber}
              </p>
              <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">
                {student.fullName}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {student.course} · Semester {student.semester} · Session{' '}
                {student.academicSession}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-slate-500">Published Subjects</p>
                <p className="text-2xl font-display font-bold tabular-nums">
                  {results.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Aggregate</p>
                <p className="text-2xl font-display font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {avgPct}%
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
              My Cryptographically Anchored Results
            </h2>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Loading your published marks…
            </p>
          ) : results.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              No examination results have been published for your registration yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {results.map((r) => (
                <div
                  key={r.id}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        {r.subjectCode}
                      </span>
                      <h3 className="font-semibold text-slate-900 dark:text-white">
                        {r.subjectName}
                      </h3>
                      <StatusLabel
                        tone={r.version > 1 ? 'accent' : 'verified'}
                        label={
                          r.version > 1
                            ? `Authorized Correction · v${r.version}`
                            : 'Original Publication · v1'
                        }
                      />
                    </div>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      Exam {r.examCode} · Block #{r.latestLedgerSequence} · Receipt{' '}
                      {r.latestReceiptId}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="mr-2 text-right">
                      <span className="font-mono font-bold text-xl tabular-nums text-slate-900 dark:text-white">
                        {r.obtainedMarks}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        /{r.maxMarks}
                      </span>
                    </div>
                    <Link
                      to={`/marksheet/${r.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-500 text-white"
                    >
                      <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Marksheet</span>
                    </Link>
                    <a
                      href={`/api/marksheets/${r.id}/pdf`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>PDF</span>
                    </a>
                    <Link
                      to={`/verify/${encodeURIComponent(
                        r.latestReceiptId
                      )}?fp=${encodeURIComponent(r.shortFingerprint)}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Verify</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => void loadHistory(r.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <History className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>History</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Correction & Publication History Panel */}
        {selectedHistory && (
          <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Publication & Correction Audit Trail — {selectedHistory.result.subjectCode}
                </h2>
                <p className="text-xs text-slate-500">
                  Both original and corrected receipts remain independently verifiable
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistory(null)}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedHistory.receipts.map((rec) => (
                <div
                  key={rec.receiptId}
                  className="p-4 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                      <span>Version v{rec.version} Receipt</span>
                    </span>
                    <Link
                      to={`/verify/${encodeURIComponent(
                        rec.receiptId
                      )}?fp=${encodeURIComponent(rec.shortFingerprint)}`}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Verify Online
                    </Link>
                  </div>
                  <p className="font-mono text-xs">{rec.receiptId}</p>
                  <p className="font-mono text-[11px] text-slate-500">
                    Block #{rec.ledgerSequence} · Fingerprint {rec.shortFingerprint}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
