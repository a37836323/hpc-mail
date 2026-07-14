/** 游标 = base64(id)，仅编码自增主键 */
export function encodeCursor(id: number): string {
  return btoa(String(id));
}

export function decodeCursor(cursor: string | undefined): number | null {
  if (!cursor) return null;
  try {
    const decoded = atob(cursor);
    const id = Number(decoded);
    if (!Number.isInteger(id) || id <= 0) return null;
    return id;
  } catch {
    return null;
  }
}
