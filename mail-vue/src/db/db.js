import Dexie from "dexie";
import {useUserStore} from "@/store/user.js"
import { watch, shallowRef } from "vue";
import {resolveUserDatabaseName} from "@/utils/user-identity.js";

const userStore = useUserStore();


let db =  shallowRef({})

function createDB() {
    const name = resolveUserDatabaseName(userStore.user)
    if (db.value?.name === name) return

    db.value?.close?.()
    const nextDB = new Dexie(name)
    nextDB.version(1).stores({
        draft: '++draftId,createTime',
        att: 'draftId',
    })
    db.value = nextDB
}

createDB()

watch(() => resolveUserDatabaseName(userStore.user), () => createDB())

export default db;
