const KEY = 'hpc-trusted-image-senders';

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** 该发件人是否已被信任（自动显示远程图片） */
export function isTrustedSender(address: string): boolean {
  return read().includes(address.toLowerCase());
}

/** 记住信任该发件人，之后自动显示其远程图片 */
export function trustSender(address: string): void {
  const addr = address.toLowerCase();
  const list = read();
  if (list.includes(addr)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...list, addr].slice(-500)));
  } catch {
    // 存储不可用时静默
  }
}
