import { afterEach, describe, expect, it, vi } from 'vitest'
import { mailApi } from './mailApi'

function response<T>(data: T): Response {
  return new Response(JSON.stringify({ code: 200, message: 'success', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('mail API adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses accountId=0 to request the unified inbox', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ list: [], total: 0, latestEmail: { emailId: 0, accountId: 0 } }))
    vi.stubGlobal('fetch', fetchMock)

    await mailApi.list({ accountId: 0, emailId: 0, size: 30, timeSort: 0, type: 0 })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/email/list?accountId=0&emailId=0&timeSort=0&size=30&type=0')
  })

  it('sends a dynamic sender without binding it to a mailbox account', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([]))
    vi.stubGlobal('fetch', fetchMock)

    await mailApi.send({
      accountId: 0,
      name: 'Billing',
      from: { name: 'Billing', localPart: 'billing', domain: 'hpc.email' },
      sendEmail: 'billing@hpc.email',
      receiveEmail: ['customer@example.com'],
      subject: 'Invoice',
      content: '<div>Attached</div>',
      text: 'Attached',
      attachments: [{ filename: 'invoice.pdf', size: 3, type: 'application/pdf', content: 'YWJj' }],
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      accountId: 0,
      from: { localPart: 'billing', domain: 'hpc.email' },
      sendEmail: 'billing@hpc.email',
    })
    expect(body.attachments[0].type).toBe('application/pdf')
  })

  it('uses authenticated logical-delete and star endpoints', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => response(null))
    vi.stubGlobal('fetch', fetchMock)

    await mailApi.remove([11, 12])
    await mailApi.cancelStar(11)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/email/delete?emailIds=11%2C12')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/star/cancel?emailId=11')
  })
})
