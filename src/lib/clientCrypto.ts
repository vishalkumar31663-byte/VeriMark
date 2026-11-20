/**
 * Browser-Side Cryptographic Signing Vault
 * - Decrypts AES-256-GCM encrypted Ed25519 private keys strictly in browser memory via Web Crypto API.
 * - Signs canonical correction messages client-side with @noble/ed25519.
 * - Private keys and signing passphrases NEVER leave the browser.
 */
import * as ed from '@noble/ed25519';
import {
  buildCorrectionSigningMessage,
  bytesToHex,
  hexToBytes,
} from '../../shared/canonical';
import {
  CorrectionSigningPayload,
  EncryptedDemoKeyBundle,
} from '../../shared/types';

export interface UnlockedSigningKey {
  keyId: string;
  role: 'EXAMINER' | 'CONTROLLER';
  ownerName: string;
  publicKeyHex: string;
  privateKeyBytes: Uint8Array;
}

export async function unlockEncryptedKeyBundle(
  bundle: EncryptedDemoKeyBundle,
  passphrase: string
): Promise<UnlockedSigningKey> {
  if (!passphrase) {
    throw new Error('Signing passphrase is required to unlock your encrypted key.');
  }

  const subtle = window.crypto.subtle;
  const salt = hexToBytes(bundle.saltHex);
  const iv = hexToBytes(bundle.ivHex);
  const ciphertext = hexToBytes(bundle.ciphertextHex);

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
      salt: salt as BufferSource,
      iterations: bundle.iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  let plaintextBuf: ArrayBuffer;
  try {
    plaintextBuf = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      aesKey,
      ciphertext as BufferSource
    );
  } catch {
    throw new Error(
      'Incorrect signing passphrase. AES-256-GCM authentication tag verification failed.'
    );
  }

  const privateKeyBytes = new Uint8Array(plaintextBuf);
  if (privateKeyBytes.length !== 32) {
    throw new Error('Decrypted key material is not a valid 32-byte Ed25519 seed.');
  }

  // Verify derived public key matches enrolled public key
  const derivedPub = await ed.getPublicKeyAsync(privateKeyBytes);
  const derivedPubHex = bytesToHex(derivedPub);
  if (derivedPubHex.toLowerCase() !== bundle.publicKeyHex.toLowerCase()) {
    throw new Error(
      'Decrypted private key does not match the enrolled institutional public key.'
    );
  }

  return {
    keyId: bundle.keyId,
    role: bundle.role,
    ownerName: bundle.ownerName,
    publicKeyHex: bundle.publicKeyHex,
    privateKeyBytes,
  };
}

export async function signCorrectionClientSide(
  payload: CorrectionSigningPayload,
  unlockedKey: UnlockedSigningKey
): Promise<{
  signatureHex: string;
  canonicalMessage: string;
}> {
  const canonicalMessage = buildCorrectionSigningMessage(payload);
  const msgBytes = new TextEncoder().encode(canonicalMessage);
  const sigBytes = await ed.signAsync(msgBytes, unlockedKey.privateKeyBytes);
  return {
    signatureHex: bytesToHex(sigBytes),
    canonicalMessage,
  };
}
