/** 管理操作审计日志条目（只读展示） */
export interface AdminAuditLogEntry {
  id: number;
  actorName: string;
  action: string;
  target: string;
  detail: string;
  ip: string;
  createdAt: string;
}
