import PptxGenJS from 'pptxgenjs';
import {
  DEMO_ACTS,
  DOMAIN_PREFIXES,
  PITCH_DECK_SLIDES,
  PitchLiveStats,
  THREAT_MATRIX_ROWS,
} from '../shared/pitchDeckData';

// VeriMark Visual Identity Palette (hex without # for PptxGenJS)
const C = {
  bg: '0B1120',       // Deep midnight navy canvas
  surface: '0F172A',  // Elevated slate surface
  surfaceAlt: '162033',
  border: '1E293B',   // Crisp 1pt border
  borderBright: '334155',
  indigo: '4F46E5',   // Primary brand accent
  indigoSoft: '1E1B4B',
  indigoLight: '818CF8',
  emerald: '10B981',  // Verified state
  emeraldSoft: '064E3B',
  amber: 'F59E0B',    // Pending / boundary
  amberSoft: '451A03',
  red: 'EF4444',      // Tamper alert
  redSoft: '450A0A',
  white: 'F8FAFC',
  text: 'E2E8F0',
  muted: '94A3B8',
  dim: '64748B',
} as const;

const FONT_HEAD = 'Segoe UI';
const FONT_BODY = 'Segoe UI';
const FONT_MONO = 'Consolas';

function formatNotes(slideIdx: number): string {
  const meta = PITCH_DECK_SLIDES[slideIdx];
  if (!meta) return '';
  const qa = meta.judgeQa
    .map((item, i) => `Q${i + 1}: ${item.question}\nA${i + 1}: ${item.answer}`)
    .join('\n\n');
  return `[${meta.durationHint}] SPEAKER NOTES:\n${meta.speakerNotes}\n\nANTICIPATED JUDGE Q&A:\n${qa}`;
}

function addSlideChrome(
  slide: PptxGenJS.Slide,
  slideNumber: number,
  totalSlides: number,
  kicker: string,
  title: string,
  subtitle?: string
) {
  slide.background = { color: C.bg };

  // Top hairline indigo progress bar
  const progressW = (13.333 * slideNumber) / totalSlides;
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.05,
    fill: { color: C.border },
    line: { color: C.border, width: 0 },
  });
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: progressW,
    h: 0.05,
    fill: { color: C.indigo },
    line: { color: C.indigo, width: 0 },
  });

  // Kicker
  slide.addText(kicker, {
    x: 0.65,
    y: 0.32,
    w: 10.0,
    h: 0.28,
    fontFace: FONT_MONO,
    fontSize: 10,
    bold: true,
    color: C.indigoLight,
    charSpacing: 1.5,
  });

  // Slide Title
  slide.addText(title, {
    x: 0.65,
    y: 0.62,
    w: 12.0,
    h: 0.52,
    fontFace: FONT_HEAD,
    fontSize: 25,
    bold: true,
    color: C.white,
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.65,
      y: 1.14,
      w: 11.8,
      h: 0.42,
      fontFace: FONT_BODY,
      fontSize: 12.5,
      color: C.muted,
    });
  }

  // Footer hairline & branding
  slide.addShape('line', {
    x: 0.65,
    y: 7.02,
    w: 12.033,
    h: 0,
    line: { color: C.border, width: 0.75 },
  });

  slide.addText('VERIMARK  ·  TAMPER-PROOF EXAM RESULT LEDGER  ·  CODE FUZION 2026', {
    x: 0.65,
    y: 7.1,
    w: 8.5,
    h: 0.25,
    fontFace: FONT_MONO,
    fontSize: 8.5,
    color: C.dim,
  });

  slide.addText(`${String(slideNumber).padStart(2, '0')} / ${String(totalSlides).padStart(2, '0')}`, {
    x: 11.2,
    y: 7.1,
    w: 1.48,
    h: 0.25,
    align: 'right',
    fontFace: FONT_MONO,
    fontSize: 9,
    bold: true,
    color: C.muted,
  });
}

function addCard(
  slide: PptxGenJS.Slide,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    fill?: string;
    border?: string;
    radius?: number;
  }
) {
  slide.addShape('roundRect', {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: opts.h,
    rectRadius: opts.radius ?? 0.08,
    fill: { color: opts.fill ?? C.surface },
    line: { color: opts.border ?? C.border, width: 1 },
  });
}

export async function generateJudgePitchPptx(
  stats: PitchLiveStats
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
  pptx.author = 'VeriMark Team — Code Fuzion 2026';
  pptx.company = 'Demo University · Lovely Professional University Hackathon';
  pptx.subject = 'VeriMark — Tamper-Proof Exam Result Ledger Judge Pitch Deck';
  pptx.title = 'VeriMark — Judge Presentation';

  const total = PITCH_DECK_SLIDES.length;

  // =========================================================================
  // SLIDE 1 — EXECUTIVE TITLE COVER
  // =========================================================================
  {
    const s = pptx.addSlide();
    s.background = { color: C.bg };
    s.addNotes(formatNotes(0));

    // Top accent bar
    s.addShape('rect', {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.08,
      fill: { color: C.indigo },
      line: { color: C.indigo, width: 0 },
    });

    // Subtle decorative architectural block grid on right
    const gridBlocks = [
      { x: 9.2, y: 1.15, seq: '#01', label: 'GENESIS / PUBLISH', color: C.indigo },
      { x: 9.2, y: 2.35, seq: '#08', label: 'RESULT_PUBLISHED', color: C.indigo },
      { x: 9.2, y: 3.55, seq: '#11', label: 'DUAL_CORRECTION', color: C.emerald },
      { x: 9.2, y: 4.75, seq: 'EXT', label: 'SIGNED CHECKPOINT', color: C.amber },
    ];
    gridBlocks.forEach((b, idx) => {
      addCard(s, {
        x: b.x,
        y: b.y,
        w: 3.45,
        h: 0.92,
        fill: C.surface,
        border: idx === 3 ? C.amber : C.borderBright,
      });
      s.addShape('roundRect', {
        x: b.x + 0.16,
        y: b.y + 0.22,
        w: 0.62,
        h: 0.46,
        rectRadius: 0.06,
        fill: { color: idx === 3 ? C.amberSoft : idx === 2 ? C.emeraldSoft : C.indigoSoft },
        line: { color: b.color, width: 1 },
      });
      s.addText(b.seq, {
        x: b.x + 0.16,
        y: b.y + 0.28,
        w: 0.62,
        h: 0.34,
        align: 'center',
        fontFace: FONT_MONO,
        fontSize: 10,
        bold: true,
        color: b.color,
      });
      s.addText(b.label, {
        x: b.x + 0.92,
        y: b.y + 0.18,
        w: 2.35,
        h: 0.26,
        fontFace: FONT_MONO,
        fontSize: 10,
        bold: true,
        color: C.white,
      });
      s.addText(
        idx === 3
          ? `Head #${stats.checkpointSequence ?? 12} · ${stats.checkpointHashShort}`
          : 'SHA-256 + Ed25519 Verified',
        {
          x: b.x + 0.92,
          y: b.y + 0.48,
          w: 2.38,
          h: 0.24,
          fontFace: FONT_MONO,
          fontSize: 8.5,
          color: C.muted,
        }
      );
      if (idx < gridBlocks.length - 1) {
        s.addShape('line', {
          x: b.x + 0.47,
          y: b.y + 0.92,
          w: 0,
          h: 0.28,
          line: { color: C.indigoLight, width: 1.5 },
        });
      }
    });

    // Event kicker
    s.addText('CODE FUZION 2026  ·  LOVELY PROFESSIONAL UNIVERSITY', {
      x: 0.75,
      y: 1.18,
      w: 8.0,
      h: 0.32,
      fontFace: FONT_MONO,
      fontSize: 11,
      bold: true,
      color: C.indigoLight,
      charSpacing: 1.5,
    });

    // Shield emblem box + brand name
    s.addShape('roundRect', {
      x: 0.75,
      y: 1.65,
      w: 0.76,
      h: 0.76,
      rectRadius: 0.14,
      fill: { color: C.indigo },
      line: { color: C.indigoLight, width: 1 },
    });
    s.addText('VM', {
      x: 0.75,
      y: 1.78,
      w: 0.76,
      h: 0.5,
      align: 'center',
      fontFace: FONT_HEAD,
      fontSize: 22,
      bold: true,
      color: C.white,
    });

    s.addText('VeriMark', {
      x: 1.68,
      y: 1.62,
      w: 6.5,
      h: 0.85,
      fontFace: FONT_HEAD,
      fontSize: 48,
      bold: true,
      color: C.white,
    });

    s.addText('Tamper-Proof Exam Result Ledger', {
      x: 0.75,
      y: 2.62,
      w: 8.0,
      h: 0.52,
      fontFace: FONT_HEAD,
      fontSize: 24,
      bold: true,
      color: C.indigoLight,
    });

    s.addText('Every Mark Verified. Every Change Accountable.', {
      x: 0.75,
      y: 3.24,
      w: 7.9,
      h: 0.45,
      fontFace: FONT_BODY,
      fontSize: 17,
      color: C.text,
    });

    s.addText(
      'Cryptographically signed university result publishing, browser-side dual-authority corrections, QR-embedded PDF marksheets, and instant zero-login public verification — built without blockchain bloat.',
      {
        x: 0.75,
        y: 3.82,
        w: 7.8,
        h: 1.05,
        fontFace: FONT_BODY,
        fontSize: 13.5,
        color: C.muted,
        lineSpacingMultiple: 1.35,
      }
    );

    // Bottom live metrics strip on cover
    const coverStats = [
      { label: 'CRYPTO PRIMITIVES', value: 'SHA-256 + Ed25519 + AES-GCM' },
      { label: 'LIVE LEDGER STATE', value: `${stats.totalLedgerEntries} Signed Blocks · ${stats.integrityStatus}` },
      { label: 'SECURITY TESTS', value: `${stats.automatedTestsPassed}/${stats.automatedTestsTotal} Passing` },
    ];
    coverStats.forEach((item, i) => {
      const cx = 0.75 + i * 2.75;
      addCard(s, { x: cx, y: 5.55, w: 2.58, h: 0.95, fill: C.surface, border: C.border });
      s.addText(item.label, {
        x: cx + 0.16,
        y: 5.68,
        w: 2.26,
        h: 0.24,
        fontFace: FONT_MONO,
        fontSize: 8.5,
        bold: true,
        color: C.muted,
      });
      s.addText(item.value, {
        x: cx + 0.16,
        y: 5.96,
        w: 2.26,
        h: 0.38,
        fontFace: FONT_HEAD,
        fontSize: 11.5,
        bold: true,
        color: i === 2 ? C.emerald : C.white,
      });
    });

    s.addText('JUDGE PRESENTATION DECK  ·  DEMO UNIVERSITY', {
      x: 0.75,
      y: 6.9,
      w: 8.5,
      h: 0.28,
      fontFace: FONT_MONO,
      fontSize: 9.5,
      color: C.dim,
    });
  }

  // =========================================================================
  // SLIDE 2 — THE PROBLEM
  // =========================================================================
  {
    const s = pptx.addSlide();
    const meta = PITCH_DECK_SLIDES[1];
    addSlideChrome(s, 2, total, meta.kicker, meta.title, meta.subtitle);
    s.addNotes(formatNotes(1));

    const problems = [
      {
        num: '01',
        accent: C.red,
        title: 'Silent Post-Publication Manipulation',
        body: 'In standard university CRUD portals, a single compromised admin account or direct SQL UPDATE overwrites student marks cleanly — leaving zero cryptographic trace of what changed.',
        impact: 'Risk: Insider mark inflation, unauthorized grade tampering, undetectable DB edits.',
      },
      {
        num: '02',
        accent: C.amber,
        title: 'Students Cannot Prove Original Marks',
        body: 'Once portal rows change, a student holding an earlier printed marksheet or screenshot has no mathematical evidence proving what the university originally published.',
        impact: 'Risk: Unresolvable grade disputes & zero verifiable history across re-evaluations.',
      },
      {
        num: '03',
        accent: C.indigoLight,
        title: 'Single-Point Authority & Unverifiable PDFs',
        body: 'Traditional ERPs let one administrator unilaterally alter grades, and employers or registrars cannot verify a paper transcript without manual back-office phone calls.',
        impact: 'Risk: Slow credential verification, forged paper transcripts, weak governance.',
      },
    ];

    problems.forEach((p, idx) => {
      const x = 0.65 + idx * 4.1;
      addCard(s, { x, y: 1.8, w: 3.85, h: 3.7, fill: C.surface, border: C.border });
      s.addShape('rect', {
        x: x + 0.24,
        y: 2.02,
        w: 0.45,
        h: 0.06,
        fill: { color: p.accent },
        line: { color: p.accent, width: 0 },
      });
      s.addText(`FAILURE MODE ${p.num}`, {
        x: x + 0.24,
        y: 2.18,
        w: 3.35,
        h: 0.25,
        fontFace: FONT_MONO,
        fontSize: 9.5,
        bold: true,
        color: p.accent,
      });
      s.addText(p.title, {
        x: x + 0.24,
        y: 2.48,
        w: 3.35,
        h: 0.62,
        fontFace: FONT_HEAD,
        fontSize: 16,
        bold: true,
        color: C.white,
      });
      s.addText(p.body, {
        x: x + 0.24,
        y: 3.16,
        w: 3.35,
        h: 1.45,
        fontFace: FONT_BODY,
        fontSize: 11.5,
        color: C.text,
        lineSpacingMultiple: 1.32,
      });
      s.addShape('line', {
        x: x + 0.24,
        y: 4.72,
        w: 3.35,
        h: 0,
        line: { color: C.border, width: 0.75 },
      });
      s.addText(p.impact, {
        x: x + 0.24,
        y: 4.82,
        w: 3.35,
        h: 0.56,
        fontFace: FONT_BODY,
        fontSize: 10,
        color: C.muted,
      });
    });

    // Bottom contrast banner
    addCard(s, { x: 0.65, y: 5.78, w: 12.033, h: 0.95, fill: C.surfaceAlt, border: C.borderBright });
    s.addText('CORE ENGINEERING QUESTION', {
      x: 0.9,
      y: 5.92,
      w: 3.5,
      h: 0.24,
      fontFace: FONT_MONO,
      fontSize: 9.5,
      bold: true,
      color: C.indigoLight,
    });
    s.addText(
      'How do we make every published exam mark independently verifiable and every legitimate re-evaluation dual-authorized — without requiring cryptocurrency wallets, gas fees, or slow blockchains?',
      {
        x: 0.9,
        y: 6.18,
        w: 11.5,
        h: 0.46,
        fontFace: FONT_HEAD,
        fontSize: 12.5,
        bold: true,
        color: C.white,
      }
    );
  }

  // =========================================================================
  // SLIDE 3 — OUR SOLUTION (4 PILLARS)
  // =========================================================================
  {
    const s = pptx.addSlide();
    const meta = PITCH_DECK_SLIDES[2];
    addSlideChrome(s, 3, total, meta.kicker, meta.title, meta.subtitle);
    s.addNotes(formatNotes(2));

    const pillars = [
      {
        tag: 'PILLAR 01 · LEDGER',
        color: C.indigoLight,
        title: 'Append-Only Signed Hash Chain',
        bullets: [
          'Every published mark is serialized as deterministic canonical JSON.',
          'Domain-separated SHA-256 links every block to its predecessor.',
          'Registrar signs every block hash with Ed25519.',
        ],
      },
      {
        tag: 'PILLAR 02 · GOVERNANCE',
        color: C.amber,
        title: 'Two-Authority Browser Signing',
        bullets: [
          'Examiner + Examination Controller hold AES-256-GCM encrypted keys.',
          'Signing occurs in-browser via @noble/ed25519; private keys never leave.',
          'Super Admins cannot bypass dual-signature verification.',
        ],
      },
      {
        tag: 'PILLAR 03 · VERIFICATION',
        color: C.emerald,
        title: 'QR PDF Marksheets & Public Proof',
        bullets: [
          'Every marksheet PDF embeds a receipt QR + short fingerprint.',
          'Zero-login verification distinguishes ORIGINAL vs SUPERSEDED v2.',
          'Downloadable privacy-preserving JSON proof verifies locally in browser.',
        ],
      },
      {
        tag: 'PILLAR 04 · DETECTION',
        color: C.red,
        title: 'External Checkpoint & Audit Engine',
        bullets: [
          'Signed ledger-head checkpoint + pinned keys live outside SQLite.',
          'Catches direct SQL edits, tail deletion, and full DB rewrites.',
          'Pinpoints the exact first invalid block sequence & hash delta.',
        ],
      },
    ];

    pillars.forEach((p, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 0.65 + col * 6.14;
      const y = 1.78 + row * 2.56;

      addCard(s, { x, y, w: 5.89, h: 2.34, fill: C.surface, border: C.border });
      s.addText(p.tag, {
        x: x + 0.26,
        y: y + 0.2,
        w: 5.3,
        h: 0.25,
        fontFace: FONT_MONO,
        fontSize: 9.5,
        bold: true,
        color: p.color,
      });
      s.addText(p.title, {
        x: x + 0.26,
        y: y + 0.48,
        w: 5.3,
        h: 0.36,
        fontFace: FONT_HEAD,
        fontSize: 16,
        bold: true,
        color: C.white,
      });
      s.addText(
        p.bullets.map((b) => ({
          text: b,
          options: { bullet: { code: '2022' }, paraSpaceAfter: 6 },
        })),
        {
          x: x + 0.26,
          y: y + 0.94,
          w: 5.35,
          h: 1.25,
          fontFace: FONT_BODY,
          fontSize: 11.5,
          color: C.text,
          valign: 'top',
        }
      );
    });
  }

  // =========================================================================
  // SLIDE 4 — SYSTEM ARCHITECTURE DIAGRAM
  // =========================================================================
  {
    const s = pptx.addSlide();
    const meta = PITCH_DECK_SLIDES[3];
    addSlideChrome(s, 4, total, meta.kicker, meta.title, meta.subtitle);
    s.addNotes(formatNotes(3));

    // Tier 1: Client / Browser
    addCard(s, { x: 0.65, y: 1.82, w: 3.45, h: 4.82, fill: C.surface, border: C.indigo });
    s.addText('TIER 1 · CLIENT BROWSER', {
      x: 0.85,
      y: 2.0,
      w: 3.05,
      h: 0.24,
      fontFace: FONT_MONO,
      fontSize: 9.5,
      bold: true,
      color: C.indigoLight,
    });
    s.addText('React 19 + Web Crypto Vault', {
      x: 0.85,
      y: 2.28,
      w: 3.05,
      h: 0.38,
      fontFace: FONT_HEAD,
      fontSize: 14.5,
      bold: true,
      color: C.white,
    });

    const clientBoxes = [
      { t: '5 Role-Scoped Portals', d: 'Super Admin, Examiner, Controller, Student, Public Verifier' },
      { t: 'Browser Key Vault', d: 'PBKDF2 (210k) + AES-256-GCM encrypted Ed25519 keys' },
      { t: 'Local Proof Verifier', d: '@noble/ed25519 + WebCrypto SHA-256 independent checks' },
    ];
    clientBoxes.forEach((cb, i) => {
      const cy = 2.84 + i * 1.18;
      addCard(s, { x: 0.85, y: cy, w: 3.05, h: 1.0, fill: C.surfaceAlt, border: C.border });
      s.addText(cb.t, {
        x: 1.0,
        y: cy + 0.14,
        w: 2.75,
        h: 0.26,
        fontFace: FONT_HEAD,
        fontSize: 11.5,
        bold: true,
        color: C.white,
      });
      s.addText(cb.d, {
        x: 1.0,
        y: cy + 0.42,
        w: 2.75,
        h: 0.48,
        fontFace: FONT_BODY,
        fontSize: 10,
        color: C.muted,
      });
    });

    // Arrow 1 -> 2
    s.addText('HTTPS / JWT\nSignatures Only →', {
      x: 4.14,
      y: 3.7,
      w: 1.05,
      h: 0.72,
      align: 'center',
      fontFace: FONT_MONO,
      fontSize: 8,
      bold: true,
      color: C.indigoLight,
    });

    // Tier 2: Backend API & Services
    addCard(s, { x: 5.22, y: 1.82, w: 3.5, h: 4.82, fill: C.surface, border: C.borderBright });
    s.addText('TIER 2 · API & CRYPTO CORE', {
      x: 5.42,
      y: 2.0,
      w: 3.1,
      h: 0.24,
      fontFace: FONT_MONO,
      fontSize: 9.5,
      bold: true,
      color: C.emerald,
    });
    s.addText('Express + Node 22 Crypto', {
      x: 5.42,
      y: 2.28,
      w: 3.1,
      h: 0.38,
      fontFace: FONT_HEAD,
      fontSize: 14.5,
      bold: true,
      color: C.white,
    });

    const apiBoxes = [
      { t: 'RBAC & Scrypt Auth', d: 'Strict server-side role guards, JWT sessions, rate limits' },
      { t: 'Ledger & Dual-Approval', d: 'Canonical JSON, SHA-256 chain, Ed25519 verify, atomic commit' },
      { t: 'Audit, Verify & PDF Engine', d: 'Full integrity scanner, privacy proofs, pdf-lib QR marksheets' },
    ];
    apiBoxes.forEach((ab, i) => {
      const cy = 2.84 + i * 1.18;
      addCard(s, { x: 5.42, y: cy, w: 3.1, h: 1.0, fill: C.surfaceAlt, border: C.border });
      s.addText(ab.t, {
        x: 5.57,
        y: cy + 0.14,
        w: 2.8,
        h: 0.26,
        fontFace: FONT_HEAD,
        fontSize: 11.5,
        bold: true,
        color: C.white,
      });
      s.addText(ab.d, {
        x: 5.57,
        y: cy + 0.42,
        w: 2.8,
        h: 0.48,
        fontFace: FONT_BODY,
        fontSize: 10,
        color: C.muted,
      });
    });

    // Arrows 2 -> 3
    s.addText('SQL Tx →', {
      x: 8.76,
      y: 2.75,
      w: 0.72,
      h: 0.34,
      align: 'center',
      fontFace: FONT_MONO,
      fontSize: 8.5,
      bold: true,
      color: C.muted,
    });
    s.addText('Anchor →', {
      x: 8.76,
      y: 5.15,
      w: 0.72,
      h: 0.34,
      align: 'center',
      fontFace: FONT_MONO,
      fontSize: 8.5,
      bold: true,
      color: C.amber,
    });

    // Tier 3A: SQLite Operational DB
    addCard(s, { x: 9.52, y: 1.82, w: 3.16, h: 2.28, fill: C.surface, border: C.border });
    s.addText('TIER 3A · OPERATIONAL DB', {
      x: 9.7,
      y: 1.98,
      w: 2.8,
      h: 0.24,
      fontFace: FONT_MONO,
      fontSize: 9,
      bold: true,
      color: C.muted,
    });
    s.addText('SQLite (verimark.db)', {
      x: 9.7,
      y: 2.24,
      w: 2.8,
      h: 0.32,
      fontFace: FONT_HEAD,
      fontSize: 13.5,
      bold: true,
      color: C.white,
    });
    s.addText(
      '• students, subjects, exams\n• results (current version)\n• ledger_entries (append-only)\n• correction_requests & approvals\n• result_receipts & audit_runs',
      {
        x: 9.7,
        y: 2.62,
        w: 2.82,
        h: 1.35,
        fontFace: FONT_MONO,
        fontSize: 9,
        color: C.text,
        lineSpacingMultiple: 1.35,
      }
    );

    // Tier 3B: External Trust Store (Highlighted Boundary!)
    addCard(s, { x: 9.52, y: 4.3, w: 3.16, h: 2.34, fill: C.amberSoft, border: C.amber });
    s.addText('TIER 3B · OUTSIDE SQLITE', {
      x: 9.7,
      y: 4.46,
      w: 2.8,
      h: 0.24,
      fontFace: FONT_MONO,
      fontSize: 9,
      bold: true,
      color: C.amber,
    });
    s.addText('External Trust Store', {
      x: 9.7,
      y: 4.72,
      w: 2.8,
      h: 0.32,
      fontFace: FONT_HEAD,
      fontSize: 13.5,
      bold: true,
      color: C.white,
    });
    s.addText(
      '• checkpoint.json\n  Signed latest seq + blockHash\n• trusted_keys.json\n  Pinned Registrar, Examiner &\n  Controller public keys\n• Rollback on write failure',
      {
        x: 9.7,
        y: 5.1,
        w: 2.82,
        h: 1.42,
        fontFace: FONT_MONO,
        fontSize: 9,
        color: C.white,
        lineSpacingMultiple: 1.32,
      }
    );
  }

  // =========================================================================
  // SLIDE 5 — CRYPTOGRAPHIC INTEGRITY ENGINE
  // =========================================================================
  {
    const s = pptx.addSlide();
    const meta = PITCH_DECK_SLIDES[4];
    addSlideChrome(s, 5, total, meta.kicker, meta.title, meta.subtitle);
    s.addNotes(formatNotes(4));

    // Visual hash chain diagram across top
    const chainNodes = [
      { seq: 'BLOCK #1', type: 'RESULT_PUBLISHED', prev: '000000...0000', hash: 'a4f9c2...81e0', border: C.indigo },
      { seq: 'BLOCK #2', type: 'RESULT_PUBLISHED', prev: 'a4f9c2...81e0', hash: '7d1b0e...3c44', border: C.indigo },
      { seq: 'BLOCK #N', type: 'RESULT_CORRECTED', prev: '7d1b0e...3c44', hash: stats.checkpointHashShort, border: C.emerald },
      { seq: 'CHECKPOINT', type: 'EXTERNAL ANCHOR', prev: `seq: ${stats.checkpointSequence ?? 12}`, hash: 'Ed25519 Signed', border: C.amber },
    ];

    chainNodes.forEach((n, idx) => {
      const nx = 0.65 + idx * 3.08;
      addCard(s, {
        x: nx,
        y: 1.78,
        w: 2.75,
        h: 1.56,
        fill: idx === 3 ? C.amberSoft : C.surface,
        border: n.border,
      });
      s.addText(n.seq, {
        x: nx + 0.16,
        y: 1.9,
        w: 2.43,
        h: 0.24,
        fontFace: FONT_MONO,
        fontSize: 10,
        bold: true,
        color: idx === 3 ? C.amber : idx === 2 ? C.emerald : C.indigoLight,
      });
      s.addText(n.type, {
        x: nx + 0.16,
        y: 2.16,
        w: 2.43,
        h: 0.24,
        fontFace: FONT_HEAD,
        fontSize: 10.5,
        bold: true,
        color: C.white,
      });
      s.addText(`prev: ${n.prev}\nhash: ${n.hash}\nsig:  Ed25519(registrar)`, {
        x: nx + 0.16,
        y: 2.48,
        w: 2.43,
        h: 0.78,
        fontFace: FONT_MONO,
        fontSize: 8.5,
        color: idx === 3 ? C.white : C.muted,
        lineSpacingMultiple: 1.3,
      });

      if (idx < chainNodes.length - 1) {
        s.addText('→', {
          x: nx + 2.76,
          y: 2.32,
          w: 0.32,
          h: 0.42,
          align: 'center',
          fontFace: FONT_HEAD,
          fontSize: 18,
          bold: true,
          color: C.indigoLight,
        });
      }
    });

    // Left bottom: 5 Domain-Separated SHA-256 Prefixes
    addCard(s, { x: 0.65, y: 3.6, w: 7.35, h: 3.16, fill: C.surface, border: C.border });
    s.addText('FIVE DOMAIN-SEPARATED SHA-256 PREFIXES', {
      x: 0.88,
      y: 3.76,
      w: 6.9,
      h: 0.26,
      fontFace: FONT_MONO,
      fontSize: 9.5,
      bold: true,
      color: C.indigoLight,
    });

    DOMAIN_PREFIXES.forEach((d, idx) => {
      const dy = 4.14 + idx * 0.5;
      s.addText(d.prefix, {
        x: 0.88,
        y: dy,
        w: 2.65,
        h: 0.36,
        fontFace: FONT_MONO,
        fontSize: 9.5,
        bold: true,
        color: C.emerald,
      });
      s.addText(d.purpose, {
        x: 3.55,
        y: dy,
        w: 4.25,
        h: 0.36,
        fontFace: FONT_BODY,
        fontSize: 10.5,
        color: C.text,
      });
    });

    // Right bottom: Canonical JSON + Atomic Guarantee
    addCard(s, { x: 8.22, y: 3.6, w: 4.46, h: 3.16, fill: C.surface, border: C.border });
    s.addText('DETERMINISTIC SERIALIZATION', {
      x: 8.45,
      y: 3.76,
      w: 4.0,
      h: 0.26,
      fontFace: FONT_MONO,
      fontSize: 9.5,
      bold: true,
      color: C.amber,
    });
    s.addText(
      'shared/canonical.ts\n• Recursive lexicographical key sort\n• Rejects NaN / Infinity values\n• Identical UTF-8 bytes in Node\n  & Browser Web Crypto\n\nATOMIC CHECKPOINT WRITE\n• SQLite tx + checkpoint.json\n• Rollback if anchor fails\n• Zero silent divergence',
      {
        x: 8.45,
        y: 4.12,
        w: 4.0,
        h: 2.48,
        fontFace: FONT_MONO,
        fontSize: 9.5,
        color: C.text,
        lineSpacingMultiple: 1.38,
      }
    );
  }

  // =========================================================================
  // SLIDE 6 — TWO-AUTHORITY BROWSER-SIDE CORRECTIONS
  // =========================================================================
  {
    const s = pptx.addSlide();
    const meta = PITCH_DECK_SLIDES[5];
    addSlideChrome(s, 6, total, meta.kicker, meta.title, meta.subtitle);
    s.addNotes(formatNotes(5));

    const steps = [
      {
        step: 'STEP 01',
        color: C.indigoLight,
        title: 'Propose & Version-Lock',
        desc: 'Staff submits proposed marks + mandatory written reason. Locked to result’s currentVersion (prevents stale overwrite).',
      },
      {
        step: 'STEP 02',
        color: C.amber,
        title: 'Examiner Browser Sign',
        desc: 'Examiner unlocks their AES-256-GCM encrypted key in-browser and produces an Ed25519 signature over canonical approval JSON.',
      },
      {
        step: 'STEP 03',
        color: C.amber,
        title: 'Controller Co-Sign',
        desc: 'Examination Controller independently inspects the proposal and signs the identical canonical digest with a distinct enrolled key.',
      },
      {
        step: 'STEP 04',
        color: C.emerald,
        title: 'Verify & Append v2',
        desc: 'Server verifies both signatures against pinned public keys, appends amendment blocks, issues v2 receipt, and re-anchors checkpoint.',
      },
    ];

    steps.forEach((st, idx) => {
      const sx = 0.65 + idx * 3.08;
      addCard(s, { x: sx, y: 1.82, w: 2.8, h: 2.75, fill: C.surface, border: C.border });
      s.addText(st.step, {
        x: sx + 0.2,
        y: 2.0,
        w: 2.4,
        h: 0.24,
        fontFace: FONT_MONO,
        fontSize: 9.5,
        bold: true,
        color: st.color,
      });
      s.addText(st.title, {
        x: sx + 0.2,
        y: 2.3,
        w: 2.4,
        h: 0.44,
        fontFace: FONT_HEAD,
        fontSize: 14,
        bold: true,
        color: C.white,
      });
      s.addText(st.desc, {
        x: sx + 0.2,
        y: 2.82,
        w: 2.4,
        h: 1.56,
        fontFace: FONT_BODY,
        fontSize: 10.5,
        color: C.text,
        lineSpacingMultiple: 1.32,
      });
      if (idx < 3) {
        s.addText('→', {
          x: sx + 2.8,
          y: 2.95,
          w: 0.28,
          h: 0.4,
          align: 'center',
          fontFace: FONT_HEAD,
          fontSize: 16,
          bold: true,
          color: C.indigoLight,
        });
      }
    });

    // Bottom enforcement invariants panel
    addCard(s, { x: 0.65, y: 4.86, w: 12.033, h: 1.88, fill: C.surfaceAlt, border: C.borderBright });
    s.addText('CRYPTOGRAPHIC INVARIANTS ENFORCED ON THE SERVER', {
      x: 0.9,
      y: 5.02,
      w: 11.5,
      h: 0.26,
      fontFace: FONT_MONO,
      fontSize: 9.5,
      bold: true,
      color: C.emerald,
    });

    const invariants = [
      { k: 'ZERO SERVER KEY EXPOSURE', v: 'Backend only stores encrypted vault ciphertext + public keys — never plaintext signing keys.' },
      { k: 'STRICT DISTINCTNESS', v: 'Requires 2 distinct roles (EXAMINER ≠ CONTROLLER), 2 distinct user IDs, and 2 distinct enrolled key IDs.' },
      { k: 'REPLAY & BYPASS PROOF', v: 'Signatures bind requestId, resultId, version, oldMarks, newMarks & reason. Super Admin has zero bypass route.' },
    ];
    invariants.forEach((inv, i) => {
      const ix = 0.9 + i * 3.92;
      s.addText(inv.k, {
        x: ix,
        y: 5.38,
        w: 3.68,
        h: 0.24,
        fontFace: FONT_MONO,
        fontSize: 9.5,
        bold: true,
        color: C.white,
      });
      s.addText(inv.v, {
        x: ix,
        y: 5.66,
        w: 3.68,
        h: 0.92,
        fontFace: FONT_BODY,
        fontSize: 10.5,
        color: C.muted,
        lineSpacingMultiple: 1.28,
      });
    });
  }

  // =========================================================================
  // SLIDE 7 — QR MARKSHEETS & PRIVACY-PRESERVING PUBLIC VERIFICATION
  // =========================================================================
  {
    const s = pptx.addSlide();
    const meta = PITCH_DECK_SLIDES[6];
    addSlideChrome(s, 7, total, meta.kicker, meta.title, meta.subtitle);
    s.addNotes(formatNotes(6));

    // Left: Verification States comparison
    addCard(s, { x: 0.65, y: 1.8, w: 6.15, h: 4.94, fill: C.surface, border: C.border });
    s.addText('VERIFICATION OUTCOMES (ZERO LOGIN REQUIRED)', {
      x: 0.88,
      y: 1.98,
      w: 5.65,
      h: 0.26,
      fontFace: FONT_MONO,
      fontSize: 9.5,
      bold: true,
      color: C.indigoLight,
    });

    const outcomes = [
      {
        status: 'VERIFIED — ORIGINAL',
        color: C.emerald,
        fill: C.emeraldSoft,
        desc: 'Marksheet matches original signed publication, hash chain is intact, and checkpoint matches.',
      },
      {
        status: 'VERIFIED — SUPERSEDED BY AUTHORIZED CORRECTION',
        color: C.amber,
        fill: C.amberSoft,
        desc: 'Old v1 paper marksheet was genuinely published — later amended to v2 with 2 valid Ed25519 signatures. Displays both original & current marks.',
      },
      {
        status: 'INVALID / TAMPERED / UNVERIFIABLE',
        color: C.red,
        fill: C.redSoft,
        desc: 'Short fingerprint mismatch, forged receipt ID, broken ledger digest, or tampered DB record flagged immediately.',
      },
    ];

    outcomes.forEach((o, idx) => {
      const oy = 2.4 + idx * 1.4;
      addCard(s, { x: 0.88, y: oy, w: 5.68, h: 1.24, fill: o.fill, border: o.color });
      s.addText(o.status, {
        x: 1.06,
        y: oy + 0.14,
        w: 5.32,
        h: 0.28,
        fontFace: FONT_MONO,
        fontSize: 9.5,
        bold: true,
        color: o.color,
      });
      s.addText(o.desc, {
        x: 1.06,
        y: oy + 0.45,
        w: 5.32,
        h: 0.68,
        fontFace: FONT_BODY,
        fontSize: 10.5,
        color: C.white,
        lineSpacingMultiple: 1.28,
      });
    });

    // Right: Printed PDF & Privacy Proof
    addCard(s, { x: 7.05, y: 1.8, w: 5.63, h: 2.34, fill: C.surface, border: C.border });
    s.addText('QR-EMBEDDED PDF MARKSHEET (pdf-lib)', {
      x: 7.28,
      y: 1.98,
      w: 5.15,
      h: 0.26,
      fontFace: FONT_MONO,
      fontSize: 9.5,
      bold: true,
      color: C.emerald,
    });
    s.addText(
      '• Generated on demand per version (v1 or v2)\n• Embeds live QR link: /verify/:receiptId?fp=<digest>\n• Displays receipt ID, ledger block sequence, short fingerprint & version stamp\n• Version-accurate: v1 PDF prints original marks even after v2 correction',
      {
        x: 7.28,
        y: 2.34,
        w: 5.15,
        h: 1.66,
        fontFace: FONT_BODY,
        fontSize: 11,
        color: C.text,
        lineSpacingMultiple: 1.38,
      }
    );

    addCard(s, { x: 7.05, y: 4.38, w: 5.63, h: 2.36, fill: C.surfaceAlt, border: C.indigo });
    s.addText('PRIVACY-PRESERVING STANDALONE PROOF', {
      x: 7.28,
      y: 4.56,
      w: 5.15,
      h: 0.26,
      fontFace: FONT_MONO,
      fontSize: 9.5,
      bold: true,
      color: C.indigoLight,
    });
    s.addText(
      '• Downloadable JSON proof bundle per receipt\n• Contains ONLY target receipt payload, chain linkage hashes, pinned public keys, and signed checkpoint\n• Zero unrelated student PII leaked from neighboring blocks\n• Browser runs shared/verifier.ts locally via Web Crypto + @noble/ed25519',
      {
        x: 7.28,
        y: 4.92,
        w: 5.15,
        h: 1.66,
        fontFace: FONT_BODY,
        fontSize: 11,
        color: C.text,
        lineSpacingMultiple: 1.38,
      }
    );
  }

  // =========================================================================
  // SLIDE 8 — THREAT MODEL & LIVE TAMPER DETECTION MATRIX
  // =========================================================================
  {
    const s = pptx.addSlide();
    const meta = PITCH_DECK_SLIDES[7];
    addSlideChrome(s, 8, total, meta.kicker, meta.title, meta.subtitle);
    s.addNotes(formatNotes(7));

    const headerRow: PptxGenJS.TableRow = [
      {
        text: 'ATTACK VECTOR',
        options: { bold: true, color: C.indigoLight, fill: { color: C.surfaceAlt }, fontFace: FONT_MONO, fontSize: 9 },
      },
      {
        text: 'DEFENSE / DETECTION LAYER',
        options: { bold: true, color: C.indigoLight, fill: { color: C.surfaceAlt }, fontFace: FONT_MONO, fontSize: 9 },
      },
      {
        text: 'VERIFIED SYSTEM OUTCOME',
        options: { bold: true, color: C.indigoLight, fill: { color: C.surfaceAlt }, fontFace: FONT_MONO, fontSize: 9 },
      },
      {
        text: 'RESULT',
        options: { bold: true, color: C.indigoLight, fill: { color: C.surfaceAlt }, fontFace: FONT_MONO, fontSize: 9, align: 'center' },
      },
    ];

    const bodyRows: PptxGenJS.TableRow[] = THREAT_MATRIX_ROWS.map((r, i) => {
      const rowFill = i % 2 === 0 ? C.surface : '111C31';
      return [
        { text: r.attack, options: { bold: true, color: C.white, fill: { color: rowFill }, fontFace: FONT_BODY, fontSize: 9.5 } },
        { text: r.layer, options: { color: C.text, fill: { color: rowFill }, fontFace: FONT_BODY, fontSize: 9.2 } },
        { text: r.outcome, options: { color: C.muted, fill: { color: rowFill }, fontFace: FONT_BODY, fontSize: 9.2 } },
        {
          text: r.status,
          options: {
            bold: true,
            color: r.status === 'DETECTED' ? C.emerald : C.indigoLight,
            fill: { color: rowFill },
            fontFace: FONT_MONO,
            fontSize: 8.5,
            align: 'center',
          },
        },
      ];
    });

    s.addTable([headerRow, ...bodyRows], {
      x: 0.65,
      y: 1.72,
      w: 12.033,
      colW: [3.0, 3.2, 4.733, 1.1],
      rowH: 0.41,
      border: { pt: 0.75, color: C.border },
      valign: 'middle',
      margin: [0.04, 0.08, 0.04, 0.08],
    });

    // Honest threat boundary strip
    addCard(s, { x: 0.65, y: 5.72, w: 12.033, h: 1.06, fill: C.amberSoft, border: C.amber });
    s.addText('HONEST SECURITY BOUNDARY (TAMPER-EVIDENT, NOT PHYSICALLY UNMODIFIABLE)', {
      x: 0.9,
      y: 5.84,
      w: 11.5,
      h: 0.24,
      fontFace: FONT_MONO,
      fontSize: 9.5,
      bold: true,
      color: C.amber,
    });
    s.addText(
      'External checkpoints detect any SQLite-only compromise. If a single host holds DB + registrar key + checkpoint, full root compromise is out of scope — production deployment replicates signed checkpoints to immutable WORM storage (S3 Object Lock) and stores registrar keys in HSM / Cloud KMS.',
      {
        x: 0.9,
        y: 6.12,
        w: 11.5,
        h: 0.56,
        fontFace: FONT_BODY,
        fontSize: 10.5,
        color: C.white,
        lineSpacingMultiple: 1.28,
      }
    );
  }

  // =========================================================================
  // SLIDE 9 — 3-MINUTE LIVE JUDGE DEMO SCRIPT
  // =========================================================================
  {
    const s = pptx.addSlide();
    const meta = PITCH_DECK_SLIDES[8];
    addSlideChrome(s, 9, total, meta.kicker, meta.title, meta.subtitle);
    s.addNotes(formatNotes(8));

    DEMO_ACTS.forEach((act, idx) => {
      const x = 0.65 + idx * 3.08;
      const accent =
        idx === 0 ? C.emerald : idx === 1 ? C.indigoLight : idx === 2 ? C.amber : C.red;

      addCard(s, { x, y: 1.8, w: 2.84, h: 4.1, fill: C.surface, border: C.border });
      s.addShape('rect', {
        x: x + 0.2,
        y: 2.0,
        w: 2.44,
        h: 0.06,
        fill: { color: accent },
        line: { color: accent, width: 0 },
      });
      s.addText(act.act, {
        x: x + 0.2,
        y: 2.16,
        w: 2.44,
        h: 0.24,
        fontFace: FONT_MONO,
        fontSize: 9.5,
        bold: true,
        color: accent,
      });
      s.addText(act.title, {
        x: x + 0.2,
        y: 2.44,
        w: 2.44,
        h: 0.54,
        fontFace: FONT_HEAD,
        fontSize: 14,
        bold: true,
        color: C.white,
      });
      s.addText(`${act.route}\n${act.account}`, {
        x: x + 0.2,
        y: 3.04,
        w: 2.44,
        h: 0.52,
        fontFace: FONT_MONO,
        fontSize: 8.5,
        color: C.muted,
      });
      s.addShape('line', {
        x: x + 0.2,
        y: 3.64,
        w: 2.44,
        h: 0,
        line: { color: C.border, width: 0.75 },
      });
      s.addText(
        act.steps.map((st) => ({
          text: st,
          options: { bullet: { code: '2022' }, paraSpaceAfter: 8 },
        })),
        {
          x: x + 0.2,
          y: 3.78,
          w: 2.44,
          h: 2.0,
          fontFace: FONT_BODY,
          fontSize: 10.5,
          color: C.text,
          valign: 'top',
        }
      );
    });

    // Bottom Demo Sandbox Note
    addCard(s, { x: 0.65, y: 6.1, w: 12.033, h: 0.68, fill: C.surfaceAlt, border: C.borderBright });
    s.addText(
      'DEV DEMO SAFETY:  Demo accounts & Tamper Lab are strictly gated to development mode and disabled automatically when NODE_ENV=production.',
      {
        x: 0.9,
        y: 6.26,
        w: 11.5,
        h: 0.34,
        fontFace: FONT_MONO,
        fontSize: 10,
        color: C.text,
      }
    );
  }

  // =========================================================================
  // SLIDE 10 — ENGINEERING RIGOR, LIVE METRICS & ROADMAP
  // =========================================================================
  {
    const s = pptx.addSlide();
    const meta = PITCH_DECK_SLIDES[9];
    addSlideChrome(s, 10, total, meta.kicker, meta.title, meta.subtitle);
    s.addNotes(formatNotes(9));

    // Top 4 KPI cards backed by live app state
    const kpis = [
      {
        label: 'AUTOMATED SECURITY TESTS',
        value: `${stats.automatedTestsPassed}/${stats.automatedTestsTotal}`,
        sub: '9 test suites · 100% passing',
        color: C.emerald,
      },
      {
        label: 'LIVE LEDGER BLOCKS',
        value: String(stats.totalLedgerEntries),
        sub: `Checkpoint #${stats.checkpointSequence ?? 12} · ${stats.integrityStatus}`,
        color: C.indigoLight,
      },
      {
        label: 'ROLE-AWARE SCREENS',
        value: '16',
        sub: '5 roles · strict backend RBAC',
        color: C.white,
      },
      {
        label: 'EXTERNAL BLOCKCHAIN COST',
        value: '$0',
        sub: 'Zero gas · Sub-ms Ed25519 verify',
        color: C.amber,
      },
    ];

    kpis.forEach((k, i) => {
      const kx = 0.65 + i * 3.08;
      addCard(s, { x: kx, y: 1.78, w: 2.84, h: 1.48, fill: C.surface, border: C.border });
      s.addText(k.label, {
        x: kx + 0.2,
        y: 1.94,
        w: 2.44,
        h: 0.24,
        fontFace: FONT_MONO,
        fontSize: 8.5,
        bold: true,
        color: C.muted,
      });
      s.addText(k.value, {
        x: kx + 0.2,
        y: 2.22,
        w: 2.44,
        h: 0.56,
        fontFace: FONT_HEAD,
        fontSize: 30,
        bold: true,
        color: k.color,
      });
      s.addText(k.sub, {
        x: kx + 0.2,
        y: 2.84,
        w: 2.44,
        h: 0.28,
        fontFace: FONT_BODY,
        fontSize: 9.5,
        color: C.muted,
      });
    });

    // Left: What's Built & Tested Today
    addCard(s, { x: 0.65, y: 3.52, w: 5.88, h: 3.22, fill: C.surface, border: C.border });
    s.addText('PRODUCTION ENGINEERING QUALITY TODAY', {
      x: 0.9,
      y: 3.7,
      w: 5.38,
      h: 0.26,
      fontFace: FONT_MONO,
      fontSize: 9.5,
      bold: true,
      color: C.emerald,
    });
    s.addText(
      [
        'Full-stack TypeScript (React 19, Express, Node 22 SQLite & Crypto)',
        'Shared pure verifier (shared/verifier.ts) runs identically on server & browser',
        'Real pdf-lib marksheet generator + live QR codes + JSON proof export',
        'Dark/Light academic security design system — desktop, tablet & mobile',
        'Verified against SQL edit, payload tamper, tail delete, full rewrite & replay',
      ].map((t) => ({ text: t, options: { bullet: { code: '2022' }, paraSpaceAfter: 8 } })),
      {
        x: 0.9,
        y: 4.08,
        w: 5.38,
        h: 2.48,
        fontFace: FONT_BODY,
        fontSize: 11,
        color: C.text,
        valign: 'top',
      }
    );

    // Right: University Scale Production Roadmap
    addCard(s, { x: 6.8, y: 3.52, w: 5.88, h: 3.22, fill: C.surfaceAlt, border: C.indigo });
    s.addText('UNIVERSITY PRODUCTION DEPLOYMENT PATH', {
      x: 7.05,
      y: 3.7,
      w: 5.38,
      h: 0.26,
      fontFace: FONT_MONO,
      fontSize: 9.5,
      bold: true,
      color: C.indigoLight,
    });
    s.addText(
      [
        'PostgreSQL with append-only DB roles for 50,000+ student scale',
        'Daily signed checkpoint replication to WORM storage (S3 Object Lock)',
        'Registrar signing key backed by Hardware Security Module (HSM / KMS)',
        'WebAuthn / FIDO2 hardware keys for Examiner & Controller approvals',
        'Bulk CSV signed batch publication for semester exam releases',
      ].map((t) => ({ text: t, options: { bullet: { code: '2022' }, paraSpaceAfter: 8 } })),
      {
        x: 7.05,
        y: 4.08,
        w: 5.38,
        h: 2.48,
        fontFace: FONT_BODY,
        fontSize: 11,
        color: C.text,
        valign: 'top',
      }
    );
  }

  const output = await pptx.write({ outputType: 'nodebuffer' });
  if (Buffer.isBuffer(output)) {
    return output;
  }
  if (output instanceof Uint8Array) {
    return Buffer.from(output);
  }
  return Buffer.from(output as ArrayBuffer);
}
