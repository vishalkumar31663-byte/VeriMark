import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { UserProfile, UserRole } from '../shared/types';
import {
  ExamAssignmentRecord,
  ExamMode,
  ExamScheduleHistoryRecord,
  ExamScheduleRecord,
  ExamScheduleStatus,
  NotificationCategory,
  NotificationPriority,
  ScheduleChangeRequestRecord,
} from '../shared/v2Types';
import { VeriMarkDatabase } from './db';
import { DomainError } from './ledgerService';
import { NotificationService } from './notificationService';

function parseTimeToMinutes(t: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(t.trim());
  if (!m) return -1;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return -1;
  return h * 60 + min;
}

function validateSafeHttpUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new DomainError(
        'Authorized online examination URL must use http:// or https://',
        400,
        'INVALID_URL_SCHEME'
      );
    }
    return parsed.toString();
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw new DomainError('Invalid online examination URL', 400, 'INVALID_URL');
  }
}

function timesOverlap(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && s2 < e1;
}

export interface CreateScheduleInput {
  examinationId?: string;
  subjectId: string;
  academicSession: string;
  course: string;
  semester: number;
  category?: string;
  examDate: string;
  startTime: string;
  endTime: string;
  timezone?: string;
  mode: ExamMode;
  onlineUrl?: string | null;
  accessInstructions?: string | null;
  campus?: string | null;
  building?: string | null;
  room?: string | null;
  reportingTime?: string | null;
  requiredDocuments?: string | null;
  instructions?: string;
  admitCardAvailable?: boolean;
  examinerUserIds?: string[];
  publishImmediately?: boolean;
}

export class ExamScheduleService {
  constructor(
    private readonly database: VeriMarkDatabase,
    private readonly notifications: NotificationService
  ) {}

  private loadAssignments(scheduleId: string): ExamAssignmentRecord[] {
    const rows = this.database.db
      .prepare(
        `SELECT a.*, u.full_name AS examiner_name, u.email AS examiner_email
         FROM exam_assignments a
         JOIN users u ON u.id = a.examiner_user_id
         WHERE a.schedule_id = ?
         ORDER BY a.assigned_at ASC`
      )
      .all(scheduleId) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: String(r.id),
      scheduleId: String(r.schedule_id),
      examinerUserId: String(r.examiner_user_id),
      examinerName: String(r.examiner_name),
      examinerEmail: String(r.examiner_email),
      assignedByUserId: String(r.assigned_by_user_id),
      roleLabel: String(r.role_label),
      assignedAt: String(r.assigned_at),
    }));
  }

  private mapScheduleRow(
    row: Record<string, unknown>,
    studentId?: string | null
  ): ExamScheduleRecord {
    const id = String(row.id);
    let studentSeatNumber: string | null = null;
    let studentRoom: string | null = null;

    if (studentId) {
      const seat = this.database.db
        .prepare(
          `SELECT room, seat_number FROM exam_seat_assignments WHERE schedule_id = ? AND student_id = ?`
        )
        .get(id, studentId) as { room: string; seat_number: string } | undefined;
      if (seat) {
        studentRoom = String(seat.room);
        studentSeatNumber = String(seat.seat_number);
      }
    }

    return {
      id,
      examinationId: String(row.examination_id),
      subjectId: String(row.subject_id),
      subjectCode: String(row.subject_code),
      subjectTitle: String(row.subject_title),
      academicSession: String(row.academic_session),
      course: String(row.course),
      semester: Number(row.semester),
      category: String(row.category),
      examDate: String(row.exam_date),
      startTime: String(row.start_time),
      endTime: String(row.end_time),
      timezone: String(row.timezone),
      mode: String(row.mode) as ExamMode,
      onlineUrl: row.online_url ? String(row.online_url) : null,
      accessInstructions: row.access_instructions ? String(row.access_instructions) : null,
      campus: row.campus ? String(row.campus) : null,
      building: row.building ? String(row.building) : null,
      room: row.room ? String(row.room) : null,
      reportingTime: row.reporting_time ? String(row.reporting_time) : null,
      requiredDocuments: row.required_documents ? String(row.required_documents) : null,
      instructions: String(row.instructions ?? ''),
      status: String(row.status) as ExamScheduleStatus,
      admitCardAvailable: Number(row.admit_card_available) === 1,
      createdByUserId: String(row.created_by_user_id),
      createdByName: String(row.created_by_name ?? 'Examination Office'),
      publishedAt: row.published_at ? String(row.published_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      assignments: this.loadAssignments(id),
      studentSeatNumber,
      studentRoom,
    };
  }

  private validateScheduleConflicts(params: {
    excludeScheduleId?: string;
    examDate: string;
    startTime: string;
    endTime: string;
    mode: ExamMode;
    campus?: string | null;
    building?: string | null;
    room?: string | null;
    course: string;
    semester: number;
    examinerUserIds?: string[];
  }): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.examDate)) {
      throw new DomainError('Examination date must follow YYYY-MM-DD format', 400);
    }

    const startMin = parseTimeToMinutes(params.startTime);
    const endMin = parseTimeToMinutes(params.endTime);
    if (startMin < 0 || endMin < 0 || endMin <= startMin) {
      throw new DomainError(
        'Invalid examination time range: end time must be strictly after start time',
        400,
        'INVALID_TIME_RANGE'
      );
    }

    const sameDayRows = this.database.db
      .prepare(
        `SELECT * FROM exam_schedules
         WHERE exam_date = ? AND status != 'CANCELLED'
         ${params.excludeScheduleId ? 'AND id != ?' : ''}`
      )
      .all(
        ...(params.excludeScheduleId
          ? [params.examDate, params.excludeScheduleId]
          : [params.examDate])
      ) as Record<string, unknown>[];

    for (const other of sameDayRows) {
      const oStart = parseTimeToMinutes(String(other.start_time));
      const oEnd = parseTimeToMinutes(String(other.end_time));
      if (!timesOverlap(startMin, endMin, oStart, oEnd)) continue;

      // 1. Overlapping cohort exam conflict (same course & semester)
      if (
        String(other.course) === params.course &&
        Number(other.semester) === params.semester
      ) {
        throw new DomainError(
          `Cohort schedule conflict: ${params.course} Semester ${params.semester} already has ${String(
            other.subject_code
          )} scheduled on ${params.examDate} (${String(other.start_time)}–${String(
            other.end_time
          )}).`,
          409,
          'SCHEDULE_COHORT_CONFLICT'
        );
      }

      // 2. Overlapping room allocation for OFFLINE exams
      if (
        params.mode === ExamMode.OFFLINE &&
        String(other.mode) === ExamMode.OFFLINE &&
        params.room &&
        other.room &&
        String(other.room).trim().toLowerCase() === params.room.trim().toLowerCase() &&
        String(other.building ?? '').trim().toLowerCase() ===
          String(params.building ?? '').trim().toLowerCase()
      ) {
        throw new DomainError(
          `Venue conflict: Room "${params.room}" (${params.building || 'Campus'}) is already booked by ${String(
            other.subject_code
          )} on ${params.examDate} (${String(other.start_time)}–${String(other.end_time)}).`,
          409,
          'SCHEDULE_ROOM_CONFLICT'
        );
      }

      // 3. Overlapping examiner assignments
      if (params.examinerUserIds && params.examinerUserIds.length > 0) {
        const otherAssigned = this.database.db
          .prepare(`SELECT examiner_user_id FROM exam_assignments WHERE schedule_id = ?`)
          .all(String(other.id)) as Array<{ examiner_user_id: string }>;
        const otherSet = new Set(otherAssigned.map((a) => String(a.examiner_user_id)));
        for (const exId of params.examinerUserIds) {
          if (otherSet.has(exId)) {
            throw new DomainError(
              `Examiner conflict: Selected examiner is already assigned to ${String(
                other.subject_code
              )} on ${params.examDate} (${String(other.start_time)}–${String(
                other.end_time
              )}).`,
              409,
              'SCHEDULE_EXAMINER_CONFLICT'
            );
          }
        }
      }
    }
  }

  private recordHistory(
    scheduleId: string,
    actorUserId: string,
    action: string,
    changeSummary: string,
    previousObj: unknown,
    nextObj: unknown
  ): void {
    const id = `esh_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    this.database.db
      .prepare(
        `INSERT INTO exam_schedule_history
          (id, schedule_id, actor_user_id, action, change_summary, previous_json, next_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        scheduleId,
        actorUserId,
        action,
        changeSummary,
        previousObj ? JSON.stringify(previousObj) : null,
        nextObj ? JSON.stringify(nextObj) : null,
        new Date().toISOString()
      );
  }

  public listSchedulesForUser(
    user: UserProfile,
    filters?: {
      status?: string;
      mode?: string;
      semester?: number;
      subjectCode?: string;
      assignedOnly?: boolean;
    }
  ): ExamScheduleRecord[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    let studentId: string | null = null;

    if (user.role === UserRole.STUDENT) {
      if (!user.studentId) return [];
      studentId = user.studentId;
      const stu = this.database.db
        .prepare(`SELECT course, semester FROM students WHERE id = ?`)
        .get(user.studentId) as { course: string; semester: number } | undefined;
      if (!stu) return [];
      // Students NEVER see DRAFT schedules
      where.push(`s.status IN ('PUBLISHED', 'CANCELLED')`);
      where.push(`s.course = ?`);
      where.push(`s.semester = ?`);
      params.push(String(stu.course), Number(stu.semester));
    } else if (user.role === UserRole.EXAMINER) {
      if (filters?.assignedOnly) {
        where.push(
          `EXISTS (SELECT 1 FROM exam_assignments ea WHERE ea.schedule_id = s.id AND ea.examiner_user_id = ?)`
        );
        params.push(user.id);
      } else {
        where.push(
          `(s.status != 'DRAFT' OR EXISTS (SELECT 1 FROM exam_assignments ea WHERE ea.schedule_id = s.id AND ea.examiner_user_id = ?))`
        );
        params.push(user.id);
      }
    }

    if (filters?.status && filters.status !== 'ALL') {
      where.push('s.status = ?');
      params.push(filters.status);
    }
    if (filters?.mode && filters.mode !== 'ALL') {
      where.push('s.mode = ?');
      params.push(filters.mode);
    }
    if (filters?.semester && Number.isInteger(filters.semester)) {
      where.push('s.semester = ?');
      params.push(filters.semester);
    }
    if (filters?.subjectCode) {
      where.push('s.subject_code = ?');
      params.push(filters.subjectCode);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.database.db
      .prepare(
        `SELECT s.*, u.full_name AS created_by_name
         FROM exam_schedules s
         JOIN users u ON u.id = s.created_by_user_id
         ${whereSql}
         ORDER BY s.exam_date ASC, s.start_time ASC`
      )
      .all(...params) as Record<string, unknown>[];

    return rows.map((r) => this.mapScheduleRow(r, studentId));
  }

  public getScheduleById(scheduleId: string, user?: UserProfile): ExamScheduleRecord | null {
    const row = this.database.db
      .prepare(
        `SELECT s.*, u.full_name AS created_by_name
         FROM exam_schedules s
         JOIN users u ON u.id = s.created_by_user_id
         WHERE s.id = ?`
      )
      .get(scheduleId) as Record<string, unknown> | undefined;

    if (!row) return null;

    if (user?.role === UserRole.STUDENT) {
      if (String(row.status) === ExamScheduleStatus.DRAFT) {
        throw new DomainError('Draft schedules are not accessible to students', 403, 'FORBIDDEN');
      }
      if (!user.studentId) {
        throw new DomainError('Student profile not linked', 403, 'FORBIDDEN');
      }
      const stu = this.database.db
        .prepare(`SELECT course, semester FROM students WHERE id = ?`)
        .get(user.studentId) as { course: string; semester: number } | undefined;
      if (
        !stu ||
        String(stu.course) !== String(row.course) ||
        Number(stu.semester) !== Number(row.semester)
      ) {
        throw new DomainError(
          'You may only view examination schedules for your enrolled course and semester',
          403,
          'FORBIDDEN'
        );
      }
    }

    return this.mapScheduleRow(row, user?.studentId);
  }

  public createSchedule(input: CreateScheduleInput, actor: UserProfile): ExamScheduleRecord {
    const subject = this.database.db
      .prepare(`SELECT id, code, name, semester FROM subjects WHERE id = ? OR code = ?`)
      .get(input.subjectId, input.subjectId) as
      | { id: string; code: string; name: string; semester: number }
      | undefined;

    if (!subject) {
      throw new DomainError('Selected subject does not exist', 404, 'SUBJECT_NOT_FOUND');
    }

    const mode = input.mode === ExamMode.ONLINE ? ExamMode.ONLINE : ExamMode.OFFLINE;
    const safeOnlineUrl = mode === ExamMode.ONLINE ? validateSafeHttpUrl(input.onlineUrl) : null;
    if (mode === ExamMode.OFFLINE && !input.room?.trim()) {
      throw new DomainError(
        'Offline examinations require a venue room allocation',
        400,
        'ROOM_REQUIRED'
      );
    }

    const examinerIds = Array.from(new Set(input.examinerUserIds ?? [])).filter(Boolean);
    for (const exId of examinerIds) {
      const exRow = this.database.db
        .prepare(`SELECT id, role FROM users WHERE id = ?`)
        .get(exId) as { id: string; role: string } | undefined;
      if (!exRow || exRow.role !== UserRole.EXAMINER) {
        throw new DomainError(`User "${exId}" is not a valid Examiner account`, 400);
      }
    }

    this.validateScheduleConflicts({
      examDate: input.examDate,
      startTime: input.startTime,
      endTime: input.endTime,
      mode,
      campus: input.campus,
      building: input.building,
      room: input.room,
      course: input.course.trim(),
      semester: Number(input.semester),
      examinerUserIds: examinerIds,
    });

    const id = `sch_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const examinationId =
      input.examinationId?.trim() ||
      `EXM-${new Date().getFullYear()}-${subject.code}-${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`;
    const now = new Date().toISOString();
    const status = input.publishImmediately
      ? ExamScheduleStatus.PUBLISHED
      : ExamScheduleStatus.DRAFT;
    const publishedAt = input.publishImmediately ? now : null;

    this.database.runInTransaction(() => {
      this.database.db
        .prepare(
          `INSERT INTO exam_schedules
            (id, examination_id, subject_id, subject_code, subject_title, academic_session, course, semester,
             category, exam_date, start_time, end_time, timezone, mode, online_url, access_instructions,
             campus, building, room, reporting_time, required_documents, instructions, status,
             admit_card_available, created_by_user_id, published_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          examinationId,
          subject.id,
          subject.code,
          subject.name,
          input.academicSession.trim() || '2025-2026',
          input.course.trim(),
          Number(input.semester),
          (input.category || 'End-Term').trim(),
          input.examDate.trim(),
          input.startTime.trim(),
          input.endTime.trim(),
          (input.timezone || 'Asia/Kolkata').trim(),
          mode,
          safeOnlineUrl,
          input.accessInstructions?.trim() || null,
          mode === ExamMode.OFFLINE ? input.campus?.trim() || 'Main Academic Campus' : null,
          mode === ExamMode.OFFLINE ? input.building?.trim() || 'Block A' : null,
          mode === ExamMode.OFFLINE ? input.room?.trim() || null : null,
          input.reportingTime?.trim() || null,
          input.requiredDocuments?.trim() ||
            (mode === ExamMode.OFFLINE
              ? 'University Photo ID Card & Printed/Digital VeriMark Admit Card'
              : 'University Photo ID & Authenticated Portal Login'),
          input.instructions?.trim() ||
            'Arrive or connect 15 minutes before exam start. Follow University Examination Conduct Regulations.',
          status,
          input.admitCardAvailable ? 1 : 0,
          actor.id,
          publishedAt,
          now,
          now
        );

      for (const exId of examinerIds) {
        const assignId = `exa_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        this.database.db
          .prepare(
            `INSERT INTO exam_assignments (id, schedule_id, examiner_user_id, assigned_by_user_id, role_label, assigned_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(assignId, id, exId, actor.id, 'Primary Examiner', now);
      }

      this.recordHistory(
        id,
        actor.id,
        status === ExamScheduleStatus.PUBLISHED ? 'CREATED_AND_PUBLISHED' : 'CREATED_DRAFT',
        `Created ${mode} exam schedule for ${subject.code} on ${input.examDate} (${input.startTime}–${input.endTime})`,
        null,
        { examinationId, examDate: input.examDate, startTime: input.startTime, endTime: input.endTime, mode, status }
      );
    });

    const created = this.getScheduleById(id)!;

    // Trigger real notifications
    for (const exId of examinerIds) {
      this.notifications.notifyUser({
        userId: exId,
        category: NotificationCategory.EXAM_SCHEDULE,
        priority: NotificationPriority.HIGH,
        title: `Examination Assigned: ${created.subjectCode}`,
        message: `You have been assigned to ${created.subjectCode} — ${created.subjectTitle} (${created.mode}) on ${created.examDate} (${created.startTime}–${created.endTime}).`,
        linkPath: '/assigned-exams',
        entityType: 'exam_schedule',
        entityId: created.id,
      });
    }

    if (created.status === ExamScheduleStatus.PUBLISHED) {
      this.notifications.notifyStudentsForCourseSemester(created.course, created.semester, {
        category: NotificationCategory.EXAM_SCHEDULE,
        priority: NotificationPriority.HIGH,
        title: `Exam Timetable Published: ${created.subjectCode}`,
        message: `${created.subjectCode} (${created.subjectTitle}) is scheduled on ${created.examDate} from ${created.startTime} to ${created.endTime} (${created.mode}).`,
        linkPath: '/exam-schedule',
        entityType: 'exam_schedule',
        entityId: created.id,
      });
    }

    return created;
  }

  public updateSchedule(
    scheduleId: string,
    patch: Partial<CreateScheduleInput> & { status?: ExamScheduleStatus },
    actor: UserProfile
  ): ExamScheduleRecord {
    const existing = this.getScheduleById(scheduleId);
    if (!existing) {
      throw new DomainError('Examination schedule not found', 404, 'SCHEDULE_NOT_FOUND');
    }

    const nextDate = patch.examDate?.trim() ?? existing.examDate;
    const nextStart = patch.startTime?.trim() ?? existing.startTime;
    const nextEnd = patch.endTime?.trim() ?? existing.endTime;
    const nextMode = patch.mode ?? existing.mode;
    const nextCampus = patch.campus !== undefined ? patch.campus : existing.campus;
    const nextBuilding = patch.building !== undefined ? patch.building : existing.building;
    const nextRoom = patch.room !== undefined ? patch.room : existing.room;
    const nextOnlineUrl =
      nextMode === ExamMode.ONLINE
        ? validateSafeHttpUrl(
            patch.onlineUrl !== undefined ? patch.onlineUrl : existing.onlineUrl
          )
        : null;
    const nextStatus = patch.status ?? existing.status;

    if (nextMode === ExamMode.OFFLINE && !nextRoom?.trim()) {
      throw new DomainError(
        'Offline examination schedules require a room allocation',
        400,
        'ROOM_REQUIRED'
      );
    }

    const assignedIds = existing.assignments.map((a) => a.examinerUserId);
    if (nextStatus !== ExamScheduleStatus.CANCELLED) {
      this.validateScheduleConflicts({
        excludeScheduleId: scheduleId,
        examDate: nextDate,
        startTime: nextStart,
        endTime: nextEnd,
        mode: nextMode,
        campus: nextCampus,
        building: nextBuilding,
        room: nextRoom,
        course: existing.course,
        semester: existing.semester,
        examinerUserIds: assignedIds,
      });
    }

    const changes: string[] = [];
    const dateChanged = nextDate !== existing.examDate || nextStart !== existing.startTime || nextEnd !== existing.endTime;
    const modeChanged = nextMode !== existing.mode;
    const venueChanged = nextRoom !== existing.room || nextBuilding !== existing.building || nextCampus !== existing.campus;
    const cancelledNow = nextStatus === ExamScheduleStatus.CANCELLED && existing.status !== ExamScheduleStatus.CANCELLED;

    if (dateChanged) changes.push(`Date/Time: ${existing.examDate} ${existing.startTime}-${existing.endTime} -> ${nextDate} ${nextStart}-${nextEnd}`);
    if (modeChanged) changes.push(`Mode: ${existing.mode} -> ${nextMode}`);
    if (venueChanged) changes.push(`Venue updated to ${nextRoom || 'Online'}`);
    if (cancelledNow) changes.push('Status -> CANCELLED');
    if (patch.admitCardAvailable !== undefined && patch.admitCardAvailable !== existing.admitCardAvailable) {
      changes.push(`Admit card availability -> ${patch.admitCardAvailable ? 'Enabled' : 'Disabled'}`);
    }
    if (changes.length === 0) changes.push('Schedule details updated');

    const now = new Date().toISOString();
    this.database.runInTransaction(() => {
      this.database.db
        .prepare(
          `UPDATE exam_schedules
           SET exam_date = ?, start_time = ?, end_time = ?, timezone = ?, mode = ?,
               online_url = ?, access_instructions = ?, campus = ?, building = ?, room = ?,
               reporting_time = ?, required_documents = ?, instructions = ?, status = ?,
               admit_card_available = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          nextDate,
          nextStart,
          nextEnd,
          patch.timezone?.trim() ?? existing.timezone,
          nextMode,
          nextOnlineUrl,
          patch.accessInstructions !== undefined
            ? patch.accessInstructions
            : existing.accessInstructions,
          nextMode === ExamMode.OFFLINE ? nextCampus : null,
          nextMode === ExamMode.OFFLINE ? nextBuilding : null,
          nextMode === ExamMode.OFFLINE ? nextRoom : null,
          patch.reportingTime !== undefined ? patch.reportingTime : existing.reportingTime,
          patch.requiredDocuments !== undefined
            ? patch.requiredDocuments
            : existing.requiredDocuments,
          patch.instructions !== undefined ? patch.instructions : existing.instructions,
          nextStatus,
          patch.admitCardAvailable !== undefined
            ? patch.admitCardAvailable
              ? 1
              : 0
            : existing.admitCardAvailable
            ? 1
            : 0,
          now,
          scheduleId
        );

      this.recordHistory(
        scheduleId,
        actor.id,
        cancelledNow ? 'CANCELLED' : modeChanged ? 'MODE_CHANGED' : 'UPDATED',
        changes.join('; '),
        {
          examDate: existing.examDate,
          startTime: existing.startTime,
          endTime: existing.endTime,
          mode: existing.mode,
          room: existing.room,
          status: existing.status,
        },
        {
          examDate: nextDate,
          startTime: nextStart,
          endTime: nextEnd,
          mode: nextMode,
          room: nextRoom,
          status: nextStatus,
        }
      );
    });

    const updated = this.getScheduleById(scheduleId)!;

    // Notify affected students & examiners if schedule is published or cancelled
    if (existing.status === ExamScheduleStatus.PUBLISHED || updated.status === ExamScheduleStatus.PUBLISHED) {
      const title = cancelledNow
        ? `Examination Cancelled: ${updated.subjectCode}`
        : modeChanged
        ? `Exam Mode Changed (${updated.mode}): ${updated.subjectCode}`
        : dateChanged
        ? `Examination Date/Time Updated: ${updated.subjectCode}`
        : `Examination Schedule Updated: ${updated.subjectCode}`;

      const msg = `${updated.subjectCode} (${updated.subjectTitle}): ${changes.join('. ')}.`;

      this.notifications.notifyStudentsForCourseSemester(updated.course, updated.semester, {
        category: NotificationCategory.EXAM_SCHEDULE,
        priority: modeChanged || dateChanged || cancelledNow
          ? NotificationPriority.HIGH
          : NotificationPriority.NORMAL,
        title,
        message: msg,
        linkPath: '/exam-schedule',
        entityType: 'exam_schedule',
        entityId: updated.id,
      });

      for (const a of updated.assignments) {
        this.notifications.notifyUser({
          userId: a.examinerUserId,
          category: NotificationCategory.EXAM_SCHEDULE,
          priority: NotificationPriority.HIGH,
          title: `Schedule Modified: ${updated.subjectCode}`,
          message: msg,
          linkPath: '/assigned-exams',
          entityType: 'exam_schedule',
          entityId: updated.id,
        });
      }
    }

    return updated;
  }

  public publishSchedule(scheduleId: string, actor: UserProfile): ExamScheduleRecord {
    const existing = this.getScheduleById(scheduleId);
    if (!existing) {
      throw new DomainError('Examination schedule not found', 404, 'SCHEDULE_NOT_FOUND');
    }
    if (existing.status === ExamScheduleStatus.PUBLISHED) {
      return existing;
    }
    if (existing.status === ExamScheduleStatus.CANCELLED) {
      throw new DomainError('Cannot publish a cancelled examination schedule', 400);
    }

    this.validateScheduleConflicts({
      excludeScheduleId: scheduleId,
      examDate: existing.examDate,
      startTime: existing.startTime,
      endTime: existing.endTime,
      mode: existing.mode,
      campus: existing.campus,
      building: existing.building,
      room: existing.room,
      course: existing.course,
      semester: existing.semester,
      examinerUserIds: existing.assignments.map((a) => a.examinerUserId),
    });

    const now = new Date().toISOString();
    this.database.runInTransaction(() => {
      this.database.db
        .prepare(
          `UPDATE exam_schedules
           SET status = 'PUBLISHED', published_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(now, now, scheduleId);

      this.recordHistory(
        scheduleId,
        actor.id,
        'PUBLISHED',
        `Published timetable entry for ${existing.subjectCode} (${existing.examDate} ${existing.startTime}–${existing.endTime})`,
        { status: existing.status },
        { status: ExamScheduleStatus.PUBLISHED, publishedAt: now }
      );
    });

    const published = this.getScheduleById(scheduleId)!;

    this.notifications.notifyStudentsForCourseSemester(published.course, published.semester, {
      category: NotificationCategory.EXAM_SCHEDULE,
      priority: NotificationPriority.HIGH,
      title: `Exam Timetable Published: ${published.subjectCode}`,
      message: `${published.subjectCode} (${published.subjectTitle}) is scheduled on ${published.examDate} (${published.startTime}–${published.endTime}, ${published.mode}).`,
      linkPath: '/exam-schedule',
      entityType: 'exam_schedule',
      entityId: published.id,
    });

    for (const a of published.assignments) {
      this.notifications.notifyUser({
        userId: a.examinerUserId,
        category: NotificationCategory.EXAM_SCHEDULE,
        priority: NotificationPriority.NORMAL,
        title: `Assigned Exam Published: ${published.subjectCode}`,
        message: `Timetable published for ${published.subjectCode} on ${published.examDate} (${published.startTime}–${published.endTime}).`,
        linkPath: '/assigned-exams',
        entityType: 'exam_schedule',
        entityId: published.id,
      });
    }

    return published;
  }

  public assignExaminer(
    scheduleId: string,
    examinerUserId: string,
    roleLabel: string,
    actor: UserProfile
  ): ExamScheduleRecord {
    const schedule = this.getScheduleById(scheduleId);
    if (!schedule) {
      throw new DomainError('Examination schedule not found', 404, 'SCHEDULE_NOT_FOUND');
    }

    const examiner = this.database.db
      .prepare(`SELECT id, full_name, role FROM users WHERE id = ?`)
      .get(examinerUserId) as { id: string; full_name: string; role: string } | undefined;
    if (!examiner || examiner.role !== UserRole.EXAMINER) {
      throw new DomainError('Target user must be an active Examiner', 400, 'INVALID_EXAMINER');
    }

    const alreadyAssigned = schedule.assignments.some(
      (a) => a.examinerUserId === examinerUserId
    );
    if (alreadyAssigned) {
      throw new DomainError(
        `${examiner.full_name} is already assigned to this examination`,
        409,
        'DUPLICATE_ASSIGNMENT'
      );
    }

    // Validate examiner doesn't have an overlapping assignment on the same date
    this.validateScheduleConflicts({
      excludeScheduleId: scheduleId,
      examDate: schedule.examDate,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      mode: schedule.mode,
      campus: schedule.campus,
      building: schedule.building,
      room: schedule.room,
      course: schedule.course,
      semester: schedule.semester,
      examinerUserIds: [examinerUserId],
    });

    const id = `exa_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();

    this.database.runInTransaction(() => {
      this.database.db
        .prepare(
          `INSERT INTO exam_assignments (id, schedule_id, examiner_user_id, assigned_by_user_id, role_label, assigned_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(id, scheduleId, examinerUserId, actor.id, roleLabel.trim() || 'Primary Examiner', now);

      this.recordHistory(
        scheduleId,
        actor.id,
        'EXAMINER_ASSIGNED',
        `Assigned Examiner ${examiner.full_name} (${roleLabel || 'Primary Examiner'})`,
        null,
        { examinerUserId, examinerName: examiner.full_name }
      );
    });

    this.notifications.notifyUser({
      userId: examinerUserId,
      category: NotificationCategory.EXAM_SCHEDULE,
      priority: NotificationPriority.HIGH,
      title: `Examination Assigned: ${schedule.subjectCode}`,
      message: `You have been assigned to ${schedule.subjectCode} (${schedule.subjectTitle}) on ${schedule.examDate} (${schedule.startTime}–${schedule.endTime}).`,
      linkPath: '/assigned-exams',
      entityType: 'exam_schedule',
      entityId: schedule.id,
    });

    return this.getScheduleById(scheduleId)!;
  }

  public removeExaminerAssignment(
    scheduleId: string,
    examinerUserId: string,
    actor: UserProfile
  ): ExamScheduleRecord {
    const schedule = this.getScheduleById(scheduleId);
    if (!schedule) {
      throw new DomainError('Examination schedule not found', 404);
    }
    this.database.db
      .prepare(`DELETE FROM exam_assignments WHERE schedule_id = ? AND examiner_user_id = ?`)
      .run(scheduleId, examinerUserId);
    this.recordHistory(
      scheduleId,
      actor.id,
      'EXAMINER_REMOVED',
      `Removed examiner assignment (${examinerUserId})`,
      { examinerUserId },
      null
    );
    return this.getScheduleById(scheduleId)!;
  }

  public getScheduleHistory(scheduleId: string): ExamScheduleHistoryRecord[] {
    const rows = this.database.db
      .prepare(
        `SELECT h.*, u.full_name AS actor_name
         FROM exam_schedule_history h
         JOIN users u ON u.id = h.actor_user_id
         WHERE h.schedule_id = ?
         ORDER BY h.created_at DESC`
      )
      .all(scheduleId) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: String(r.id),
      scheduleId: String(r.schedule_id),
      actorUserId: String(r.actor_user_id),
      actorName: String(r.actor_name),
      action: String(r.action),
      changeSummary: String(r.change_summary),
      createdAt: String(r.created_at),
    }));
  }

  public createChangeRequest(
    scheduleId: string,
    requestedChanges: string,
    reason: string,
    actor: UserProfile
  ): ScheduleChangeRequestRecord {
    const schedule = this.getScheduleById(scheduleId);
    if (!schedule) {
      throw new DomainError('Examination schedule not found', 404);
    }
    if (
      actor.role === UserRole.EXAMINER &&
      !schedule.assignments.some((a) => a.examinerUserId === actor.id)
    ) {
      throw new DomainError(
        'Examiners can only submit schedule modification requests for their assigned examinations',
        403,
        'FORBIDDEN'
      );
    }
    if (!requestedChanges.trim() || reason.trim().length < 8) {
      throw new DomainError(
        'Please specify the requested schedule changes and a clear reason (min 8 chars)',
        400
      );
    }

    const id = `scr_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.database.db
      .prepare(
        `INSERT INTO schedule_change_requests
          (id, schedule_id, requested_by_user_id, requested_changes, reason, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`
      )
      .run(id, scheduleId, actor.id, requestedChanges.trim(), reason.trim(), now, now);

    this.notifications.notifyUsersByRole([UserRole.CONTROLLER, UserRole.SUPER_ADMIN], {
      category: NotificationCategory.EXAM_SCHEDULE,
      priority: NotificationPriority.HIGH,
      title: `Schedule Change Request: ${schedule.subjectCode}`,
      message: `${actor.fullName} requested a schedule modification for ${schedule.subjectCode}: ${requestedChanges.trim()}`,
      linkPath: '/exam-management',
      entityType: 'schedule_change_request',
      entityId: id,
    });

    return this.listChangeRequests().find((r) => r.id === id)!;
  }

  public listChangeRequests(user?: UserProfile): ScheduleChangeRequestRecord[] {
    const where =
      user?.role === UserRole.EXAMINER ? 'WHERE r.requested_by_user_id = ?' : '';
    const params = user?.role === UserRole.EXAMINER ? [user.id] : [];

    const rows = this.database.db
      .prepare(
        `SELECT r.*, s.examination_id, s.subject_code, s.subject_title,
                req.full_name AS requested_by_name, rev.full_name AS reviewed_by_name
         FROM schedule_change_requests r
         JOIN exam_schedules s ON s.id = r.schedule_id
         JOIN users req ON req.id = r.requested_by_user_id
         LEFT JOIN users rev ON rev.id = r.reviewed_by_user_id
         ${where}
         ORDER BY r.created_at DESC`
      )
      .all(...params) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: String(r.id),
      scheduleId: String(r.schedule_id),
      examinationId: String(r.examination_id),
      subjectCode: String(r.subject_code),
      subjectTitle: String(r.subject_title),
      requestedByUserId: String(r.requested_by_user_id),
      requestedByName: String(r.requested_by_name),
      requestedChanges: String(r.requested_changes),
      reason: String(r.reason),
      status: String(r.status) as 'PENDING' | 'APPROVED' | 'REJECTED',
      reviewedByUserId: r.reviewed_by_user_id ? String(r.reviewed_by_user_id) : null,
      reviewedByName: r.reviewed_by_name ? String(r.reviewed_by_name) : null,
      reviewNote: r.review_note ? String(r.review_note) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  public reviewChangeRequest(
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    reviewNote: string,
    actor: UserProfile
  ): ScheduleChangeRequestRecord {
    const existing = this.listChangeRequests().find((r) => r.id === requestId);
    if (!existing) {
      throw new DomainError('Schedule change request not found', 404);
    }

    const now = new Date().toISOString();
    this.database.db
      .prepare(
        `UPDATE schedule_change_requests
         SET status = ?, reviewed_by_user_id = ?, review_note = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(decision, actor.id, reviewNote.trim() || null, now, requestId);

    this.notifications.notifyUser({
      userId: existing.requestedByUserId,
      category: NotificationCategory.EXAM_SCHEDULE,
      priority: NotificationPriority.NORMAL,
      title: `Controller Response on ${existing.subjectCode} Change Request`,
      message: `Your schedule modification request was ${decision.toLowerCase()} by ${actor.fullName}${
        reviewNote.trim() ? `: ${reviewNote.trim()}` : ''
      }.`,
      linkPath: '/assigned-exams',
      entityType: 'schedule_change_request',
      entityId: requestId,
    });

    return this.listChangeRequests().find((r) => r.id === requestId)!;
  }

  public async generateTimetablePdf(
    schedules: ExamScheduleRecord[],
    subtitle: string
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle('VeriMark Official Examination Timetable');
    pdfDoc.setAuthor('Demo University Examination Office');

    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontMono = await pdfDoc.embedFont(StandardFonts.CourierBold);

    const navy = rgb(0.06, 0.09, 0.16);
    const indigo = rgb(0.31, 0.27, 0.9);
    const slate = rgb(0.39, 0.45, 0.55);
    const border = rgb(0.84, 0.87, 0.92);

    page.drawRectangle({
      x: 28,
      y: height - 110,
      width: width - 56,
      height: 82,
      color: navy,
    });
    page.drawText('DEMO UNIVERSITY — EXAMINATION TIMETABLE', {
      x: 46,
      y: height - 62,
      size: 16,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText(subtitle, {
      x: 46,
      y: height - 82,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.78, 0.84, 0.94),
    });
    page.drawText(`Generated: ${new Date().toUTCString()}`, {
      x: 46,
      y: height - 98,
      size: 8,
      font: fontMono,
      color: rgb(0.6, 0.7, 0.85),
    });

    let y = height - 140;
    page.drawText('CODE', { x: 42, y, size: 8.5, font: fontBold, color: indigo });
    page.drawText('SUBJECT', { x: 102, y, size: 8.5, font: fontBold, color: indigo });
    page.drawText('DATE & TIME', { x: 288, y, size: 8.5, font: fontBold, color: indigo });
    page.drawText('MODE / VENUE', { x: 416, y, size: 8.5, font: fontBold, color: indigo });
    y -= 10;
    page.drawLine({
      start: { x: 36, y },
      end: { x: width - 36, y },
      thickness: 0.75,
      color: border,
    });
    y -= 20;

    if (schedules.length === 0) {
      page.drawText('No published examinations found for this selection.', {
        x: 42,
        y,
        size: 10,
        font: fontRegular,
        color: slate,
      });
    } else {
      for (const s of schedules.slice(0, 14)) {
        page.drawText(s.subjectCode, { x: 42, y, size: 9, font: fontMono, color: navy });
        page.drawText(s.subjectTitle.slice(0, 32), {
          x: 102,
          y,
          size: 9,
          font: fontBold,
          color: navy,
        });
        page.drawText(`${s.examDate}  ${s.startTime}-${s.endTime}`, {
          x: 288,
          y,
          size: 8.5,
          font: fontMono,
          color: navy,
        });
        const venue =
          s.mode === ExamMode.ONLINE
            ? 'ONLINE (Authorized Portal)'
            : `OFFLINE · ${s.building || ''} ${s.room || ''}`.trim();
        page.drawText(venue.slice(0, 28), {
          x: 416,
          y,
          size: 8.5,
          font: fontRegular,
          color: slate,
        });

        y -= 14;
        page.drawText(
          `Exam ID: ${s.examinationId} · ${s.course} Sem ${s.semester} · Status: ${s.status}${
            s.studentSeatNumber ? ` · Seat: ${s.studentSeatNumber}` : ''
          }`,
          { x: 42, y, size: 7.5, font: fontRegular, color: slate }
        );
        y -= 16;
        page.drawLine({
          start: { x: 36, y: y + 6 },
          end: { x: width - 36, y: y + 6 },
          thickness: 0.4,
          color: border,
        });
        y -= 10;
      }
    }

    page.drawText(
      'VeriMark 2.0 Smart Examination Management · Official Published Schedule Export',
      { x: 42, y: 42, size: 8, font: fontRegular, color: slate }
    );

    return await pdfDoc.save();
  }
}
