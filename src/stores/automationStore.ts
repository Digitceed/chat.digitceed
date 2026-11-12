/**
 * Digitceed AI — the saved automations (24/7 agents and Security checks) and
 * their run history. Runtime state (which one runs right now) is kept apart
 * from what is persisted, so a crash never leaves a run "running" forever.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { safeJSONStorage } from '../lib/storage-quota'
import { nextRunAfter } from '../lib/automation-schedule'
import type { Automation, AutomationRun } from '../types/automations'

export const MAX_RUNS_KEPT = 20
export const MAX_REPORT_CHARS = 8_000
export const MAX_DETAILS_CHARS = 12_000

export type NewAutomation = Omit<Automation, 'id' | 'createdAt' | 'updatedAt' | 'runs' | 'lastRunAt' | 'nextRunAt'>

interface AutomationState {
  automations: Automation[]
  /** Runtime only: id of the automation whose run is in progress. */
  runningId: string | null
  /** Runtime only: unread alerts (warning/critical runs), for the header badge. */
  unreadAlerts: number

  add: (a: NewAutomation) => string
  update: (id: string, patch: Partial<NewAutomation>) => void
  remove: (id: string) => void
  setEnabled: (id: string, enabled: boolean) => void
  get: (id: string) => Automation | undefined

  /** Record the start of a run; returns the run id. */
  beginRun: (id: string, trigger: AutomationRun['trigger']) => string
  /** Store the outcome of a run and plan the next one. */
  finishRun: (id: string, runId: string, outcome: Omit<AutomationRun, 'id' | 'startedAt' | 'trigger'>) => void
  clearRuns: (id: string) => void
  markAlertsRead: () => void
}

function clip(s: string | undefined, max: number): string | undefined {
  if (s === undefined) return undefined
  return s.length > max ? `${s.slice(0, max)}\n… (cut, ${s.length - max} more characters)` : s
}

function planned(a: Automation, from: number): Automation {
  return { ...a, nextRunAt: a.enabled ? nextRunAfter(a.schedule, from) : undefined }
}

export const useAutomationStore = create<AutomationState>()(
  persist(
    (set, get) => ({
      automations: [],
      runningId: null,
      unreadAlerts: 0,

      add: (input) => {
        const id = uuid()
        const now = Date.now()
        const a = planned({ ...input, id, createdAt: now, updatedAt: now, runs: [] }, now)
        set((s) => ({ automations: [...s.automations, a] }))
        return id
      },

      update: (id, patch) => {
        const now = Date.now()
        set((s) => ({
          automations: s.automations.map((a) => {
            if (a.id !== id) return a
            const next = { ...a, ...patch, updatedAt: now }
            // A new schedule (or switching it on) re-plans from now.
            const replan = patch.schedule !== undefined || patch.enabled !== undefined
            return replan ? planned(next, now) : next
          }),
        }))
      },

      remove: (id) => set((s) => ({ automations: s.automations.filter((a) => a.id !== id) })),

      setEnabled: (id, enabled) => get().update(id, { enabled }),

      get: (id) => get().automations.find((a) => a.id === id),

      beginRun: (id, trigger) => {
        const runId = uuid()
        const run: AutomationRun = { id: runId, startedAt: Date.now(), status: 'running', report: '', trigger }
        set((s) => ({
          runningId: id,
          automations: s.automations.map((a) =>
            a.id === id ? { ...a, runs: [run, ...a.runs].slice(0, MAX_RUNS_KEPT) } : a),
        }))
        return runId
      },

      finishRun: (id, runId, outcome) => {
        const now = Date.now()
        const alert = (a: Automation) =>
          (a.alertOn === 'warning' && (outcome.status === 'warning' || outcome.status === 'critical'))
          || (a.alertOn === 'critical' && outcome.status === 'critical')
        set((s) => {
          let alerts = s.unreadAlerts
          const automations = s.automations.map((a) => {
            if (a.id !== id) return a
            if (alert(a)) alerts += 1
            const runs = a.runs.map((r) => r.id === runId
              ? {
                  ...r,
                  ...outcome,
                  finishedAt: outcome.finishedAt ?? now,
                  report: clip(outcome.report, MAX_REPORT_CHARS) ?? '',
                  details: clip(outcome.details, MAX_DETAILS_CHARS),
                }
              : r)
            return planned({ ...a, runs, lastRunAt: now }, now)
          })
          return { automations, runningId: s.runningId === id ? null : s.runningId, unreadAlerts: alerts }
        })
      },

      clearRuns: (id) => set((s) => ({
        automations: s.automations.map((a) => a.id === id ? { ...a, runs: [] } : a),
      })),

      markAlertsRead: () => set({ unreadAlerts: 0 }),
    }),
    {
      name: 'digitceed-automations',
      storage: safeJSONStorage(),
      version: 1,
      partialize: (s) => ({ automations: s.automations }),
      // A run that was "running" when the app closed did not finish: say so.
      // A slot missed while the app was closed (PC off at 07:00) runs ONCE,
      // a minute after start, instead of being skipped or fired repeatedly.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { automations?: unknown }
        const list = Array.isArray(p.automations) ? (p.automations as Automation[]) : []
        const now = Date.now()
        const automations = list
          .filter((a) => a && typeof a.id === 'string' && Array.isArray(a.runs))
          .map((a) => {
            const runs = a.runs.map((r) => r.status === 'running'
              ? { ...r, status: 'stopped' as const, finishedAt: r.finishedAt ?? now, report: r.report || 'The app was closed while this run was in progress.' }
              : r)
            const next = a.enabled ? nextRunAfter(a.schedule, now) : undefined
            const nextRunAt = a.nextRunAt ? Math.max(a.nextRunAt, now + 60_000) : next
            return { ...a, runs, nextRunAt: a.enabled ? nextRunAt : undefined }
          })
        return { ...current, automations }
      },
    },
  ),
)
