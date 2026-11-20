import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { AdmitCardService } from './server/admitCardService';
import { AnalyticsService } from './server/analyticsService';
import { AttachmentStore } from './server/attachmentStore';
import { AuditService } from './server/auditService';
import { loadConfig, VeriMarkConfig } from './server/config';
import { VeriMarkDatabase } from './server/db';
import { ExamScheduleService } from './server/examScheduleService';
import { LedgerService } from './server/ledgerService';
import { NotificationService } from './server/notificationService';
import { RevaluationService } from './server/revaluationService';
import { createApiRouter } from './server/routes';
import { seedDemoDataIfEmpty } from './server/seed';
import { seedV2DataIfEmpty } from './server/seedV2';
import { TamperService } from './server/tamperService';
import { TicketService } from './server/ticketService';
import { ExternalTrustStore } from './server/trustStore';
import { createV2Router } from './server/v2Routes';
import { VerifyService } from './server/verifyService';

export async function createVeriMarkApp(overrides?: Partial<VeriMarkConfig>) {
  const config = loadConfig(overrides);
  const database = new VeriMarkDatabase(config.dbPath);
  const trustStore = new ExternalTrustStore(config.trustDir);
  const ledgerService = new LedgerService(database, trustStore);
  const auditService = new AuditService(database, trustStore);
  const verifyService = new VerifyService(database, trustStore, ledgerService);
  const tamperService = new TamperService(
    database,
    trustStore,
    ledgerService,
    auditService
  );

  // VeriMark 2.0 services
  const notificationService = new NotificationService(database);
  const attachmentStore = new AttachmentStore(database, path.dirname(config.dbPath));
  const examScheduleService = new ExamScheduleService(database, notificationService);
  const admitCardService = new AdmitCardService(database, notificationService);
  const ticketService = new TicketService(
    database,
    notificationService,
    attachmentStore,
    ledgerService
  );
  const revaluationService = new RevaluationService(
    database,
    notificationService,
    attachmentStore,
    ledgerService
  );
  const analyticsService = new AnalyticsService(
    database,
    ledgerService,
    verifyService,
    auditService
  );

  await seedDemoDataIfEmpty(database, trustStore, ledgerService, auditService);
  const runV2Seed = () =>
    seedV2DataIfEmpty({
      database,
      ledgerService,
      notificationService,
      examScheduleService,
      admitCardService,
      ticketService,
      revaluationService,
    });
  runV2Seed();
  tamperService.setAfterResetHook(runV2Seed);

  const app = express();
  app.set('trust proxy', 1);
  // 4mb accommodates base64-encoded 2mb evidence attachments while AttachmentStore enforces exact 2mb decoded limit
  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());

  app.use(
    '/api',
    createApiRouter({
      config,
      database,
      trustStore,
      ledgerService,
      auditService,
      verifyService,
      tamperService,
      notificationService,
      ticketService,
      revaluationService,
    })
  );

  app.use(
    '/api',
    createV2Router({
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
    })
  );

  return {
    app,
    config,
    database,
    trustStore,
    ledgerService,
    auditService,
    verifyService,
    tamperService,
    notificationService,
    attachmentStore,
    examScheduleService,
    admitCardService,
    ticketService,
    revaluationService,
    analyticsService,
  };
}

async function startServer() {
  const { app, config } = await createVeriMarkApp();

  if (!config.isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(
      `VeriMark 2.0 server listening on http://localhost:${config.port} (env=${config.nodeEnv}, tamperLab=${config.enableTamperLab})`
    );
  });
}

// Only start HTTP listener when executed directly (not imported by tests)
const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve('server.ts');

if (isDirectExecution) {
  startServer().catch((err) => {
    console.error('Failed to start VeriMark server:', err);
    process.exit(1);
  });
}
