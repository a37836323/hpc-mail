/**
 * 验证码兜底提取（纯函数）。服务端 verificationCode 优先，此函数仅在其缺失时
 * 从主题 + 正文文本中提取：上下文关键词 ±120 字符内的 4-8 位数字，或 6-8 位大写
 * 字母数字组合；存在多个候选时取距离关键词最近的一个。
 */
export interface OtpMatch {
  code: string;
  source: 'subject' | 'body';
}

const PROXIMITY = 120;

const KEYWORD_PATTERN =
  /验证码|校验码|动态密码|一次性密码|动态验证码|安全码|verification code|verification|passcode|security code|access code|login code|one[-\s]?time|\bcode\b|\botp\b|\bpin\b|2fa/gi;

const DIGIT_PATTERN = /\d{4,8}/g;
const ALNUM_PATTERN = /[A-Z0-9]{6,8}/g;

interface Range {
  start: number;
  end: number;
}

interface Candidate {
  code: string;
  start: number;
  end: number;
}

function keywordRanges(text: string): Range[] {
  const ranges: Range[] = [];
  KEYWORD_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = KEYWORD_PATTERN.exec(text))) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
    if (match.index === KEYWORD_PATTERN.lastIndex) KEYWORD_PATTERN.lastIndex += 1;
  }
  return ranges;
}

function candidates(text: string): Candidate[] {
  const found: Candidate[] = [];
  DIGIT_PATTERN.lastIndex = 0;
  let digit: RegExpExecArray | null;
  while ((digit = DIGIT_PATTERN.exec(text))) {
    found.push({ code: digit[0], start: digit.index, end: digit.index + digit[0].length });
  }
  ALNUM_PATTERN.lastIndex = 0;
  let alnum: RegExpExecArray | null;
  while ((alnum = ALNUM_PATTERN.exec(text))) {
    const value = alnum[0];
    if (!/\d/.test(value) || !/[A-Z]/.test(value)) continue;
    found.push({ code: value, start: alnum.index, end: alnum.index + value.length });
  }
  return found;
}

function nearestDistance(candidate: Candidate, keywords: Range[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const keyword of keywords) {
    let gap: number;
    if (candidate.start >= keyword.end) gap = candidate.start - keyword.end;
    else if (keyword.start >= candidate.end) gap = keyword.start - candidate.end;
    else gap = 0;
    if (gap < best) best = gap;
  }
  return best;
}

interface Ranked extends OtpMatch {
  distance: number;
  index: number;
}

function rankField(text: string, source: OtpMatch['source']): Ranked[] {
  if (!text) return [];
  const keywords = keywordRanges(text);
  if (keywords.length === 0) return [];
  const ranked: Ranked[] = [];
  for (const candidate of candidates(text)) {
    const distance = nearestDistance(candidate, keywords);
    if (distance <= PROXIMITY) {
      ranked.push({ code: candidate.code, source, distance, index: candidate.start });
    }
  }
  return ranked;
}

export function extractOtp(subject: string | null | undefined, text: string | null | undefined): OtpMatch | null {
  const ranked = [...rankField(subject ?? '', 'subject'), ...rankField(text ?? '', 'body')];
  if (ranked.length === 0) return null;
  ranked.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.source !== b.source) return a.source === 'subject' ? -1 : 1;
    return a.index - b.index;
  });
  const best = ranked[0]!;
  return { code: best.code, source: best.source };
}
