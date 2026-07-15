/** 解析 IP 为 {值, 总位宽}；IPv4→32 位，IPv6→128 位；非法返回 null */
function parseIp(ip: string): { value: bigint; width: number } | null {
  const addr = (ip.split('%')[0] ?? '').trim().toLowerCase();
  if (addr.includes(':')) {
    if (addr.split('::').length > 2) return null;
    const [head, tail] = addr.includes('::') ? addr.split('::') : [addr, undefined];
    const headGroups = head ? head.split(':') : [];
    const tailGroups = tail ? tail.split(':') : [];
    let groups: string[];
    if (addr.includes('::')) {
      const missing = 8 - headGroups.length - tailGroups.length;
      if (missing < 0) return null;
      groups = [...headGroups, ...Array(missing).fill('0'), ...tailGroups];
    } else {
      groups = headGroups;
    }
    if (groups.length !== 8) return null;
    let value = 0n;
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      value = (value << 16n) + BigInt(parseInt(g, 16));
    }
    return { value, width: 128 };
  }
  const parts = addr.split('.');
  if (parts.length !== 4) return null;
  let num = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    num = num * 256n + BigInt(n);
  }
  return { value: num, width: 32 };
}

/**
 * 判断来源 IP 是否命中白名单。空白名单放行。
 * 支持精确匹配与 IPv4/IPv6 CIDR（仅同协议族之间比较，跨族永不误匹配）。
 */
export function ipInAllowList(ip: string, list: string[]): boolean {
  if (list.length === 0) return true;
  const target = parseIp(ip);
  if (!target) return false;
  for (const entry of list) {
    const trimmed = entry.trim().toLowerCase();
    const slash = trimmed.indexOf('/');
    if (slash > 0) {
      const base = parseIp(trimmed.slice(0, slash));
      const bits = Number(trimmed.slice(slash + 1));
      if (!base || base.width !== target.width) continue;
      if (!Number.isInteger(bits) || bits < 0 || bits > base.width) continue;
      const mask =
        bits === 0 ? 0n : ((1n << BigInt(bits)) - 1n) << BigInt(base.width - bits);
      if ((target.value & mask) === (base.value & mask)) return true;
    } else {
      const base = parseIp(trimmed);
      if (base && base.width === target.width && base.value === target.value) return true;
    }
  }
  return false;
}
