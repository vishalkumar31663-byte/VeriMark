import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, Printer, ShieldCheck } from 'lucide-react';
import { ReceiptRecord, ResultRecord } from '../../shared/types';
import { AppShell } from '../components/AppShell';
import { VeriMarkLogo } from '../components/Logo';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

interface MarksheetMetaResponse {
  result: ResultRecord;
  receipt: ReceiptRecord;
  allReceipts: ReceiptRecord[];
  verifyUrl: string;
  verifyPath: string;
  qrDataUrl: string;
}

export function MarksheetPreviewPage() {
  const { resultId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pushToast } = useToast();

  const versionParam = searchParams.get('version');
  const [data, setData] = useState<MarksheetMetaResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!resultId) return;
    setLoading(true);
    const qs = versionParam ? `?version=${encodeURIComponent(versionParam)}` : '';
    apiRequest<MarksheetMetaResponse>(`/api/marksheets/${resultId}/meta${qs}`)
      .then(setData)
      .catch((err) => {
        pushToast(
          'error',
          'Could not load marksheet',
          err instanceof Error ? err.message : undefined
        );
      })
      .finally(() => setLoading(false));
  }, [resultId, versionParam, pushToast]);

  const pdfHref = data
    ? `/api/marksheets/${data.result.id}/pdf?version=${data.receipt.version}`
    : '#';

  const percentage = data
    ? Math.round((data.result.obtainedMarks / data.result.maxMarks) * 1000) / 10
    : 0;

  return (
    <AppShell
      title="Official Marksheet Preview"
      breadcrumb="VeriMark / Documents / PDF Marksheet"
      actions={
        data ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Print</span>
            </button>
            <a
              href={pdfHref}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white whitespace-nowrap"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Download PDF</span>
            </a>
          </div>
        ) : null
      }
    >
      {loading ? (
        <div className="p-12 text-center text-sm text-slate-500 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl">
          Generating marksheet preview & QR code…
        </div>
      ) : !data ? (
        <div className="p-12 text-center text-sm text-slate-500 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl">
          Marksheet not found.
        </div>
      ) : (
        <div className="space-y-5 max-w-4xl mx-auto">
          {/* Version Switcher if multiple receipts exist */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/results"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Back to Results</span>
            </Link>

            {data.allReceipts.length > 1 && (
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {data.allReceipts.map((rec) => (
                  <button
                    key={rec.receiptId}
                    type="button"
                    onClick={() => setSearchParams({ version: String(rec.version) })}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      rec.version === data.receipt.version
                        ? 'bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Version v{rec.version} ({rec.receiptId.slice(-6)})
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Printable Institutional Marksheet Sheet */}
          <article className="bg-white text-slate-900 border border-slate-300 rounded-xl overflow-hidden shadow-sm">
            {/* Academic Navy Letterhead */}
            <div className="bg-[#0F172A] text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <VeriMarkLogo size={38} showWordmark={false} />
                <div>
                  <p className="font-display font-extrabold text-xl tracking-tight">
                    DEMO UNIVERSITY
                  </p>
                  <p className="text-xs text-slate-300">
                    Official Cryptographically Anchored Statement of Marks
                  </p>
                  <p className="text-[11px] text-indigo-300 mt-0.5">
                    VeriMark Ledger · Every Mark Verified. Every Change Accountable.
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right font-mono text-xs space-y-0.5">
                <p className="text-emerald-300 font-semibold">
                  RECORD VERSION v{data.receipt.version}
                </p>
                <p className="text-slate-300">
                  LEDGER BLOCK #{data.receipt.ledgerSequence}
                </p>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              {/* Candidate Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-5 border-b border-slate-200 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Student Name</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {data.result.studentName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Registration Number</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5">
                    {data.result.registrationNumber}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Course & Semester</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {data.result.course} · Sem {data.result.semester}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Academic Session</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5">
                    {data.result.academicSession}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Examination ID</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5">
                    {data.result.examCode}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Publication Date</p>
                  <p className="font-mono text-xs font-semibold text-slate-900 mt-1">
                    {new Date(data.receipt.createdAt).toUTCString()}
                  </p>
                </div>
              </div>

              {/* Marks Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Subject Code</th>
                      <th className="py-3 px-4 font-semibold">Subject Name</th>
                      <th className="py-3 px-4 font-semibold text-right">Max Marks</th>
                      <th className="py-3 px-4 font-semibold text-right">Obtained</th>
                      <th className="py-3 px-4 font-semibold text-right">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-4 px-4 font-mono font-semibold">
                        {data.result.subjectCode}
                      </td>
                      <td className="py-4 px-4 font-medium">
                        {data.result.subjectName}
                      </td>
                      <td className="py-4 px-4 text-right font-mono tabular-nums">
                        {data.result.maxMarks}
                      </td>
                      <td className="py-4 px-4 text-right font-mono tabular-nums font-bold text-indigo-700 text-base">
                        {data.result.obtainedMarks}
                      </td>
                      <td className="py-4 px-4 text-right font-mono tabular-nums font-semibold">
                        {percentage}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* QR & Cryptographic Receipt Panel */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row items-start gap-6">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 shrink-0">
                  <img
                    src={data.qrDataUrl}
                    alt={`QR verification code for receipt ${data.receipt.receiptId}`}
                    className="w-36 h-36 block"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex-1 min-w-0 space-y-2.5">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700">
                    <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                    <span>CRYPTOGRAPHIC RECEIPT & PUBLIC VERIFICATION</span>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-slate-500">Receipt Identifier</dt>
                      <dd className="font-mono font-bold text-slate-900">
                        {data.receipt.receiptId}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Short Fingerprint</dt>
                      <dd className="font-mono font-bold text-slate-900">
                        {data.receipt.shortFingerprint}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-slate-500">Payload SHA-256</dt>
                      <dd className="font-mono text-[11px] text-slate-700 break-all">
                        {data.receipt.payloadHash}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-slate-500">Ledger Block Hash</dt>
                      <dd className="font-mono text-[11px] text-slate-700 break-all">
                        {data.receipt.blockHash}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Scan the QR code or open the public verification link below without
                    logging in to validate this receipt independently against Demo
                    University pinned Ed25519 keys. Printed receipts remain permanently
                    verifiable even after authorized dual-signed corrections.
                  </p>
                  <Link
                    to={data.verifyPath}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Open Public Verification Page</span>
                  </Link>
                </div>
              </div>
            </div>
          </article>
        </div>
      )}
    </AppShell>
  );
}
