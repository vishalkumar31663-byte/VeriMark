import {
  GENESIS_PREVIOUS_HASH,
  buildBlockHashPreimage,
  buildCorrectionSigningMessage,
  buildPayloadHashPreimage,
  canonicalJson,
} from '../shared/canonical';
import { AuditReport, UserRole } from '../shared/types';
import { AuditService } from './auditService';
import { generateEd25519Keypair, sha256Hex, signEd25519Hex } from './crypto';
import { VeriMarkDatabase } from './db';
import { DomainError, LedgerService } from './ledgerService';
import { seedDemoDataIfEmpty } from './seed';
import { ExternalTrustStore } from './trustStore';

export type TamperAttackType =
  | 'alter_marks'
  | 'modify_payload'
  | 'break_chain'
  | 'delete_tail'
  | 'forge_chain'
  | 'attempt_single_approval'
  | 'attempt_duplicate_signer'
  | 'attempt_approval_replay';

export interface TamperActionResult {
  attackType: TamperAttackType;
  category: 'DATABASE_ATTACK' | 'AUTHORIZATION_ATTACK';
  executed: boolean;
  blockedByDefense: boolean;
  title: string;
  description: string;
  technicalDetail: string;
  rejectionCode?: string;
  auditReport: AuditReport;
}

/**
 * Development-Only Controlled Attack Simulation Engine (Tamper Lab).
 * Executes REAL raw SQLite mutations bypassing normal application logic, or
 * executes real rejected authorization/cryptographic attempts, and runs the real AuditService.
 */
export class TamperService {
  constructor(
    private readonly database: VeriMarkDatabase,
    private readonly trustStore: ExternalTrustStore,
    private readonly ledgerService: LedgerService,
    private readonly auditService: AuditService
  ) {}

  public executeAttack(attackType: TamperAttackType): TamperActionResult {
    const db = this.database.db;

    switch (attackType) {
      case 'alter_marks': {
        const target = db
          .prepare(
            `SELECT r.id, r.obtained_marks, r.max_marks, s.registration_number, s.full_name, sub.code
             FROM results r
             JOIN students s ON s.id = r.student_id
             JOIN subjects sub ON sub.id = r.subject_id
             ORDER BY r.latest_ledger_sequence ASC LIMIT 1`
          )
          .get() as
          | {
              id: string;
              obtained_marks: number;
              max_marks: number;
              registration_number: string;
              full_name: string;
              code: string;
            }
          | undefined;

        if (!target) {
          throw new DomainError('No published results available to tamper with', 400);
        }

        const forgedMarks =
          Number(target.obtained_marks) >= 98
            ? 41
            : Math.min(Number(target.max_marks), Number(target.obtained_marks) + 9);

        db.prepare(`UPDATE results SET obtained_marks = ? WHERE id = ?`).run(
          forgedMarks,
          target.id
        );

        const auditReport = this.auditService.runAudit(true);
        return {
          attackType,
          category: 'DATABASE_ATTACK',
          executed: true,
          blockedByDefense: false,
          title: 'Direct SQLite Marks Tampering Executed',
          description: `Executed raw SQL UPDATE on results table for ${target.full_name} (${target.registration_number}, ${target.code}), changing marks from ${target.obtained_marks} to ${forgedMarks} without touching the ledger.`,
          technicalDetail: `SQL: UPDATE results SET obtained_marks = ${forgedMarks} WHERE id = '${target.id}'`,
          auditReport,
        };
      }

      case 'modify_payload': {
        const entry = db
          .prepare(
            `SELECT sequence, payload_json FROM ledger_entries WHERE event_type = 'RESULT_PUBLISHED' ORDER BY sequence ASC LIMIT 1`
          )
          .get() as { sequence: number; payload_json: string } | undefined;

        if (!entry) {
          throw new DomainError('No ledger entries available to modify', 400);
        }

        const payload = JSON.parse(entry.payload_json) as Record<string, unknown>;
        const oldMarks = Number(payload.obtainedMarks ?? 0);
        const alteredMarks = oldMarks === 99 ? 52 : 99;
        payload.obtainedMarks = alteredMarks;

        db.prepare(`UPDATE ledger_entries SET payload_json = ? WHERE sequence = ?`).run(
          canonicalJson(payload),
          entry.sequence
        );

        const auditReport = this.auditService.runAudit(true);
        return {
          attackType,
          category: 'DATABASE_ATTACK',
          executed: true,
          blockedByDefense: false,
          title: 'Direct SQLite Ledger Payload Tampering Executed',
          description: `Modified payload_json directly inside ledger block #${entry.sequence} (obtainedMarks ${oldMarks} → ${alteredMarks}) while leaving stored payload_hash unchanged.`,
          technicalDetail: `SQL: UPDATE ledger_entries SET payload_json = <altered> WHERE sequence = ${entry.sequence}`,
          auditReport,
        };
      }

      case 'break_chain': {
        const entry = db
          .prepare(
            `SELECT sequence, previous_hash FROM ledger_entries WHERE sequence >= 2 ORDER BY sequence ASC LIMIT 1`
          )
          .get() as { sequence: number; previous_hash: string } | undefined;

        if (!entry) {
          throw new DomainError('Need at least 2 ledger blocks to break hash-chain link', 400);
        }

        const brokenPrev = 'deadbeef'.repeat(8);
        db.prepare(`UPDATE ledger_entries SET previous_hash = ? WHERE sequence = ?`).run(
          brokenPrev,
          entry.sequence
        );

        const auditReport = this.auditService.runAudit(true);
        return {
          attackType,
          category: 'DATABASE_ATTACK',
          executed: true,
          blockedByDefense: false,
          title: 'Hash-Chain Link Corruption Executed',
          description: `Overwrote previous_hash on ledger block #${entry.sequence} with a forged value, severing continuity with block #${entry.sequence - 1}.`,
          technicalDetail: `SQL: UPDATE ledger_entries SET previous_hash = '${brokenPrev.slice(0, 16)}…' WHERE sequence = ${entry.sequence}`,
          auditReport,
        };
      }

      case 'delete_tail': {
        const latest = db
          .prepare(
            `SELECT sequence, event_id FROM ledger_entries ORDER BY sequence DESC LIMIT 1`
          )
          .get() as { sequence: number; event_id: string } | undefined;

        if (!latest) {
          throw new DomainError('Ledger is already empty', 400);
        }

        db.prepare(`DELETE FROM ledger_entries WHERE sequence = ?`).run(latest.sequence);

        const auditReport = this.auditService.runAudit(true);
        return {
          attackType,
          category: 'DATABASE_ATTACK',
          executed: true,
          blockedByDefense: false,
          title: 'Ledger Tail Deletion Executed',
          description: `Deleted the final ledger block #${latest.sequence} (${latest.event_id}) directly from SQLite. External signed checkpoint.json detects the missing tail immediately.`,
          technicalDetail: `SQL: DELETE FROM ledger_entries WHERE sequence = ${latest.sequence}`,
          auditReport,
        };
      }

      case 'forge_chain': {
        const entries = db
          .prepare(`SELECT * FROM ledger_entries ORDER BY sequence ASC`)
          .all() as Record<string, unknown>[];

        if (entries.length === 0) {
          throw new DomainError('No ledger entries to rewrite', 400);
        }

        // Attacker alters block #1 payload AND recalculates every payload_hash, previous_hash,
        // and block_hash across the ENTIRE chain using an attacker's rogue key!
        const rogueKey = generateEd25519Keypair();
        let prevHash = GENESIS_PREVIOUS_HASH;

        for (let i = 0; i < entries.length; i++) {
          const row = entries[i];
          const seq = Number(row.sequence);
          const payload = JSON.parse(String(row.payload_json)) as Record<string, unknown>;
          if (i === 0) {
            payload.obtainedMarks = 100;
          }
          const newPayloadJson = canonicalJson(payload);
          const newPayloadHash = sha256Hex(buildPayloadHashPreimage(payload));
          const newBlockHash = sha256Hex(
            buildBlockHashPreimage({
              sequence: seq,
              eventId: String(row.event_id),
              eventType: String(row.event_type),
              previousHash: prevHash,
              payloadHash: newPayloadHash,
              publisherId: String(row.publisher_id),
              publisherKeyId: String(row.publisher_key_id),
              timestamp: String(row.timestamp),
              schemaVersion: String(row.schema_version),
            })
          );
          const rogueSig = signEd25519Hex(newBlockHash, rogueKey.privateKeyHex);

          db.prepare(
            `UPDATE ledger_entries
             SET previous_hash = ?, payload_hash = ?, block_hash = ?, signature = ?, payload_json = ?
             WHERE sequence = ?`
          ).run(prevHash, newPayloadHash, newBlockHash, rogueSig, newPayloadJson, seq);

          prevHash = newBlockHash;
        }

        const auditReport = this.auditService.runAudit(true);
        return {
          attackType,
          category: 'DATABASE_ATTACK',
          executed: true,
          blockedByDefense: false,
          title: 'Full Hash-Chain Rewrite (Forged Chain) Executed',
          description: `Attacker modified block #1 marks to 100 and recalculated all ${entries.length} payload hashes, block hashes, and chain links in SQLite with a rogue key. Audit catches BOTH invalid Ed25519 publisher signatures AND external checkpoint head divergence.`,
          technicalDetail: `Recomputed hashes for blocks #1–#${entries.length}; signed with un-enrolled key ${rogueKey.publicKeyHex.slice(0, 16)}…`,
          auditReport,
        };
      }

      case 'attempt_single_approval': {
        const partial = this.ledgerService
          .listCorrectionRequests()
          .find((c) => c.approvals.length === 1) ??
          this.ledgerService
            .listCorrectionRequests()
            .find((c) => c.status === 'PENDING');

        if (!partial) {
          throw new DomainError(
            'No pending or partially approved correction request found. Reset demo DB to restore sample requests.',
            400
          );
        }

        try {
          this.ledgerService.finalizeCorrection(partial.id, 'usr_admin_01');
          throw new Error('Unexpected: single-approval finalization succeeded');
        } catch (err) {
          const auditReport = this.auditService.runAudit(false);
          const dErr = err instanceof DomainError ? err : null;
          return {
            attackType,
            category: 'AUTHORIZATION_ATTACK',
            executed: true,
            blockedByDefense: true,
            title: 'Single-Approval Correction Bypass Blocked',
            description: `Attempted to finalize correction request ${partial.id} (${partial.registrationNumber} · ${partial.subjectCode}) with only ${partial.approvals.length} approval(s). Backend strictly rejected it.`,
            technicalDetail: dErr?.message ?? String(err),
            rejectionCode: dErr?.code ?? 'INSUFFICIENT_APPROVALS',
            auditReport,
          };
        }
      }

      case 'attempt_duplicate_signer': {
        const partial = this.ledgerService
          .listCorrectionRequests()
          .find((c) => c.approvals.length === 1);

        if (!partial) {
          throw new DomainError(
            'No single-approval correction request found. Reset demo DB to restore sample requests.',
            400
          );
        }

        const existingApproval = partial.approvals[0];
        try {
          this.ledgerService.submitApproval({
            correctionRequestId: partial.id,
            approverUserId: existingApproval.approverUserId,
            approverRole:
              existingApproval.approverRole === 'EXAMINER'
                ? UserRole.CONTROLLER
                : UserRole.EXAMINER,
            keyId: existingApproval.keyId,
            signatureHex: existingApproval.signatureHex,
            decision: 'APPROVED',
          });
          throw new Error('Unexpected: duplicate signer accepted');
        } catch (err) {
          const auditReport = this.auditService.runAudit(false);
          const dErr = err instanceof DomainError ? err : null;
          return {
            attackType,
            category: 'AUTHORIZATION_ATTACK',
            executed: true,
            blockedByDefense: true,
            title: 'Duplicate Signer Dual-Role Attack Blocked',
            description: `Attempted to submit a second approval on ${partial.id} using the same individual (${existingApproval.approverName}) and key (${existingApproval.keyId}) as the first approval.`,
            technicalDetail: dErr?.message ?? String(err),
            rejectionCode: dErr?.code ?? 'DUPLICATE_SIGNER',
            auditReport,
          };
        }
      }

      case 'attempt_approval_replay': {
        const allReqs = this.ledgerService.listCorrectionRequests();
        const donor = allReqs.find((c) => c.approvals.length > 0);
        const target = allReqs.find(
          (c) => c.id !== donor?.id && c.status === 'PENDING'
        );

        if (!donor || !target) {
          throw new DomainError(
            'Need one signed request and one unsigned pending request for replay simulation. Reset demo DB if needed.',
            400
          );
        }

        const stolenApproval = donor.approvals[0];
        try {
          this.ledgerService.submitApproval({
            correctionRequestId: target.id,
            approverUserId: stolenApproval.approverUserId,
            approverRole:
              stolenApproval.approverRole === 'EXAMINER'
                ? UserRole.EXAMINER
                : UserRole.CONTROLLER,
            keyId: stolenApproval.keyId,
            signatureHex: stolenApproval.signatureHex,
            decision: 'APPROVED',
          });
          throw new Error('Unexpected: replayed signature accepted');
        } catch (err) {
          const auditReport = this.auditService.runAudit(false);
          const dErr = err instanceof DomainError ? err : null;
          return {
            attackType,
            category: 'AUTHORIZATION_ATTACK',
            executed: true,
            blockedByDefense: true,
            title: 'Cross-Request Approval Replay Attack Blocked',
            description: `Replayed valid Ed25519 signature from request ${donor.id} onto different correction request ${target.id} (${target.registrationNumber} · ${target.subjectCode}). Rejected due to replay detection and request-bound canonical payload.`,
            technicalDetail: dErr?.message ?? String(err),
            rejectionCode: dErr?.code ?? 'APPROVAL_REPLAY',
            auditReport,
          };
        }
      }

      default:
        throw new DomainError(`Unknown attack type: ${String(attackType)}`, 400);
    }
  }

  public async resetDemoDatabase(): Promise<{
    reset: boolean;
    auditReport: AuditReport;
  }> {
    const db = this.database.db;
    db.exec(`
      PRAGMA foreign_keys = OFF;
      DELETE FROM approvals;
      DELETE FROM correction_requests;
      DELETE FROM result_receipts;
      DELETE FROM results;
      DELETE FROM ledger_entries;
      DELETE FROM audit_records;
      DELETE FROM exams;
      DELETE FROM subjects;
      DELETE FROM students;
      DELETE FROM revoked_tokens;
      DELETE FROM users;
      PRAGMA foreign_keys = ON;
    `);

    this.trustStore.clearAllForReset();
    await seedDemoDataIfEmpty(
      this.database,
      this.trustStore,
      this.ledgerService,
      this.auditService
    );

    const auditReport = this.auditService.runAudit(true);
    return { reset: true, auditReport };
  }
}
