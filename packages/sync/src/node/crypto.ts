import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * 零知识加密的信封（设计 §8.1）。
 *
 * **secret gist 不是私有的**——它只是不被搜索索引，任何拿到 URL 的人无需登录即可读
 * 全文。所以进 Gist 的 WebDAV 凭据必须先在本地加密，云端只看得见一堆密文。
 *
 * 全部用 `node:crypto`：不引入任何第三方库，更不引入原生模块——那对
 * `npm run setup` 的 `--ignore-scripts` 很重要。
 */
export interface SecretEnvelope {
  v: 1;
  kdf: 'scrypt';
  cipher: 'AES-256-GCM';
  /** base64。**只在改口令时更换**，不是每次写。 */
  salt: string;
  /** base64，12 字节，每次加密都换。 */
  iv: string;
  updatedAt: string;
  device: string;
  /** base64，密文 + 尾部 16 字节 GCM 认证标签。 */
  data: string;
}

/** 口令错，或密文被篡改。**这两者故意不区分**——见下面的注释。 */
export class PassphraseError extends Error {
  readonly statusCode = 400;

  constructor(message = '口令不正确，或云端数据已被篡改') {
    super(message);
    this.name = 'PassphraseError';
  }
}

/** 信封本身的结构坏了：不是「口令错」，重输一遍也没用。 */
export class CorruptEnvelopeError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'CorruptEnvelopeError';
  }
}

const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const TAG_BYTES = 16;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase.normalize('NFKC'), salt, KEY_BYTES);
}

export interface EncryptOptions {
  device: string;
  /** 传上一份信封的 salt 以复用它。scrypt 很慢，每改一次主题就重派生会明显卡。 */
  salt?: string;
  updatedAt?: string;
}

export function encryptEnvelope(
  value: unknown,
  passphrase: string,
  options: EncryptOptions,
): SecretEnvelope {
  if (passphrase.trim().length === 0) {
    throw new Error('同步口令不能为空');
  }

  const salt =
    options.salt === undefined ? randomBytes(SALT_BYTES) : Buffer.from(options.salt, 'base64');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  const body = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value), 'utf8')),
    cipher.final(),
  ]);

  return {
    v: 1,
    kdf: 'scrypt',
    cipher: 'AES-256-GCM',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    device: options.device,
    // 认证标签跟在密文后面，于是信封里**不需要单独存 verifier**：
    // 解不开就是口令错。少一个字段，也少一个能被离线爆破的靶子。
    data: Buffer.concat([body, cipher.getAuthTag()]).toString('base64'),
  };
}

export function decryptEnvelope(envelope: SecretEnvelope, passphrase: string): unknown {
  assertWellFormed(envelope);

  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const raw = Buffer.from(envelope.data, 'base64');
  if (salt.length === 0 || iv.length !== IV_BYTES || raw.length <= TAG_BYTES) {
    throw new CorruptEnvelopeError('信封里的 salt / iv / 密文长度不对');
  }

  const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));

  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([
      decipher.update(raw.subarray(0, raw.length - TAG_BYTES)),
      decipher.final(),
    ]);
  } catch {
    // GCM 解不开只有两种可能：口令错，或密文被动过。
    // **密码学上区分不了这两者**，所以这里也不假装能——消息把两种都说出来。
    throw new PassphraseError();
  }

  try {
    return JSON.parse(plaintext.toString('utf8'));
  } catch {
    // 标签验过了却不是合法 JSON：是我们自己写坏的，不是口令的问题。
    throw new CorruptEnvelopeError('解密成功但内容不是合法 JSON');
  }
}

function assertWellFormed(envelope: SecretEnvelope): void {
  if (envelope?.v !== 1) {
    throw new CorruptEnvelopeError(`不认识的信封版本：${String(envelope?.v)}`);
  }
  if (envelope.kdf !== 'scrypt' || envelope.cipher !== 'AES-256-GCM') {
    throw new CorruptEnvelopeError(`不认识的算法：${envelope.kdf} / ${envelope.cipher}`);
  }
  for (const field of ['salt', 'iv', 'data'] as const) {
    if (typeof envelope[field] !== 'string' || envelope[field].length === 0) {
      throw new CorruptEnvelopeError(`信封缺少 ${field}`);
    }
  }
}
