import { describe, expect, it } from 'vitest';
import { extractOtp } from './otp';

describe('extractOtp', () => {
  it('提取中文关键词附近的数字验证码', () => {
    const result = extractOtp('登录提醒', '您的验证码是 482913，请在 5 分钟内使用。');
    expect(result).toEqual({ code: '482913', source: 'body' });
  });

  it('提取英文关键词附近的验证码', () => {
    const result = extractOtp('', 'Your verification code is 903215.');
    expect(result?.code).toBe('903215');
  });

  it('多个候选时取距离关键词最近的一个', () => {
    const result = extractOtp('', '订单号 100200 已创建，你的验证码是 445566。');
    expect(result?.code).toBe('445566');
  });

  it('识别大写字母数字混合验证码', () => {
    const result = extractOtp('', 'Your code: A1B2C3 expires soon.');
    expect(result?.code).toBe('A1B2C3');
  });

  it('没有关键词时不提取', () => {
    expect(extractOtp('Hello', 'The tracking number is 123456.')).toBeNull();
  });

  it('主题命中时标记来源为 subject', () => {
    const result = extractOtp('验证码 246810 请查收', '正文无关内容');
    expect(result).toEqual({ code: '246810', source: 'subject' });
  });
});
