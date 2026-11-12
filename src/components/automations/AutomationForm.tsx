import { useState } from 'react'
import { AlertTriangle, Network, Shield, ShieldCheck, RefreshCw, Users, KeyRound, Rocket, FolderLock, Activity, Check } from 'lucide-react'
import { INPUT_CLASS, COMPACT_INPUT_CLASS, ScheduleEditor } from './ScheduleEditor'
import { SECURITY_CHECKS, type SecurityCheck } from '../../lib/security-checks'
import type { NewAutomation } from '../../stores/automationStore'
import type { AutomationKind, AutomationPermissions, AutomationSchedule, Automation } from '../../types/automations'

export const CHECK_ICONS: Record<SecurityCheck['icon'], typeof Shield> = {
  Network, Shield, ShieldCheck, RefreshCw, Users, KeyRound, Rocket, FolderLock, Activity,
}

/** The tools an agent can be given, in the words the user reads. */
export const AGENT_TOOLS: Array<{ name: string; label: string; hint: string }> = [
  { name: 'web_search', label: 'Search the web', hint: 'web_search' },
  { name: 'web_fetch', label: 'Open web pages', hint: 'web_fetch' },
  { name: 'file_read', label: 'Read files', hint: 'file_read' },
  { name: 'file_list', label: 'List folders', hint: 'file_list' },
  { name: 'file_search', label: 'Search in files', hint: 'file_search' },
  { name: 'file_write', label: 'Write files', hint: 'file_write' },
  { name: 'file_edit', label: 'Edit files', hint: 'file_edit' },
  { name: 'image_generate', label: 'Generate images', hint: 'image_generate' },
]

export interface FormValue {
  kind: AutomationKind
  name: string
  instructions: string
  checks: string[]
  permissions: AutomationPermissions
  schedule: AutomationSchedule
  alertOn: Automation['alertOn']
}

export function emptyForm(kind: AutomationKind): FormValue {
  return kind === 'security'
    ? {
        kind, name: 'Security check', instructions: '', checks: SECURITY_CHECKS.map((c) => c.id),
        permissions: { tools: [], shell: 'read' }, schedule: { kind: 'daily', time: '07:00' }, alertOn: 'warning',
      }
    : {
        kind, name: '', instructions: '', checks: [],
        permissions: { tools: ['web_search', 'web_fetch'], shell: 'off' }, schedule: { kind: 'interval', minutes: 60 }, alertOn: 'warning',
      }
}

export function formFromAutomation(a: Automation): FormValue {
  return {
    kind: a.kind, name: a.name, instructions: a.instructions, checks: a.checks ?? [],
    permissions: a.permissions, schedule: a.schedule, alertOn: a.alertOn,
  }
}

export function automationFromForm(v: FormValue): NewAutomation {
  return {
    kind: v.kind,
    name: v.name.trim() || (v.kind === 'security' ? 'Security check' : 'Agent'),
    instructions: v.instructions.trim(),
    checks: v.kind === 'security' ? v.checks : undefined,
    // A Security automation can only ever inspect: its shell is read-only
    // and it gets no other tools, whatever the form state says.
    permissions: v.kind === 'security' ? { tools: [], shell: 'read' } : v.permissions,
    schedule: v.schedule,
    enabled: v.schedule.kind !== 'manual',
    alertOn: v.alertOn,
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[0.72rem] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{children}</div>
}

interface Props {
  initial: FormValue
  submitLabel: string
  onSubmit: (v: FormValue, runNow: boolean) => void
  onCancel: () => void
}

export function AutomationForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<FormValue>(initial)
  const set = (patch: Partial<FormValue>) => setV((prev) => ({ ...prev, ...patch }))
  const toggleTool = (name: string) => set({
    permissions: {
      ...v.permissions,
      tools: v.permissions.tools.includes(name) ? v.permissions.tools.filter((t) => t !== name) : [...v.permissions.tools, name],
    },
  })
  const toggleCheck = (id: string) => set({ checks: v.checks.includes(id) ? v.checks.filter((c) => c !== id) : [...v.checks, id] })
  const hasWork = v.kind === 'security' ? (v.checks.length > 0 || v.instructions.trim().length > 0) : v.instructions.trim().length > 0

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 space-y-4">
      <div>
        <Label>Name</Label>
        <input className={INPUT_CLASS} value={v.name} placeholder={v.kind === 'security' ? 'Nightly security check' : 'Website monitor'} onChange={(e) => set({ name: e.target.value })} />
      </div>

      {v.kind === 'security' && (
        <div>
          <Label>What to check</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SECURITY_CHECKS.map((c) => {
              const Icon = CHECK_ICONS[c.icon]
              const on = v.checks.includes(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCheck(c.id)}
                  className={`flex items-start gap-2.5 text-left rounded-lg border px-3 py-2 transition-colors ${on
                    ? 'border-blue-500/60 bg-blue-500/[0.07]'
                    : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'}`}
                >
                  <Icon size={15} className={on ? 'text-blue-500 mt-0.5' : 'text-gray-400 mt-0.5'} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[0.75rem] font-semibold text-gray-900 dark:text-gray-100">{c.name}</span>
                    <span className="block text-[0.66rem] text-gray-500">{c.description}</span>
                  </span>
                  {on && <Check size={13} className="text-blue-500 mt-0.5" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <Label>{v.kind === 'security' ? 'Your own question (optional)' : 'What should this agent do?'}</Label>
        <textarea
          className={`${INPUT_CLASS} min-h-[90px]`}
          value={v.instructions}
          placeholder={v.kind === 'security'
            ? 'e.g. Is Remote Desktop reachable from outside? Which programs talk to the internet right now?'
            : 'e.g. Open https://mijnwinkel.nl every 15 minutes. If the page does not load or the checkout button is missing, start your answer with ALERT.'}
          onChange={(e) => set({ instructions: e.target.value })}
        />
        <p className="mt-1 text-[0.66rem] text-gray-500">
          {v.kind === 'security'
            ? 'Security checks only look; they never change a setting. You get a report with what to do yourself.'
            : 'Write it like you would to a colleague. An answer that starts with ALERT counts as a warning.'}
        </p>
      </div>

      {v.kind === 'agent' && (
        <div>
          <Label>What may it do on its own?</Label>
          <div className="flex flex-wrap gap-1.5">
            {AGENT_TOOLS.map((t) => {
              const on = v.permissions.tools.includes(t.name)
              return (
                <button
                  key={t.name}
                  onClick={() => toggleTool(t.name)}
                  className={`px-2.5 py-1 rounded-full text-[0.7rem] border transition-colors ${on
                    ? 'border-blue-500/60 bg-blue-500/10 text-blue-700 dark:text-blue-200'
                    : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-white/20'}`}
                  title={t.hint}
                >
                  {on ? '✓ ' : ''}{t.label}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[0.7rem] text-gray-600 dark:text-gray-400">Terminal:</span>
            {(['off', 'read', 'all'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => set({ permissions: { ...v.permissions, shell: mode } })}
                className={`px-2.5 py-1 rounded-full text-[0.7rem] border ${v.permissions.shell === mode
                  ? mode === 'all' ? 'border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-300' : 'border-blue-500/60 bg-blue-500/10 text-blue-700 dark:text-blue-200'
                  : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400'}`}
              >
                {mode === 'off' ? 'Off' : mode === 'read' ? 'Inspect only' : 'Any command'}
              </button>
            ))}
          </div>
          {v.permissions.shell === 'all' && (
            <p className="mt-2 flex items-start gap-1.5 text-[0.68rem] text-red-600 dark:text-red-300">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              This agent may run any command on this computer without asking, also at night. Only choose this for a task you fully trust.
            </p>
          )}
        </div>
      )}

      <div>
        <Label>When</Label>
        <ScheduleEditor value={v.schedule} onChange={(schedule) => set({ schedule })} />
      </div>

      <div>
        <Label>Alert me</Label>
        <select className={COMPACT_INPUT_CLASS} value={v.alertOn} onChange={(e) => set({ alertOn: e.target.value as FormValue['alertOn'] })}>
          <option value="warning">On warnings and critical findings</option>
          <option value="critical">Only on critical findings</option>
          <option value="never">Never, I check the history myself</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button disabled={!hasWork} onClick={() => onSubmit(v, true)} className="lu-primary px-3.5 py-2 rounded-lg text-[0.75rem] disabled:opacity-40">
          {submitLabel} and run now
        </button>
        <button
          disabled={!hasWork}
          onClick={() => onSubmit(v, false)}
          className="px-3.5 py-2 rounded-lg text-[0.75rem] border border-gray-300 dark:border-white/15 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-40"
        >
          {submitLabel}
        </button>
        <button onClick={onCancel} className="px-3 py-2 rounded-lg text-[0.75rem] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Cancel</button>
      </div>
    </div>
  )
}
