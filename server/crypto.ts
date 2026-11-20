import crypto from 'node:crypto';
import { bytesToHex, hexToBytes } from '../shared/canonical';

// Standard ASN.1 DER prefixes for raw 32-byte Ed25519 keys (RFC 8410)
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_PKCS8_PREFIX = Buffer.from(
  '302e020100300506032b657004220420',
  'hex'
);

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function generateEd25519Keypair(): {
  publicKeyHex: string;
  privateKeyHex: string;
} {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' });
  const rawPub = spki.subarray(spki.length - 32);
  const rawPriv = pkcs8.subarray(pkcs8.length - 32);
  return {
    publicKeyHex: rawPub.toString('hex'),
    privateKeyHex: rawPriv.toString('hex'),
  };
}

export function derivePublicKeyHex(privateKeyHex: string): string {
  const privKeyObj = crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(privateKeyHex, 'hex')]),
    format: 'der',
    type: 'pkcs8',
  });
  const pubKeyObj = crypto.createPublicKey(privKeyObj);
  const spki = pubKeyObj.export({ format: 'der', type: 'spki' });
  return spki.subarray(spki.length - 32).toString('hex');
}

export function signEd25519Hex(messageUtf8: string, privateKeyHex: string): string {
  const privKeyObj = crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(privateKeyHex, 'hex')]),
    format: 'der',
    type: 'pkcs8',
  });
  const sig = crypto.sign(null, Buffer.from(messageUtf8, 'utf8'), privKeyObj);
  return sig.toString('hex');
}

export function verifyEd25519Hex(
  messageUtf8: string,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  try {
    const pubBytes = Buffer.from(publicKeyHex, 'hex');
    const sigBytes = Buffer.from(signatureHex, 'hex');
    if (pubBytes.length !== 32 || sigBytes.length !== 64) {
      return false;
    }
    const pubKeyObj = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, pubBytes]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(
      null,
      Buffer.from(messageUtf8, 'utf8'),
      pubKeyObj,
      sigBytes
    );
  } catch {
    return false;
  }
}

/**
 * Memory-hard password hashing using Node.js scrypt (RFC 7914) with 16-byte random salt
 * and constant-time comparison.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt$16384$8$1$${salt}$${derived.toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expectedHex = parts[5];
  const derived = crypto.scryptSync(password, salt, 64, { N, r, p });
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export interface SessionJwtPayload {
  sub: string;
  email: string;
  role: string;
  jti: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function signSessionJwt(
  payload: Omit<SessionJwtPayload, 'iat' | 'exp' | 'jti'>,
  secret: string,
  expiresInSeconds = 8 * 60 * 60
): { token: string; jti: string; expiresAt: string } {
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomUUID();
  const fullPayload: SessionJwtPayload = {
    ...payload,
    jti,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${headerB64}.${payloadB64}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest();
  const sigB64 = base64UrlEncode(sig);
  return {
    token: `${data}.${sigB64}`,
    jti,
    expiresAt: new Date((now + expiresInSeconds) * 1000).toISOString(),
  };
}

export function verifySessionJwt(
  token: string,
  secret: string
): SessionJwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const expectedSig = base64UrlEncode(
      crypto.createHmac('sha256', secret).update(data).digest()
    );
    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
    const parsed = JSON.parse(base64UrlDecode(payloadB64)) as SessionJwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!parsed.exp || parsed.exp <= now) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Encrypts a 32-byte raw Ed25519 private key using Web Crypto PBKDF2-SHA256 + AES-256-GCM
 * so the ciphertext can be decrypted exclusively client-side in the browser.
 */
export async function encryptPrivateKeyAesGcm(
  privateKeyHex: string,
  passphrase: string,
  iterations = 100_000
): Promise<{ saltHex: string; ivHex: string; ciphertextHex: string; iterations: number }> {
  const subtle = globalThis.crypto.subtle;
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);

  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const plaintext = hexToBytes(privateKeyHex);
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plaintext as BufferSource
  );

  return {
    saltHex: bytesToHex(new Uint8Array(salt)),
    ivHex: bytesToHex(new Uint8Array(iv)),
    ciphertextHex: bytesToHex(new Uint8Array(ciphertext)),
    iterations,
  };
}
