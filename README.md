# VeriMark 2.0 — Smart Examination Management & Cryptographic Result Verification System

**Every Exam Organized. Every Result Verified. Every Change Accountable.**

Built for **Code Fuzion 2026** (Lovely Professional University).

VeriMark 2.0 extends the tamper-evident **VeriMark** cryptographic exam result ledger into a complete university examination operations platform covering **Student**, **Examiner**, **Examination Controller**, **Super Admin**, and **Public Verifier** workflows—without weakening a single cryptographic guarantee.

---

## Core Cryptographic Security (Preserved from VeriMark 1.0)

1. **Append-Only Signed Hash-Chain Ledger**:
   - Every published result (`RESULT_PUBLISHED`), dual-authority approval (`CORRECTION_APPROVED`), and amendment (`RESULT_CORRECTED`) is serialized using recursively key-sorted canonical JSON (`shared/canonical.ts`).
   - Domain-separated SHA-256 hashes (`VERIMARK_PAYLOAD_V1:`, `VERIMARK_BLOCK_V1:`, `VERIMARK_CORRECTION_V1:`, `VERIMARK_CHECKPOINT_V1:`, `VERIMARK_RECEIPT_V1:`) bind payloads, headers, receipts, and checkpoints.
   - Every ledger block links `previous_hash` and is signed by the institutional registrar's Ed25519 key.
2. **External Signed Checkpoint & Pinned Key Registry (Outside SQLite)**:
   - Enrolled public keys (`data/trust/trusted_keys.json`) and the signed ledger-head checkpoint (`data/trust/checkpoint.json`) are persisted strictly outside SQLite.
   - Publishing and correction finalization execute inside an exclusive SQLite transaction that rolls back completely if external checkpoint anchoring fails.
3. **Two-Authority Browser-Side Cryptographic Corrections**:
   - **No ticket resolution or revaluation decision can ever mutate published marks directly.**
   - Every authorized mark change requires independent Ed25519 signatures from BOTH an **Examiner** AND the **Examination Controller**, unlocked in browser memory via PBKDF2-SHA256 + Web Crypto AES-256-GCM (`src/lib/clientCrypto.ts`).
4. **Privacy-Preserving Public Verification & Standalone Verifier**:
   - Public QR verification (`/verify/:receiptId`) works without login, supports pasting full QR URLs or scanning uploaded QR images (`BarcodeDetector`), and runs independent browser-side `@noble/ed25519` proof verification without leaking unrelated students' PII.

---

## VeriMark 2.0 Features (All 12 Modules)

1. **Smart Notifications**: Persistent SQLite notifications with live Server-Sent Events (`/api/notifications/stream`), polling fallback, header bell badge, category/priority filters, and mark-read actions.
2. **Proof of Result (`/proof-of-result`)**: Dedicated verification receipt workspace displaying live cryptographic status, SHA-256 payload/block hashes, QR code, version history switcher, PDF marksheet download, and verification proof JSON export.
3. **Examination Schedule (`/exam-schedule`, `/assigned-exams`, `/exam-management`)**: Full draft/published/cancelled schedule management with cohort, room, and examiner time-overlap conflict detection, examiner assignment, schedule change requests, auditable change history, Calendar & List views, and `pdf-lib` timetable PDF export.
4. **Online & Offline Exam Modes**: First-class `ONLINE` (validated `http:`/`https:` portal URL, access window state, login instructions) and `OFFLINE` (campus, building, hall/room, seat number, reporting time, required IDs) modes with automatic student & examiner notifications on mode updates.
5. **Raise & Track Tickets (`/tickets`, `/tickets/new`)**: 9 categories, 9 statuses with validated transitions, threaded conversation, staff-only internal notes (stripped server-side from student API responses), validated evidence attachments (PDF/PNG/JPEG/TXT, magic-byte checked, 2 MB limit), SLA overdue tracking, examiner escalation, and student reopen.
6. **Public QR Verification (`/verify`, `/verify/:receiptId`)**: Enhanced with QR URL `?fp=` parser, browser QR image upload scanner, standalone client-side proof verification, and quick switching to Admit Card Verification.
7. **Result Comparison (`/result-comparison`)**: Side-by-side **Original Result (v1) → Corrected Result (vN)** comparison showing exact mark delta, version lineage, receipt IDs, Ed25519 signer identities, linked tickets/revaluations, and clearly separated pending proposals.
8. **Revaluation Requests (`/revaluations`)**: Duplicate-active-request guard, evidence attachment upload, Examiner review & recommendation, and Controller final decision that routes approved changes into the two-signature `LedgerService` correction workflow.
9. **Result Analytics (`/analytics`)**: Real SQL-backed Recharts visualizations tailored for Student performance, strictly scoped Examiner assigned subjects, and Controller institutional pass rates, score distributions, and correction/ticket metrics—computed on latest finalized versions without double-counting.
10. **Digital Admit Cards (`/admit-cards`, `/admit-card/verify/:token`)**: Seat allocation with room/seat conflict prevention, bulk publish & reissue (invalidating superseded versions), `pdf-lib` PDF generation with dedicated admit-card verification QR tokens, and public token verification clearly stating that admit cards are not proof of attendance or marks.
11. **Ticket-to-Correction End-to-End Workflow**: Student raises `INCORRECT_MARKS` ticket → Examiner investigates & escalates → Controller initiates a formal `CorrectionRequest` → Examiner & Controller independently Ed25519 co-sign → Finalization appends a new ledger block, updates external checkpoint, auto-resolves the linked ticket/revaluation, and notifies the student.
12. **Exam Countdown (`/exam-countdown` & Dashboard Widgets)**: Live ticking timezone-aware countdown (`Days / Hours / Minutes / Seconds`, `"Exam Started"`, `"Exam Completed"`, clean empty state) on Student, Examiner, and Controller dashboards.

---

## Quick Start (Windows / macOS / Linux + VS Code)

### Prerequisites
- Node.js **22.14+** (uses native `node:sqlite` and `node:crypto` Ed25519—no C++ build tools required)

### Setup & Run
```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env    # PowerShell: Copy-Item .env.example .env

# 3. Start full-stack dev server (Express API + Vite React SPA on port 3000)
npm run dev

# 4. Run all automated VeriMark 1.0 + VeriMark 2.0 security & workflow tests
npm test

# 5. Typecheck & production build
npm run lint
npm run build
```

Open `http://localhost:3000`.

---

## Demo Accounts (Seeded Automatically in Development)

- **Super Admin**: `admin@demouniversity.edu` / `Admin@VeriMark2026`
- **Examiner**: `examiner@demouniversity.edu` / `Examiner@VeriMark2026` (Browser Key Passphrase: `ExaminerSign#2026`)
- **Examination Controller**: `controller@demouniversity.edu` / `Controller@VeriMark2026` (Browser Key Passphrase: `ControllerSign#2026`)
- **Student 1 (Aarav Sharma)**: `student@demouniversity.edu` / `Student@VeriMark2026`
- **Student 2 (Ananya Verma)**: `ananya.verma@demouniversity.edu` / `Student@VeriMark2026`

---

## Security Boundaries & Production Deployment Notes

- **Tamper-Evident Architecture**: VeriMark is tamper-evident, not physically unmodifiable. External checkpoints and pinned public keys detect SQLite-only compromise, but do not defend against an attacker who compromises SQLite, server signing keys, and external checkpoint storage simultaneously.
- **Persistent Storage Requirement**: Because VeriMark runs a full Express backend with SQLite (`data/verimark.sqlite`), external trust checkpoints (`data/trust/`), and uploaded evidence (`data/uploads/`), production deployments should run on a persistent Node.js host with mounted storage (e.g., Cloud Run with persistent volume + managed PostgreSQL/object storage, Fly.io, Railway, or a university VM) rather than ephemeral serverless-only hosting where local disk resets between invocations.
- **Threat-Model Hardening**: In production, mirror signed checkpoints to immutable WORM object storage, store registrar signing keys in an HSM/KMS, disable the Dev Tamper Lab (`ENABLE_TAMPER_LAB=false`), and configure a strong `JWT_SECRET`.
