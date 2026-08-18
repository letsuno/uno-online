import { describe, it, expect } from 'vitest';
import { validatePassword, validateNickname } from '../../src/auth/validation';

describe('validatePassword', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePassword('abc123').valid).toBe(false);
    expect(validatePassword('abc123').error).toBe('密码至少 8 个字符');
  });

  it('rejects passwords longer than 128 characters', () => {
    expect(validatePassword('a1' + 'x'.repeat(128)).valid).toBe(false);
  });

  it('rejects password without letters', () => {
    expect(validatePassword('12345678').valid).toBe(false);
    expect(validatePassword('12345678').error).toBe('密码必须包含字母');
  });

  it('rejects password without numbers', () => {
    expect(validatePassword('abcdefgh').valid).toBe(false);
    expect(validatePassword('abcdefgh').error).toBe('密码必须包含数字');
  });

  it('accepts valid password with letters and numbers', () => {
    expect(validatePassword('abc12345').valid).toBe(true);
  });

  it('accepts password with special characters', () => {
    expect(validatePassword('abc123!@').valid).toBe(true);
  });
});

describe('validateNickname', () => {
  it('rejects empty nickname', () => {
    expect(validateNickname('').valid).toBe(false);
  });

  it('rejects pure whitespace', () => {
    expect(validateNickname('   ').valid).toBe(false);
  });

  it('rejects nickname with only symbols/punctuation', () => {
    expect(validateNickname('...').valid).toBe(false);
    expect(validateNickname('!!!').error).toBe('昵称必须包含至少一个字母或数字');
  });

  it('accepts Chinese nickname', () => {
    expect(validateNickname('小明').valid).toBe(true);
  });

  it('accepts nickname with mixed content', () => {
    expect(validateNickname('玩家_01').valid).toBe(true);
  });

  it('accepts emoji with letters', () => {
    expect(validateNickname('player').valid).toBe(true);
  });

  it('rejects nickname longer than 20 characters', () => {
    expect(validateNickname('a'.repeat(21)).valid).toBe(false);
  });

  it('strips control characters before validation', () => {
    expect(validateNickname('​​abc').valid).toBe(true);
  });
});
