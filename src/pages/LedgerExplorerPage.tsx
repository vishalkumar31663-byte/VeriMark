import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Link2, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  AuditIssue,
  LedgerEntryRecord,
  LedgerEventType,
  TrustedCheckpoint,
} from '../../shared/types';
import { AppShell } from '../components/AppShell';
import { StatusLabel } from '../components/StatusLabel';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

interface LedgerResponse {
  entries: LedgerEntryRecord[];
  checkpoint: TrustedCheckpoint | null;
  checkpointValid: boolean;
  integrityStatus: string;
  firstInvalidBlock: number | null;
  issues: AuditIssue[];
}

export function LedgerExplorerPage() {
  const { pushToast } = useToast();
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<LedgerResponse>('/api/ledger')
      .then((res) => {
        setData(res);
        if (res.entries.length > 0) {
          setSelectedSeq(res.entries[res.entries.length - 1].sequence);
        }
      })
      .catch((err) => {
        pushToast(
          'error',
          'Could not load ledger',
          err instanceof Error ? err.message : undefined
        );
      })
      .finally(() => setLoading(false));
  }, [pushToast]);

  const selectedBlock = useMemo(() => {
    if (!data || selectedSeq === null) return null;
    return data.entries.find((e) => e.sequence === selectedSeq) ?? null;
  }, [data, selectedSeq]);

  // If inspecting a RESULT_CORRECTED block, find its original RESULT_PUBLISHED block for diff view!
  const originalForDiff = useMemo(() => {
    if (
      !data ||
      !selectedBlock ||
      selectedBlock.eventType !== LedgerEventType.RESULT_CORRECTED
    ) {
      return null;
    }
    const targetResultId = selectedBlock.payload.resultId;
    return (
      data.entries.find(
        (e) =>
          e.eventType === LedgerEventType.RESULT_PUBLISHED &&
          e.payload.resultId === targetResultId
      ) ?? null
    );
  }, [data, selectedBlock]);

  const invalidSequences = useMemo(() => {
    const set = new Set<number>();
    for (const iss of data?.issues ?? []) {
      if (iss.firstInvalidBlock !== null) set.add(iss.firstInvalidBlock);
    }
    return set;
  }, [data]);

  return (
    <AppShell
      title="Cryptographic Ledger Explorer"
      breadcrumb="VeriMark / Cryptography / Hash-Chain Explorer"
    >
      {loading || !data ? (
        <div className="p-12 text-center text-sm text-slate-500 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl">
          Loading append-only signed ledger…
        </div>
      ) : (
        <div className="space-y-6">
          {/* External Checkpoint Header */}
          <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              {data.integrityStatus === 'VERIFIED' ? (
                <ShieldCheck
                  className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <ShieldAlert
                  className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
              )}
              <div>
                <h2 className="font-display font-bold text-base">
                  External Signed Checkpoint Anchor
                </h2>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                  {data.checkpoint
                    ? `Anchored Head: Block #${data.checkpoint.sequence} · Hash ${data.checkpoint.blockHash.slice(
                        0,
                        24
                      )}… · Authority ${data.checkpoint.authorityKeyId}`
                    : 'No external checkpoint file found'}
                </p>
              </div>
            </div>
            <StatusLabel
              tone={
                data.integrityStatus === 'VERIFIED' && data.checkpointValid
                  ? 'verified'
                  : 'danger'
              }
              label={
                data.integrityStatus === 'VERIFIED'
                  ? `Chain Verified (${data.entries.length} Blocks)`
                  : `Tampering Detected (First Block #${
                      data.firstInvalidBlock ?? '?'
                    })`
              }
              icon="shield"
            />
          </section>

          {/* Visual Hash-Chain Diagram */}
          <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-sm">
                Visual Hash-Chain Diagram (Click Any Block to Inspect)
              </h2>
              <span className="text-xs text-slate-500">
                Each block commits to previous_hash + payload_hash + Ed25519 signature
              </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {data.entries.map((entry, idx) => {
                const isSelected = entry.sequence === selectedSeq;
                const isFlagged =
                  invalidSequences.has(entry.sequence) ||
                  (data.firstInvalidBlock !== null &&
                    entry.sequence >= data.firstInvalidBlock);
                const isCheckpointHead =
                  data.checkpoint?.sequence === entry.sequence;

                return (
                  <div key={entry.sequence} className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedSeq(entry.sequence)}
                      className={`text-left p-3 rounded-lg border w-44 transition-colors ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : isFlagged
                          ? 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-slate-900 dark:text-white'
                          : 'bg-slate-50 dark:bg-[#0B1120] border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono font-bold">
                        <span>Block #{entry.sequence}</span>
                        {isCheckpointHead && (
                          <span
                            className={`text-[10px] ${
                              isSelected ? 'text-emerald-200' : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            HEAD
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-[11px] font-medium truncate mt-1 ${
                          isSelected ? 'text-indigo-100' : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {entry.eventType.replace(/_/g, ' ')}
                      </p>
                      <p
                        className={`text-[10px] font-mono truncate mt-1 ${
                          isSelected ? 'text-indigo-200' : 'text-slate-400'
                        }`}
                      >
                        {entry.blockHash.slice(0, 16)}…
                      </p>
                    </button>
                    {idx < data.entries.length - 1 && (
                      <ArrowRight
                        className="w-4 h-4 text-slate-400 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Split Table + Block Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-7 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-3 px-4 font-semibold">Seq</th>
                      <th className="py-3 px-4 font-semibold">Event Type</th>
                      <th className="py-3 px-4 font-semibold">Block Hash</th>
                      <th className="py-3 px-4 font-semibold">Signer Key</th>
                      <th className="py-3 px-4 font-semibold">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.entries.map((entry) => {
                      const active = entry.sequence === selectedSeq;
                      return (
                        <tr
                          key={entry.sequence}
                          onClick={() => setSelectedSeq(entry.sequence)}
                          className={`cursor-pointer ${
                            active
                              ? 'bg-indigo-50/70 dark:bg-indigo-950/35'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3 px-4 font-mono font-bold tabular-nums">
                            #{entry.sequence}
                          </td>
                          <td className="py-3 px-4 font-medium">
                            {entry.eventType}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {entry.blockHash.slice(0, 14)}…
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {entry.publisherKeyId}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                            {new Date(entry.timestamp).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Block Inspector */}
            <section className="lg:col-span-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              {selectedBlock ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display font-bold text-base inline-flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                      <span>Block #{selectedBlock.sequence} Inspector</span>
                    </h2>
                    <span className="font-mono text-xs text-slate-500">
                      {selectedBlock.eventId}
                    </span>
                  </div>

                  <dl className="space-y-2 text-xs">
                    <div>
                      <dt className="text-slate-500">Event Type</dt>
                      <dd className="font-mono font-semibold">
                        {selectedBlock.eventType} (schema v{selectedBlock.schemaVersion})
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Previous Block Hash</dt>
                      <dd className="font-mono text-[11px] break-all text-slate-600 dark:text-slate-400">
                        {selectedBlock.previousHash}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Payload SHA-256</dt>
                      <dd className="font-mono text-[11px] break-all text-slate-600 dark:text-slate-400">
                        {selectedBlock.payloadHash}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Block Hash</dt>
                      <dd className="font-mono text-[11px] break-all text-indigo-600 dark:text-indigo-400">
                        {selectedBlock.blockHash}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">
                        Ed25519 Signature ({selectedBlock.publisherKeyId})
                      </dt>
                      <dd className="font-mono text-[11px] break-all text-slate-600 dark:text-slate-400">
                        {selectedBlock.signature}
                      </dd>
                    </div>
                  </dl>

                  {/* Side-by-side Diff for RESULT_CORRECTED blocks */}
                  {originalForDiff && (
                    <div className="p-3.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900 space-y-2 text-xs">
                      <p className="font-semibold text-amber-800 dark:text-amber-300">
                        Correction Diff vs. Original Block #{originalForDiff.sequence}
                      </p>
                      <div className="grid grid-cols-2 gap-3 font-mono">
                        <div>
                          <span className="text-slate-500 block">Original (v1)</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {String(originalForDiff.payload.obtainedMarks)} /{' '}
                            {String(originalForDiff.payload.maxMarks)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">
                            Corrected (v{String(selectedBlock.payload.newVersion)})
                          </span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">
                            {String(selectedBlock.payload.newMarks)} /{' '}
                            {String(selectedBlock.payload.maxMarks)}
                          </span>
                        </div>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300">
                        Reason: {String(selectedBlock.payload.reason ?? '')}
                      </p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500">
                      Canonical Event Payload
                    </p>
                    <pre className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 text-[11px] font-mono overflow-x-auto max-h-64">
                      {JSON.stringify(selectedBlock.payload, null, 2)}
                    </pre>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  Select a ledger block to inspect its cryptographic headers and payload.
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}
