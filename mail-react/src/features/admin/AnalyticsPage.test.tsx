import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyticsApi } from './analyticsApi'
import { AnalyticsPage } from './AnalyticsPage'

vi.mock('./analyticsApi', () => ({
  analyticsApi: { overview: vi.fn() },
}))

const days = Array.from({ length: 15 }, (_, index) => ({
  date: `2026-07-${String(index + 1).padStart(2, '0')}`,
  total: index,
}))

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.mocked(analyticsApi.overview).mockResolvedValue({
      numberCount: {
        receiveTotal: 120,
        sendTotal: 40,
        accountTotal: 8,
        userTotal: 3,
        normalReceiveTotal: 110,
        normalSendTotal: 38,
        normalAccountTotal: 7,
        normalUserTotal: 3,
        delReceiveTotal: 10,
        delSendTotal: 2,
        delAccountTotal: 1,
        delUserTotal: 0,
      },
      userDayCount: days,
      receiveRatio: { nameRatio: [{ name: 'App Store', total: 20 }] },
      emailDayCount: { receiveDayCount: days, sendDayCount: days.map((day) => ({ ...day, total: day.total / 2 })) },
      daySendTotal: 6,
    })
  })

  it('renders accessible summaries and lightweight SVG trends', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(<QueryClientProvider client={client}><AnalyticsPage /></QueryClientProvider>)

    expect(await screen.findByText('120')).toBeInTheDocument()
    expect(screen.getByText('累计收件')).toBeInTheDocument()
    expect(screen.getByText('App Store')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '近 15 天邮件趋势趋势图' })).toBeInTheDocument()
    expect(container.querySelector('canvas')).toBeNull()
  })
})
