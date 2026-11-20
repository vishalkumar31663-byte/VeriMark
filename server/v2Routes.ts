import express, { NextFunction, Request, Response } from 'express';
import { CorrectionStatus, UserProfile, UserRole } from '../shared/types';
import {
  ExamMode,
  ExamScheduleStatus,
  TicketCategory,
  TicketStatus,
} from '../shared/v2Types';
import { AdmitCardService } from './admitCardService';
import { AnalyticsService } from './analyticsService';
import { AttachmentStore } from './attachmentStore';
import { AuditService } from './auditService';
import { VeriMarkConfig } from './config';
import { verifySessionJwt } from './crypto';
import { VeriMarkDatabase } from './db';
import { ExamScheduleService } from './examScheduleService';
import { DomainError, LedgerService } from './ledgerService';
import { NotificationService } from './notificationService';
import { generateQrDataUrl } from './pdfService';
import { RevaluationService } from './revaluationService';
import { TicketService } from './ticketService';

export function createV2Router(deps: {
  config: VeriMarkConfig;
  database: VeriMarkDatabase;
  ledgerService: LedgerService;
  auditService: AuditService;
  notificationService: NotificationService;
  attachmentStore: AttachmentStore;
  examScheduleService: ExamScheduleService;
  admitCardService: AdmitCardService;
  ticketService: TicketService;
  revaluationService: RevaluationService;
  analyticsService: AnalyticsService;
}): express.Router {
  const {
    config,
    database,
    ledgerService,
    auditService,
    notificationService,
    attachmentStore,
    examScheduleService,
    admitCardService,
    ticketService,
    revaluationService,
    analyticsService,
  } = deps;

  const router = express.Router();

  const extractToken = (req: Request): string | null => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    if (req.cookies && typeof req.cookies.verimark_session === 'string') {
      return req.cookies.verimark_session;
    }
    return null;
  };

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHENTICATED',
      });
    }
    const payload = verifySessionJwt(token, config.jwtSecret);
    if (!payload) {
      return res.status(401).json({
        error: 'Session expired or invalid. Please sign in again.',
        code: 'INVALID_SESSION',
      });
    }
    const revoked = database.db
      .prepare(`SELECT jti FROM revoked_tokens WHERE jti = ?`)
      .get(payload.jti);
    if (revoked) {
      return res.status(401).json({
        error: 'Session has been logged out',
        code: 'REVOKED_SESSION',
      });
    }

    const userRow = database.db
      .prepare(
        `SELECT id, email, full_name, role, key_id, student_id, created_at FROM users WHERE id = ?`
      )
      .get(payload.sub) as Record<string, unknown> | undefined;

    if (!userRow) {
      return res.status(401).json({
        error: 'User account no longer exists',
        code: 'USER_NOT_FOUND',
      });
    }

    req.user = {
      id: String(userRow.id),
      email: String(userRow.email),
      fullName: String(userRow.full_name),
      role: String(userRow.role) as UserRole,
      keyId: userRow.key_id ? String(userRow.key_id) : null,
      studentId: userRow.student_id ? String(userRow.student_id) : null,
      createdAt: String(userRow.created_at),
    };
    req.tokenJti = payload.jti;
    return next();
  };

  const requireRoles = (...roles: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          error: `Forbidden: requires role ${roles.join(' or ')}`,
          code: 'FORBIDDEN_ROLE',
        });
      }
      return next();
    };
  };

  const handleError = (err: unknown, res: Response) => {
    if (err instanceof DomainError) {
      return res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
      });
    }
    console.error('[VeriMark 2.0 API Error]', err);
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  };

  // ============================================================
  // FEATURE 1 — SMART NOTIFICATIONS (REST + SSE LIVE STREAM)
  // ============================================================
  router.get('/notifications/unread-count', requireAuth, (req, res) => {
    try {
      const unreadCount = notificationService.getUnreadCount(req.user!.id);
      res.json({ unreadCount });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get('/notifications/stream', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const unreadCount = notificationService.getUnreadCount(req.user!.id);
    res.write(`event: connected\ndata: ${JSON.stringify({ unreadCount })}\n\n`);

    const unregister = notificationService.registerSseClient(req.user!.id, res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      unregister();
    });
  });

  router.post('/notifications/mark-all-read', requireAuth, (req, res) => {
    try {
      const updated = notificationService.markAllAsRead(req.user!.id);
      res.json({ updated, unreadCount: 0 });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get('/notifications', requireAuth, (req, res) => {
    try {
      const notifications = notificationService.listForUser(req.user!.id, {
        category: req.query.category ? String(req.query.category) : undefined,
        priority: req.query.priority ? String(req.query.priority) : undefined,
        unreadOnly: req.query.unreadOnly === '1' || req.query.unreadOnly === 'true',
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      const unreadCount = notificationService.getUnreadCount(req.user!.id);
      res.json({ notifications, unreadCount });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.patch('/notifications/:id/read', requireAuth, (req, res) => {
    try {
      const updated = notificationService.markAsRead(req.user!.id, String(req.params.id));
      const unreadCount = notificationService.getUnreadCount(req.user!.id);
      res.json({ updated, unreadCount });
    } catch (err) {
      handleError(err, res);
    }
  });

  // ============================================================
  // FEATURE 3 & 4 — EXAMINATION SCHEDULES & ONLINE/OFFLINE MODES
  // ============================================================
  router.get('/exam-schedules/examiners', requireAuth, requireRoles(UserRole.CONTROLLER, UserRole.SUPER_ADMIN), (_req, res) => {
    try {
      const rows = database.db
        .prepare(
          `SELECT id, email, full_name, key_id FROM users WHERE role = 'EXAMINER' ORDER BY full_name ASC`
        )
        .all() as Array<{ id: string; email: string; full_name: string; key_id: string | null }>;
      res.json({
        examiners: rows.map((r) => ({
          id: String(r.id),
          email: String(r.email),
          fullName: String(r.full_name),
          keyId: r.key_id ? String(r.key_id) : null,
        })),
      });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get('/exam-schedules/pdf', requireAuth, async (req, res) => {
    try {
      const assignedOnly = req.query.assignedOnly === '1' || req.query.assignedOnly === 'true';
      const schedules = examScheduleService.listSchedulesForUser(req.user!, {
        status: req.user!.role === UserRole.STUDENT ? ExamScheduleStatus.PUBLISHED : undefined,
        assignedOnly,
      });
      const subtitle =
        req.user!.role === UserRole.STUDENT
          ? `Official Published Timetable for ${req.user!.fullName}`
          : req.user!.role === UserRole.EXAMINER
          ? `Assigned Examination Duty Schedule — ${req.user!.fullName}`
          : `Institution-Wide Examination Timetable — Controller Export`;
      const pdfBytes = await examScheduleService.generateTimetablePdf(schedules, subtitle);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="VeriMark-Exam-Timetable.pdf"`
      );
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get(
    '/exam-schedules/change-requests',
    requireAuth,
    requireRoles(UserRole.EXAMINER, UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const requests = examScheduleService.listChangeRequests(req.user!);
        res.json({ requests });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.post(
    '/exam-schedules/change-requests/:requestId/review',
    requireAuth,
    requireRoles(UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const decision =
          String(req.body?.decision ?? '').toUpperCase() === 'APPROVED'
            ? 'APPROVED'
            : 'REJECTED';
        const updated = examScheduleService.reviewChangeRequest(
          String(req.params.requestId),
          decision,
          String(req.body?.reviewNote ?? ''),
          req.user!
        );
        res.json({ request: updated });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.get('/exam-schedules', requireAuth, (req, res) => {
    try {
      const schedules = examScheduleService.listSchedulesForUser(req.user!, {
        status: req.query.status ? String(req.query.status) : undefined,
        mode: req.query.mode ? String(req.query.mode) : undefined,
        semester: req.query.semester ? Number(req.query.semester) : undefined,
        subjectCode: req.query.subjectCode ? String(req.query.subjectCode) : undefined,
        assignedOnly: req.query.assignedOnly === '1' || req.query.assignedOnly === 'true',
      });
      res.json({ schedules });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.post(
    '/exam-schedules',
    requireAuth,
    requireRoles(UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const schedule = examScheduleService.createSchedule(
          {
            examinationId: req.body?.examinationId ? String(req.body.examinationId) : undefined,
            subjectId: String(req.body?.subjectId ?? ''),
            academicSession: String(req.body?.academicSession ?? '2025-2026'),
            course: String(req.body?.course ?? ''),
            semester: Number(req.body?.semester),
            category: req.body?.category ? String(req.body.category) : 'End-Term Theory',
            examDate: String(req.body?.examDate ?? ''),
            startTime: String(req.body?.startTime ?? ''),
            endTime: String(req.body?.endTime ?? ''),
            timezone: req.body?.timezone ? String(req.body.timezone) : 'Asia/Kolkata',
            mode:
              String(req.body?.mode ?? 'OFFLINE').toUpperCase() === ExamMode.ONLINE
                ? ExamMode.ONLINE
                : ExamMode.OFFLINE,
            onlineUrl: req.body?.onlineUrl ?? null,
            accessInstructions: req.body?.accessInstructions ?? null,
            campus: req.body?.campus ?? null,
            building: req.body?.building ?? null,
            room: req.body?.room ?? null,
            reportingTime: req.body?.reportingTime ?? null,
            requiredDocuments: req.body?.requiredDocuments ?? null,
            instructions: req.body?.instructions ? String(req.body.instructions) : undefined,
            admitCardAvailable: Boolean(req.body?.admitCardAvailable),
            examinerUserIds: Array.isArray(req.body?.examinerUserIds)
              ? req.body.examinerUserIds.map(String)
              : [],
            publishImmediately: Boolean(req.body?.publishImmediately),
          },
          req.user!
        );
        res.status(201).json({ schedule });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.get('/exam-schedules/:id', requireAuth, (req, res) => {
    try {
      const schedule = examScheduleService.getScheduleById(String(req.params.id), req.user!);
      if (!schedule) {
        return res.status(404).json({ error: 'Examination schedule not found' });
      }
      return res.json({ schedule });
    } catch (err) {
      return handleError(err, res);
    }
  });

  router.patch(
    '/exam-schedules/:id',
    requireAuth,
    requireRoles(UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const schedule = examScheduleService.updateSchedule(
          String(req.params.id),
          {
            examDate: req.body?.examDate !== undefined ? String(req.body.examDate) : undefined,
            startTime: req.body?.startTime !== undefined ? String(req.body.startTime) : undefined,
            endTime: req.body?.endTime !== undefined ? String(req.body.endTime) : undefined,
            timezone: req.body?.timezone !== undefined ? String(req.body.timezone) : undefined,
            mode: req.body?.mode !== undefined
              ? (String(req.body.mode).toUpperCase() as ExamMode)
              : undefined,
            onlineUrl: req.body?.onlineUrl !== undefined ? req.body.onlineUrl : undefined,
            accessInstructions:
              req.body?.accessInstructions !== undefined
                ? req.body.accessInstructions
                : undefined,
            campus: req.body?.campus !== undefined ? req.body.campus : undefined,
            building: req.body?.building !== undefined ? req.body.building : undefined,
            room: req.body?.room !== undefined ? req.body.room : undefined,
            reportingTime:
              req.body?.reportingTime !== undefined ? req.body.reportingTime : undefined,
            requiredDocuments:
              req.body?.requiredDocuments !== undefined
                ? req.body.requiredDocuments
                : undefined,
            instructions:
              req.body?.instructions !== undefined ? String(req.body.instructions) : undefined,
            admitCardAvailable:
              req.body?.admitCardAvailable !== undefined
                ? Boolean(req.body.admitCardAvailable)
                : undefined,
            status:
              req.body?.status !== undefined
                ? (String(req.body.status).toUpperCase() as ExamScheduleStatus)
                : undefined,
          },
          req.user!
        );
        res.json({ schedule });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.post(
    '/exam-schedules/:id/publish',
    requireAuth,
    requireRoles(UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const schedule = examScheduleService.publishSchedule(String(req.params.id), req.user!);
        res.json({ schedule });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.get(
    '/exam-schedules/:id/history',
    requireAuth,
    requireRoles(UserRole.EXAMINER, UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const history = examScheduleService.getScheduleHistory(String(req.params.id));
        res.json({ history });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.post(
    '/exam-schedules/:id/assignments',
    requireAuth,
    requireRoles(UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const schedule = examScheduleService.assignExaminer(
          String(req.params.id),
          String(req.body?.examinerUserId ?? ''),
          String(req.body?.roleLabel ?? 'Primary Examiner'),
          req.user!
        );
        res.json({ schedule });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.delete(
    '/exam-schedules/:id/assignments/:examinerUserId',
    requireAuth,
    requireRoles(UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const schedule = examScheduleService.removeExaminerAssignment(
          String(req.params.id),
          String(req.params.examinerUserId),
          req.user!
        );
        res.json({ schedule });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.post(
    '/exam-schedules/:id/change-requests',
    requireAuth,
    requireRoles(UserRole.EXAMINER, UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const request = examScheduleService.createChangeRequest(
          String(req.params.id),
          String(req.body?.requestedChanges ?? ''),
          String(req.body?.reason ?? ''),
          req.user!
        );
        res.status(201).json({ request });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  // ============================================================
  // FEATURE 5 & 11 — SUPPORT TICKETS & TICKET-TO-CORRECTION
  // ============================================================
  router.get('/tickets', requireAuth, (req, res) => {
    try {
      const tickets = ticketService.listTickets(req.user!, {
        status: req.query.status ? String(req.query.status) : undefined,
        category: req.query.category ? String(req.query.category) : undefined,
        overdueOnly: req.query.overdueOnly === '1' || req.query.overdueOnly === 'true',
      });
      res.json({ tickets });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.post('/tickets', requireAuth, (req, res) => {
    try {
      const ticket = ticketService.createTicket(
        {
          category: String(req.body?.category ?? '') as TicketCategory,
          subject: String(req.body?.subject ?? ''),
          description: String(req.body?.description ?? ''),
          relatedExamId: req.body?.relatedExamId ? String(req.body.relatedExamId) : null,
          relatedScheduleId: req.body?.relatedScheduleId
            ? String(req.body.relatedScheduleId)
            : null,
          relatedResultId: req.body?.relatedResultId ? String(req.body.relatedResultId) : null,
          priority: req.body?.priority ? String(req.body.priority) as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' : undefined,
          attachment: req.body?.attachment ?? null,
        },
        req.user!
      );
      res.status(201).json({ ticket });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get('/tickets/:id', requireAuth, (req, res) => {
    try {
      const ticket = ticketService.getTicketDetail(String(req.params.id), req.user!);
      res.json({ ticket });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.post('/tickets/:id/messages', requireAuth, (req, res) => {
    try {
      const ticket = ticketService.addMessage(
        String(req.params.id),
        String(req.body?.body ?? ''),
        Boolean(req.body?.isInternalNote),
        req.user!,
        req.body?.attachment ?? null
      );
      res.status(201).json({ ticket });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.patch(
    '/tickets/:id/status',
    requireAuth,
    requireRoles(UserRole.EXAMINER, UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const ticket = ticketService.updateStatusOrAssignment(
          String(req.params.id),
          {
            status: req.body?.status ? (String(req.body.status) as TicketStatus) : undefined,
            assignedExaminerId:
              req.body?.assignedExaminerId !== undefined
                ? req.body.assignedExaminerId
                  ? String(req.body.assignedExaminerId)
                  : null
                : undefined,
            recommendedMarks:
              req.body?.recommendedMarks !== undefined && req.body?.recommendedMarks !== ''
                ? Number(req.body.recommendedMarks)
                : undefined,
            recommendationNote:
              req.body?.recommendationNote !== undefined
                ? String(req.body.recommendationNote)
                : undefined,
            resolutionReason:
              req.body?.resolutionReason !== undefined
                ? String(req.body.resolutionReason)
                : undefined,
          },
          req.user!
        );
        res.json({ ticket });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.post(
    '/tickets/:id/escalate',
    requireAuth,
    requireRoles(UserRole.EXAMINER, UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const recommendedMarks =
          req.body?.recommendedMarks !== undefined &&
          req.body?.recommendedMarks !== null &&
          req.body?.recommendedMarks !== ''
            ? Number(req.body.recommendedMarks)
            : null;
        const ticket = ticketService.escalateTicket(
          String(req.params.id),
          String(req.body?.reason ?? ''),
          recommendedMarks,
          req.user!
        );
        res.json({ ticket });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.post('/tickets/:id/reopen', requireAuth, (req, res) => {
    try {
      const ticket = ticketService.reopenTicket(
        String(req.params.id),
        String(req.body?.reason ?? ''),
        req.user!
      );
      res.json({ ticket });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.post(
    '/tickets/:id/initiate-correction',
    requireAuth,
    requireRoles(UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const outcome = ticketService.initiateCorrectionFromTicket(
          String(req.params.id),
          Number(req.body?.proposedMarks),
          String(req.body?.reason ?? ''),
          req.user!
        );
        res.status(201).json(outcome);
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  // Authorized attachment download (verifies access via parent ticket or revaluation ownership)
  router.get('/attachments/:id', requireAuth, (req, res) => {
    try {
      const data = attachmentStore.getAttachmentForDownload(String(req.params.id));
      if (!data) {
        return res.status(404).json({ error: 'Attachment not found' });
      }
      if (data.record.ticketId) {
        ticketService.getTicketDetail(data.record.ticketId, req.user!);
      } else if (data.record.revaluationId) {
        revaluationService.getById(data.record.revaluationId, req.user!);
      } else if (
        req.user!.role === UserRole.STUDENT &&
        data.record.uploadedByUserId !== req.user!.id
      ) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      res.setHeader('Content-Type', data.record.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${data.record.originalName}"`
      );
      return res.send(data.buffer);
    } catch (err) {
      return handleError(err, res);
    }
  });

  // ============================================================
  // FEATURE 8 — REVALUATION REQUESTS
  // ============================================================
  router.get('/revaluations', requireAuth, (req, res) => {
    try {
      const revaluations = revaluationService.listRevaluations(req.user!, {
        status: req.query.status ? String(req.query.status) : undefined,
        resultId: req.query.resultId ? String(req.query.resultId) : undefined,
      });
      res.json({ revaluations });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.post(
    '/revaluations',
    requireAuth,
    requireRoles(UserRole.STUDENT),
    (req, res) => {
      try {
        const revaluation = revaluationService.submitRevaluation(
          {
            resultId: String(req.body?.resultId ?? ''),
            reason: String(req.body?.reason ?? ''),
            attachment: req.body?.attachment ?? null,
          },
          req.user!
        );
        res.status(201).json({ revaluation });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.get('/revaluations/:id', requireAuth, (req, res) => {
    try {
      const revaluation = revaluationService.getById(String(req.params.id), req.user!);
      res.json({ revaluation });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.post(
    '/revaluations/:id/recommendation',
    requireAuth,
    requireRoles(UserRole.EXAMINER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const rec = String(req.body?.recommendation ?? '').toUpperCase();
        if (!['APPROVE', 'REJECT', 'EVIDENCE_REQUIRED'].includes(rec)) {
          throw new DomainError('Invalid recommendation value', 400);
        }
        const revaluation = revaluationService.submitExaminerRecommendation(
          String(req.params.id),
          {
            recommendation: rec as 'APPROVE' | 'REJECT' | 'EVIDENCE_REQUIRED',
            recommendedMarks:
              req.body?.recommendedMarks !== undefined &&
              req.body?.recommendedMarks !== null &&
              req.body?.recommendedMarks !== ''
                ? Number(req.body.recommendedMarks)
                : null,
            notes: String(req.body?.notes ?? ''),
          },
          req.user!
        );
        res.json({ revaluation });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.post(
    '/revaluations/:id/decision',
    requireAuth,
    requireRoles(UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const decision =
          String(req.body?.decision ?? '').toUpperCase() === 'REJECTED'
            ? 'REJECTED'
            : 'APPROVED_FOR_CORRECTION';
        const outcome = revaluationService.submitControllerDecision(
          String(req.params.id),
          {
            decision,
            notes: String(req.body?.notes ?? ''),
            proposedMarks:
              req.body?.proposedMarks !== undefined &&
              req.body?.proposedMarks !== null &&
              req.body?.proposedMarks !== ''
                ? Number(req.body.proposedMarks)
                : undefined,
            initiateCorrection: Boolean(req.body?.initiateCorrection),
          },
          req.user!
        );
        res.json(outcome);
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  // ============================================================
  // FEATURE 7 — RESULT COMPARISON
  // ============================================================
  router.get('/results/:id/comparison', requireAuth, (req, res) => {
    try {
      const comparison = analyticsService.getResultComparison(
        String(req.params.id),
        req.user!
      );
      res.json(comparison);
    } catch (err) {
      handleError(err, res);
    }
  });

  // ============================================================
  // FEATURE 9 — RESULT ANALYTICS (ROLE-SCOPED)
  // ============================================================
  router.get(
    '/analytics/student',
    requireAuth,
    requireRoles(UserRole.STUDENT, UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const studentId =
          req.user!.role === UserRole.STUDENT
            ? req.user!.studentId
            : req.query.studentId
            ? String(req.query.studentId)
            : null;
        if (!studentId) {
          return res.status(400).json({ error: 'Student ID is required' });
        }
        const analytics = analyticsService.getStudentAnalytics(studentId);
        return res.json(analytics);
      } catch (err) {
        return handleError(err, res);
      }
    }
  );

  router.get(
    '/analytics/examiner',
    requireAuth,
    requireRoles(UserRole.EXAMINER, UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const examinerId =
          req.user!.role === UserRole.EXAMINER
            ? req.user!.id
            : req.query.examinerUserId
            ? String(req.query.examinerUserId)
            : req.user!.id;
        const analytics = analyticsService.getExaminerAnalytics(examinerId);
        res.json(analytics);
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.get(
    '/analytics/controller',
    requireAuth,
    requireRoles(UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (_req, res) => {
      try {
        const analytics = analyticsService.getControllerAnalytics();
        res.json(analytics);
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  // ============================================================
  // FEATURE 10 — DIGITAL ADMIT CARDS & PUBLIC ADMIT VERIFICATION
  // ============================================================
  // Public route — MUST be registered before /admit-cards/:id!
  router.get('/admit-cards/verify/:token', (req, res) => {
    try {
      const verification = admitCardService.verifyPublicToken(String(req.params.token));
      res.json(verification);
    } catch (err) {
      handleError(err, res);
    }
  });

  router.post(
    '/admit-cards/publish',
    requireAuth,
    requireRoles(UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const result = admitCardService.publishAdmitCardsForSchedule(
          String(req.body?.scheduleId ?? ''),
          req.user!,
          {
            reissueExisting: Boolean(req.body?.reissueExisting),
            studentIds: Array.isArray(req.body?.studentIds)
              ? req.body.studentIds.map(String)
              : undefined,
          }
        );
        res.status(201).json(result);
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.post(
    '/admit-cards/seats',
    requireAuth,
    requireRoles(UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const allocation = admitCardService.assignSeat({
          scheduleId: String(req.body?.scheduleId ?? ''),
          studentId: String(req.body?.studentId ?? ''),
          room: String(req.body?.room ?? ''),
          seatNumber: String(req.body?.seatNumber ?? ''),
          campus: req.body?.campus ? String(req.body.campus) : undefined,
          building: req.body?.building ? String(req.body.building) : undefined,
          actor: req.user!,
        });
        res.status(201).json({ allocation });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.get('/admit-cards', requireAuth, async (req, res) => {
    try {
      const cards = admitCardService.listAdmitCardsForUser(req.user!, {
        scheduleId: req.query.scheduleId ? String(req.query.scheduleId) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
      });
      const origin = `${req.protocol}://${req.get('host')}`;
      const enriched = await Promise.all(
        cards.map(async (c) => {
          const verifyUrl = `${origin}/admit-card/verify/${encodeURIComponent(c.verificationToken)}`;
          const qrDataUrl = await generateQrDataUrl(verifyUrl);
          return { ...c, verifyUrl, qrDataUrl };
        })
      );
      res.json({ admitCards: enriched });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get('/admit-cards/:id/pdf', requireAuth, async (req, res) => {
    try {
      const card = admitCardService.getAdmitCardById(String(req.params.id), req.user!);
      const origin = `${req.protocol}://${req.get('host')}`;
      const verifyUrl = `${origin}/admit-card/verify/${encodeURIComponent(card.verificationToken)}`;
      const pdfBytes = await admitCardService.generateAdmitCardPdf(card, verifyUrl);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="VeriMark-AdmitCard-${card.registrationNumber}-${card.subjectCode}-v${card.version}.pdf"`
      );
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get('/admit-cards/:id', requireAuth, async (req, res) => {
    try {
      const card = admitCardService.getAdmitCardById(String(req.params.id), req.user!);
      const origin = `${req.protocol}://${req.get('host')}`;
      const verifyUrl = `${origin}/admit-card/verify/${encodeURIComponent(card.verificationToken)}`;
      const qrDataUrl = await generateQrDataUrl(verifyUrl);
      res.json({ admitCard: { ...card, verifyUrl, qrDataUrl } });
    } catch (err) {
      handleError(err, res);
    }
  });

  // ============================================================
  // ROLE-SPECIFIC DASHBOARD SUMMARIES (100% REAL DB QUERIES)
  // ============================================================
  router.get(
    '/dashboard/student-summary',
    requireAuth,
    requireRoles(UserRole.STUDENT),
    (req, res) => {
      try {
        const user = req.user!;
        const results = user.studentId
          ? ledgerService.listResults({ studentId: user.studentId })
          : [];
        const schedules = examScheduleService.listSchedulesForUser(user, {
          status: ExamScheduleStatus.PUBLISHED,
        });
        const admitCards = admitCardService.listAdmitCardsForUser(user);
        const tickets = ticketService.listTickets(user);
        const revaluations = revaluationService.listRevaluations(user);
        const unreadNotifications = notificationService.getUnreadCount(user.id);

        const nowMs = Date.now();
        const upcomingExams = schedules.filter((s) => {
          const endMs = new Date(`${s.examDate}T${s.endTime}:00`).getTime();
          return Number.isNaN(endMs) ? true : endMs >= nowMs;
        });

        const openTicketsCount = tickets.filter(
          (t) =>
            t.status !== TicketStatus.RESOLVED &&
            t.status !== TicketStatus.REJECTED &&
            t.status !== TicketStatus.CLOSED
        ).length;

        const activeRevalsCount = revaluations.filter(
          (r) => r.status !== 'COMPLETED' && r.status !== 'REJECTED'
        ).length;

        res.json({
          cards: {
            upcomingExamsCount: upcomingExams.length,
            nextExam: upcomingExams[0] ?? null,
            admitCardsAvailable: admitCards.length,
            publishedResultsCount: results.length,
            activeTicketsCount: openTicketsCount,
            activeRevaluationsCount: activeRevalsCount,
            unreadNotificationsCount: unreadNotifications,
          },
          upcomingExams: upcomingExams.slice(0, 4),
          recentResults: results.slice(0, 5),
          recentTickets: tickets.slice(0, 4),
        });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.get(
    '/dashboard/examiner-summary',
    requireAuth,
    requireRoles(UserRole.EXAMINER),
    (req, res) => {
      try {
        const user = req.user!;
        const assignedExams = examScheduleService.listSchedulesForUser(user, {
          assignedOnly: true,
        });
        const tickets = ticketService.listTickets(user);
        const revaluations = revaluationService.listRevaluations(user);
        const corrections = ledgerService.listCorrectionRequests();
        const unreadNotifications = notificationService.getUnreadCount(user.id);

        const pendingCorrectionApprovals = corrections.filter(
          (c) =>
            (c.status === CorrectionStatus.PENDING ||
              c.status === CorrectionStatus.APPROVED_PARTIAL) &&
            !c.approvals.some((a) => a.approverRole === 'EXAMINER')
        );

        const openTickets = tickets.filter(
          (t) =>
            t.status !== TicketStatus.RESOLVED &&
            t.status !== TicketStatus.REJECTED &&
            t.status !== TicketStatus.CLOSED
        );

        const pendingRevals = revaluations.filter(
          (r) =>
            r.status === 'SUBMITTED' ||
            r.status === 'UNDER_REVIEW' ||
            r.status === 'EVIDENCE_REQUIRED'
        );

        const nowMs = Date.now();
        const upcomingAssigned = assignedExams.filter(
          (s) => s.status === ExamScheduleStatus.PUBLISHED && new Date(`${s.examDate}T${s.endTime}:00`).getTime() >= nowMs
        );

        res.json({
          cards: {
            assignedExamsCount: assignedExams.length,
            nextAssignedExam: upcomingAssigned[0] ?? null,
            pendingRevaluationsCount: pendingRevals.length,
            assignedOpenTicketsCount: openTickets.length,
            pendingCorrectionApprovalsCount: pendingCorrectionApprovals.length,
            unreadNotificationsCount: unreadNotifications,
          },
          upcomingAssigned: upcomingAssigned.slice(0, 4),
          pendingCorrections: pendingCorrectionApprovals.slice(0, 5),
          openTickets: openTickets.slice(0, 5),
          pendingRevaluations: pendingRevals.slice(0, 5),
        });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  router.get(
    '/dashboard/controller-summary',
    requireAuth,
    requireRoles(UserRole.CONTROLLER, UserRole.SUPER_ADMIN),
    (req, res) => {
      try {
        const user = req.user!;
        const audit = auditService.runAudit(false);
        const schedules = examScheduleService.listSchedulesForUser(user);
        const tickets = ticketService.listTickets(user);
        const revaluations = revaluationService.listRevaluations(user);
        const corrections = ledgerService.listCorrectionRequests();
        const unreadNotifications = notificationService.getUnreadCount(user.id);

        const publishedExams = schedules.filter(
          (s) => s.status === ExamScheduleStatus.PUBLISHED
        );
        const pendingSecondSigs = corrections.filter(
          (c) =>
            c.status === CorrectionStatus.PENDING ||
            c.status === CorrectionStatus.APPROVED_PARTIAL ||
            c.status === CorrectionStatus.READY_TO_FINALIZE
        );
        const escalatedTickets = tickets.filter(
          (t) => t.status === TicketStatus.ESCALATED || t.isOverdue
        );
        const pendingRevals = revaluations.filter(
          (r) => r.status !== 'COMPLETED' && r.status !== 'REJECTED'
        );

        const activeAdmitRow = database.db
          .prepare(`SELECT COUNT(*) AS cnt FROM admit_cards WHERE status = 'ACTIVE'`)
          .get() as { cnt: number };

        const nowMs = Date.now();
        const upcomingExams = publishedExams.filter(
          (s) => new Date(`${s.examDate}T${s.endTime}:00`).getTime() >= nowMs
        );

        res.json({
          cards: {
            publishedExamsCount: publishedExams.length,
            draftExamsCount: schedules.filter((s) => s.status === ExamScheduleStatus.DRAFT).length,
            admitCardsIssuedCount: Number(activeAdmitRow.cnt),
            pendingCorrectionsCount: pendingSecondSigs.length,
            escalatedTicketsCount: escalatedTickets.length,
            pendingRevaluationsCount: pendingRevals.length,
            ledgerIntegrityStatus: audit.status,
            ledgerIssuesCount: audit.issues.length,
            unreadNotificationsCount: unreadNotifications,
          },
          audit,
          upcomingExams: upcomingExams.slice(0, 4),
          pendingCorrections: pendingSecondSigs.slice(0, 5),
          escalatedTickets: escalatedTickets.slice(0, 5),
        });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  return router;
}
