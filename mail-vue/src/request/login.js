import http from '@/axios/index.js';

export function login(username, password) {
    return http.post('/login', {username, password}, {noMsg: true})
}

export function logout() {
    return http.delete('/logout')
}

export function register(form) {
    return http.post('/register', form, {noMsg: true})
}
