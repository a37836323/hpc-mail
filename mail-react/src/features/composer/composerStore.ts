import { create } from 'zustand'
import type { DraftRecord } from '@/features/drafts/types'
import type { MailMessage } from '@/features/mail/types'

export type ComposeIntent =
  | { kind: 'new' }
  | { kind: 'reply'; message: MailMessage }
  | { kind: 'forward'; message: MailMessage }
  | { kind: 'draft'; draft: DraftRecord }

interface ComposerState {
  open: boolean
  intent: ComposeIntent
  openIntent: (intent: ComposeIntent) => void
  close: () => void
}

export const useComposerStore = create<ComposerState>((set) => ({
  open: false,
  intent: { kind: 'new' },
  openIntent: (intent) => set({ open: true, intent }),
  close: () => set({ open: false }),
}))

export const openComposer = () => useComposerStore.getState().openIntent({ kind: 'new' })
export const openReply = (message: MailMessage) => useComposerStore.getState().openIntent({ kind: 'reply', message })
export const openForward = (message: MailMessage) => useComposerStore.getState().openIntent({ kind: 'forward', message })
export const openDraft = (draft: DraftRecord) => useComposerStore.getState().openIntent({ kind: 'draft', draft })
