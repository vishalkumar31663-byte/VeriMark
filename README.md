# VeriMark — Tamper-Proof Exam Result Ledger

**Every Mark Verified. Every Change Accountable.**

Built for **Code Fuzion 2026** (Lovely Professional University).

VeriMark is a tamper-evident university examination result management platform built on deterministic canonical JSON, domain-separated SHA-256 hash chaining, Ed25519 digital signatures, independently anchored external checkpoints, browser-side AES-256-GCM encrypted signing keys, and QR-verifiable PDF marksheets.

---

## Core Security Architecture

1. **Append-Only Signed Hash-Chain Ledger**:
   - Every published result (`RESULT_PUBLISHED`), dual-authority approval (`CORRECTION_APPROVED`), and amendment (`RESULT_CORRECTED`) is serialized using recursively key-sorted canonical JSON (`shared/canonical.ts`).
   - Domain-separated SHA-256 hashes (`VERIMARK_PAYLOAD_V1:`, `VERIMARK_BLOCK_V1:`, `VERIMARK_CORRECTION_V1:`, `VERIMARK_CHECKPOINT_V1:`, `VERIMARK_RECEIPT_V1:`) bind payloads, headers, receipts, and checkpoints.
   - Every ledger block references `previous_hash` and is signed by the institutional registrar's Ed25519 key.
2. **External Signed Checkpoint & Pinned Key Registry (Outside SQLite)**:
   - Enrolled public keys (`data/trust/trusted_keys.json`) and the signed ledger-head checkpoint (`data/trust/checkpoint.json`) are stored strictly outside the SQLite database.
   - Publishing and correction finalization execute inside an exclusive SQLite transaction that rolls back completely if external checkpoint anchoring fails—an unanchored result is never reported as published or verified.
3. **Two-Authority Browser-Side Cryptographic Corrections**:
   - Legitimate mark corrections require independent Ed25519 signatures from BOTH an **Examiner** AND the **Examination Controller**, bound to the exact canonical request payload and locked to the current result version.
   - Approver private keys are encrypted with PBKDF2-SHA256 + Web Crypto AES-256-GCM (`src/lib/clientCrypto.ts`) and decrypted strictly inside browser memory. The server never receives private keys or passphrases.
4. **Privacy-Preserving Public Verification & Standalone Verifier**:
   - Anyone scanning a printed marksheet QR code (`/verify/:receiptId`) can verify authenticity without logging in.
   - Exported verification proofs (`/api/verify/:receiptId/proof`) exclude unrelated students' PII by including only cryptographic headers for other blocks.
   - Users can run the standalone `@noble/ed25519` browser verifier (`shared/verifier.ts`) directly in the browser without blindly trusting the server's displayed status.

### Threat-Model Boundaries (Honest Security Claims)
- VeriMark is **tamper-evident**, not physically unmodifiable.
- Keeping signed checkpoints and pinned public keys outside SQLite detects database-only attacks (direct SQL mark edits, payload edits, broken links, tail truncation, or rewriting the entire SQLite hash chain with a rogue key).
- It does **not** defend against an attacker who compromises the SQLite database, server signing keys, AND external checkpoint storage simultaneously. Production deployments should mirror checkpoints to immutable WORM storage or hardware security modules (HSM).

---

## Quick Start (Windows / macOS / Linux + VS Code)

### Prerequisites
- Node.js **22.14+** (uses native `node:sqlite` and `node:crypto` Ed25519—no C++ build tools needed on Windows)

### Setup & Run
```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env    # On Windows PowerShell: Copy-Item .env.example .env

# 3. Start full-stack dev server (Express API + Vite React SPA on port 3000)
npm run dev

# 4. Run all 20 automated cryptographic & security test cases
npm test
```

Open `http://localhost:3000`.

---

## Hackathon Judge Demo Walkthrough (3 Minutes)

All demo accounts are fictional seed records created automatically in development mode:
- **Super Admin**: `admin@demouniversity.edu` / `Admin@VeriMark2026`
- **Examiner**: `examiner@demouniversity.edu` / `Examiner@VeriMark2026` (Browser Key Passphrase: `ExaminerSign#2026`)
- **Examination Controller**: `controller@demouniversity.edu` / `Controller@VeriMark2026` (Browser Key Passphrase: `ControllerSign#2026`)
- **Student**: `student@demouniversity.edu` / `Student@VeriMark2026`

### Live Demo Steps
1. **Verify an Original & a Superseded Receipt (No Login)**:
   - On the Landing Page, click any anchored receipt to open `/verify/:receiptId`.
   - Click **Run Independent Client Verification** to verify every hash, Ed25519 signature, and external checkpoint inside the browser.
2. **Publish a Result & Download QR PDF Marksheet**:
   - Sign in as **Super Admin** -> **Publish Results** -> publish marks for any student -> open **PDF Marksheet** -> download the real PDF with embedded QR code.
3. **Execute a Real Dual-Authority Correction**:
   - Sign in as **Examiner** -> **Examiner Approvals** -> unlock key (`ExaminerSign#2026`) -> sign a pending proposal in-browser with Ed25519.
   - Sign in as **Examination Controller** -> **Controller Approvals** -> unlock key (`ControllerSign#2026`) -> co-sign & click **Finalize & Anchor Correction**.
   - Check the student's original v1 receipt: it now displays `VERIFIED — SUPERSEDED BY AUTHORIZED CORRECTION` while v2 displays `VERIFIED — ORIGINAL`.
4. **Simulate Real SQLite Attacks in Tamper Lab**:
   - Sign in as **Super Admin** -> **Tamper Lab (Dev)** -> click **Alter Published Marks in SQLite** or **Rewrite Entire Hash Chain**.
   - Open **Security Audit** to see exact pinpointed expected vs. database mismatches.
   - Click **Reset Demo Database** in Tamper Lab to restore a verified baseline.
