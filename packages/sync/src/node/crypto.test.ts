import { describe, expect, it } from 'vitest';
import {
  decryptEnvelope,
  encryptEnvelope,
  PassphraseError,
  CorruptEnvelopeError,
} from './crypto.js';

const passphrase = '一个还算长的口令 42';
const payload = { webdav: { url: 'https://dav.example.com/dav/', password: 's3cret' } };

describe('信封加解密', () => {
  it('往返之后拿回一模一样的对象', () => {
    const envelope = encryptEnvelope(payload, passphrase, { device: '测试机' });

    expect(decryptEnvelope(envelope, passphrase)).toEqual(payload);
  });

  it('密文里看不到明文的任何片段', () => {
    const envelope = encryptEnvelope(payload, passphrase, { device: '测试机' });

    expect(JSON.stringify(envelope)).not.toContain('s3cret');
    expect(JSON.stringify(envelope)).not.toContain('dav.example.com');
  });

  it('header 保持明文：不解密就能做列表与冲突判断', () => {
    const envelope = encryptEnvelope(payload, passphrase, {
      device: '测试机',
      updatedAt: '2026-08-19T10:00:00.000Z',
    });

    expect(envelope).toMatchObject({
      v: 1,
      kdf: 'scrypt',
      cipher: 'AES-256-GCM',
      device: '测试机',
      updatedAt: '2026-08-19T10:00:00.000Z',
    });
    expect(typeof envelope.salt).toBe('string');
    expect(typeof envelope.iv).toBe('string');
  });

  it('口令不对 → PassphraseError，而不是一个通用失败', () => {
    const envelope = encryptEnvelope(payload, passphrase, { device: '测试机' });

    expect(() => decryptEnvelope(envelope, '错的口令')).toThrow(PassphraseError);
  });

  it('密文被篡改 → 同样被 GCM 的认证标签挡下', () => {
    const envelope = encryptEnvelope(payload, passphrase, { device: '测试机' });
    const bytes = Buffer.from(envelope.data, 'base64');
    bytes[0] = bytes[0]! ^ 0xff;

    expect(() =>
      decryptEnvelope({ ...envelope, data: bytes.toString('base64') }, passphrase),
    ).toThrow(PassphraseError);
  });

  it('信封结构本身坏了 → CorruptEnvelopeError，与口令错分得开', () => {
    expect(() => decryptEnvelope({ v: 1 } as never, passphrase)).toThrow(CorruptEnvelopeError);
  });

  it('不认识的版本 → CorruptEnvelopeError', () => {
    const envelope = encryptEnvelope(payload, passphrase, { device: '测试机' });

    expect(() => decryptEnvelope({ ...envelope, v: 2 } as never, passphrase)).toThrow(
      CorruptEnvelopeError,
    );
  });

  it('每次加密换一个 iv，同样的明文不会产生同样的密文', () => {
    const a = encryptEnvelope(payload, passphrase, { device: '测试机' });
    const b = encryptEnvelope(payload, passphrase, { device: '测试机' });

    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('沿用上一份的 salt：scrypt 很慢，不能每写一次就重派生', () => {
    const first = encryptEnvelope(payload, passphrase, { device: '测试机' });

    const second = encryptEnvelope(payload, passphrase, { device: '测试机', salt: first.salt });

    expect(second.salt).toBe(first.salt);
    expect(decryptEnvelope(second, passphrase)).toEqual(payload);
  });

  it('不传 salt 时每次都换一把新的——改口令走的就是这条路', () => {
    const a = encryptEnvelope(payload, passphrase, { device: '测试机' });
    const b = encryptEnvelope(payload, passphrase, { device: '测试机' });

    expect(a.salt).not.toBe(b.salt);
  });

  it('不单独存 verifier：信封里除 header 外只有密文一个字段', () => {
    const envelope = encryptEnvelope(payload, passphrase, { device: '测试机' });

    expect(Object.keys(envelope).sort()).toEqual(
      ['cipher', 'data', 'device', 'iv', 'kdf', 'salt', 'updatedAt', 'v'].sort(),
    );
  });

  it('空口令直接拒绝，不给一个能被秒破的信封', () => {
    expect(() => encryptEnvelope(payload, '  ', { device: '测试机' })).toThrow('口令');
  });
});
