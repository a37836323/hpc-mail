import { defineStore } from 'pinia'

export const useWriterStore = defineStore('writer', {
    state: () => ({
        sendRecipientRecord: [],
        senderHistory: [],
        senderName: '',
        shortcutConfirmed: false,
    }),
    persist: {
        pick: ['sendRecipientRecord', 'senderHistory', 'senderName', 'shortcutConfirmed'],
    },
})
