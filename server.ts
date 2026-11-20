import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { AuditService } from './server/auditService';
import { loadConfig, VeriMarkConfig } from './server/config';
import { VeriMarkDatabase } from './server/db';
import { LedgerService } from './server/ledgerService';
import { createApiRouter } from './server/routes';
import { seedDemoDataIfEmpty } from './server/seed';
import { TamperService } from './server/tamperService';
import { ExternalTrustStore } from './server/trustStore';
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

  await seedDemoDataIfEmpty(database, trustStore, ledgerService, auditService);

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
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
      `VeriMark server listening on http://localhost:${config.port} (env=${config.nodeEnv}, tamperLab=${config.enableTamperLab})`
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
