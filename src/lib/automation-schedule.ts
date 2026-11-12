/**
 * Digitceed AI — when does an automation run next. Pure functions, no store,
 * so the scheduler and the view agree and both are testable.
 */
import type { AutomationSchedule } from '../types/automations'

export const MIN_INTERVAL_MINUTES = 5

function parseTime(time: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return { h, m: min }
}

/**
 * The next moment after `from` this schedule fires, or `undefined` for a
 * manual one (or an invalid time). `from` is a timestamp in ms.
 */
export function nextRunAfter(schedule: AutomationSchedule, from: number): number | undefined {
  switch (schedule.kind) {
    case 'manual':
      return undefined
    case 'interval': {
      const minutes = Math.max(MIN_INTERVAL_MINUTES, Math.floor(schedule.minutes || 0))
      return from + minutes * 60_000
    }
    case 'daily': {
      const t = parseTime(schedule.time)
      if (!t) return undefined
      const d = new Date(from)
      d.setSeconds(0, 0)
      d.setHours(t.h, t.m)
      if (d.getTime() <= from) d.setDate(d.getDate() + 1)
      return d.getTime()
    }
    case 'weekly': {
      const t = parseTime(schedule.time)
      if (!t) return undefined
      const d = new Date(from)
      d.setSeconds(0, 0)
      d.setHours(t.h, t.m)
      const wd = ((schedule.weekday % 7) + 7) % 7
      let add = (wd - d.getDay() + 7) % 7
      if (add === 0 && d.getTime() <= from) add = 7
      d.setDate(d.getDate() + add)
      return d.getTime()
    }
  }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function describeSchedule(s: AutomationSchedule): string {
  switch (s.kind) {
    case 'manual': return 'Only when you press Run'
    case 'interval': {
      const m = Math.max(MIN_INTERVAL_MINUTES, Math.floor(s.minutes || 0))
      if (m % 1440 === 0) return m === 1440 ? 'Every day' : `Every ${m / 1440} days`
      if (m % 60 === 0) return m === 60 ? 'Every hour' : `Every ${m / 60} hours`
      return `Every ${m} minutes`
    }
    case 'daily': return `Every day at ${s.time}`
    case 'weekly': return `Every ${WEEKDAYS[((s.weekday % 7) + 7) % 7]} at ${s.time}`
  }
}

/** "in 5 min", "in 3 h", "tomorrow 07:00" — short, for a list row. */
export function describeWhen(ts: number | undefined, now: number): string {
  if (!ts) return '—'
  const diff = ts - now
  if (diff <= 60_000) return 'now'
  const min = Math.round(diff / 60_000)
  if (min < 60) return `in ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `in ${h} h`
  const d = new Date(ts)
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}
