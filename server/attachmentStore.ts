import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TicketAttachmentRecord } from '../shared/v2Types';
import { VeriMarkDatabase } from './db';
import { DomainError } from './ledgerService';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
]);

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'text/plain': '.txt',
};

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2 MB

export interface AttachmentUploadInput {
  originalName: string;
  mimeType: string;
  contentBase64: string;
}

export class AttachmentStore {
  private readonly uploadsDir: string;

  constructor(
    private readonly database: VeriMarkDatabase,
    baseDataDir: string
  ) {
    this.uploadsDir = path.resolve(baseDataDir, 'uploads');
    fs.mkdirSync(this.uploadsDir, { recursive: true });
  }

  private sanitizeDisplayName(raw: string): string {
    const base = path.basename(raw || 'evidence').replace(/[^\w.\-() ]+/g, '_').trim();
    return (base || 'evidence').slice(0, 120);
  }

  private resolveSafePath(storedName: string): string {
    if (!/^[a-zA-Z0-9._-]+$/.test(storedName)) {
      throw new DomainError('Invalid attachment reference', 400, 'INVALID_ATTACHMENT');
    }
    const resolved = path.resolve(this.uploadsDir, storedName);
    const prefix = this.uploadsDir.endsWith(path.sep)
      ? this.uploadsDir
      : this.uploadsDir + path.sep;
    if (!resolved.startsWith(prefix)) {
      throw new DomainError('Attachment path outside allowed storage', 400, 'INVALID_PATH');
    }
    return resolved;
  }

  public saveAttachment(params: {
    ticketId?: string | null;
    revaluationId?: string | null;
    uploadedByUserId: string;
    upload: AttachmentUploadInput;
  }): TicketAttachmentRecord {
    const mimeType = String(params.upload.mimeType || '').trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new DomainError(
        'Unsupported evidence file type. Allowed: PDF, PNG, JPEG, or plain text.',
        400,
        'UNSUPPORTED_MIME_TYPE'
      );
    }

    const cleanBase64 = String(params.upload.contentBase64 || '').replace(
      /^data:[^;]+;base64,/,
      ''
    );
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length === 0) {
      throw new DomainError('Uploaded attachment is empty', 400, 'EMPTY_ATTACHMENT');
    }
    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new DomainError(
        'Attachment exceeds maximum allowed size of 2 MB',
        400,
        'ATTACHMENT_TOO_LARGE'
      );
    }

    // Basic magic-byte sanity validation for PDF / PNG / JPEG
    if (mimeType === 'application/pdf' && buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
      throw new DomainError('File header does not match PDF format', 400, 'INVALID_FILE_SIGNATURE');
    }
    if (
      mimeType === 'image/png' &&
      buffer.subarray(0, 4).toString('hex') !== '89504e47'
    ) {
      throw new DomainError('File header does not match PNG format', 400, 'INVALID_FILE_SIGNATURE');
    }
    if (
      mimeType === 'image/jpeg' &&
      buffer.subarray(0, 2).toString('hex') !== 'ffd8'
    ) {
      throw new DomainError('File header does not match JPEG format', 400, 'INVALID_FILE_SIGNATURE');
    }

    const id = `att_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const ext = MIME_TO_EXT[mimeType] ?? '.bin';
    const storedName = `${id}${ext}`;
    const safePath = this.resolveSafePath(storedName);
    const originalName = this.sanitizeDisplayName(params.upload.originalName);
    const now = new Date().toISOString();

    fs.writeFileSync(safePath, buffer);

    this.database.db
      .prepare(
        `INSERT INTO ticket_attachments
          (id, ticket_id, revaluation_id, uploaded_by_user_id, original_name, stored_name, mime_type, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.ticketId ?? null,
        params.revaluationId ?? null,
        params.uploadedByUserId,
        originalName,
        storedName,
        mimeType,
        buffer.length,
        now
      );

    const uploader = this.database.db
      .prepare(`SELECT full_name FROM users WHERE id = ?`)
      .get(params.uploadedByUserId) as { full_name: string } | undefined;

    return {
      id,
      ticketId: params.ticketId ?? null,
      revaluationId: params.revaluationId ?? null,
      uploadedByUserId: params.uploadedByUserId,
      uploadedByName: uploader ? String(uploader.full_name) : 'User',
      originalName,
      mimeType,
      sizeBytes: buffer.length,
      createdAt: now,
    };
  }

  public getAttachmentForDownload(attachmentId: string): {
    record: TicketAttachmentRecord & { storedName: string };
    buffer: Buffer;
  } | null {
    const row = this.database.db
      .prepare(
        `SELECT a.*, u.full_name AS uploader_name
         FROM ticket_attachments a
         JOIN users u ON u.id = a.uploaded_by_user_id
         WHERE a.id = ?`
      )
      .get(attachmentId) as Record<string, unknown> | undefined;

    if (!row) return null;

    const storedName = String(row.stored_name);
    const safePath = this.resolveSafePath(storedName);
    if (!fs.existsSync(safePath)) return null;

    return {
      record: {
        id: String(row.id),
        ticketId: row.ticket_id ? String(row.ticket_id) : null,
        revaluationId: row.revaluation_id ? String(row.revaluation_id) : null,
        uploadedByUserId: String(row.uploaded_by_user_id),
        uploadedByName: String(row.uploader_name),
        originalName: String(row.original_name),
        storedName,
        mimeType: String(row.mime_type),
        sizeBytes: Number(row.size_bytes),
        createdAt: String(row.created_at),
      },
      buffer: fs.readFileSync(safePath),
    };
  }

  public listByTicket(ticketId: string): TicketAttachmentRecord[] {
    const rows = this.database.db
      .prepare(
        `SELECT a.*, u.full_name AS uploader_name
         FROM ticket_attachments a
         JOIN users u ON u.id = a.uploaded_by_user_id
         WHERE a.ticket_id = ?
         ORDER BY a.created_at ASC`
      )
      .all(ticketId) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: String(row.id),
      ticketId: row.ticket_id ? String(row.ticket_id) : null,
      revaluationId: row.revaluation_id ? String(row.revaluation_id) : null,
      uploadedByUserId: String(row.uploaded_by_user_id),
      uploadedByName: String(row.uploader_name),
      originalName: String(row.original_name),
      mimeType: String(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      createdAt: String(row.created_at),
    }));
  }

  public listByRevaluation(revaluationId: string): TicketAttachmentRecord[] {
    const rows = this.database.db
      .prepare(
        `SELECT a.*, u.full_name AS uploader_name
         FROM ticket_attachments a
         JOIN users u ON u.id = a.uploaded_by_user_id
         WHERE a.revaluation_id = ?
         ORDER BY a.created_at ASC`
      )
      .all(revaluationId) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: String(row.id),
      ticketId: row.ticket_id ? String(row.ticket_id) : null,
      revaluationId: row.revaluation_id ? String(row.revaluation_id) : null,
      uploadedByUserId: String(row.uploaded_by_user_id),
      uploadedByName: String(row.uploader_name),
      originalName: String(row.original_name),
      mimeType: String(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      createdAt: String(row.created_at),
    }));
  }
}
