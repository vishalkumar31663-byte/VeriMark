import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileCheck2, Lock, QrCode, ShieldCheck } from 'lucide-react';
import { canonicalJson } from '../../shared/canonical';
import {
  ExamRecord,
  LedgerEntryRecord,
  ReceiptRecord,
  ResultRecord,
  StudentRecord,
  SubjectRecord,
  TrustedCheckpoint,
} from '../../shared/types';
import { AppShell } from '../components/AppShell';
import { useToast } from '../context/ToastContext';
import { ApiError, apiRequest } from '../lib/api';

interface CatalogResponse {
  students: StudentRecord[];
  exams: ExamRecord[];
  subjects: SubjectRecord[];
}

interface PublishResponse {
  result: ResultRecord;
  ledgerEntry: LedgerEntryRecord;
  receipt: ReceiptRecord;
  checkpoint: TrustedCheckpoint;
}

export function PublishResultPage() {
  const { pushToast } = useToast();
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);

  const [registrationNumber, setRegistrationNumber] = useState('');
  const [examId, setExamId] = useState('exm_2026_s6');
  const [academicSession, setAcademicSession] = useState('2025-2026');
  const [semester, setSemester] = useState('6');
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [maxMarks, setMaxMarks] = useState('100');
  const [obtainedMarks, setObtainedMarks] = useState('');
  const [publishedAt, setPublishedAt] = useState(() =>
    new Date().toISOString().slice(0, 16)
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishResponse | null>(null);

  useEffect(() => {
    apiRequest<CatalogResponse>('/api/catalog')
      .then((c) => {
        setCatalog(c);
        if (c.students.length > 0 && !registrationNumber) {
          setRegistrationNumber(c.students[0].registrationNumber);
        }
        if (c.exams.length > 0) {
          setExamId(c.exams[0].id);
        }
      })
      .catch(() => {
        // Ignore catalog error
      });
  }, []);

  const handleSubjectPick = (code: string) => {
    setSubjectCode(code);
    const matched = catalog?.subjects.find((s) => s.code === code);
    if (matched) {
      setSubjectName(matched.name);
      setMaxMarks(String(matched.maxMarks));
      setSemester(String(matched.semester));
    }
  };

  const canonicalPreview = useMemo(() => {
    return canonicalJson({
      schemaVersion: '1.0',
      registrationNumber: registrationNumber.trim().toUpperCase(),
      examId: examId.trim(),
      academicSession: academicSession.trim(),
      semester: Number(semester) || 0,
      subjectCode: subjectCode.trim().toUpperCase(),
      subjectName: subjectName.trim(),
      maxMarks: Number(maxMarks) || 0,
      obtainedMarks: Number(obtainedMarks) || 0,
      version: 1,
    });
  }, [
    registrationNumber,
    examId,
    academicSession,
    semester,
    subjectCode,
    subjectName,
    maxMarks,
    obtainedMarks,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const maxNum = Number(maxMarks);
    const obtNum = Number(obtainedMarks);
    if (!registrationNumber.trim() || !subjectCode.trim() || !subjectName.trim()) {
      setError('Registration number, subject code, and subject name are required.');
      return;
    }
    if (!Number.isFinite(obtNum) || obtNum < 0 || obtNum > maxNum) {
      setError(`Obtained marks must be between 0 and ${maxNum}.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<PublishResponse>('/api/results/publish', {
        method: 'POST',
        body: JSON.stringify({
          registrationNumber: registrationNumber.trim(),
          examId: examId.trim(),
          academicSession: academicSession.trim(),
          semester: Number(semester),
          subjectCode: subjectCode.trim().toUpperCase(),
          subjectName: subjectName.trim(),
          maxMarks: maxNum,
          obtainedMarks: obtNum,
          publishedAt: new Date(publishedAt).toISOString(),
        }),
      });
      setPublished(res);
      pushToast(
        'success',
        `Result Anchored in Block #${res.ledgerEntry.sequence}`,
        `Receipt ${res.receipt.receiptId} generated and checkpoint #${res.checkpoint.sequence} signed.`
      );
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Failed to publish result.';
      setError(msg);
      pushToast('error', 'Publication Rejected', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Publish Examination Result"
      breadcrumb="VeriMark / Results / Publish"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
              Canonical Publication Form
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Publishes atomically to the append-only signed ledger, issues a receipt,
              and updates the external signed checkpoint. Rolls back completely if
              checkpoint anchoring fails.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="pub-reg" className="text-xs font-semibold">
                  Student Registration Number
                </label>
                <select
                  id="pub-reg"
                  value={registrationNumber}
                  onChange={(e) => {
                    setRegistrationNumber(e.target.value);
                    const s = catalog?.students.find(
                      (x) => x.registrationNumber === e.target.value
                    );
                    if (s) {
                      setSemester(String(s.semester));
                      setAcademicSession(s.academicSession);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                >
                  {catalog?.students.map((s) => (
                    <option key={s.id} value={s.registrationNumber}>
                      {s.registrationNumber} — {s.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="pub-exam" className="text-xs font-semibold">
                  Examination ID
                </label>
                <select
                  id="pub-exam"
                  value={examId}
                  onChange={(e) => setExamId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                >
                  {catalog?.exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.examCode} — {ex.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="pub-session" className="text-xs font-semibold">
                  Academic Session
                </label>
                <input
                  id="pub-session"
                  required
                  value={academicSession}
                  onChange={(e) => setAcademicSession(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pub-semester" className="text-xs font-semibold">
                  Semester
                </label>
                <input
                  id="pub-semester"
                  type="number"
                  min={1}
                  max={12}
                  required
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pub-ts" className="text-xs font-semibold">
                  Publication Timestamp
                </label>
                <input
                  id="pub-ts"
                  type="datetime-local"
                  required
                  value={publishedAt}
                  onChange={(e) => setPublishedAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="pub-sub-code" className="text-xs font-semibold">
                  Subject Code
                </label>
                <input
                  id="pub-sub-code"
                  list="verimark-subjects"
                  required
                  value={subjectCode}
                  onChange={(e) => handleSubjectPick(e.target.value)}
                  placeholder="e.g. CSE308"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
                <datalist id="verimark-subjects">
                  {catalog?.subjects.map((sub) => (
                    <option key={sub.id} value={sub.code}>
                      {sub.name}
                    </option>
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pub-sub-name" className="text-xs font-semibold">
                  Subject Name
                </label>
                <input
                  id="pub-sub-name"
                  required
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="e.g. Formal Verification & Program Proofs"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="pub-max" className="text-xs font-semibold">
                  Maximum Marks
                </label>
                <input
                  id="pub-max"
                  type="number"
                  min={1}
                  max={1000}
                  required
                  value={maxMarks}
                  onChange={(e) => setMaxMarks(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pub-obtained" className="text-xs font-semibold">
                  Obtained Marks
                </label>
                <input
                  id="pub-obtained"
                  type="number"
                  min={0}
                  max={Number(maxMarks) || 100}
                  step="0.5"
                  required
                  value={obtainedMarks}
                  onChange={(e) => setObtainedMarks(e.target.value)}
                  placeholder="0 – 100"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white transition-colors"
              >
                <Lock className="w-4 h-4" aria-hidden="true" />
                <span>
                  {submitting
                    ? 'Signing & Anchoring to Ledger…'
                    : 'Sign & Publish to Ledger'}
                </span>
              </button>
            </div>
          </form>
        </section>

        {/* Right Column: Live Canonical Preview + Post-Publish Cryptographic Receipt */}
        <div className="lg:col-span-5 space-y-5">
          {published && (
            <section className="bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900 rounded-xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Result Published & Anchored
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    Ledger Block #{published.ledgerEntry.sequence} · External Checkpoint #
                    {published.checkpoint.sequence}
                  </p>
                </div>
              </div>

              <dl className="space-y-2 text-xs font-mono">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Receipt ID</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white">
                    {published.receipt.receiptId}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Short Fingerprint</dt>
                  <dd className="text-slate-900 dark:text-white">
                    {published.receipt.shortFingerprint}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Block Hash</dt>
                  <dd className="truncate max-w-[200px] text-slate-700 dark:text-slate-300">
                    {published.ledgerEntry.blockHash}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  to={`/marksheet/${published.result.id}`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Open PDF Marksheet</span>
                </Link>
                <Link
                  to={`/verify/${encodeURIComponent(
                    published.receipt.receiptId
                  )}?fp=${encodeURIComponent(published.receipt.shortFingerprint)}`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
                >
                  <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Public Verify</span>
                </Link>
              </div>
            </section>
          )}

          <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck
                className="w-4 h-4 text-indigo-600 dark:text-indigo-400"
                aria-hidden="true"
              />
              <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Deterministic Canonical Payload Preview
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Domain-separated SHA-256 (<code className="font-mono">VERIMARK_PAYLOAD_V1:</code>)
              is calculated over recursively key-sorted JSON before Ed25519 block signing.
            </p>
            <pre className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">
              {canonicalPreview}
            </pre>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
