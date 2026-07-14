import { api } from '@/api'

export interface AnalyticsCount {
  receiveTotal: number
  sendTotal: number
  accountTotal: number
  userTotal: number
  normalReceiveTotal: number
  normalSendTotal: number
  normalAccountTotal: number
  normalUserTotal: number
  delReceiveTotal: number
  delSendTotal: number
  delAccountTotal: number
  delUserTotal: number
}

export interface DailyCount {
  date: string
  total: number
}

export interface AnalyticsData {
  numberCount: AnalyticsCount
  userDayCount: DailyCount[]
  receiveRatio: { nameRatio: Array<{ name: string; total: number }> }
  emailDayCount: {
    receiveDayCount: DailyCount[]
    sendDayCount: DailyCount[]
  }
  daySendTotal: number
}

export const analyticsApi = {
  overview: (timeZone: string, signal?: AbortSignal) =>
    api.get<AnalyticsData>('/analysis/echarts', { query: { timeZone }, signal }),
}
