import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import {
  ReceiptRecord,
  ResultRecord,
  VerificationResponse,
} from '../../shared/types';
import { AppShell } from '../components/AppShell';
import { ResultProofCard } from '../components/v2/ResultProofAndComparison';
import { EmptyState, LoadingSkeleton } from '../components/v2/UiPrimitives';
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

export function ProofOfResultPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pushToast } = useToast();

  const [results, setResults] = useState<ResultRecord[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string>(
    searchParams.get('resultId') ?? ''
  );
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [meta, setMeta] = useState<MarksheetMetaResponse | null>(null);
  const [verification, setVerification] = useState<VerificationResponse | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingProof, setLoadingProof] = useState(false);

  useEffect(() => {
    setLoadingList(true);
    apiRequest<{ results: ResultRecord[] }>('/api/results')
      .then((res) => {
        setResults(res.results);
        if (!selectedResultId && res.results.length > 0) {
          setSelectedResultId(res.results[0].id);
        }
      })
      .catch((err) =>
        pushToast(
          'error',
          'Could not load results',
          err instanceof Error ? err.message : undefined
        )
      )
      .finally(() => setLoadingList(false));
  }, [pushToast, selectedResultId]);

  const loadProof = useCallback(
    async (resultId: string, version: number | null) => {
      if (!resultId) return;
      setLoadingProof(true);
      try {
        const vQuery = version ? `?version=${version}` : '';
        const metaRes = await apiRequest<MarksheetMetaResponse>(
          `/api/marksheets/${encodeURIComponent(resultId)}/meta${vQuery}`
        );
        setMeta(metaRes);
        const verRes = await apiRequest<VerificationResponse>(
          `/api/verify/${encodeURIComponent(metaRes.receipt.receiptId)}?fp=${encodeURIComponent(
            metaRes.receipt.shortFingerprint
          )}`
        );
        setVerification(verRes);
      } catch (err) {
        pushToast(
          'error',
          'Could not load cryptographic proof',
          err instanceof Error ? err.message : undefined
        );
      } finally {
        setLoadingProof(false);
      }
    },
    [pushToast]
  );

  useEffect(() => {
    if (selectedResultId) {
      void loadProof(selectedResultId, selectedVersion);
    }
  }, [selectedResultId, selectedVersion, loadProof]);

  const handleSelectResult = (id: string) => {
    setSelectedResultId(id);
    setSelectedVersion(null);
    setSearchParams({ resultId: id });
  };

  const handleCopyUrl = async () => {
    if (!meta) return;
    try {
      await navigator.clipboard.writeText(meta.verifyUrl);
      pushToast('success', 'Public verification URL copied to clipboard');
    } catch {
      pushToast('info', 'Copy URL manually', meta.verifyUrl);
    }
  };

  return (
    <AppShell
      title="Proof of Result"
      breadcrumb="VeriMark 2.0 / Cryptographic Proof of Result"
    >
      <div className="space-y-6">
        {loadingList ? (
          <LoadingSkeleton rows={3} />
        ) : results.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No published results available"
            description="Once an examination result is anchored onto the VeriMark ledger, its cryptographic proof card, QR code, and JSON verification bundle will appear here."
          />
        ) : (
          <>
            {/* Result Selector + Version Switcher */}
            <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="flex-1 space-y-1.5">
                <label
                  htmlFor="proof-result-select"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Select Published Examination Result
                </label>
                <select
                  id="proof-result-select"
                  value={selectedResultId}
                  onChange={(e) => handleSelectResult(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                >
                  {results.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.registrationNumber} — {r.subjectCode} ({r.subjectName}) ·{' '}
                      {r.obtainedMarks}/{r.maxMarks} · v{r.version}
                    </option>
                  ))}
                </select>
              </div>

              {meta && meta.allReceipts.length > 1 && (
                <div className="space-y-1.5">
                  <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Inspect Receipt Version
                  </span>
                  <div className="flex items-center gap-1.5">
                    {meta.allReceipts.map((rec) => {
                      const active = meta.receipt.version === rec.version;
                      return (
                        <button
                          key={rec.receiptId}
                          type="button"
                          onClick={() => setSelectedVersion(rec.version)}
                          className={`px-3 py-2 text-xs font-mono font-semibold rounded-lg border transition-colors ${
                            active
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          v{rec.version} {rec.version === 1 ? '(Original)' : '(Corrected)'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {loadingProof || !meta || !verification ? (
              <LoadingSkeleton rows={3} />
            ) : (
              <ResultProofCard
                result={meta.result}
                receipt={meta.receipt}
                verification={verification}
                qrDataUrl={meta.qrDataUrl}
                verifyUrl={meta.verifyUrl}
                onCopyUrl={() => void handleCopyUrl()}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
