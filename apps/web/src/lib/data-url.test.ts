import { describe, expect, it } from 'vitest';
import { stripDataUrlPrefix } from './data-url';

describe('stripDataUrlPrefix', () => {
  it('剥离 data URL 前缀返回纯 base64', () => {
    expect(stripDataUrlPrefix('data:image/png;base64,AAAB')).toBe('AAAB');
    expect(stripDataUrlPrefix('data:image/webp;base64,QUJDRA==')).toBe('QUJDRA==');
  });

  it('已是纯 base64（无前缀）时原样返回', () => {
    expect(stripDataUrlPrefix('AAAB')).toBe('AAAB');
  });
});
