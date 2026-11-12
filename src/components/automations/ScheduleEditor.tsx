import type { AutomationSchedule } from '../../types/automations'

export const INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/[0.04] px-3 py-2 '
  + 'text-[0.8rem] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 '
  + 'focus:outline-none focus:border-blue-500 dark:focus:border-blue-400'

/** Same look, sized to its content (selects, time fields). */
export const COMPACT_INPUT_CLASS = INPUT_CLASS.replace('w-full ', 'w-auto ')

const INTERVALS: Array<[number, string]> = [
  [5, 'every 5 minutes'], [15, 'every 15 minutes'], [30, 'every 30 minutes'], [60, 'every hour'],
  [180, 'every 3 hours'], [360, 'every 6 hours'], [720, 'every 12 hours'], [1440, 'every 24 hours'],
]
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface Props {
  value: AutomationSchedule
  onChange: (s: AutomationSchedule) => void
}

export function ScheduleEditor({ value, onChange }: Props) {
  const time = value.kind === 'daily' || value.kind === 'weekly' ? value.time : '07:00'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="When to run"
        className={COMPACT_INPUT_CLASS}
        value={value.kind}
        onChange={(e) => {
          const k = e.target.value as AutomationSchedule['kind']
          if (k === 'manual') onChange({ kind: 'manual' })
          else if (k === 'interval') onChange({ kind: 'interval', minutes: 60 })
          else if (k === 'daily') onChange({ kind: 'daily', time })
          else onChange({ kind: 'weekly', weekday: 1, time })
        }}
      >
        <option value="manual">Only when I press Run</option>
        <option value="interval">Repeat</option>
        <option value="daily">Every day</option>
        <option value="weekly">Every week</option>
      </select>
      {value.kind === 'interval' && (
        <select
          aria-label="Interval"
          className={COMPACT_INPUT_CLASS}
          value={value.minutes}
          onChange={(e) => onChange({ kind: 'interval', minutes: Number(e.target.value) })}
        >
          {INTERVALS.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
        </select>
      )}
      {value.kind === 'weekly' && (
        <select
          aria-label="Weekday"
          className={COMPACT_INPUT_CLASS}
          value={value.weekday}
          onChange={(e) => onChange({ ...value, weekday: Number(e.target.value) })}
        >
          {DAYS.map((d, i) => <option key={d} value={i}>on {d}</option>)}
        </select>
      )}
      {(value.kind === 'daily' || value.kind === 'weekly') && (
        <input
          type="time"
          aria-label="Time"
          className={COMPACT_INPUT_CLASS}
          value={value.time}
          onChange={(e) => onChange({ ...value, time: e.target.value || '07:00' })}
        />
      )}
    </div>
  )
}
