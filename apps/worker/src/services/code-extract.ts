import { htmlToText } from '../lib/text.js';
import type { Env } from '../types.js';

/** 验证码上下文关键词 */
const KEYWORD_REGEX =
  /(verification|verify|one[-\s]?time|passcode|pass\s?code|security\s?code|otp|access\s?code|\bcode\b|\bpin\b|验证码|校验码|动态码|动态密码|确认码|验证代码|口令|验证)/gi;

const NEIGHBORHOOD = 120;

interface Candidate {
  value: string;
  index: number;
}

/** 收集候选：4-8 位纯数字，或 6-8 位大写字母数字混合（至少含一位数字与一位字母） */
function collectCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  const digit = /(?<![\w])(\d{4,8})(?![\w])/g;
  let m: RegExpExecArray | null;
  while ((m = digit.exec(text)) !== null) {
    out.push({ value: m[1]!, index: m.index });
  }
  const alnum = /(?<![\w])([A-Z0-9]{6,8})(?![\w])/g;
  while ((m = alnum.exec(text)) !== null) {
    const v = m[1]!;
    if (/\d/.test(v) && /[A-Z]/.test(v)) out.push({ value: v, index: m.index });
  }
  return out;
}

/**
 * 纯正则提码：关键词 ±120 字符内的候选，多候选取距关键词最近者。
 * 导出为纯函数便于单测。
 */
export function extractCodeByRegex(subject: string, body: string): string {
  const corpus = `${subject || ''}\n${body || ''}`;
  const keywordPositions: number[] = [];
  let km: RegExpExecArray | null;
  KEYWORD_REGEX.lastIndex = 0;
  while ((km = KEYWORD_REGEX.exec(corpus)) !== null) {
    keywordPositions.push(km.index);
  }
  if (keywordPositions.length === 0) return '';

  const candidates = collectCandidates(corpus);
  let best: { value: string; distance: number } | null = null;
  for (const cand of candidates) {
    let minDist = Infinity;
    for (const kp of keywordPositions) {
      const dist = Math.abs(cand.index - kp);
      if (dist < minDist) minDist = dist;
    }
    if (minDist <= NEIGHBORHOOD && (best === null || minDist < best.distance)) {
      best = { value: cand.value, distance: minDist };
    }
  }
  return best ? best.value : '';
}

/** Workers AI 兜底提码：3s 超时，JSON-only，≤8 字符 */
export async function extractCodeByAi(
  env: Env,
  input: { subject: string; text: string; html: string },
): Promise<string> {
  const subject = input.subject || '';
  const body = (input.text || htmlToText(input.html)).slice(0, 6000);
  if (!subject && !body) return '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const result = (await env.ai.run(
      env.ai_model || '@cf/meta/llama-3.1-8b-instruct',
      {
        messages: [
          {
            role: 'system',
            content:
              'You extract verification codes from emails. Return only JSON like {"code":"12345678"} or {"code":""}. The code must be 8 characters or fewer and must not contain spaces. If the code is longer than 8 characters or contains spaces, return {"code":""}. Do not explain.',
          },
          { role: 'user', content: `Subject: ${subject}\n\n${body}` },
        ],
        temperature: 0,
        max_tokens: 32,
      },
      { signal: controller.signal } as never,
    )) as { response?: string } | string;

    const content = typeof result === 'string' ? result : result?.response || '';
    const match = content.match(/\{[^}]*\}/);
    if (!match) return '';
    const json = JSON.parse(match[0]) as { code?: unknown };
    if (typeof json.code !== 'string') return '';
    if (json.code.length > 8 || /\s/.test(json.code)) return '';
    return json.code;
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}
