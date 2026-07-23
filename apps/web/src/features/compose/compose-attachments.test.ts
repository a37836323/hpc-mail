import { describe, expect, it } from 'vitest';
import {
  estimateExternalMessageBytes,
  exceedsExternalLimit,
  hasExternalRecipient,
} from './compose-attachments';

const MB = 1024 * 1024;

describe('hasExternalRecipient', () => {
  it('收件人全在系统域名内不算外部', () => {
    expect(hasExternalRecipient(['a@hpc.email', 'b@hpc.email'], ['hpc.email'])).toBe(false);
  });

  it('含外部域名即算外部', () => {
    expect(hasExternalRecipient(['a@qq.com'], ['hpc.email'])).toBe(true);
  });

  it('站内 + 外部混合，只要有外部即 true', () => {
    expect(hasExternalRecipient(['a@hpc.email', 'b@qq.com'], ['hpc.email'])).toBe(true);
  });

  it('无 @ 的非法格式按外部处理（保守拦截）', () => {
    expect(hasExternalRecipient(['badaddr'], ['hpc.email'])).toBe(true);
  });

  it('大小写不敏感', () => {
    expect(hasExternalRecipient(['a@HPC.EMAIL'], ['hpc.email'])).toBe(false);
  });
});

describe('estimateExternalMessageBytes', () => {
  it('附件按 base64 4/3 膨胀后加正文', () => {
    // 3MB 原始 → 4MB base64；1MB 正文 → 合计 5MB
    expect(estimateExternalMessageBytes(3 * MB, MB)).toBe(4 * MB + MB);
  });

  it('零附件只算正文', () => {
    expect(estimateExternalMessageBytes(0, 500)).toBe(500);
  });
});

describe('exceedsExternalLimit', () => {
  it('小附件 + 小正文不超限', () => {
    expect(exceedsExternalLimit(100, 100)).toBe(false);
  });

  it('3MB 原始附件（→4MB base64）恰好在 4MiB 阈值上不超', () => {
    // ceil(3MB*4/3) = 4MB，等于阈值，不超（> 才超）
    expect(exceedsExternalLimit(3 * MB, 0)).toBe(false);
  });

  it('4MB 原始附件（→5.33MB base64）超 4MiB 阈值', () => {
    expect(exceedsExternalLimit(4 * MB, 0)).toBe(true);
  });
});
