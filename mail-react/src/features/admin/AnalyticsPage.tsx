import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AtSign, Inbox, RefreshCw, Send, TrendingUp, Users } from 'lucide-react'
import { Button } from '@/components/ui'
import { analyticsApi, type AnalyticsData, type DailyCount } from './analyticsApi'

function number(value: number | undefined): string {
  return new Intl.NumberFormat('zh-CN').format(Number(value) || 0)
}

function shortDate(value: string): string {
  const [, month = '', day = ''] = value.split('-')
  return `${Number(month)}/${Number(day)}`
}

function PolylineChart({ title, series }: {
  title: string
  series: Array<{ label: string; color: string; data: DailyCount[] }>
}) {
  const width = 720
  const height = 240
  const padding = { top: 18, right: 20, bottom: 34, left: 42 }
  const values = series.flatMap((item) => item.data.map((point) => Number(point.total) || 0))
  const max = Math.max(1, ...values)
  const pointCount = Math.max(2, ...series.map((item) => item.data.length))
  const x = (index: number) => padding.left + index * ((width - padding.left - padding.right) / (pointCount - 1))
  const y = (value: number) => padding.top + (height - padding.top - padding.bottom) * (1 - value / max)
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const dates = series[0]?.data ?? []

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          {series.map((item) => <span key={item.label} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}
        </div>
      </div>
      <svg className="h-auto w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}趋势图`}>
        <title>{title}</title>
        {ticks.map((tick) => {
          const tickY = y(max * tick)
          return <g key={tick}><line x1={padding.left} y1={tickY} x2={width - padding.right} y2={tickY} stroke="#e2e8f0" /><text x={padding.left - 8} y={tickY + 4} textAnchor="end" fill="#64748b" fontSize="11">{Math.round(max * tick)}</text></g>
        })}
        {dates.map((point, index) => (index % 3 === 0 || index === dates.length - 1) && <text key={point.date} x={x(index)} y={height - 8} textAnchor="middle" fill="#64748b" fontSize="11">{shortDate(point.date)}</text>)}
        {series.map((item) => {
          const points = item.data.map((point, index) => `${x(index)},${y(Number(point.total) || 0)}`).join(' ')
          return <polyline key={item.label} points={points} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        })}
      </svg>
    </div>
  )
}

function SenderBars({ data }: { data: Array<{ name: string; total: number }> }) {
  const max = Math.max(1, ...data.map((item) => Number(item.total) || 0))
  return (
    <div>
      <h3 className="font-semibold text-slate-900">主要邮件来源</h3>
      {!data.length ? <p className="mt-8 text-center text-sm text-slate-500">暂无可统计的发件人。</p> : (
        <ol className="mt-4 space-y-3">
          {data.map((item) => (
            <li key={item.name || 'unknown'}>
              <div className="flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium text-slate-700" title={item.name || '未知发件人'}>{item.name || '未知发件人'}</span><strong className="text-slate-900">{number(item.total)}</strong></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(2, (item.total / max) * 100)}%` }} /></div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function Metric({ label, total, active, deleted, icon: Icon }: {
  label: string
  total: number
  active: number
  deleted: number
  icon: typeof Inbox
}) {
  const activeRatio = total ? Math.round((active / total) * 100) : 0
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-slate-500">{label}</p><strong className="mt-2 block text-3xl font-semibold tracking-tight text-slate-950">{number(total)}</strong></div><span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="size-5" /></span></div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${label}有效占比 ${activeRatio}%`}><div className="h-full rounded-full bg-emerald-500" style={{ width: `${activeRatio}%` }} /></div>
      <div className="mt-2 flex justify-between gap-2 text-xs text-slate-500"><span>有效 {number(active)}</span><span>已删除 {number(deleted)}</span></div>
    </article>
  )
}

export function AnalyticsPage() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const query = useQuery({
    queryKey: ['analytics', timeZone],
    queryFn: ({ signal }) => analyticsApi.overview(timeZone, signal),
    staleTime: 60_000,
  })
  const data = query.data
  const weekly = useMemo(() => {
    if (!data) return { users: 0, received: 0, sent: 0 }
    const sum = (items: DailyCount[]) => items.slice(-7).reduce((total, item) => total + (Number(item.total) || 0), 0)
    return { users: sum(data.userDayCount), received: sum(data.emailDayCount.receiveDayCount), sent: sum(data.emailDayCount.sendDayCount) }
  }, [data])

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-slate-50" aria-labelledby="analytics-heading">
      <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div><h1 id="analytics-heading" className="text-xl font-semibold tracking-tight text-slate-950">分析页</h1><p className="mt-1 text-sm text-slate-500">查看平台邮件、邮箱与用户的整体趋势。</p></div>
          <Button size="icon" variant="secondary" aria-label="刷新分析数据" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={`size-4.5 ${query.isFetching ? 'animate-spin' : ''}`} /></Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        {query.isPending ? (
          <div className="grid min-h-72 place-items-center text-sm text-slate-500" role="status">正在加载分析数据…</div>
        ) : query.isError ? (
          <div className="grid min-h-72 place-items-center text-center" role="alert"><div><h2 className="font-semibold text-slate-900">分析数据加载失败</h2><p className="mt-2 text-sm text-slate-600">{query.error instanceof Error ? query.error.message : '请检查网络连接后重试。'}</p><Button className="mt-5" variant="secondary" onClick={() => void query.refetch()}>重新加载</Button></div></div>
        ) : data ? <AnalyticsContent data={data} weekly={weekly} /> : null}
      </div>
    </main>
  )
}

function AnalyticsContent({ data, weekly }: { data: AnalyticsData; weekly: { users: number; received: number; sent: number } }) {
  const counts = data.numberCount
  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="累计数据">
        <Metric label="累计收件" total={counts.receiveTotal} active={counts.normalReceiveTotal} deleted={counts.delReceiveTotal} icon={Inbox} />
        <Metric label="累计发件" total={counts.sendTotal} active={counts.normalSendTotal} deleted={counts.delSendTotal} icon={Send} />
        <Metric label="平台邮箱" total={counts.accountTotal} active={counts.normalAccountTotal} deleted={counts.delAccountTotal} icon={AtSign} />
        <Metric label="平台用户" total={counts.userTotal} active={counts.normalUserTotal} deleted={counts.delUserTotal} icon={Users} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,.7fr)]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <PolylineChart title="近 15 天邮件趋势" series={[
            { label: '收件', color: '#2563eb', data: data.emailDayCount.receiveDayCount },
            { label: '发件', color: '#059669', data: data.emailDayCount.sendDayCount },
          ]} />
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><SenderBars data={data.receiveRatio.nameRatio} /></article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,.6fr)]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><PolylineChart title="近 15 天用户增长" series={[{ label: '新增用户', color: '#7c3aed', data: data.userDayCount }]} /></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-slate-500">今日发件</p><strong className="mt-2 block text-4xl font-semibold tracking-tight text-slate-950">{number(data.daySendTotal)}</strong></div><TrendingUp className="size-6 text-blue-600" /></div>
          <dl className="mt-8 grid grid-cols-3 gap-2 border-t border-slate-200 pt-4 text-center"><div><dt className="text-xs text-slate-500">近 7 天收件</dt><dd className="mt-1 font-semibold text-slate-900">{number(weekly.received)}</dd></div><div><dt className="text-xs text-slate-500">近 7 天发件</dt><dd className="mt-1 font-semibold text-slate-900">{number(weekly.sent)}</dd></div><div><dt className="text-xs text-slate-500">新增用户</dt><dd className="mt-1 font-semibold text-slate-900">{number(weekly.users)}</dd></div></dl>
          <p className="mt-5 text-xs leading-5 text-slate-500">统计时区：{Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}</p>
        </article>
      </section>
    </>
  )
}
