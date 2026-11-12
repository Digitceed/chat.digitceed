import { useEffect, useState } from 'react'
import { Play, Square, Pencil, Trash2, ChevronDown, ChevronRight, ShieldCheck, Bot, Loader2 } from 'lucide-react'
import { ToggleSwitch } from '../ui/ToggleSwitch'
import { useAutomationStore } from '../../stores/automationStore'
import { runAutomation, stopAutomationRun } from '../../lib/automation-runner'
import { describeSchedule, describeWhen } from '../../lib/automation-schedule'
import type { Automation, AutomationRun, RunStatus } from '../../types/automations'

const STATUS_STYLE: Record<RunStatus, string> = {
  running: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
  ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  critical: 'bg-red-500/15 text-red-700 dark:text-red-300',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-300',
  stopped: 'bg-gray-500/15 text-gray-600 dark:text-gray-300',
}
const STATUS_LABEL: Record<RunStatus, string> = {
  running: 'Running', ok: 'OK', warning: 'Warning', critical: 'Critical', failed: 'Failed', stopped: 'Stopped',
}

export function StatusPill({ status }: { status: RunStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold ${STATUS_STYLE[status]}`}>
      {status === 'running' && <Loader2 size={10} className="animate-spin" />}
      {STATUS_LABEL[status]}
    </span>
  )
}

function RunEntry({ run }: { run: AutomationRun }) {
  const [showDetails, setShowDetails] = useState(false)
  const when = new Date(run.startedAt)
  const secs = run.finishedAt ? Math.max(1, Math.round((run.finishedAt - run.startedAt) / 1000)) : null
  return (
    <div className="border-t border-gray-200 dark:border-white/5 pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
      <div className="flex items-center gap-2 mb-1.5">
        <StatusPill status={run.status} />
        <span className="text-[0.7rem] text-gray-500">
          {when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          {secs !== null && ` · ${secs}s`}
          {run.trigger === 'schedule' ? ' · scheduled' : ' · manual'}
        </span>
      </div>
      {run.report && (
        <div className="text-[0.78rem] leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{run.report}</div>
      )}
      {run.refused && run.refused.length > 0 && (
        <p className="mt-2 text-[0.7rem] text-amber-700 dark:text-amber-300">
          Not allowed by this automation's permissions, so it did not run: {run.refused.join(' · ')}
        </p>
      )}
      {run.details && (
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="mt-2 text-[0.7rem] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1"
        >
          {showDetails ? <ChevronDown size={11} /> : <ChevronRight size={11} />} Raw output
        </button>
      )}
      {showDetails && run.details && (
        <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-gray-100 dark:bg-black/30 p-2 text-[0.65rem] text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{run.details}</pre>
      )}
    </div>
  )
}

interface Props {
  automation: Automation
  onEdit: (id: string) => void
}

/** A clock that ticks every 30 s, so "next in 5 min" stays honest. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function AutomationCard({ automation: a, onEdit }: Props) {
  const now = useNow()
  const runningId = useAutomationStore((s) => s.runningId)
  const setEnabled = useAutomationStore((s) => s.setEnabled)
  const remove = useAutomationStore((s) => s.remove)
  const clearRuns = useAutomationStore((s) => s.clearRuns)
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isRunning = runningId === a.id
  const busyElsewhere = runningId !== null && !isRunning
  const last = a.runs[0]
  const Icon = a.kind === 'security' ? ShieldCheck : Bot

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
          <Icon size={17} />
        </div>
        <button className="flex-1 min-w-0 text-left" onClick={() => setOpen((v) => !v)}>
          <div className="flex items-center gap-2">
            <span className="text-[0.85rem] font-semibold text-gray-900 dark:text-gray-100 truncate">{a.name}</span>
            {last && <StatusPill status={last.status} />}
          </div>
          <div className="text-[0.7rem] text-gray-500 truncate">
            {describeSchedule(a.schedule)}
            {a.enabled && a.nextRunAt ? ` · next ${describeWhen(a.nextRunAt, now)}` : ''}
            {!a.enabled && a.schedule.kind !== 'manual' ? ' · paused' : ''}
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {a.schedule.kind !== 'manual' && (
            <ToggleSwitch enabled={a.enabled} onChange={(v) => setEnabled(a.id, v)} ariaLabel={a.enabled ? 'Pause' : 'Switch on'} />
          )}
          {isRunning ? (
            <button onClick={stopAutomationRun} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500" title="Stop">
              <Square size={15} />
            </button>
          ) : (
            <button
              onClick={() => { setOpen(true); void runAutomation(a.id, 'manual') }}
              disabled={busyElsewhere}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 disabled:opacity-30"
              title={busyElsewhere ? 'Another automation is running' : 'Run now'}
            >
              <Play size={15} />
            </button>
          )}
          <button onClick={() => onEdit(a.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500" title="Edit">
            <Pencil size={14} />
          </button>
          <button
            onClick={() => {
              if (confirmDelete) { remove(a.id); return }
              setConfirmDelete(true)
              setTimeout(() => setConfirmDelete(false), 3000)
            }}
            className={`p-1.5 rounded-lg ${confirmDelete ? 'bg-red-500/20 text-red-500' : 'hover:bg-red-500/10 text-gray-500 hover:text-red-500'}`}
            title={confirmDelete ? 'Click again to delete' : 'Delete'}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4">
          {a.instructions && (
            <p className="text-[0.72rem] text-gray-500 mb-3"><span className="font-semibold">Task:</span> {a.instructions}</p>
          )}
          {a.runs.length === 0 ? (
            <p className="text-[0.75rem] text-gray-500">No runs yet. Press ▶ to run it now.</p>
          ) : (
            <div>
              {a.runs.map((r) => <RunEntry key={r.id} run={r} />)}
              <button onClick={() => clearRuns(a.id)} className="mt-3 text-[0.68rem] text-gray-500 hover:text-red-500">Clear history</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
