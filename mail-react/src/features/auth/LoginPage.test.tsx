import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api'
import { useAuthStore } from '@/stores/auth-store'
import type { AuthWebsiteConfig } from './authApi'
import { LoginPage } from './LoginPage'
import { TurnstileWidget, type TurnstileApi } from './TurnstileWidget'

const authMock = vi.hoisted(() => ({
  config: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}))

vi.mock('./authApi', () => ({ authApi: authMock }))

type WidgetOptions = Parameters<TurnstileApi['render']>[1]

function renderLogin(config: AuthWebsiteConfig) {
  authMock.config.mockResolvedValue(config)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><LoginPage /></MemoryRouter></QueryClientProvider>)
}

async function openRegistration() {
  await userEvent.click(await screen.findByRole('button', { name: '没有账户？创建账户' }))
  await screen.findByRole('heading', { name: '创建平台账户' })
}

async function fillRegistration(password = 'safe-password') {
  await userEvent.type(screen.getByLabelText('用户名'), 'new-user')
  await userEvent.type(screen.getByLabelText('密码'), password)
  await userEvent.type(screen.getByLabelText('确认密码'), password)
}

describe('LoginPage Turnstile registration regression', () => {
  beforeEach(() => {
    authMock.config.mockReset(); authMock.login.mockReset(); authMock.register.mockReset()
    localStorage.clear()
    useAuthStore.setState({ token: null, authenticated: false })
    document.getElementById('cloudflare-turnstile-script')?.remove()
    delete window.turnstile
  })

  afterEach(() => {
    document.getElementById('cloudflare-turnstile-script')?.remove()
    delete window.turnstile
    vi.restoreAllMocks()
  })

  it('does not load Turnstile on the login screen and submits its token only when registration requires it', async () => {
    let options: WidgetOptions | undefined
    const renderWidget = vi.fn((_container: HTMLElement, value: WidgetOptions) => { options = value; return 'widget-login' })
    window.turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
    authMock.register.mockResolvedValue({ token: 'registered-session' })
    renderLogin({ register: 0, registerVerify: 0, regVerifyOpen: false, siteKey: 'site-key', regKey: 1 })

    await screen.findByRole('heading', { name: '欢迎回来' })
    expect(renderWidget).not.toHaveBeenCalled()
    expect(document.getElementById('cloudflare-turnstile-script')).toBeNull()

    await openRegistration()
    await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
    act(() => options?.callback('challenge-token'))
    await fillRegistration()
    await userEvent.click(screen.getByRole('button', { name: '创建账户' }))

    await waitFor(() => expect(authMock.register).toHaveBeenCalledWith(expect.objectContaining({
      username: 'new-user', password: 'safe-password', token: 'challenge-token',
    })))
  })

  it('upgrades COUNT mode to Turnstile after any registration 400 and keeps the server message', async () => {
    const renderWidget = vi.fn(() => 'widget-count')
    window.turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
    authMock.register.mockRejectedValue(new ApiError('当前网络需要安全验证', { code: 400, httpStatus: 400 }))
    renderLogin({ register: 0, registerVerify: 2, regVerifyOpen: false, siteKey: 'site-key', regKey: 1 })

    await openRegistration()
    expect(renderWidget).not.toHaveBeenCalled()
    await fillRegistration()
    await userEvent.click(screen.getByRole('button', { name: '创建账户' }))

    expect(await screen.findByText('当前网络需要安全验证')).toBeInTheDocument()
    expect(screen.getByText('请先完成安全验证，再重新提交注册。')).toBeInTheDocument()
    await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  })

  it('rejects registration passwords longer than 30 characters before calling the API', async () => {
    renderLogin({ register: 0, registerVerify: 1, regVerifyOpen: false, regKey: 1 })
    await openRegistration()
    await fillRegistration('x'.repeat(31))
    await userEvent.click(screen.getByRole('button', { name: '创建账户' }))

    expect(await screen.findByText('密码最多允许 30 个字符。')).toBeInTheDocument()
    expect(authMock.register).not.toHaveBeenCalled()
  })

  it('resets expired widgets and removes the instance on unmount', async () => {
    let options: WidgetOptions | undefined
    const onToken = vi.fn()
    const reset = vi.fn()
    const remove = vi.fn()
    window.turnstile = { render: vi.fn((_container, value) => { options = value; return 'widget-cleanup' }), reset, remove }
    const view = render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={onToken} />)
    await waitFor(() => expect(options).toBeDefined())

    act(() => { options?.callback('one-use-token'); options?.['expired-callback']() })
    expect(onToken).toHaveBeenLastCalledWith('')
    expect(reset).toHaveBeenCalledWith('widget-cleanup')
    view.unmount()
    expect(remove).toHaveBeenCalledWith('widget-cleanup')
  })

  it('shows a recoverable error when the external script fails', async () => {
    const onError = vi.fn()
    render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} onError={onError} />)
    const firstScript = document.getElementById('cloudflare-turnstile-script')
    expect(firstScript).toHaveAttribute('src', 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')
    fireEvent.error(firstScript as HTMLScriptElement)

    expect(await screen.findByText('安全验证模块加载失败')).toBeInTheDocument()
    expect(onError).toHaveBeenCalledWith('安全验证模块加载失败')
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(document.getElementById('cloudflare-turnstile-script')).not.toBe(firstScript))
  })
})
