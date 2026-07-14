import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui'

interface State {
  error: Error | null
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React application boundary:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="grid min-h-dvh place-items-center bg-[var(--color-canvas)] px-4 py-12">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">工作台未能正常启动</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">页面遇到了无法恢复的问题。刷新后会重新载入，草稿仍保存在当前浏览器。</p>
          <Button className="mt-6" onClick={() => window.location.reload()}>刷新工作台</Button>
        </div>
      </main>
    )
  }
}
