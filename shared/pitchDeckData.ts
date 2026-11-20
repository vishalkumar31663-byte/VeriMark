export interface PitchLiveStats {
  totalStudents: number;
  totalResults: number;
  totalLedgerEntries: number;
  totalReceipts: number;
  approvedCorrections: number;
  pendingCorrections: number;
  checkpointSequence: number | null;
  checkpointHashShort: string;
  checkpointValid: boolean;
  integrityStatus: string;
  automatedTestsPassed: number;
  automatedTestsTotal: number;
}

export interface JudgeQaItem {
  question: string;
  answer: string;
}

export interface PitchSlideMeta {
  id: string;
  number: number;
  kicker: string;
  title: string;
  subtitle: string;
  durationHint: string;
  speakerNotes: string;
  judgeQa: JudgeQaItem[];
}

export const PITCH_DECK_SLIDES: PitchSlideMeta[] = [
  {
    id: 'cover',
    number: 1,
    kicker: 'CODE FUZION 2026 · LOVELY PROFESSIONAL UNIVERSITY',
    title: 'VeriMark',
    subtitle: 'Every Mark Verified. Every Change Accountable.',
    durationHint: '0:00 – 0:20',
    speakerNotes:
      'Good morning judges. We built VeriMark — a tamper-evident examination result ledger. Universities publish millions of marks into mutable databases where silent insider edits leave students with no way to prove what was originally published. VeriMark makes every mark cryptographically verifiable and every legitimate correction dual-signed and permanently auditable.',
    judgeQa: [
      {
        question: 'Is this built on Ethereum or a paid blockchain?',
        answer:
          'No. We deliberately avoided cryptocurrency bloat, gas fees, and wallet UX. VeriMark uses deterministic SHA-256 hash chaining, Ed25519 digital signatures, and an isolated external signed checkpoint store — giving universities cryptographic tamper-evidence with millisecond latency and zero blockchain operating cost.',
      },
    ],
  },
  {
    id: 'problem',
    number: 2,
    kicker: '01 · THE PROBLEM',
    title: 'Mutable Exam Databases Break Academic Trust',
    subtitle:
      'Once examination marks sit in a standard SQL table, unauthorized edits are silent and printed marksheets cannot prove historical truth.',
    durationHint: '0:20 – 0:45',
    speakerNotes:
      'Today, university ERP portals rely on conventional CRUD databases. A single compromised admin account or direct SQL UPDATE can silently alter a student’s marks with zero trace. Worse, when a student challenges a discrepancy using a printed marksheet, there is no cryptographic proof linking that paper document back to what the university originally published.',
    judgeQa: [
      {
        question: 'Why aren’t standard SQL audit logs or database backups enough?',
        answer:
          'Standard audit log tables live inside the exact same database an insider or DBA controls — they can be updated or truncated together with the marks row. VeriMark anchors signed cryptographic hashes to an external trust store outside the database, so any SQL rewrite or log deletion is mathematically exposed.',
      },
    ],
  },
  {
    id: 'solution',
    number: 3,
    kicker: '02 · OUR SOLUTION',
    title: 'Tamper-Evident Ledger Without Blockchain Overhead',
    subtitle:
      'Four interlocking cryptographic guarantees turn every published mark into a verifiable academic record.',
    durationHint: '0:45 – 1:15',
    speakerNotes:
      'VeriMark combines four genuine cryptographic controls: an append-only SHA-256 hash chain signed with Ed25519; browser-side dual-authority signing so not even a Super Admin can silently edit marks; QR-embedded PDF marksheets that anyone can verify without logging in; and an independent external checkpoint outside SQLite that detects full database rewrites.',
    judgeQa: [
      {
        question: 'Are any of the signatures or verification checks simulated?',
        answer:
          'Zero simulation. Every hash is real SHA-256 over canonical JSON, every signature is real Ed25519 verified via Node crypto and @noble/ed25519 in the browser, and private signing keys are encrypted client-side with Web Crypto AES-256-GCM.',
      },
    ],
  },
  {
    id: 'architecture',
    number: 4,
    kicker: '03 · SYSTEM ARCHITECTURE',
    title: 'Separation of Concerns & Isolated Trust Boundary',
    subtitle:
      'Signing keys stay encrypted in the browser, RBAC is enforced server-side, and checkpoints live outside SQLite.',
    durationHint: '1:15 – 1:45',
    speakerNotes:
      'Here is our full-stack architecture. On the left, Examiners and Controllers hold AES-256-GCM encrypted Ed25519 keys in the browser — plaintext private keys never cross the network. In the center, our Express API enforces strict role-based authorization on every endpoint. On the right, notice the critical trust boundary: SQLite holds operational tables and ledger blocks, while signed checkpoints and pinned public keys live outside SQLite in an external trust store.',
    judgeQa: [
      {
        question: 'What happens if the server crashes between writing SQLite and updating the external checkpoint?',
        answer:
          'Ledger writes wrap the SQLite transaction and external checkpoint write atomically: if the external checkpoint cannot be written and signed, the SQLite transaction rolls back so the database and checkpoint never silently diverge.',
      },
    ],
  },
  {
    id: 'crypto-engine',
    number: 5,
    kicker: '04 · CRYPTOGRAPHIC INTEGRITY ENGINE',
    title: 'Deterministic Canonical Hashing & Ed25519 Chaining',
    subtitle:
      'Every event is normalized into canonical JSON, domain-separated before hashing, chained to its predecessor, and signed.',
    durationHint: '1:45 – 2:15',
    speakerNotes:
      'A subtle failure mode in real crypto systems is non-deterministic JSON key ordering or cross-type hash collisions. We solved both: a shared pure TypeScript canonicalizer produces identical UTF-8 byte strings on server and browser, and every hash uses one of five strict domain prefixes — payload, block, approval, receipt, and checkpoint — preventing signature replay across contexts.',
    judgeQa: [
      {
        question: 'Why domain-separate SHA-256 hashes?',
        answer:
          'Domain separation ensures a signed payload from one operation (such as a receipt fingerprint) can never be replayed or misinterpreted as a valid signature for another operation (such as a correction approval or ledger block).',
      },
    ],
  },
  {
    id: 'dual-approval',
    number: 6,
    kicker: '05 · TWO-AUTHORITY CORRECTIONS',
    title: 'Not Even a Super Admin Can Silently Edit Marks',
    subtitle:
      'Legitimate re-evaluations require independent browser-side Ed25519 signatures from both the Examiner and the Examination Controller.',
    durationHint: '2:15 – 2:50',
    speakerNotes:
      'Real universities do have legitimate re-evaluations, so immutability cannot mean freezing mistakes forever. In VeriMark, a correction is proposed with a mandatory reason and locked to the current result version. The Examiner unlocks their AES-GCM key in the browser and signs the exact canonical payload. The Examination Controller independently reviews and co-signs with a distinct key. Only after both signatures verify against pinned public keys does the backend append a v2 amendment block — keeping v1 permanently intact.',
    judgeQa: [
      {
        question: 'Can the Examiner sign twice or reuse an old signature on a different marks change?',
        answer:
          'No. The backend enforces two distinct roles (EXAMINER + CONTROLLER), two distinct user IDs, and two distinct enrolled key IDs, and binds every signature to the exact correctionRequestId, resultId, currentVersion, previousMarks, proposedMarks, and reason.',
      },
    ],
  },
  {
    id: 'public-verify',
    number: 7,
    kicker: '06 · QR MARKSHEETS & PUBLIC VERIFICATION',
    title: 'Zero-Login Proof for Students, Parents & Employers',
    subtitle:
      'Printed PDF marksheets embed a QR verification link and downloadable proof bundle with zero leakage of unrelated student PII.',
    durationHint: '2:50 – 3:20',
    speakerNotes:
      'Every marksheet PDF generated by VeriMark carries a live QR code pointing to our public verification portal. Anyone can scan it with zero login. If the mark is unchanged, it returns VERIFIED — ORIGINAL. If a dual-signed re-evaluation happened later, scanning the older v1 marksheet returns VERIFIED — SUPERSEDED BY AUTHORIZED CORRECTION and displays both original and updated marks with signer proof. Users can also download a JSON proof and verify signatures locally in their browser.',
    judgeQa: [
      {
        question: 'Does public verification expose other students’ data from the hash chain?',
        answer:
          'No. Our verification proof bundle exposes only the target receipt’s event data, cryptographic digests, and chain linkage hashes — never names, registration numbers, or marks of any unrelated student in neighboring blocks.',
      },
    ],
  },
  {
    id: 'threat-model',
    number: 8,
    kicker: '07 · LIVE TAMPER DETECTION & HONEST THREAT MODEL',
    title: 'Eight Attack Vectors Tested — Zero False Claims',
    subtitle:
      'Tamper-evident by design: we pinpoint every database-layer compromise and document production hardening boundaries honestly.',
    durationHint: '3:20 – 3:55',
    speakerNotes:
      'Judges appreciate honesty over buzzwords. VeriMark does not claim SQLite is physically unmodifiable — instead, it is cryptographically tamper-evident. Our Security Audit Engine catches direct SQL mark edits, payload tampering, broken hash chains, tail deletions, and even a full SQLite chain rewrite using a rogue key because the external checkpoint and pinned keys reject it. For production hardening beyond a single host, checkpoints replicate to WORM storage or an HSM.',
    judgeQa: [
      {
        question: 'What if an attacker gets root access to the server, steals the registrar private key, AND overwrites checkpoint.json?',
        answer:
          'That is our explicitly documented threat boundary. If one host holds the DB, signing key, and checkpoint, full host compromise can forge everything — which is why printed student receipts with short fingerprints plus production WORM/HSM checkpoint replication close that final gap.',
      },
    ],
  },
  {
    id: 'demo-script',
    number: 9,
    kicker: '08 · 3-MINUTE LIVE JUDGE DEMO',
    title: 'Watch Every Cryptographic Claim Live in Four Acts',
    subtitle:
      'A repeatable live walkthrough from public QR verification to dual-signed re-evaluation and live SQLite tampering detection.',
    durationHint: '3:55 – 4:30',
    speakerNotes:
      'We are ready to prove every single slide live right now in 3 minutes. Act 1: scan or click a receipt on the public verifier with zero login and run standalone browser verification. Act 2: log in as Super Admin, publish a new mark, and download the QR PDF marksheet. Act 3: log in as Examiner and Controller to sign a correction in-browser with AES-GCM unlocked keys and finalize v2. Act 4: launch an attack in our Dev-Only Tamper Lab and watch the Security Audit Engine pinpoint the exact tampered block.',
    judgeQa: [
      {
        question: 'Is the Tamper Lab exposed in production?',
        answer:
          'Never. Tamper Lab routes return HTTP 404 when NODE_ENV=production unless explicitly enabled via a dev flag, and are always restricted to Super Admin sessions.',
      },
    ],
  },
  {
    id: 'engineering-impact',
    number: 10,
    kicker: '09 · ENGINEERING RIGOR & IMPACT',
    title: 'Built Like Production Security Infrastructure',
    subtitle:
      'Verified by 20 automated cryptographic tests, strict role isolation, and zero external dependencies.',
    durationHint: '4:30 – 5:00',
    speakerNotes:
      'To close: VeriMark is not a mockup. It has 16 role-aware interfaces, strict backend RBAC across five roles, live PDF and QR generation, zero external blockchain dependencies, and 20 automated security tests covering every tamper and replay scenario — all passing. Every mark verified. Every change accountable. Thank you — we would love to take your questions or run the live demo.',
    judgeQa: [
      {
        question: 'How would a university like LPU deploy VeriMark at scale (50,000+ students)?',
        answer:
          'Because verification is pure SHA-256 + Ed25519 (~0.1ms per block), 100,000 results verify in seconds. Moving from SQLite to PostgreSQL with append-only roles, publishing signed daily Merkle/checkpoint roots to S3 Object Lock (WORM), and storing registrar keys in Cloud KMS/HSM scales cleanly to full university volume.',
      },
    ],
  },
];

export const THREAT_MATRIX_ROWS = [
  {
    attack: 'Direct SQL marks UPDATE',
    layer: 'Audit Engine · Materialized State Check',
    outcome: 'Pinpoints result ID + marks mismatch vs latest ledger event',
    status: 'DETECTED',
  },
  {
    attack: 'Historical ledger payload mutation',
    layer: 'SHA-256 Payload & Block Digest Recompute',
    outcome: 'Flags exact firstInvalidBlock sequence & hash delta',
    status: 'DETECTED',
  },
  {
    attack: 'Broken previous_hash link',
    layer: 'Sequential Hash-Chain Continuity Check',
    outcome: 'Flags chain discontinuity at tampered sequence number',
    status: 'DETECTED',
  },
  {
    attack: 'Ledger tail deletion / rollback',
    layer: 'External Signed Checkpoint Comparison',
    outcome: 'Detects sequence regression against checkpoint.json',
    status: 'DETECTED',
  },
  {
    attack: 'Full SQLite chain rewrite w/ rogue key',
    layer: 'Pinned Trusted Keys + External Checkpoint',
    outcome: 'Rejects unpinned key ID & mismatched checkpoint head hash',
    status: 'DETECTED',
  },
  {
    attack: 'Super Admin silent mark edit',
    layer: 'RBAC + Dual-Authority Finalization Gate',
    outcome: 'Blocked with 403 / 409 — no bypass endpoint exists',
    status: 'BLOCKED',
  },
  {
    attack: 'Duplicate role or same-user double sign',
    layer: 'Approver Role, User & Key Distinctness Check',
    outcome: 'Rejected before persistence; requires Examiner + Controller',
    status: 'BLOCKED',
  },
  {
    attack: 'Signature replay on modified marks',
    layer: 'Canonical Approval Payload Version Binding',
    outcome: 'Ed25519 verification fails on any field or version change',
    status: 'BLOCKED',
  },
] as const;

export const DEMO_ACTS = [
  {
    act: 'ACT 01 · 35s',
    title: 'Zero-Login Public Verification',
    route: '/verify',
    account: 'No login required',
    steps: [
      'Open an anchored receipt from the landing page',
      'Inspect VERIFIED — SUPERSEDED v1 vs v2 timeline',
      'Click Run Local Browser Verification on JSON proof',
    ],
  },
  {
    act: 'ACT 02 · 40s',
    title: 'Publish Mark & QR PDF Marksheet',
    route: '/publish',
    account: 'admin@demouniv.edu',
    steps: [
      'Publish a new subject result for a student',
      'Inspect the new Ed25519-signed ledger block',
      'Download & preview the QR-embedded PDF marksheet',
    ],
  },
  {
    act: 'ACT 03 · 55s',
    title: 'Dual-Authority Browser Signing',
    route: '/approvals/examiner',
    account: 'examiner@ + controller@',
    steps: [
      'Propose a re-evaluation correction with written reason',
      'Examiner unlocks AES-GCM key in browser & signs',
      'Controller independently co-signs & finalizes v2',
    ],
  },
  {
    act: 'ACT 04 · 50s',
    title: 'Live Tamper Attack & Audit Pinpoint',
    route: '/tamper-lab',
    account: 'admin@demouniv.edu',
    steps: [
      'Execute Direct SQL Marks Edit or Tail Deletion',
      'Run Security Audit Engine → exact block pinpointed',
      'Reset demo ledger cleanly back to VERIFIED state',
    ],
  },
] as const;

export const DOMAIN_PREFIXES = [
  { prefix: 'VERIMARK:PAYLOAD:V1|', purpose: 'Deterministic canonical JSON hash of each event payload' },
  { prefix: 'VERIMARK:BLOCK:V1|', purpose: 'Hash-chain digest linking prevHash + sequence + payloadHash' },
  { prefix: 'VERIMARK:APPROVAL:V1|', purpose: 'Correction approval payload signed in-browser by authorities' },
  { prefix: 'VERIMARK:RECEIPT:V1|', purpose: 'Short verification fingerprint printed on PDF marksheet QR' },
  { prefix: 'VERIMARK:CHECKPOINT:V1|', purpose: 'External signed ledger-head anchor stored outside SQLite' },
] as const;
