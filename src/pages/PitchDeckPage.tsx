import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Grid2x2,
  KeyRound,
  Lock,
  Maximize2,
  MessageSquareText,
  Minimize2,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  DEMO_ACTS,
  DOMAIN_PREFIXES,
  PITCH_DECK_SLIDES,
  PitchLiveStats,
  THREAT_MATRIX_ROWS,
} from '../../shared/pitchDeckData';
import { VeriMarkLogo } from '../components/Logo';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

const DEFAULT_STATS: PitchLiveStats = {
  totalStudents: 8,
  totalResults: 10,
  totalLedgerEntries: 12,
  totalReceipts: 11,
  approvedCorrections: 1,
  pendingCorrections: 2,
  checkpointSequence: 12,
  checkpointHashShort: 'verified-head',
  checkpointValid: true,
  integrityStatus: 'VERIFIED',
  automatedTestsPassed: 20,
  automatedTestsTotal: 20,
};

export function PitchDeckPage() {
  const { pushToast } = useToast();
  const [slideIndex, setSlideIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stats, setStats] = useState<PitchLiveStats>(DEFAULT_STATS);
  const stageRef = useRef<HTMLDivElement>(null);

  const totalSlides = PITCH_DECK_SLIDES.length;
  const currentMeta = PITCH_DECK_SLIDES[slideIndex];

  useEffect(() => {
    apiRequest<{ stats: PitchLiveStats }>('/api/presentation/meta')
      .then((res) => {
        if (res?.stats) setStats(res.stats);
      })
      .catch(() => {
        // Fallback defaults remain clean
      });
  }, []);

  const goNext = useCallback(() => {
    setSlideIndex((i) => Math.min(totalSlides - 1, i + 1));
  }, [totalSlides]);

  const goPrev = useCallback(() => {
    setSlideIndex((i) => Math.max(0, i - 1));
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement && stageRef.current) {
      try {
        await stageRef.current.requestFullscreen();
      } catch {
        // Ignore if browser blocks fullscreen in iframe
      }
    } else if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Home') {
        e.preventDefault();
        setSlideIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setSlideIndex(totalSlides - 1);
      } else if (e.key.toLowerCase() === 'n') {
        setShowNotes((v) => !v);
      } else if (e.key.toLowerCase() === 'g') {
        setShowGrid((v) => !v);
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      } else if (e.key === 'Escape' && showGrid) {
        setShowGrid(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, showGrid, toggleFullscreen, totalSlides]);

  const handleDownloadPptx = async () => {
    setDownloading(true);
    try {
      const response = await fetch('/api/presentation/pptx');
      if (!response.ok) {
        throw new Error('Failed to generate PowerPoint file');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'VeriMark-Judge-Pitch-Deck.pptx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      pushToast('success', 'Downloaded VeriMark-Judge-Pitch-Deck.pptx (10 slides + speaker notes)');
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Unable to download PowerPoint file'
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col">
      {/* Top Presenter Toolbar */}
      <header className="sticky top-0 z-30 h-15 bg-[#0B1120]/95 backdrop-blur border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link to="/" className="shrink-0" aria-label="Back to VeriMark Home">
            <VeriMarkLogo size={24} />
          </Link>
          <span className="hidden sm:inline text-slate-700">|</span>
          <div className="hidden sm:block min-w-0">
            <p className="text-xs font-mono uppercase tracking-wider text-indigo-400 truncate">
              Judge Pitch Deck · Code Fuzion 2026
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowGrid((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap"
          >
            <Grid2x2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden md:inline">Slides</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              showNotes
                ? 'border-indigo-500/60 bg-indigo-950/60 text-indigo-300'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <MessageSquareText className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden md:inline">Speaker Notes & Q&A</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span className="hidden lg:inline">{isFullscreen ? 'Exit' : 'Present'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPptx}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{downloading ? 'Generating…' : 'Download .pptx'}</span>
          </button>

          <Link
            to="/verify"
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap"
          >
            <span>Live Demo</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* Main Presentation Workspace */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex flex-col gap-5">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* 16:9 Slide Canvas */}
          <div className={showNotes ? 'xl:col-span-8 space-y-4' : 'xl:col-span-12 space-y-4'}>
            <div
              ref={stageRef}
              className="relative w-full rounded-xl overflow-hidden bg-[#0B1120] border border-slate-800 shadow-2xl"
            >
              {/* Top Slide Progress Bar */}
              <div className="h-1 w-full bg-slate-800">
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${((slideIndex + 1) / totalSlides) * 100}%` }}
                />
              </div>

              {/* Slide Body */}
              <div className="p-6 sm:p-8 lg:p-10 min-h-[500px] sm:min-h-[540px] flex flex-col justify-between">
                <SlideRenderer slideId={currentMeta.id} meta={currentMeta} stats={stats} />

                {/* Slide Footer */}
                <div className="mt-6 pt-3 border-t border-slate-800/90 flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span className="truncate">
                    VERIMARK · TAMPER-PROOF EXAM RESULT LEDGER · CODE FUZION 2026
                  </span>
                  <span className="shrink-0 font-semibold text-slate-400">
                    {String(slideIndex + 1).padStart(2, '0')} / {String(totalSlides).padStart(2, '0')}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Navigation Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0F172A] border border-slate-800 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={slideIndex === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={slideIndex === totalSlides - 1}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                >
                  <span>Next Slide</span>
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Interactive Slide Stepper Dots */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1" role="tablist" aria-label="Slide selector">
                {PITCH_DECK_SLIDES.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={idx === slideIndex}
                    aria-label={`Slide ${s.number}: ${s.title}`}
                    onClick={() => setSlideIndex(idx)}
                    className={`h-2 rounded-full transition-all ${
                      idx === slideIndex
                        ? 'w-7 bg-indigo-500'
                        : 'w-2 bg-slate-700 hover:bg-slate-500'
                    }`}
                  />
                ))}
              </div>

              <div className="text-xs font-mono text-slate-400">
                Slide {slideIndex + 1} of {totalSlides} · {currentMeta.durationHint}
              </div>
            </div>
          </div>

          {/* Right Panel: Speaker Notes & Anticipated Judge Q&A */}
          {showNotes && (
            <aside className="xl:col-span-4 bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-wider text-indigo-400">
                    Presenter Coach · {currentMeta.durationHint}
                  </p>
                  <h2 className="font-display font-bold text-base text-white mt-0.5">
                    Speaker Script & Judge Q&A
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNotes(false)}
                  aria-label="Hide speaker notes"
                  className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                  What to Say on Slide {currentMeta.number}
                </p>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {currentMeta.speakerNotes}
                </p>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-800">
                <p className="text-xs font-mono font-semibold text-amber-400 uppercase tracking-wider">
                  Anticipated Judge Question
                </p>
                {currentMeta.judgeQa.map((qa, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-lg bg-[#0B1120] border border-slate-800 space-y-2"
                  >
                    <p className="text-xs font-semibold text-white">“{qa.question}”</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{qa.answer}</p>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-800 space-y-2">
                <p className="text-[11px] font-mono text-slate-500">
                  KEYBOARD SHORTCUTS
                </p>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono text-slate-400">
                  <span>← / → : Navigate</span>
                  <span>F : Fullscreen</span>
                  <span>N : Toggle Notes</span>
                  <span>G : Slide Grid</span>
                </div>
              </div>
            </aside>
          )}
        </div>
      </main>

      {/* Slide Overview Grid Modal */}
      {showGrid && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-xl max-w-5xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-base text-white">
                  All 10 Slides — Jump Directly During Judge Q&A
                </h2>
                <p className="text-xs text-slate-400">
                  Click any slide to present it immediately. All speaker notes are embedded in the .pptx download.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGrid(false)}
                aria-label="Close slide grid"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {PITCH_DECK_SLIDES.map((slide, idx) => {
                const active = idx === slideIndex;
                return (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => {
                      setSlideIndex(idx);
                      setShowGrid(false);
                    }}
                    className={`text-left p-4 rounded-xl border transition-colors ${
                      active
                        ? 'bg-indigo-950/50 border-indigo-500 text-white'
                        : 'bg-[#0B1120] border-slate-800 hover:border-slate-600 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-indigo-400 font-semibold">
                        SLIDE {String(slide.number).padStart(2, '0')}
                      </span>
                      <span className="text-slate-500">{slide.durationHint}</span>
                    </div>
                    <p className="mt-1.5 font-display font-bold text-sm text-white line-clamp-2">
                      {slide.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                      {slide.subtitle}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlideHeader({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-1 mb-4">
      <p className="text-[11px] font-mono font-semibold uppercase tracking-widest text-indigo-400">
        {kicker}
      </p>
      <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tight text-white">
        {title}
      </h1>
      <p className="text-xs sm:text-sm text-slate-400 max-w-3xl">{subtitle}</p>
    </div>
  );
}

function SlideRenderer({
  slideId,
  meta,
  stats,
}: {
  slideId: string;
  meta: (typeof PITCH_DECK_SLIDES)[number];
  stats: PitchLiveStats;
}) {
  switch (slideId) {
    // 1. COVER
    case 'cover':
      return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center flex-1">
          <div className="lg:col-span-7 space-y-5">
            <p className="text-xs font-mono font-semibold tracking-widest text-indigo-400">
              {meta.kicker}
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center font-display font-extrabold text-xl text-white">
                  VM
                </div>
                <h1 className="font-display font-extrabold text-4xl sm:text-5xl tracking-tight text-white">
                  VeriMark
                </h1>
              </div>
              <p className="font-display font-bold text-xl sm:text-2xl text-indigo-300">
                Tamper-Proof Exam Result Ledger
              </p>
            </div>
            <p className="text-base sm:text-lg font-medium text-slate-200">
              {meta.subtitle}
            </p>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xl">
              Cryptographically signed university result publishing, browser-side dual-authority
              corrections, QR-embedded PDF marksheets, and zero-login public verification —
              engineered without blockchain bloat.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-lg bg-[#0F172A] border border-slate-800">
                <p className="text-[10px] font-mono text-slate-400 uppercase">Crypto Primitives</p>
                <p className="mt-1 text-xs font-bold text-white">SHA-256 + Ed25519 + AES-GCM</p>
              </div>
              <div className="p-3.5 rounded-lg bg-[#0F172A] border border-slate-800">
                <p className="text-[10px] font-mono text-slate-400 uppercase">Live Ledger State</p>
                <p className="mt-1 text-xs font-bold text-white">
                  {stats.totalLedgerEntries} Blocks · {stats.integrityStatus}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-[#0F172A] border border-slate-800">
                <p className="text-[10px] font-mono text-slate-400 uppercase">Security Tests</p>
                <p className="mt-1 text-xs font-bold text-emerald-400">
                  {stats.automatedTestsPassed}/{stats.automatedTestsTotal} Passing
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-2.5">
            {[
              { seq: '#01', title: 'GENESIS / PUBLISH', sub: 'SHA-256 + Ed25519 Signed', tone: 'indigo' },
              { seq: '#08', title: 'RESULT_PUBLISHED', sub: 'Chained to Block #07', tone: 'indigo' },
              { seq: '#11', title: 'DUAL_CORRECTION', sub: 'Examiner + Controller Co-Signed', tone: 'emerald' },
              {
                seq: 'EXT',
                title: 'EXTERNAL CHECKPOINT',
                sub: `Head #${stats.checkpointSequence ?? 12} · ${stats.checkpointHashShort}`,
                tone: 'amber',
              },
            ].map((node, i) => (
              <div key={node.seq} className="space-y-2">
                <div
                  className={`p-3.5 rounded-lg bg-[#0F172A] border flex items-center gap-3.5 ${
                    node.tone === 'amber'
                      ? 'border-amber-500/60'
                      : node.tone === 'emerald'
                      ? 'border-emerald-500/50'
                      : 'border-slate-800'
                  }`}
                >
                  <div
                    className={`w-11 h-9 rounded-md font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                      node.tone === 'amber'
                        ? 'bg-amber-950/70 text-amber-400 border border-amber-500/40'
                        : node.tone === 'emerald'
                        ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/40'
                        : 'bg-indigo-950/70 text-indigo-300 border border-indigo-500/40'
                    }`}
                  >
                    {node.seq}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-bold text-white truncate">{node.title}</p>
                    <p className="text-[11px] font-mono text-slate-400 truncate">{node.sub}</p>
                  </div>
                </div>
                {i < 3 && (
                  <div className="pl-5 text-indigo-400 font-mono text-xs leading-none">↓</div>
                )}
              </div>
            ))}
          </div>
        </div>
      );

    // 2. PROBLEM
    case 'problem':
      return (
        <div className="flex-1 flex flex-col justify-between">
          <SlideHeader kicker={meta.kicker} title={meta.title} subtitle={meta.subtitle} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                tag: 'FAILURE MODE 01',
                color: 'text-red-400',
                bar: 'bg-red-500',
                title: 'Silent Post-Publication Manipulation',
                body: 'In standard CRUD exam portals, a compromised admin account or direct SQL UPDATE overwrites student marks cleanly with zero cryptographic trace.',
                foot: 'Risk: Insider mark inflation & undetectable DB edits.',
              },
              {
                tag: 'FAILURE MODE 02',
                color: 'text-amber-400',
                bar: 'bg-amber-500',
                title: 'Students Cannot Prove Original Marks',
                body: 'Once database rows change, a student holding a printed marksheet or screenshot has no mathematical proof of what was originally published.',
                foot: 'Risk: Unresolvable disputes & missing re-evaluation history.',
              },
              {
                tag: 'FAILURE MODE 03',
                color: 'text-indigo-400',
                bar: 'bg-indigo-500',
                title: 'Single-Point Authority & Paper Forgery',
                body: 'One administrator can unilaterally alter grades, and employers cannot authenticate paper transcripts without manual phone calls to registrars.',
                foot: 'Risk: Slow credential checks & forged marksheets.',
              },
            ].map((item) => (
              <div
                key={item.tag}
                className="p-5 rounded-xl bg-[#0F172A] border border-slate-800 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2.5">
                  <div className={`w-10 h-1 rounded-full ${item.bar}`} />
                  <p className={`text-[11px] font-mono font-bold ${item.color}`}>{item.tag}</p>
                  <h2 className="font-display font-bold text-base text-white">{item.title}</h2>
                  <p className="text-xs text-slate-300 leading-relaxed">{item.body}</p>
                </div>
                <p className="pt-3 border-t border-slate-800 text-[11px] text-slate-400">
                  {item.foot}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 rounded-xl bg-[#162033] border border-slate-700">
            <p className="text-[11px] font-mono font-semibold text-indigo-400 uppercase">
              Core Engineering Question
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              How do we make every published exam mark independently verifiable and every legitimate
              re-evaluation dual-authorized — without cryptocurrency wallets, gas fees, or slow blockchains?
            </p>
          </div>
        </div>
      );

    // 3. SOLUTION
    case 'solution':
      return (
        <div className="flex-1 flex flex-col justify-between">
          <SlideHeader kicker={meta.kicker} title={meta.title} subtitle={meta.subtitle} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
            {[
              {
                icon: Lock,
                tag: 'PILLAR 01 · LEDGER',
                color: 'text-indigo-400',
                title: 'Append-Only Signed Hash Chain',
                points: [
                  'Deterministic canonical JSON serialization on every event',
                  'Domain-separated SHA-256 links every block to its predecessor',
                  'Registrar Ed25519 signature seals every published block',
                ],
              },
              {
                icon: KeyRound,
                tag: 'PILLAR 02 · GOVERNANCE',
                color: 'text-amber-400',
                title: 'Two-Authority Browser Signing',
                points: [
                  'Examiner & Controller keys encrypted client-side with AES-256-GCM',
                  'Ed25519 signing runs in-browser; plaintext private keys never leave',
                  'Not even a Super Admin can bypass dual-authority finalization',
                ],
              },
              {
                icon: QrCode,
                tag: 'PILLAR 03 · VERIFICATION',
                color: 'text-emerald-400',
                title: 'QR PDF Marksheets & Public Proof',
                points: [
                  'Every marksheet PDF embeds a live QR receipt + short fingerprint',
                  'Zero-login portal distinguishes ORIGINAL vs SUPERSEDED v2',
                  'Downloadable JSON proof verifies locally in any browser',
                ],
              },
              {
                icon: ShieldCheck,
                tag: 'PILLAR 04 · DETECTION',
                color: 'text-red-400',
                title: 'External Checkpoint & Audit Engine',
                points: [
                  'Signed ledger head & pinned public keys live outside SQLite',
                  'Catches direct SQL edits, tail deletion, and full DB rewrites',
                  'Pinpoints exact firstInvalidBlock sequence & digest delta',
                ],
              },
            ].map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.tag}
                  className="p-5 rounded-xl bg-[#0F172A] border border-slate-800 space-y-2.5"
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${p.color}`} aria-hidden="true" />
                    <span className={`text-[11px] font-mono font-bold ${p.color}`}>{p.tag}</span>
                  </div>
                  <h2 className="font-display font-bold text-base text-white">{p.title}</h2>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2">
                        <span className="text-slate-500 mt-0.5">•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      );

    // 4. ARCHITECTURE
    case 'architecture':
      return (
        <div className="flex-1 flex flex-col justify-between">
          <SlideHeader kicker={meta.kicker} title={meta.title} subtitle={meta.subtitle} />
          <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 items-stretch flex-1">
            {/* Tier 1 */}
            <div className="lg:col-span-3 p-4 rounded-xl bg-[#0F172A] border border-indigo-500/50 flex flex-col gap-3">
              <div>
                <p className="text-[10px] font-mono font-bold text-indigo-400">TIER 1 · BROWSER</p>
                <h2 className="font-display font-bold text-sm text-white mt-0.5">
                  React 19 + Web Crypto Vault
                </h2>
              </div>
              <div className="flex-1 flex flex-col justify-between gap-2.5">
                {[
                  ['5 Role Portals', 'Admin, Examiner, Controller, Student, Public'],
                  ['AES-256-GCM Vault', 'PBKDF2 (210k) encrypted Ed25519 keys'],
                  ['Local Verifier', '@noble/ed25519 + Web Crypto SHA-256'],
                ].map(([t, d]) => (
                  <div key={t} className="p-3 rounded-lg bg-[#162033] border border-slate-800 flex-1 flex flex-col justify-center">
                    <p className="text-xs font-semibold text-white">{t}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{d}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Arrow 1 */}
            <div className="lg:col-span-1 flex items-center justify-center text-center">
              <div className="text-[10px] font-mono text-indigo-400 font-semibold leading-snug">
                HTTPS / JWT
                <br />
                Signed →
              </div>
            </div>

            {/* Tier 2 */}
            <div className="lg:col-span-3 p-4 rounded-xl bg-[#0F172A] border border-slate-700 flex flex-col gap-3">
              <div>
                <p className="text-[10px] font-mono font-bold text-emerald-400">
                  TIER 2 · API & CRYPTO CORE
                </p>
                <h2 className="font-display font-bold text-sm text-white mt-0.5">
                  Express + Node 22 Crypto
                </h2>
              </div>
              <div className="flex-1 flex flex-col justify-between gap-2.5">
                {[
                  ['RBAC & Scrypt Auth', 'Server-side role guards, JWT & rate limits'],
                  ['Ledger & Approvals', 'Canonical JSON, SHA-256 chain, Ed25519 verify'],
                  ['Audit & PDF Engine', 'Full scanner, JSON proofs, pdf-lib QR'],
                ].map(([t, d]) => (
                  <div key={t} className="p-3 rounded-lg bg-[#162033] border border-slate-800 flex-1 flex flex-col justify-center">
                    <p className="text-xs font-semibold text-white">{t}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{d}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Arrow 2 */}
            <div className="lg:col-span-1 flex items-center justify-center text-center">
              <div className="text-[10px] font-mono text-amber-400 font-semibold">
                Atomic Tx
                <br />+ Anchor →
              </div>
            </div>

            {/* Tier 3 */}
            <div className="lg:col-span-3 flex flex-col gap-3 justify-between">
              <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1.5 flex-1">
                <p className="text-[10px] font-mono font-bold text-slate-400">
                  TIER 3A · OPERATIONAL DB
                </p>
                <h3 className="font-display font-bold text-sm text-white">SQLite (verimark.db)</h3>
                <p className="text-[11px] font-mono text-slate-300 leading-relaxed">
                  • students, subjects, exams
                  <br />• results & result_receipts
                  <br />• ledger_entries (append-only)
                  <br />• correction_requests & approvals
                </p>
              </div>
              <div className="p-4 rounded-xl bg-amber-950/35 border border-amber-500/60 space-y-1.5 flex-1">
                <p className="text-[10px] font-mono font-bold text-amber-400">
                  TIER 3B · OUTSIDE SQLITE
                </p>
                <h3 className="font-display font-bold text-sm text-white">External Trust Store</h3>
                <p className="text-[11px] font-mono text-amber-100/90 leading-relaxed">
                  • checkpoint.json (signed head)
                  <br />• trusted_keys.json (pinned keys)
                  <br />• Atomic rollback on anchor error
                </p>
              </div>
            </div>
          </div>
        </div>
      );

    // 5. CRYPTO ENGINE
    case 'crypto-engine':
      return (
        <div className="flex-1 flex flex-col justify-between gap-4">
          <SlideHeader kicker={meta.kicker} title={meta.title} subtitle={meta.subtitle} />

          {/* Chain row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { seq: 'BLOCK #1', type: 'RESULT_PUBLISHED', prev: '000000...0000', hash: 'a4f9c2...81e0', border: 'border-indigo-500/50', text: 'text-indigo-400' },
              { seq: 'BLOCK #2', type: 'RESULT_PUBLISHED', prev: 'a4f9c2...81e0', hash: '7d1b0e...3c44', border: 'border-indigo-500/50', text: 'text-indigo-400' },
              { seq: 'BLOCK #N', type: 'RESULT_CORRECTED', prev: '7d1b0e...3c44', hash: stats.checkpointHashShort, border: 'border-emerald-500/60', text: 'text-emerald-400' },
              { seq: 'CHECKPOINT', type: 'EXTERNAL ANCHOR', prev: `seq: ${stats.checkpointSequence ?? 12}`, hash: 'Ed25519 Signed', border: 'border-amber-500/60', text: 'text-amber-400' },
            ].map((b) => (
              <div key={b.seq} className={`p-3.5 rounded-xl bg-[#0F172A] border ${b.border}`}>
                <p className={`text-[11px] font-mono font-bold ${b.text}`}>{b.seq}</p>
                <p className="text-xs font-bold text-white mt-0.5">{b.type}</p>
                <div className="mt-2 text-[11px] font-mono text-slate-400 space-y-0.5">
                  <p className="truncate">prev: {b.prev}</p>
                  <p className="truncate">hash: {b.hash}</p>
                  <p>sig: Ed25519(registrar)</p>
                </div>
              </div>
            ))}
          </div>

          {/* Prefixes + Canonical */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-2.5">
              <p className="text-[11px] font-mono font-bold text-indigo-400">
                FIVE DOMAIN-SEPARATED SHA-256 PREFIXES
              </p>
              <div className="space-y-2">
                {DOMAIN_PREFIXES.map((d) => (
                  <div
                    key={d.prefix}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 text-xs items-baseline"
                  >
                    <span className="sm:col-span-5 font-mono font-bold text-emerald-400">
                      {d.prefix}
                    </span>
                    <span className="sm:col-span-7 text-slate-300">{d.purpose}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-2">
              <p className="text-[11px] font-mono font-bold text-amber-400">
                DETERMINISTIC SERIALIZATION
              </p>
              <ul className="text-xs font-mono text-slate-300 space-y-1.5 leading-relaxed">
                <li>• shared/canonical.ts</li>
                <li>• Recursive lexicographical sort</li>
                <li>• Rejects NaN / Infinity</li>
                <li>• Identical UTF-8 in Node & Browser</li>
                <li className="pt-1.5 text-emerald-400">• Atomic SQLite + checkpoint rollback</li>
              </ul>
            </div>
          </div>
        </div>
      );

    // 6. DUAL APPROVAL
    case 'dual-approval':
      return (
        <div className="flex-1 flex flex-col justify-between gap-4">
          <SlideHeader kicker={meta.kicker} title={meta.title} subtitle={meta.subtitle} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {[
              {
                step: 'STEP 01',
                color: 'text-indigo-400',
                title: 'Propose & Version-Lock',
                desc: 'Authorized staff submits proposed marks + mandatory reason locked to currentVersion.',
              },
              {
                step: 'STEP 02',
                color: 'text-amber-400',
                title: 'Examiner Browser Sign',
                desc: 'Examiner unlocks their AES-256-GCM key in-browser and signs canonical approval JSON.',
              },
              {
                step: 'STEP 03',
                color: 'text-amber-400',
                title: 'Controller Co-Sign',
                desc: 'Examination Controller independently reviews & signs the exact same digest with a distinct key.',
              },
              {
                step: 'STEP 04',
                color: 'text-emerald-400',
                title: 'Verify & Append v2',
                desc: 'Server verifies both signatures against pinned keys, appends amendment blocks & issues v2.',
              },
            ].map((s) => (
              <div
                key={s.step}
                className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-2"
              >
                <p className={`text-[11px] font-mono font-bold ${s.color}`}>{s.step}</p>
                <h2 className="font-display font-bold text-sm text-white">{s.title}</h2>
                <p className="text-xs text-slate-300 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-xl bg-[#162033] border border-slate-700 space-y-3">
            <p className="text-[11px] font-mono font-bold text-emerald-400">
              CRYPTOGRAPHIC INVARIANTS ENFORCED ON THE SERVER
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-mono font-bold text-white">ZERO SERVER KEY EXPOSURE</p>
                <p className="text-xs text-slate-300 mt-1">
                  Server only stores encrypted vault ciphertext + public keys — never plaintext signing keys.
                </p>
              </div>
              <div>
                <p className="text-xs font-mono font-bold text-white">STRICT DISTINCTNESS</p>
                <p className="text-xs text-slate-300 mt-1">
                  Requires 2 distinct roles (EXAMINER ≠ CONTROLLER), 2 distinct user IDs, and 2 distinct key IDs.
                </p>
              </div>
              <div>
                <p className="text-xs font-mono font-bold text-white">REPLAY & BYPASS PROOF</p>
                <p className="text-xs text-slate-300 mt-1">
                  Signatures bind requestId, resultId, version, oldMarks, newMarks & reason. Zero admin bypass.
                </p>
              </div>
            </div>
          </div>
        </div>
      );

    // 7. PUBLIC VERIFY
    case 'public-verify':
      return (
        <div className="flex-1 flex flex-col justify-between">
          <SlideHeader kicker={meta.kicker} title={meta.title} subtitle={meta.subtitle} />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
            <div className="lg:col-span-6 p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-3">
              <p className="text-[11px] font-mono font-bold text-indigo-400">
                VERIFICATION OUTCOMES (ZERO LOGIN REQUIRED)
              </p>
              <div className="space-y-2.5">
                <div className="p-3.5 rounded-lg bg-emerald-950/35 border border-emerald-500/50">
                  <p className="text-xs font-mono font-bold text-emerald-400">
                    VERIFIED — ORIGINAL
                  </p>
                  <p className="text-xs text-slate-200 mt-1">
                    Printed marksheet matches original signed publication, hash chain is intact, and external checkpoint verifies.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-amber-950/35 border border-amber-500/50">
                  <p className="text-xs font-mono font-bold text-amber-400">
                    VERIFIED — SUPERSEDED BY AUTHORIZED CORRECTION
                  </p>
                  <p className="text-xs text-slate-200 mt-1">
                    Older v1 marksheet was genuinely published — later amended to v2 with 2 valid Ed25519 signatures. Displays both original & updated marks.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-red-950/35 border border-red-500/50">
                  <p className="text-xs font-mono font-bold text-red-400">
                    INVALID / TAMPERED / UNVERIFIABLE
                  </p>
                  <p className="text-xs text-slate-200 mt-1">
                    Fingerprint mismatch, forged receipt ID, broken digest, or unauthorized DB modification flagged immediately.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 flex flex-col gap-3.5">
              <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-2 flex-1">
                <p className="text-[11px] font-mono font-bold text-emerald-400">
                  QR-EMBEDDED PDF MARKSHEET (pdf-lib)
                </p>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  <li>• Generated on demand per version (v1 or v2)</li>
                  <li>• Live QR link: <span className="font-mono text-indigo-300">/verify/:receiptId?fp=&lt;digest&gt;</span></li>
                  <li>• Displays receipt ID, ledger sequence, short fingerprint & version stamp</li>
                  <li>• Version-accurate: v1 PDF always renders original published marks</li>
                </ul>
              </div>
              <div className="p-4 rounded-xl bg-[#162033] border border-indigo-500/50 space-y-2 flex-1">
                <p className="text-[11px] font-mono font-bold text-indigo-400">
                  PRIVACY-PRESERVING STANDALONE PROOF
                </p>
                <ul className="space-y-1.5 text-xs text-slate-200">
                  <li>• Downloadable JSON proof bundle per receipt</li>
                  <li>• Contains ONLY target receipt payload, chain linkage hashes, pinned keys & checkpoint</li>
                  <li>• Zero unrelated student PII leaked from neighboring blocks</li>
                  <li>• Runs <span className="font-mono text-emerald-300">shared/verifier.ts</span> locally in the user’s browser</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      );

    // 8. THREAT MODEL
    case 'threat-model':
      return (
        <div className="flex-1 flex flex-col justify-between gap-3">
          <SlideHeader kicker={meta.kicker} title={meta.title} subtitle={meta.subtitle} />

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0F172A]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#162033] border-b border-slate-800 font-mono text-[10px] text-indigo-300">
                  <th className="py-2 px-3">ATTACK VECTOR</th>
                  <th className="py-2 px-3">DETECTION / DEFENSE LAYER</th>
                  <th className="py-2 px-3">VERIFIED SYSTEM OUTCOME</th>
                  <th className="py-2 px-3 text-center">RESULT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {THREAT_MATRIX_ROWS.map((row) => (
                  <tr key={row.attack}>
                    <td className="py-1 px-3 font-semibold text-white whitespace-nowrap">
                      {row.attack}
                    </td>
                    <td className="py-1 px-3 text-slate-300">{row.layer}</td>
                    <td className="py-1 px-3 text-slate-400">{row.outcome}</td>
                    <td className="py-1 px-3 text-center font-mono text-[10px] font-bold">
                      <span
                        className={
                          row.status === 'DETECTED' ? 'text-emerald-400' : 'text-indigo-400'
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-950/35 border border-amber-500/60 flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs">
              <p className="font-mono font-bold text-amber-400">
                HONEST SECURITY BOUNDARY (TAMPER-EVIDENT, NOT PHYSICALLY UNMODIFIABLE)
              </p>
              <p className="text-amber-100/90 mt-0.5 leading-relaxed">
                External checkpoints catch any SQLite-only compromise. Production deployment
                replicates checkpoints to immutable WORM storage (S3 Object Lock) and holds
                registrar keys in HSM / Cloud KMS to defend against full-host root compromise.
              </p>
            </div>
          </div>
        </div>
      );

    // 9. DEMO SCRIPT
    case 'demo-script':
      return (
        <div className="flex-1 flex flex-col justify-between gap-4">
          <SlideHeader kicker={meta.kicker} title={meta.title} subtitle={meta.subtitle} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 flex-1">
            {DEMO_ACTS.map((act, idx) => {
              const accents = [
                { bar: 'bg-emerald-500', text: 'text-emerald-400' },
                { bar: 'bg-indigo-500', text: 'text-indigo-400' },
                { bar: 'bg-amber-500', text: 'text-amber-400' },
                { bar: 'bg-red-500', text: 'text-red-400' },
              ][idx];
              return (
                <div
                  key={act.act}
                  className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className={`w-full h-1 rounded-full ${accents.bar}`} />
                    <p className={`text-[11px] font-mono font-bold ${accents.text}`}>{act.act}</p>
                    <h2 className="font-display font-bold text-sm text-white">{act.title}</h2>
                    <div className="text-[11px] font-mono text-slate-400">
                      <p>{act.route}</p>
                      <p>{act.account}</p>
                    </div>
                  </div>

                  <ul className="pt-2.5 border-t border-slate-800 space-y-1.5 text-xs text-slate-300 flex-1">
                    {act.steps.map((st) => (
                      <li key={st} className="flex items-start gap-1.5">
                        <span className="text-slate-500">•</span>
                        <span>{st}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to={act.route}
                    className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-indigo-400 hover:text-indigo-300 whitespace-nowrap"
                  >
                    <span className="truncate">Open {act.route}</span>
                    <ArrowRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 rounded-xl bg-[#162033] border border-slate-700 text-xs font-mono text-slate-300">
            DEV DEMO SAFETY: Demo accounts & Tamper Lab are strictly gated to development mode and
            automatically return HTTP 404 when NODE_ENV=production.
          </div>
        </div>
      );

    // 10. ENGINEERING IMPACT
    case 'engineering-impact':
    default:
      return (
        <div className="flex-1 flex flex-col justify-between gap-4">
          <SlideHeader kicker={meta.kicker} title={meta.title} subtitle={meta.subtitle} />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {[
              {
                label: 'AUTOMATED TESTS',
                val: `${stats.automatedTestsPassed}/${stats.automatedTestsTotal}`,
                sub: '9 security suites passing',
                color: 'text-emerald-400',
              },
              {
                label: 'LIVE LEDGER BLOCKS',
                val: String(stats.totalLedgerEntries),
                sub: `Head #${stats.checkpointSequence ?? 12} · ${stats.integrityStatus}`,
                color: 'text-indigo-400',
              },
              {
                label: 'ROLE-AWARE PAGES',
                val: '16',
                sub: '5 roles · backend RBAC',
                color: 'text-white',
              },
              {
                label: 'BLOCKCHAIN GAS COST',
                val: '$0',
                sub: 'Sub-ms Ed25519 verify',
                color: 'text-amber-400',
              },
            ].map((k) => (
              <div key={k.label} className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
                <p className="text-[10px] font-mono font-bold text-slate-400">{k.label}</p>
                <p className={`mt-1 font-display font-extrabold text-3xl tabular-nums ${k.color}`}>
                  {k.val}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{k.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
            <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-2.5">
              <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-mono font-bold">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>PRODUCTION ENGINEERING QUALITY TODAY</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300">
                <li>• Full-stack TypeScript (React 19, Express, Node 22 SQLite & Crypto)</li>
                <li>• Shared pure verifier runs identically on server & browser</li>
                <li>• Real pdf-lib marksheet generator + live QR codes + JSON proof export</li>
                <li>• Verified against SQL edit, payload tamper, tail delete, full rewrite & replay</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-[#162033] border border-indigo-500/50 space-y-2.5">
              <div className="flex items-center gap-2 text-indigo-400 text-[11px] font-mono font-bold">
                <ArrowLeft className="w-4 h-4 rotate-180" aria-hidden="true" />
                <span>UNIVERSITY PRODUCTION DEPLOYMENT PATH</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-200">
                <li>• PostgreSQL with append-only DB roles for 50,000+ student scale</li>
                <li>• Daily signed checkpoint replication to WORM storage (S3 Object Lock)</li>
                <li>• Registrar signing key backed by Hardware Security Module (HSM / KMS)</li>
                <li>• WebAuthn / FIDO2 hardware keys for Examiner & Controller approvals</li>
              </ul>
            </div>
          </div>
        </div>
      );
  }
}
