import type { DraftRecord } from './types'

const DB_NAME = 'hpc-mail-react-drafts'
const DB_VERSION = 1
const STORE_NAME = 'drafts'
const USER_INDEX = 'by-user'

function openDraftDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error('当前浏览器不支持本地草稿存储'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error || new Error('无法打开草稿数据库'))
    request.onblocked = () => reject(new Error('草稿数据库正在被其他页面占用，请关闭其他标签页后重试'))
    request.onupgradeneeded = () => {
      const database = request.result
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction?.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: 'draftId', autoIncrement: true })
      if (store && !store.indexNames.contains(USER_INDEX)) store.createIndex(USER_INDEX, 'userId', { unique: false })
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('草稿操作失败'))
  })
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDraftDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, mode)
    const completion = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error('草稿事务失败'))
      transaction.onabort = () => reject(transaction.error || new Error('草稿事务已取消'))
    })
    const result = await requestValue(action(transaction.objectStore(STORE_NAME)))
    await completion
    return result
  } finally {
    database.close()
  }
}

export async function listDrafts(userId: number): Promise<DraftRecord[]> {
  const drafts = await withStore('readonly', (store) => store.index(USER_INDEX).getAll(IDBKeyRange.only(userId)))
  return (drafts as DraftRecord[]).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function saveDraft(record: DraftRecord): Promise<DraftRecord> {
  const normalized: DraftRecord = structuredClone(record)
  if (!normalized.draftId) delete normalized.draftId
  const draftId = await withStore('readwrite', (store) => store.put(normalized))
  return { ...normalized, draftId: Number(draftId) }
}

export async function deleteDraft(userId: number, draftId: number): Promise<void> {
  const existing = await withStore('readonly', (store) => store.get(draftId)) as DraftRecord | undefined
  if (!existing || existing.userId !== userId) return
  await withStore('readwrite', (store) => store.delete(draftId))
}

export const draftKeys = {
  root: ['drafts'] as const,
  list: (userId: number) => [...draftKeys.root, userId] as const,
}
