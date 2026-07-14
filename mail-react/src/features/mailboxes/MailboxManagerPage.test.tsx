import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mailboxApi } from './mailboxApi'
import { MailboxManagerPage } from './MailboxManagerPage'
import { useMailboxes } from './useMailboxes'

vi.mock('./mailboxApi', () => ({
  mailboxApi: {
    config: vi.fn(),
    currentUser: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    pin: vi.fn(),
    remove: vi.fn(),
  },
}))

vi.mock('./useMailboxes', () => ({ useMailboxes: vi.fn() }))

describe('MailboxManagerPage', () => {
  beforeEach(() => {
    vi.mocked(mailboxApi.config).mockResolvedValue({ addEmail: 0, manyEmail: 0, addEmailVerify: 1, minEmailPrefix: 1, domainList: ['@hpc.email'] })
    vi.mocked(mailboxApi.currentUser).mockResolvedValue({ userId: 1, username: 'platform-user', permKeys: ['*'], role: { availDomain: [] } })
    vi.mocked(mailboxApi.remove).mockResolvedValue(undefined)
    vi.mocked(useMailboxes).mockReturnValue({
      data: [{ accountId: 8, email: 'support@hpc.email', name: 'Support', sort: 0 }],
      error: null,
      isPending: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useMailboxes>)
  })

  it('separates platform-account semantics and confirms deletion in an accessible dialog', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><MailboxManagerPage /></QueryClientProvider>)

    expect(await screen.findByText(/平台登录账户与邮箱相互独立/)).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: '删除 support@hpc.email' }))
    expect(screen.getByRole('dialog')).toHaveAccessibleName('删除邮箱')
    expect(screen.getByText(/删除 support@hpc.email 后/)).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '删除邮箱' }))
    expect(mailboxApi.remove).toHaveBeenCalledWith(8)
  })

  it('does not render create or delete actions without the matching permissions', async () => {
    vi.mocked(mailboxApi.currentUser).mockResolvedValue({
      userId: 1,
      username: 'readonly-user',
      permKeys: ['account:query'],
      role: { availDomain: ['hpc.email'] },
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MailboxManagerPage /></QueryClientProvider>)

    await waitFor(() => expect(client.getQueryData(['mailbox-management', 'user'])).toBeDefined())
    expect(screen.queryByRole('button', { name: '创建邮箱' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除 support@hpc.email' })).not.toBeInTheDocument()
  })
})
