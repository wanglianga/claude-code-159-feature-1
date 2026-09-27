// 时间与展示工具

export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

/** 把 YYYY-MM-DD 解析为当地午夜，避免 UTC 解析造成效期差一天 */
function parseDay(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** 距离目标日期还有多少整天（负数表示已过期），按自然日计算 */
export function daysUntil(target: string, now: string | Date): number {
  const t = target.length === 10 ? parseDay(target) : toDate(target)
  const ms = startOfDay(t).getTime() - startOfDay(toDate(now)).getTime()
  return Math.round(ms / 86_400_000)
}

/** 已发生多少小时（用于超时未取、配送延误判断） */
export function hoursSince(from: string, now: string | Date): number {
  return (toDate(now).getTime() - toDate(from).getTime()) / 3_600_000
}

export function fmtDate(iso: string): string {
  const d = toDate(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function fmtDateTime(iso: string): string {
  const d = toDate(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${fmtDate(iso)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function addHours(iso: string, hours: number): string {
  return new Date(toDate(iso).getTime() + hours * 3_600_000).toISOString()
}

export function addDays(iso: string, days: number): string {
  return addHours(iso, days * 24)
}
