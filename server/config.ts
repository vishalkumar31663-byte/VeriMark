import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export interface VeriMarkConfig {
  nodeEnv: string;
  port: number;
  appUrl: string;
  jwtSecret: string;
  dataDir: string;
  trustDir: string;
  dbPath: string;
  enableTamperLab: boolean;
  isProduction: boolean;
}

export function loadConfig(overrides?: Partial<VeriMarkConfig>): VeriMarkConfig {
  const nodeEnv = overrides?.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  const dataDir = path.resolve(
    overrides?.dataDir ?? process.env.VERIMARK_DATA_DIR ?? './data/db'
  );
  const trustDir = path.resolve(
    overrides?.trustDir ?? process.env.VERIMARK_TRUST_DIR ?? './data/trust'
  );
  const dbPath = overrides?.dbPath ?? path.join(dataDir, 'verimark.sqlite');

  // Tamper Lab is strictly disabled in production unless explicitly overridden in dev/test
  const enableTamperLab =
    overrides?.enableTamperLab ??
    (!isProduction && process.env.VERIMARK_ENABLE_TAMPER_LAB !== 'false');

  return {
    nodeEnv,
    port: overrides?.port ?? Number(process.env.PORT ?? 3000),
    appUrl:
      overrides?.appUrl ??
      process.env.APP_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`,
    jwtSecret:
      overrides?.jwtSecret ??
      process.env.JWT_SECRET ??
      'verimark-dev-jwt-secret-change-in-production-0f8c2a9e4d1b7a53',
    dataDir,
    trustDir,
    dbPath,
    enableTamperLab,
    isProduction,
  };
}
