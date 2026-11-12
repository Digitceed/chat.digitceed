import { describe, it, expect } from 'vitest'
import { nextRunAfter, describeSchedule, MIN_INTERVAL_MINUTES } from '../automation-schedule'

describe('nextRunAfter', () => {
  const base = new Date(2026, 10, 12, 10, 30, 0).getTime() // Thu 12 Nov 2026 10:30

  it('manual never runs on its own', () => {
    expect(nextRunAfter({ kind: 'manual' }, base)).toBeUndefined()
  })
  it('interval adds minutes, with a floor', () => {
    expect(nextRunAfter({ kind: 'interval', minutes: 60 }, base)).toBe(base + 3_600_000)
    expect(nextRunAfter({ kind: 'interval', minutes: 1 }, base)).toBe(base + MIN_INTERVAL_MINUTES * 60_000)
  })
  it('daily later today, or tomorrow', () => {
    expect(new Date(nextRunAfter({ kind: 'daily', time: '11:00' }, base)!).getDate()).toBe(12)
    const t = new Date(nextRunAfter({ kind: 'daily', time: '07:00' }, base)!)
    expect([t.getDate(), t.getHours(), t.getMinutes()]).toEqual([13, 7, 0])
  })
  it('weekly lands on the weekday', () => {
    const t = new Date(nextRunAfter({ kind: 'weekly', weekday: 1, time: '08:00' }, base)!)
    expect(t.getDay()).toBe(1)
    expect(t.getDate()).toBe(16)
    // Same weekday but time already passed → next week.
    const same = new Date(nextRunAfter({ kind: 'weekly', weekday: 4, time: '09:00' }, base)!)
    expect(same.getDate()).toBe(19)
  })
  it('rejects a broken time', () => {
    expect(nextRunAfter({ kind: 'daily', time: '25:00' }, base)).toBeUndefined()
  })
  it('describes', () => {
    expect(describeSchedule({ kind: 'interval', minutes: 60 })).toBe('Every hour')
    expect(describeSchedule({ kind: 'daily', time: '07:00' })).toBe('Every day at 07:00')
  })
})
