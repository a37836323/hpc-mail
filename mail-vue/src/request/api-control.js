import http from '@/axios/index.js'

export const apiConfig = () => http.get('/apiKey/config')
export const apiSetConfig = enabled => http.put('/apiKey/setConfig', { enabled })
export const apiUsers = () => http.get('/apiKey/users')
export const apiKeyList = params => http.get('/apiKey/list', { params })
export const apiKeyCreate = form => http.post('/apiKey/create', form)
export const apiKeySetStatus = (apiKeyId, status) => http.put('/apiKey/status', { apiKeyId, status })
export const apiKeyRevoke = apiKeyId => http.delete('/apiKey/delete', { params: { apiKeyId } })
export const apiAuditList = params => http.get('/apiKey/audit', { params })
