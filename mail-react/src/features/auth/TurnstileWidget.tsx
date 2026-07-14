import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'

const TURNSTILE_SCRIPT_ID = 'cloudflare-turnstile-script'
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export interface TurnstileApi {
  render: (container: HTMLElement, options: {
    sitekey: string
    callback: (token: string) => void
    'error-callback': () => void
    'expired-callback': () => void
  }) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

let loader: Promise<TurnstileApi> | null = null

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loader) return loader

  loader = new Promise<TurnstileApi>((resolve, reject) => {
    let script = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null
    const loaded = () => {
      if (window.turnstile) resolve(window.turnstile)
      else {
        script?.remove()
        loader = null
        reject(new Error('安全验证模块未能初始化'))
      }
    }
    const failed = () => {
      script?.remove()
      loader = null
      reject(new Error('安全验证模块加载失败'))
    }

    const isNewScript = !script
    if (!script) {
      script = document.createElement('script')
      script.id = TURNSTILE_SCRIPT_ID
      script.src = TURNSTILE_SCRIPT_URL
      script.async = true
      script.defer = true
      script.dataset.cfasync = 'false'
    }
    script.addEventListener('load', loaded, { once: true })
    script.addEventListener('error', failed, { once: true })
    if (isNewScript) document.head.appendChild(script)
  })
  return loader
}

export interface TurnstileWidgetProps {
  siteKey: string
  resetKey: number
  onToken: (token: string) => void
  onError?: (message: string) => void
}

export function TurnstileWidget({ siteKey, resetKey, onToken, onError }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onTokenRef = useRef(onToken)
  const onErrorRef = useRef(onError)
  const [retryKey, setRetryKey] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => { onTokenRef.current = onToken; onErrorRef.current = onError }, [onToken, onError])

  useEffect(() => {
    let active = true
    let api: TurnstileApi | undefined
    let widgetId: string | undefined
    setState('loading')
    setMessage('')
    onTokenRef.current('')

    if (!siteKey) {
      const errorMessage = '站点未配置安全验证密钥，请联系管理员。'
      setState('error')
      setMessage(errorMessage)
      onErrorRef.current?.(errorMessage)
      return () => undefined
    }

    void loadTurnstile().then((loadedApi) => {
      if (!active || !containerRef.current) return
      api = loadedApi
      try {
        widgetId = loadedApi.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => { if (active) { onTokenRef.current(token); setState('ready'); setMessage('') } },
          'error-callback': () => {
            if (!active) return
            onTokenRef.current('')
            setState('error')
            const errorMessage = '安全验证失败，请重试。'
            setMessage(errorMessage)
            onErrorRef.current?.(errorMessage)
            if (widgetId) loadedApi.reset(widgetId)
          },
          'expired-callback': () => {
            if (!active) return
            onTokenRef.current('')
            setState('error')
            const errorMessage = '安全验证已过期，请重新完成验证。'
            setMessage(errorMessage)
            onErrorRef.current?.(errorMessage)
            if (widgetId) loadedApi.reset(widgetId)
          },
        })
        setState('ready')
      } catch {
        const errorMessage = '安全验证模块初始化失败，请重试。'
        setState('error')
        setMessage(errorMessage)
        onErrorRef.current?.(errorMessage)
      }
    }).catch((error: unknown) => {
      if (!active) return
      const errorMessage = error instanceof Error ? error.message : '安全验证模块加载失败'
      setState('error')
      setMessage(errorMessage)
      onErrorRef.current?.(errorMessage)
    })

    return () => {
      active = false
      onTokenRef.current('')
      if (api && widgetId) {
        try { api.remove(widgetId) } catch { /* Widget may already have removed itself. */ }
      }
      containerRef.current?.replaceChildren()
    }
  }, [siteKey, resetKey, retryKey])

  return (
    <div className="grid gap-2" aria-label="安全验证">
      <div ref={containerRef} className="min-h-[65px] overflow-hidden" />
      {state === 'loading' && <p className="text-xs text-slate-500" role="status">正在加载安全验证…</p>}
      {state === 'error' && <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert"><span>{message}</span><Button type="button" size="sm" variant="secondary" onClick={() => setRetryKey((value) => value + 1)}>重试</Button></div>}
    </div>
  )
}
