import Dexie from "dexie";
import {useUserStore} from "@/store/user.js"
import { watch, shallowRef } from "vue";

const userStore = useUserStore();


let db =  shallowRef({})

function createDB() {
    // Keep the legacy database name for migrated users so existing local drafts
    // remain available; username is the fallback for account-less new users.
    const backendEmail = userStore.user.email;
    const legacyEmail = userStore.user.legacyEmail || (/@auth\.invalid$/i.test(backendEmail || '') ? '' : backendEmail);
    const identity = userStore.user.username || userStore.user.userId || 'guest';
    db.value = new Dexie(legacyEmail || `hpc-mail-${identity}`);
    db.value.version(1).stores({
        draft: '++draftId,createTime'
    })

    db.value.version(1).stores({
        att: 'draftId'
    })
}

createDB()

watch(() => userStore.user.username || userStore.user.legacyEmail || userStore.user.userId,() => createDB())

export default db;
