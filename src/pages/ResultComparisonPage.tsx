import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GitCompareArrows } from 'lucide-react';
import { ResultRecord } from '../../shared/types';
import { ResultComparisonResponse } from '../../shared/v2Types';
import { AppShell } from '../components/AppShell';
import { ResultComparisonPanel } from '../components/v2/ResultProofAndComparison';
import { EmptyState, LoadingSkeleton } from '../components/v2/UiPrimitives';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

export function ResultComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pushToast } = useToast();

  const [results, setResults] = useState<ResultRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>(
    searchParams.get('resultId') ?? ''
  );
  const [comparison, setComparison] = useState<ResultComparisonResponse | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingComparison, setLoadingComparison] = useState(false);

  useEffect(() => {
    setLoadingList(true);
    apiRequest<{ results: ResultRecord[] }>('/api/results')
      .then((res) => {
        setResults(res.results);
        if (!selectedId && res.results.length > 0) {
          // Prefer a corrected result (version > 1) first so the side-by-side diff shines immediately
          const corrected = res.results.find((r) => r.version > 1);
          setSelectedId((corrected ?? res.results[0]).id);
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
  }, [pushToast, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingComparison(true);
    apiRequest<ResultComparisonResponse>(
      `/api/results/${encodeURIComponent(selectedId)}/comparison`
    )
      .then(setComparison)
      .catch((err) =>
        pushToast(
          'error',
          'Could not load version comparison',
          err instanceof Error ? err.message : undefined
        )
      )
      .finally(() => setLoadingComparison(false));
  }, [selectedId, pushToast]);

  const handleChange = (id: string) => {
    setSelectedId(id);
    setSearchParams({ resultId: id });
  };

  return (
    <AppShell
      title="Result Comparison (Original vs. Corrected)"
      breadcrumb="VeriMark 2.0 / Result Version Comparison"
    >
      <div className="space-y-6">
        {loadingList ? (
          <LoadingSkeleton rows={3} />
        ) : results.length === 0 ? (
          <EmptyState
            icon={GitCompareArrows}
            title="No published results to compare"
            description="Published and corrected examination results will appear here for side-by-side cryptographic version comparison."
          />
        ) : (
          <>
            <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
              <label
                htmlFor="comparison-result-select"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Select Examination Result to Compare Across Ledger Versions
              </label>
              <select
                id="comparison-result-select"
                value={selectedId}
                onChange={(e) => handleChange(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
              >
                {results.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.registrationNumber} — {r.subjectCode} ({r.subjectName}) · Current:{' '}
                    {r.obtainedMarks}/{r.maxMarks} · v{r.version}
                    {r.version > 1 ? ' [Corrected]' : ' [Original]'}
                  </option>
                ))}
              </select>
            </section>

            {loadingComparison || !comparison ? (
              <LoadingSkeleton rows={3} />
            ) : (
              <ResultComparisonPanel comparison={comparison} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
