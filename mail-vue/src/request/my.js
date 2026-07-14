import http from '@/axios/index.js';

export function loginUserInfo() {
    return http.get('/my/loginUserInfo')
}

export function resetPassword(password) {
    return http.put('/my/resetPassword', {password})
}

export function setDisplayName(displayName) {
    return http.put('/my/setDisplayName', {displayName})
}

export function userDelete() {
    return http.delete('/my/delete')
}
