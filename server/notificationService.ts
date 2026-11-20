import crypto from 'node:crypto';
import { Response } from 'express';
import { UserRole } from '../shared/types';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationRecord,
} from '../shared/v2Types';
import { VeriMarkDatabase } from './db';

export interface CreateNotificationInput {
  userId: string;
  category: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  message: string;
  linkPath?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

export class NotificationService {
  private readonly sseClients = new Map<string, Set<Response>>();

  constructor(private readonly database: VeriMarkDatabase) {}

  public registerSseClient(userId: string, res: Response): () => void {
    let set = this.sseClients.get(userId);
    if (!set) {
      set = new Set<Response>();
      this.sseClients.set(userId, set);
    }
    set.add(res);

    return () => {
      const current = this.sseClients.get(userId);
      if (current) {
        current.delete(res);
        if (current.size === 0) {
          this.sseClients.delete(userId);
        }
      }
    };
  }

  private pushToSse(userId: string, notification: NotificationRecord): void {
    const clients = this.sseClients.get(userId);
    if (!clients || clients.size === 0) return;
    const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
    for (const res of clients) {
      try {
        res.write(payload);
      } catch {
        clients.delete(res);
      }
    }
  }

  public notifyUser(input: CreateNotificationInput): NotificationRecord {
    const id = `ntf_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const now = new Date().toISOString();
    const priority = input.priority ?? NotificationPriority.NORMAL;

    this.database.db
      .prepare(
        `INSERT INTO notifications
          (id, user_id, category, priority, title, message, link_path, entity_type, entity_id, is_read, created_at, read_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)`
      )
      .run(
        id,
        input.userId,
        input.category,
        priority,
        input.title.trim(),
        input.message.trim(),
        input.linkPath ?? null,
        input.entityType ?? null,
        input.entityId ?? null,
        now
      );

    const record: NotificationRecord = {
      id,
      userId: input.userId,
      category: input.category,
      priority,
      title: input.title.trim(),
      message: input.message.trim(),
      linkPath: input.linkPath ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      isRead: false,
      createdAt: now,
      readAt: null,
    };

    this.pushToSse(input.userId, record);
    return record;
  }

  public notifyStudentByStudentId(
    studentId: string,
    payload: Omit<CreateNotificationInput, 'userId'>
  ): NotificationRecord[] {
    const users = this.database.db
      .prepare(`SELECT id FROM users WHERE student_id = ?`)
      .all(studentId) as Array<{ id: string }>;
    return users.map((u) => this.notifyUser({ ...payload, userId: String(u.id) }));
  }

  public notifyUsersByRole(
    roles: UserRole[],
    payload: Omit<CreateNotificationInput, 'userId'>,
    excludeUserId?: string
  ): NotificationRecord[] {
    if (roles.length === 0) return [];
    const placeholders = roles.map(() => '?').join(', ');
    const rows = this.database.db
      .prepare(`SELECT id FROM users WHERE role IN (${placeholders})`)
      .all(...roles) as Array<{ id: string }>;

    const created: NotificationRecord[] = [];
    for (const row of rows) {
      const uid = String(row.id);
      if (excludeUserId && uid === excludeUserId) continue;
      created.push(this.notifyUser({ ...payload, userId: uid }));
    }
    return created;
  }

  public notifyStudentsForCourseSemester(
    course: string,
    semester: number,
    payload: Omit<CreateNotificationInput, 'userId'>
  ): NotificationRecord[] {
    const rows = this.database.db
      .prepare(
        `SELECT u.id
         FROM users u
         JOIN students s ON s.id = u.student_id
         WHERE u.role = 'STUDENT' AND s.course = ? AND s.semester = ?`
      )
      .all(course, semester) as Array<{ id: string }>;

    return rows.map((r) => this.notifyUser({ ...payload, userId: String(r.id) }));
  }

  public listForUser(
    userId: string,
    filters?: {
      category?: string;
      priority?: string;
      unreadOnly?: boolean;
      limit?: number;
    }
  ): NotificationRecord[] {
    const where: string[] = ['user_id = ?'];
    const params: (string | number)[] = [userId];

    if (filters?.category && filters.category !== 'ALL') {
      where.push('category = ?');
      params.push(filters.category);
    }
    if (filters?.priority && filters.priority !== 'ALL') {
      where.push('priority = ?');
      params.push(filters.priority);
    }
    if (filters?.unreadOnly) {
      where.push('is_read = 0');
    }

    const limit = Math.min(200, Math.max(1, filters?.limit ?? 100));
    const rows = this.database.db
      .prepare(
        `SELECT * FROM notifications
         WHERE ${where.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(...params, limit) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      category: String(r.category) as NotificationCategory,
      priority: String(r.priority) as NotificationPriority,
      title: String(r.title),
      message: String(r.message),
      linkPath: r.link_path ? String(r.link_path) : null,
      entityType: r.entity_type ? String(r.entity_type) : null,
      entityId: r.entity_id ? String(r.entity_id) : null,
      isRead: Number(r.is_read) === 1,
      createdAt: String(r.created_at),
      readAt: r.read_at ? String(r.read_at) : null,
    }));
  }

  public getUnreadCount(userId: string): number {
    const row = this.database.db
      .prepare(`SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0`)
      .get(userId) as { cnt: number };
    return Number(row.cnt);
  }

  public markAsRead(userId: string, notificationId: string): boolean {
    const now = new Date().toISOString();
    const res = this.database.db
      .prepare(
        `UPDATE notifications
         SET is_read = 1, read_at = COALESCE(read_at, ?)
         WHERE id = ? AND user_id = ?`
      )
      .run(now, notificationId, userId);
    return Number(res.changes) > 0;
  }

  public markAllAsRead(userId: string): number {
    const now = new Date().toISOString();
    const res = this.database.db
      .prepare(
        `UPDATE notifications
         SET is_read = 1, read_at = COALESCE(read_at, ?)
         WHERE user_id = ? AND is_read = 0`
      )
      .run(now, userId);
    return Number(res.changes);
  }
}
