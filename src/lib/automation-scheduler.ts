/**
 * Digitceed AI — the clock that starts automations.
 *
 * Lives in the main window, which stays alive when the window is closed to
 * the tray (lib.rs, CloseRequested → hide), so agents keep running 24/7 as
 * long as Digitceed AI runs. One run at a time; a due automation waits for
 * the one in progress, then starts.
 */
import { useAutomationStore } from '../stores/automationStore'
import { runAutomation, isAutomationRunning } from './automation-runner'

const TICK_MS = 20_000

/** The automation that should start now, if any. Exported for tests. */
export function dueAutomationId(now: number): string | null {
  const due = useAutomationStore.getState().automations
    .filter((a) => a.enabled && a.nextRunAt !== undefined && a.nextRunAt <= now)
    .sort((x, y) => (x.nextRunAt ?? 0) - (y.nextRunAt ?? 0))
  return due[0]?.id ?? null
}

export function tickAutomations(now = Date.now()): void {
  if (isAutomationRunning()) return
  const id = dueAutomationId(now)
  if (id) void runAutomation(id, 'schedule')
}

let timer: ReturnType<typeof setInterval> | null = null

/** Start the clock once; returns a stop function (for React effects). */
export function startAutomationScheduler(): () => void {
  if (!timer) {
    timer = setInterval(() => tickAutomations(), TICK_MS)
    setTimeout(() => tickAutomations(), 5_000)
  }
  return () => {
    if (timer) clearInterval(timer)
    timer = null
  }
}
