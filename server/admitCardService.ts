import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { UserProfile, UserRole } from '../shared/types';
import {
  AdmitCardRecord,
  AdmitCardStatus,
  ExamMode,
  ExamScheduleStatus,
  NotificationCategory,
  NotificationPriority,
  PublicAdmitCardVerification,
} from '../shared/v2Types';
import { VeriMarkDatabase } from './db';
import { DomainError } from './ledgerService';
import { NotificationService } from './notificationService';

export class AdmitCardService {
  constructor(
    private readonly database: VeriMarkDatabase,
    private readonly notifications: NotificationService
  ) {}

  private mapRow(row: Record<string, unknown>): AdmitCardRecord {
    return {
      id: String(row.id),
      cardNumber: String(row.card_number),
      verificationToken: String(row.verification_token),
      studentId: String(row.student_id),
      studentName: String(row.student_name),
      registrationNumber: String(row.registration_number),
      course: String(row.course),
      semester: Number(row.semester),
      academicSession: String(row.academic_session),
      scheduleId: String(row.schedule_id),
      examinationId: String(row.examination_id),
      subjectCode: String(row.subject_code),
      subjectTitle: String(row.subject_title),
      examCategory: String(row.category),
      examDate: String(row.exam_date),
      startTime: String(row.start_time),
      endTime: String(row.end_time),
      timezone: String(row.timezone),
      reportingTime: row.reporting_time ? String(row.reporting_time) : null,
      mode: String(row.mode) as ExamMode,
      campus: row.campus ? String(row.campus) : null,
      building: row.building ? String(row.building) : null,
      room: row.room_override
        ? String(row.room_override)
        : row.seat_room
        ? String(row.seat_room)
        : row.schedule_room
        ? String(row.schedule_room)
        : null,
      seatNumber: row.seat_number
        ? String(row.seat_number)
        : row.assigned_seat_number
        ? String(row.assigned_seat_number)
        : null,
      onlineUrl: row.online_url ? String(row.online_url) : null,
      accessInstructions: row.access_instructions ? String(row.access_instructions) : null,
      requiredDocuments: row.required_documents ? String(row.required_documents) : null,
      instructions: String(row.instructions ?? ''),
      version: Number(row.version),
      status: String(row.status) as AdmitCardStatus,
      issuedByUserId: String(row.issued_by_user_id),
      issuedAt: String(row.issued_at),
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    };
  }

  private baseSelectSql(): string {
    return `
      SELECT ac.*,
             st.full_name AS student_name, st.registration_number, st.course, st.semester, st.academic_session,
             sc.examination_id, sc.subject_code, sc.subject_title, sc.category,
             sc.exam_date, sc.start_time, sc.end_time, sc.timezone, sc.reporting_time,
             sc.mode, sc.campus, sc.building, sc.room AS schedule_room,
             sc.online_url, sc.access_instructions, sc.required_documents, sc.instructions,
             sa.room AS seat_room, sa.seat_number AS assigned_seat_number
      FROM admit_cards ac
      JOIN students st ON st.id = ac.student_id
      JOIN exam_schedules sc ON sc.id = ac.schedule_id
      LEFT JOIN exam_seat_assignments sa ON sa.schedule_id = ac.schedule_id AND sa.student_id = ac.student_id
    `;
  }

  public listAdmitCardsForUser(
    user: UserProfile,
    filters?: { scheduleId?: string; status?: string }
  ): AdmitCardRecord[] {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (user.role === UserRole.STUDENT) {
      if (!user.studentId) return [];
      where.push('ac.student_id = ?');
      where.push(`ac.status = 'ACTIVE'`);
      params.push(user.studentId);
    } else if (user.role === UserRole.EXAMINER) {
      where.push(
        `EXISTS (SELECT 1 FROM exam_assignments ea WHERE ea.schedule_id = ac.schedule_id AND ea.examiner_user_id = ?)`
      );
      params.push(user.id);
    }

    if (filters?.scheduleId) {
      where.push('ac.schedule_id = ?');
      params.push(filters.scheduleId);
    }
    if (filters?.status && filters.status !== 'ALL') {
      where.push('ac.status = ?');
      params.push(filters.status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.database.db
      .prepare(
        `${this.baseSelectSql()}
         ${whereSql}
         ORDER BY sc.exam_date ASC, st.registration_number ASC, ac.version DESC`
      )
      .all(...params) as Record<string, unknown>[];

    return rows.map((r) => this.mapRow(r));
  }

  public getAdmitCardById(cardId: string, user: UserProfile): AdmitCardRecord {
    const row = this.database.db
      .prepare(`${this.baseSelectSql()} WHERE ac.id = ?`)
      .get(cardId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new DomainError('Admit card not found', 404, 'ADMIT_CARD_NOT_FOUND');
    }

    const card = this.mapRow(row);
    if (user.role === UserRole.STUDENT && user.studentId !== card.studentId) {
      throw new DomainError(
        'Students may only access their own admit cards',
        403,
        'FORBIDDEN'
      );
    }
    if (user.role === UserRole.EXAMINER) {
      const assigned = this.database.db
        .prepare(
          `SELECT 1 FROM exam_assignments WHERE schedule_id = ? AND examiner_user_id = ?`
        )
        .get(card.scheduleId, user.id);
      if (!assigned) {
        throw new DomainError(
          'Examiners may only inspect admit cards for their assigned examinations',
          403,
          'FORBIDDEN'
        );
      }
    }

    return card;
  }

  public assignSeat(params: {
    scheduleId: string;
    studentId: string;
    room: string;
    seatNumber: string;
    campus?: string;
    building?: string;
    actor: UserProfile;
  }): { scheduleId: string; studentId: string; room: string; seatNumber: string } {
    const schedule = this.database.db
      .prepare(`SELECT id, campus, building, mode FROM exam_schedules WHERE id = ?`)
      .get(params.scheduleId) as
      | { id: string; campus: string | null; building: string | null; mode: string }
      | undefined;

    if (!schedule) {
      throw new DomainError('Examination schedule not found', 404);
    }
    if (!params.room.trim() || !params.seatNumber.trim()) {
      throw new DomainError('Room and seat number are required', 400);
    }

    const conflict = this.database.db
      .prepare(
        `SELECT student_id FROM exam_seat_assignments
         WHERE schedule_id = ? AND lower(room) = lower(?) AND lower(seat_number) = lower(?) AND student_id != ?`
      )
      .get(params.scheduleId, params.room.trim(), params.seatNumber.trim(), params.studentId) as
      | { student_id: string }
      | undefined;

    if (conflict) {
      throw new DomainError(
        `Seat ${params.seatNumber} in Room ${params.room} is already allocated to another student`,
        409,
        'SEAT_CONFLICT'
      );
    }

    const now = new Date().toISOString();
    const existing = this.database.db
      .prepare(
        `SELECT id FROM exam_seat_assignments WHERE schedule_id = ? AND student_id = ?`
      )
      .get(params.scheduleId, params.studentId) as { id: string } | undefined;

    if (existing) {
      this.database.db
        .prepare(
          `UPDATE exam_seat_assignments
           SET campus = ?, building = ?, room = ?, seat_number = ?, assigned_by_user_id = ?, assigned_at = ?
           WHERE id = ?`
        )
        .run(
          params.campus?.trim() || schedule.campus,
          params.building?.trim() || schedule.building,
          params.room.trim(),
          params.seatNumber.trim(),
          params.actor.id,
          now,
          existing.id
        );
    } else {
      const id = `seat_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      this.database.db
        .prepare(
          `INSERT INTO exam_seat_assignments (id, schedule_id, student_id, campus, building, room, seat_number, assigned_by_user_id, assigned_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          params.scheduleId,
          params.studentId,
          params.campus?.trim() || schedule.campus,
          params.building?.trim() || schedule.building,
          params.room.trim(),
          params.seatNumber.trim(),
          params.actor.id,
          now
        );
    }

    return {
      scheduleId: params.scheduleId,
      studentId: params.studentId,
      room: params.room.trim(),
      seatNumber: params.seatNumber.trim(),
    };
  }

  public publishAdmitCardsForSchedule(
    scheduleId: string,
    actor: UserProfile,
    options?: { reissueExisting?: boolean; studentIds?: string[] }
  ): { issuedCount: number; cards: AdmitCardRecord[] } {
    const schedule = this.database.db
      .prepare(`SELECT * FROM exam_schedules WHERE id = ?`)
      .get(scheduleId) as Record<string, unknown> | undefined;

    if (!schedule) {
      throw new DomainError('Examination schedule not found', 404);
    }
    if (String(schedule.status) !== ExamScheduleStatus.PUBLISHED) {
      throw new DomainError(
        'Examination schedule must be PUBLISHED before issuing admit cards',
        400,
        'SCHEDULE_NOT_PUBLISHED'
      );
    }

    const students = this.database.db
      .prepare(
        `SELECT id, registration_number, full_name FROM students
         WHERE course = ? AND semester = ?
         ORDER BY registration_number ASC`
      )
      .all(String(schedule.course), Number(schedule.semester)) as Array<{
      id: string;
      registration_number: string;
      full_name: string;
    }>;

    const targetStudents =
      options?.studentIds && options.studentIds.length > 0
        ? students.filter((s) => options.studentIds!.includes(s.id))
        : students;

    if (targetStudents.length === 0) {
      throw new DomainError(
        `No eligible students enrolled in ${String(schedule.course)} Semester ${Number(
          schedule.semester
        )}`,
        400
      );
    }

    const now = new Date().toISOString();
    const createdIds: string[] = [];

    this.database.runInTransaction(() => {
      // Enable admit card availability flag on schedule
      this.database.db
        .prepare(`UPDATE exam_schedules SET admit_card_available = 1, updated_at = ? WHERE id = ?`)
        .run(now, scheduleId);

      targetStudents.forEach((stu, idx) => {
        const existingActive = this.database.db
          .prepare(
            `SELECT id, version FROM admit_cards WHERE schedule_id = ? AND student_id = ? AND status = 'ACTIVE'`
          )
          .get(scheduleId, stu.id) as { id: string; version: number } | undefined;

        if (existingActive && !options?.reissueExisting) {
          return;
        }

        let nextVersion = 1;
        if (existingActive) {
          nextVersion = Number(existingActive.version) + 1;
          this.database.db
            .prepare(`UPDATE admit_cards SET status = 'REISSUED', revoked_at = ? WHERE id = ?`)
            .run(now, existingActive.id);
        }

        // Lookup or auto-allocate seat for OFFLINE exams
        let seatNumber: string | null = null;
        let roomOverride: string | null = null;
        if (String(schedule.mode) === ExamMode.OFFLINE) {
          const seatRow = this.database.db
            .prepare(
              `SELECT room, seat_number FROM exam_seat_assignments WHERE schedule_id = ? AND student_id = ?`
            )
            .get(scheduleId, stu.id) as { room: string; seat_number: string } | undefined;

          if (seatRow) {
            roomOverride = String(seatRow.room);
            seatNumber = String(seatRow.seat_number);
          } else {
            const defaultRoom = String(schedule.room || 'Hall-101');
            const autoSeat = `R${Math.floor(idx / 6) + 1}-S${String((idx % 6) + 1).padStart(
              2,
              '0'
            )}`;
            const seatId = `seat_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
            this.database.db
              .prepare(
                `INSERT OR IGNORE INTO exam_seat_assignments (id, schedule_id, student_id, campus, building, room, seat_number, assigned_by_user_id, assigned_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .run(
                seatId,
                scheduleId,
                stu.id,
                schedule.campus ? String(schedule.campus) : null,
                schedule.building ? String(schedule.building) : null,
                defaultRoom,
                autoSeat,
                actor.id,
                now
              );
            roomOverride = defaultRoom;
            seatNumber = autoSeat;
          }
        }

        const id = `adm_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const cardNumber = `AC-${new Date().getFullYear()}-${String(
          schedule.subject_code
        )}-${stu.registration_number.slice(-5)}-V${nextVersion}`;
        const token = `ADMIT-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;

        this.database.db
          .prepare(
            `INSERT INTO admit_cards
              (id, card_number, verification_token, student_id, schedule_id, version, status, seat_number, room_override, issued_by_user_id, issued_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, NULL)`
          )
          .run(
            id,
            cardNumber,
            token,
            stu.id,
            scheduleId,
            nextVersion,
            seatNumber,
            roomOverride,
            actor.id,
            now
          );

        createdIds.push(id);
      });
    });

    const issuedCards = createdIds.map((id) => {
      const row = this.database.db
        .prepare(`${this.baseSelectSql()} WHERE ac.id = ?`)
        .get(id) as Record<string, unknown>;
      return this.mapRow(row);
    });

    for (const card of issuedCards) {
      this.notifications.notifyStudentByStudentId(card.studentId, {
        category: NotificationCategory.ADMIT_CARD,
        priority: NotificationPriority.HIGH,
        title:
          card.version > 1
            ? `Admit Card Reissued (v${card.version}): ${card.subjectCode}`
            : `Admit Card Available: ${card.subjectCode}`,
        message: `Your digital admit card (${card.cardNumber}) for ${card.subjectCode} on ${card.examDate} is ready to download.`,
        linkPath: '/admit-cards',
        entityType: 'admit_card',
        entityId: card.id,
      });
    }

    return { issuedCount: issuedCards.length, cards: issuedCards };
  }

  public verifyPublicToken(token: string): PublicAdmitCardVerification {
    const clean = token.trim();
    const checkedAt = new Date().toISOString();
    const disclaimer =
      'Admit card verification confirms examination scheduling & seating eligibility only. It is NOT proof of exam attendance or published examination marks.';

    if (!clean) {
      return { valid: false, status: 'NOT_FOUND', disclaimer, verifiedAt: checkedAt, card: null };
    }

    const row = this.database.db
      .prepare(`${this.baseSelectSql()} WHERE ac.verification_token = ? OR ac.card_number = ?`)
      .get(clean, clean) as Record<string, unknown> | undefined;

    if (!row) {
      return { valid: false, status: 'NOT_FOUND', disclaimer, verifiedAt: checkedAt, card: null };
    }

    const card = this.mapRow(row);
    const status =
      card.status === AdmitCardStatus.ACTIVE
        ? 'VALID'
        : card.status === AdmitCardStatus.REISSUED
        ? 'REISSUED'
        : 'REVOKED';

    return {
      valid: status === 'VALID',
      status,
      disclaimer,
      verifiedAt: checkedAt,
      card: {
        cardNumber: card.cardNumber,
        version: card.version,
        studentName: card.studentName,
        registrationNumber: card.registrationNumber,
        course: card.course,
        semester: card.semester,
        academicSession: card.academicSession,
        examinationId: card.examinationId,
        subjectCode: card.subjectCode,
        subjectTitle: card.subjectTitle,
        examDate: card.examDate,
        startTime: card.startTime,
        endTime: card.endTime,
        timezone: card.timezone,
        mode: card.mode,
        campus: card.campus,
        building: card.building,
        room: card.room,
        seatNumber: card.seatNumber,
        issuedAt: card.issuedAt,
      },
    };
  }

  public async generateAdmitCardPdf(
    card: AdmitCardRecord,
    verifyUrl: string
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`VeriMark Digital Admit Card - ${card.registrationNumber}`);
    pdfDoc.setAuthor('Demo University Examination Controller');

    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontMono = await pdfDoc.embedFont(StandardFonts.CourierBold);

    const navy = rgb(0.06, 0.09, 0.16);
    const indigo = rgb(0.31, 0.27, 0.9);
    const slate = rgb(0.39, 0.45, 0.55);
    const border = rgb(0.84, 0.87, 0.92);
    const lightSurface = rgb(0.97, 0.98, 0.99);

    page.drawRectangle({
      x: 28,
      y: 28,
      width: width - 56,
      height: height - 56,
      borderColor: border,
      borderWidth: 1,
    });

    page.drawRectangle({
      x: 28,
      y: height - 126,
      width: width - 56,
      height: 98,
      color: navy,
    });

    page.drawText('DEMO UNIVERSITY', {
      x: 48,
      y: height - 64,
      size: 18,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('OFFICIAL EXAMINATION ADMIT CARD (HALL TICKET)', {
      x: 48,
      y: height - 84,
      size: 10,
      font: fontBold,
      color: rgb(0.7, 0.78, 1),
    });
    page.drawText(`Card No: ${card.cardNumber}   ·   Version v${card.version}   ·   Mode: ${card.mode}`, {
      x: 48,
      y: height - 102,
      size: 8.5,
      font: fontMono,
      color: rgb(0.75, 0.85, 0.95),
    });

    let y = height - 160;
    page.drawText('CANDIDATE DETAILS', { x: 48, y, size: 9.5, font: fontBold, color: indigo });
    y -= 10;
    page.drawLine({ start: { x: 48, y }, end: { x: width - 48, y }, thickness: 0.75, color: border });
    y -= 22;

    const leftPairs: Array<[string, string]> = [
      ['Candidate Name', card.studentName],
      ['Registration Number', card.registrationNumber],
      ['Program / Course', card.course],
    ];
    const rightPairs: Array<[string, string]> = [
      ['Academic Session', card.academicSession],
      ['Semester', `Semester ${card.semester}`],
      ['Examination ID', card.examinationId],
    ];

    for (let i = 0; i < leftPairs.length; i++) {
      page.drawText(leftPairs[i][0], { x: 48, y, size: 8, font: fontRegular, color: slate });
      page.drawText(leftPairs[i][1], { x: 48, y: y - 13, size: 11, font: fontBold, color: navy });

      page.drawText(rightPairs[i][0], { x: 325, y, size: 8, font: fontRegular, color: slate });
      page.drawText(rightPairs[i][1], { x: 325, y: y - 13, size: 11, font: fontBold, color: navy });
      y -= 38;
    }

    y -= 8;
    page.drawText('EXAMINATION SCHEDULE & MODE ALLOCATION', {
      x: 48,
      y,
      size: 9.5,
      font: fontBold,
      color: indigo,
    });
    y -= 12;
    page.drawRectangle({
      x: 48,
      y: y - 126,
      width: width - 96,
      height: 126,
      color: lightSurface,
      borderColor: border,
      borderWidth: 0.85,
    });

    const examRows: Array<[string, string]> = [
      ['Subject', `${card.subjectCode} — ${card.subjectTitle}`],
      ['Exam Date & Time', `${card.examDate}  |  ${card.startTime} – ${card.endTime} (${card.timezone})`],
      ['Reporting Time', card.reportingTime || '15 minutes prior to start time'],
      [
        card.mode === ExamMode.ONLINE ? 'Authorized Portal' : 'Venue & Seat',
        card.mode === ExamMode.ONLINE
          ? card.onlineUrl || 'Authorized University Exam Portal'
          : `${card.campus || 'Main Campus'}, ${card.building || 'Block A'}, Room ${
              card.room || 'TBA'
            }${card.seatNumber ? ` · Seat ${card.seatNumber}` : ''}`,
      ],
      ['Required Documents', card.requiredDocuments || 'University Photo ID & Admit Card'],
    ];

    let ey = y - 22;
    for (const [k, v] of examRows) {
      page.drawText(`${k}:`, { x: 60, y: ey, size: 8.5, font: fontBold, color: slate });
      page.drawText(v.slice(0, 68), { x: 168, y: ey, size: 9, font: fontRegular, color: navy });
      ey -= 22;
    }

    // QR Code Verification Box (explicitly separate from Result Receipt Verification)
    const qrY = 160;
    page.drawRectangle({
      x: 48,
      y: qrY,
      width: width - 96,
      height: 175,
      color: lightSurface,
      borderColor: border,
      borderWidth: 0.85,
    });

    const qrPng = await QRCode.toBuffer(verifyUrl, {
      type: 'png',
      width: 240,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });
    const qrImg = await pdfDoc.embedPng(qrPng);
    page.drawImage(qrImg, { x: 66, y: qrY + 24, width: 126, height: 126 });

    page.drawText('ADMIT CARD VERIFICATION (SEPARATE FROM RESULT RECEIPTS)', {
      x: 212,
      y: qrY + 146,
      size: 8.8,
      font: fontBold,
      color: indigo,
    });
    page.drawText(`Verification Token: ${card.verificationToken}`, {
      x: 212,
      y: qrY + 124,
      size: 8.5,
      font: fontMono,
      color: navy,
    });
    page.drawText(`Issued At: ${new Date(card.issuedAt).toUTCString()}`, {
      x: 212,
      y: qrY + 106,
      size: 8,
      font: fontRegular,
      color: slate,
    });
    page.drawText('Important Instructions:', {
      x: 212,
      y: qrY + 84,
      size: 8.5,
      font: fontBold,
      color: navy,
    });
    page.drawText(card.instructions.slice(0, 72), {
      x: 212,
      y: qrY + 70,
      size: 8,
      font: fontRegular,
      color: slate,
    });
    page.drawText('Notice: This admit card confirms exam eligibility only and is NOT', {
      x: 212,
      y: qrY + 46,
      size: 7.8,
      font: fontBold,
      color: rgb(0.7, 0.35, 0.05),
    });
    page.drawText('proof of exam attendance or published examination marks.', {
      x: 212,
      y: qrY + 34,
      size: 7.8,
      font: fontBold,
      color: rgb(0.7, 0.35, 0.05),
    });
    page.drawText(verifyUrl.slice(0, 72), {
      x: 212,
      y: qrY + 14,
      size: 7,
      font: fontMono,
      color: indigo,
    });

    page.drawText(
      'Demo University Examination Controller · VeriMark 2.0 Smart Examination Management',
      { x: 48, y: 54, size: 8, font: fontBold, color: navy }
    );

    return await pdfDoc.save();
  }
}
