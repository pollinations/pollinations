import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// Try to use keytar for secure storage, fall back to encrypted file
let keytar: any;
try {
  keytar = await import('keytar');
} catch {
  console.warn('keytar not available, using encrypted file storage');
}

const KEYCHAIN_SERVICE = 'pollinations-cli';
const KEYCHAIN_ACCOUNT = 'session-token';
const CONFIG_DIR = join(homedir(), '.pollinations');
const TOKEN_FILE = join(CONFIG_DIR, 'token.enc');

// Derive encryption key from machine ID
async function getEncryptionKey(): Promise<Buffer> {
  const machineId = process.env.USER || process.env.USERNAME || 'default';
  const salt = 'pollinations-cli-salt';
  return (await scryptAsync(machineId, salt, 32)) as Buffer;
}

// Encrypt data using AES-256-GCM
async function encrypt(text: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encrypted
  });
}

// Decrypt data using AES-256-GCM
async function decrypt(encryptedData: string): Promise<string> {
  const { iv, authTag, encrypted } = JSON.parse(encryptedData);
  const key = await getEncryptionKey();

  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export interface StoredToken {
  accessToken: string;
  expiresAt: string;
  userId: string;
  userName?: string;
  userEmail?: string;
}

export class TokenStorage {
  async store(token: StoredToken): Promise<void> {
    const tokenString = JSON.stringify(token);

    if (keytar) {
      // Use system keychain if available
      await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, tokenString);
    } else {
      // Fall back to encrypted file
      await fs.mkdir(CONFIG_DIR, { recursive: true });
      const encrypted = await encrypt(tokenString);
      await fs.writeFile(TOKEN_FILE, encrypted, 'utf8');
    }
  }

  async retrieve(): Promise<StoredToken | null> {
    try {
      let tokenString: string | null = null;

      if (keytar) {
        tokenString = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
      } else {
        try {
          const encrypted = await fs.readFile(TOKEN_FILE, 'utf8');
          tokenString = await decrypt(encrypted);
        } catch {
          return null;
        }
      }

      if (!tokenString) return null;

      const token = JSON.parse(tokenString) as StoredToken;

      // Check if token is expired
      if (new Date(token.expiresAt) < new Date()) {
        await this.clear();
        return null;
      }

      return token;
    } catch {
      return null;
    }
  }

  async clear(): Promise<void> {
    if (keytar) {
      await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    } else {
      try {
        await fs.unlink(TOKEN_FILE);
      } catch {
        // Ignore if file doesn't exist
      }
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.retrieve();
    return token !== null;
  }
}