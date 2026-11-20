import fs from 'node:fs';
import path from 'node:path';
import {
  LEDGER_SCHEMA_VERSION,
  buildCheckpointSigningMessage,
} from '../shared/canonical';
import {
  EncryptedDemoKeyBundle,
  TrustedCheckpoint,
  TrustedKeyEntry,
} from '../shared/types';
import {
  encryptPrivateKeyAesGcm,
  generateEd25519Keypair,
  signEd25519Hex,
  verifyEd25519Hex,
} from './crypto';

interface ServerKeyStore {
  publisherKeyId: string;
  publisherPrivateKeyHex: string;
  publisherPublicKeyHex: string;
  checkpointKeyId: string;
  checkpointPrivateKeyHex: string;
  checkpointPublicKeyHex: string;
}

/**
 * Independently Protected External Trust Store (kept strictly OUTSIDE SQLite).
 *
 * Threat-model boundary:
 * Protects against SQLite-only compromise (direct mark alteration, payload tampering,
 * hash-chain forgery, ledger truncation, or rogue key injection into SQLite).
 * Does NOT defend against an attacker who compromises the SQLite DB, the server signing
 * keys, AND this external trust storage simultaneously.
 */
export class ExternalTrustStore {
  private readonly trustDir: string;
  private readonly trustedKeysPath: string;
  private readonly serverKeysPath: string;
  private readonly checkpointPath: string;
  private readonly demoVaultPath: string;
  private simulateCheckpointFailure = false;

  constructor(trustDir: string) {
    this.trustDir = trustDir;
    this.trustedKeysPath = path.join(trustDir, 'trusted_keys.json');
    this.serverKeysPath = path.join(trustDir, 'server_keys.json');
    this.checkpointPath = path.join(trustDir, 'checkpoint.json');
    this.demoVaultPath = path.join(trustDir, 'demo_encrypted_vault.json');
    fs.mkdirSync(trustDir, { recursive: true });
  }

  private atomicWriteJson(filePath: string, data: unknown): void {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
  }

  public async ensureInitialized(): Promise<{
    serverKeys: ServerKeyStore;
    trustedKeys: TrustedKeyEntry[];
    demoApproverRawKeys?: {
      examinerKeyId: string;
      examinerPrivateKeyHex: string;
      examinerPublicKeyHex: string;
      controllerKeyId: string;
      controllerPrivateKeyHex: string;
      controllerPublicKeyHex: string;
    };
  }> {
    if (
      fs.existsSync(this.serverKeysPath) &&
      fs.existsSync(this.trustedKeysPath) &&
      fs.existsSync(this.demoVaultPath)
    ) {
      const serverKeys = JSON.parse(
        fs.readFileSync(this.serverKeysPath, 'utf8')
      ) as ServerKeyStore;
      const trustedKeys = JSON.parse(
        fs.readFileSync(this.trustedKeysPath, 'utf8')
      ) as TrustedKeyEntry[];
      return { serverKeys, trustedKeys };
    }

    const now = new Date().toISOString();
    const publisherPair = generateEd25519Keypair();
    const checkpointPair = generateEd25519Keypair();
    const examinerPair = generateEd25519Keypair();
    const controllerPair = generateEd25519Keypair();

    const serverKeys: ServerKeyStore = {
      publisherKeyId: 'pub-registrar-ed25519-01',
      publisherPrivateKeyHex: publisherPair.privateKeyHex,
      publisherPublicKeyHex: publisherPair.publicKeyHex,
      checkpointKeyId: 'cp-authority-ed25519-01',
      checkpointPrivateKeyHex: checkpointPair.privateKeyHex,
      checkpointPublicKeyHex: checkpointPair.publicKeyHex,
    };

    const trustedKeys: TrustedKeyEntry[] = [
      {
        keyId: serverKeys.publisherKeyId,
        ownerName: 'Demo University Registrar Publisher',
        ownerEmail: 'admin@demouniversity.edu',
        role: 'PUBLISHER',
        publicKeyHex: serverKeys.publisherPublicKeyHex,
        enrolledAt: now,
        active: true,
      },
      {
        keyId: serverKeys.checkpointKeyId,
        ownerName: 'VeriMark Independent Checkpoint Authority',
        ownerEmail: 'checkpoint@demouniversity.edu',
        role: 'CHECKPOINT_AUTHORITY',
        publicKeyHex: serverKeys.checkpointPublicKeyHex,
        enrolledAt: now,
        active: true,
      },
      {
        keyId: 'examiner-dr-meera-ed25519-01',
        ownerName: 'Dr. Meera Kulkarni',
        ownerEmail: 'examiner@demouniversity.edu',
        role: 'EXAMINER',
        publicKeyHex: examinerPair.publicKeyHex,
        enrolledAt: now,
        active: true,
      },
      {
        keyId: 'controller-prof-rajesh-ed25519-01',
        ownerName: 'Prof. Rajeshwar Nair',
        ownerEmail: 'controller@demouniversity.edu',
        role: 'CONTROLLER',
        publicKeyHex: controllerPair.publicKeyHex,
        enrolledAt: now,
        active: true,
      },
    ];

    // Encrypt Examiner and Controller private keys with independent passphrases via Web Crypto AES-256-GCM.
    // The server NEVER retains plaintext approver private keys after vault generation.
    const examinerEncrypted = await encryptPrivateKeyAesGcm(
      examinerPair.privateKeyHex,
      'ExaminerSign#2026'
    );
    const controllerEncrypted = await encryptPrivateKeyAesGcm(
      controllerPair.privateKeyHex,
      'ControllerSign#2026'
    );

    const demoBundles: EncryptedDemoKeyBundle[] = [
      {
        keyId: 'examiner-dr-meera-ed25519-01',
        role: 'EXAMINER',
        ownerName: 'Dr. Meera Kulkarni',
        ownerEmail: 'examiner@demouniversity.edu',
        publicKeyHex: examinerPair.publicKeyHex,
        ...examinerEncrypted,
      },
      {
        keyId: 'controller-prof-rajesh-ed25519-01',
        role: 'CONTROLLER',
        ownerName: 'Prof. Rajeshwar Nair',
        ownerEmail: 'controller@demouniversity.edu',
        publicKeyHex: controllerPair.publicKeyHex,
        ...controllerEncrypted,
      },
    ];

    this.atomicWriteJson(this.serverKeysPath, serverKeys);
    this.atomicWriteJson(this.trustedKeysPath, trustedKeys);
    this.atomicWriteJson(this.demoVaultPath, demoBundles);

    return {
      serverKeys,
      trustedKeys,
      demoApproverRawKeys: {
        examinerKeyId: 'examiner-dr-meera-ed25519-01',
        examinerPrivateKeyHex: examinerPair.privateKeyHex,
        examinerPublicKeyHex: examinerPair.publicKeyHex,
        controllerKeyId: 'controller-prof-rajesh-ed25519-01',
        controllerPrivateKeyHex: controllerPair.privateKeyHex,
        controllerPublicKeyHex: controllerPair.publicKeyHex,
      },
    };
  }

  public getServerKeys(): ServerKeyStore {
    return JSON.parse(fs.readFileSync(this.serverKeysPath, 'utf8')) as ServerKeyStore;
  }

  public getTrustedKeys(): TrustedKeyEntry[] {
    if (!fs.existsSync(this.trustedKeysPath)) {
      return [];
    }
    return JSON.parse(fs.readFileSync(this.trustedKeysPath, 'utf8')) as TrustedKeyEntry[];
  }

  public getTrustedKeyById(keyId: string): TrustedKeyEntry | undefined {
    return this.getTrustedKeys().find((k) => k.keyId === keyId && k.active);
  }

  public getEncryptedDemoVault(): EncryptedDemoKeyBundle[] {
    if (!fs.existsSync(this.demoVaultPath)) {
      return [];
    }
    return JSON.parse(
      fs.readFileSync(this.demoVaultPath, 'utf8')
    ) as EncryptedDemoKeyBundle[];
  }

  public enrollPublicKey(entry: TrustedKeyEntry): void {
    const keys = this.getTrustedKeys().filter((k) => k.keyId !== entry.keyId);
    keys.push(entry);
    this.atomicWriteJson(this.trustedKeysPath, keys);
  }

  public signBlockHash(blockHash: string): {
    publisherKeyId: string;
    signature: string;
  } {
    const serverKeys = this.getServerKeys();
    const signature = signEd25519Hex(blockHash, serverKeys.publisherPrivateKeyHex);
    return {
      publisherKeyId: serverKeys.publisherKeyId,
      signature,
    };
  }

  public setSimulateCheckpointFailure(fail: boolean): void {
    this.simulateCheckpointFailure = fail;
  }

  public anchorCheckpoint(sequence: number, blockHash: string): TrustedCheckpoint {
    if (this.simulateCheckpointFailure) {
      throw new Error('Checkpoint anchor storage unavailable (simulated I/O failure)');
    }
    const serverKeys = this.getServerKeys();
    const timestamp = new Date().toISOString();
    const msg = buildCheckpointSigningMessage({
      schemaVersion: LEDGER_SCHEMA_VERSION,
      sequence,
      blockHash,
      timestamp,
      authorityKeyId: serverKeys.checkpointKeyId,
    });
    const signature = signEd25519Hex(msg, serverKeys.checkpointPrivateKeyHex);
    const checkpoint: TrustedCheckpoint = {
      schemaVersion: LEDGER_SCHEMA_VERSION,
      sequence,
      blockHash,
      timestamp,
      authorityKeyId: serverKeys.checkpointKeyId,
      signature,
    };
    this.atomicWriteJson(this.checkpointPath, checkpoint);
    return checkpoint;
  }

  public getCheckpoint(): TrustedCheckpoint | null {
    if (!fs.existsSync(this.checkpointPath)) {
      return null;
    }
    try {
      return JSON.parse(
        fs.readFileSync(this.checkpointPath, 'utf8')
      ) as TrustedCheckpoint;
    } catch {
      return null;
    }
  }

  public verifyCheckpointSignature(checkpoint: TrustedCheckpoint | null): boolean {
    if (!checkpoint) return false;
    const key = this.getTrustedKeyById(checkpoint.authorityKeyId);
    if (!key || key.role !== 'CHECKPOINT_AUTHORITY') return false;
    const msg = buildCheckpointSigningMessage({
      schemaVersion: checkpoint.schemaVersion,
      sequence: checkpoint.sequence,
      blockHash: checkpoint.blockHash,
      timestamp: checkpoint.timestamp,
      authorityKeyId: checkpoint.authorityKeyId,
    });
    return verifyEd25519Hex(msg, checkpoint.signature, key.publicKeyHex);
  }

  public clearAllForReset(): void {
    for (const p of [
      this.checkpointPath,
      this.serverKeysPath,
      this.trustedKeysPath,
      this.demoVaultPath,
    ]) {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
  }
}
