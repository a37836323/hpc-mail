import type { SendAttachment } from '@/features/mail/types'

export interface DraftRecord {
  draftId?: number
  userId: number
  name: string
  localPart: string
  domain: string
  receiveEmail: string[]
  subject: string
  content: string
  text: string
  sendType: 'reply' | 'forward' | ''
  emailId?: number
  attachments: SendAttachment[]
  createdAt: string
  updatedAt: string
}
