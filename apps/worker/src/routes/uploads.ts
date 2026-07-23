import {
  MAX_ATTACHMENT_FILE_BYTES,
  SINGLE_UPLOAD_THRESHOLD_BYTES,
  MULTIPART_PART_BYTES,
  attachmentFilenameSchema,
  completeMultipartUploadSchema,
  initMultipartUploadSchema,
  type CompleteMultipartUploadRequest,
  type InitMultipartUploadRequest,
} from '@hpc-mail/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { createDb } from '../db/client.js';
import { draftAttachments } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { ok, parseBody, parseId } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { draftKey, newDraftToken } from '../services/upload.js';
import type { AppContext } from '../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth);

/** 单片流式直传：filename/mimeType 走 query，二进制内容走 body → R2 put 流式 */
app.post('/', async (c) => {
  const user = c.get('user')!;
  const filenameParsed = attachmentFilenameSchema.safeParse(c.req.query('filename'));
  if (!filenameParsed.success) throw new AppError('validation_failed', '文件名非法');
  const mimeType = (c.req.query('mimeType') || 'application/octet-stream').trim().slice(0, 128) ||
    'application/octet-stream';
  const declaredSize = Number(c.req.header('content-length') || '0');
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
    throw new AppError('validation_failed', '缺少 Content-Length');
  }
  if (declaredSize > MAX_ATTACHMENT_FILE_BYTES) {
    throw new AppError(
      'payload_too_large',
      `单文件超过 ${Math.floor(MAX_ATTACHMENT_FILE_BYTES / 1024 / 1024)}MB 上限`,
    );
  }
  if (declaredSize > SINGLE_UPLOAD_THRESHOLD_BYTES) {
    throw new AppError('payload_too_large', '文件较大，请改用分片上传');
  }
  const token = newDraftToken();
  const key = draftKey(user.id, token);
  const stream = c.req.raw.body;
  if (!stream) throw new AppError('validation_failed', '上传内容为空');
  await c.env.r2.put(key, stream, { httpMetadata: { contentType: mimeType } });
  const db = createDb(c.env);
  await db.insert(draftAttachments).values({
    userId: user.id,
    token,
    filename: filenameParsed.data,
    mimeType,
    size: declaredSize,
    r2Key: key,
    status: 'ready',
  });
  return ok(c, { token, filename: filenameParsed.data, size: declaredSize, mimeType }, 201);
});

/** 大文件分片上传：初始化（创建 R2 multipart upload，返回 uploadId + 分片参数） */
app.post('/multipart', async (c) => {
  const user = c.get('user')!;
  const req = await parseBody<InitMultipartUploadRequest>(c, initMultipartUploadSchema);
  const token = newDraftToken();
  const key = draftKey(user.id, token);
  const mpu = await c.env.r2.createMultipartUpload(key, {
    httpMetadata: { contentType: req.mimeType },
  });
  const db = createDb(c.env);
  await db.insert(draftAttachments).values({
    userId: user.id,
    token,
    filename: req.filename,
    mimeType: req.mimeType,
    size: req.size,
    r2Key: key,
    uploadId: mpu.uploadId,
    status: 'uploading',
  });
  return ok(
    c,
    {
      token,
      uploadId: mpu.uploadId,
      partBytes: MULTIPART_PART_BYTES,
      partCount: Math.ceil(req.size / MULTIPART_PART_BYTES),
    },
    201,
  );
});

/** 上传一个分片：body 流式 → R2 uploadPart，记录 {partNumber, etag} */
app.put('/multipart/:token/parts/:partNumber', async (c) => {
  const user = c.get('user')!;
  const token = c.req.param('token');
  const partNumber = parseId(c.req.param('partNumber'));
  if (partNumber > 10000) throw new AppError('validation_failed', '分片编号过大');
  const db = createDb(c.env);
  const row = await db.select().from(draftAttachments).where(eq(draftAttachments.token, token)).get();
  if (!row || row.userId !== user.id) throw new AppError('not_found', '上传会话不存在');
  if (row.status !== 'uploading' || !row.uploadId) {
    throw new AppError('validation_failed', '该上传会话不可续传');
  }
  const stream = c.req.raw.body;
  if (!stream) throw new AppError('validation_failed', '分片内容为空');
  const part = await c.env.r2.resumeMultipartUpload(row.r2Key, row.uploadId).uploadPart(partNumber, stream);
  const parts = [...(row.parts ?? []), { partNumber, etag: part.etag }];
  await db.update(draftAttachments).set({ parts }).where(eq(draftAttachments.id, row.id));
  return ok(c, { partNumber, etag: part.etag });
});

/** 完成分片上传：按 partNumber 升序提交所有 parts，触发 R2 complete */
app.post('/multipart/:token/complete', async (c) => {
  const user = c.get('user')!;
  const token = c.req.param('token');
  const req = await parseBody<CompleteMultipartUploadRequest>(c, completeMultipartUploadSchema);
  const db = createDb(c.env);
  const row = await db.select().from(draftAttachments).where(eq(draftAttachments.token, token)).get();
  if (!row || row.userId !== user.id) throw new AppError('not_found', '上传会话不存在');
  if (row.status !== 'uploading' || !row.uploadId) {
    throw new AppError('validation_failed', '该上传会话不可完成');
  }
  const parts = [...req.parts].sort((a, b) => a.partNumber - b.partNumber);
  const obj = await c.env.r2.resumeMultipartUpload(row.r2Key, row.uploadId).complete(parts);
  await db
    .update(draftAttachments)
    .set({ status: 'ready', size: obj.size, parts })
    .where(eq(draftAttachments.id, row.id));
  return ok(c, { token, size: obj.size });
});

/** 删除草稿附件：取消未完成的 multipart（abort）或删已完成的 R2 对象，并删行 */
app.delete('/:token', async (c) => {
  const user = c.get('user')!;
  const token = c.req.param('token');
  const db = createDb(c.env);
  const row = await db.select().from(draftAttachments).where(eq(draftAttachments.token, token)).get();
  if (!row || row.userId !== user.id) throw new AppError('not_found', '上传会话不存在');
  if (row.uploadId && row.status === 'uploading') {
    try {
      await c.env.r2.resumeMultipartUpload(row.r2Key, row.uploadId).abort();
    } catch (e) {
      console.error('abort multipart 失败:', e);
    }
  } else {
    try {
      await c.env.r2.delete(row.r2Key);
    } catch (e) {
      console.error('删除草稿 R2 失败:', e);
    }
  }
  await db.delete(draftAttachments).where(eq(draftAttachments.id, row.id));
  return ok(c, { success: true });
});

export default app;
