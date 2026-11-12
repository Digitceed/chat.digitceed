/**
 * Digitceed AI — Automations: agents that run on their own, on a schedule,
 * on this machine. A Security check is an automation of kind 'security'.
 */

export type AutomationKind = 'agent' | 'security'

export type AutomationSchedule =
  | { kind: 'manual' }
  /** Every N minutes (minimum 5). */
  | { kind: 'interval'; minutes: number }
  /** Every day at HH:MM local time. */
  | { kind: 'daily'; time: string }
  /** Every week on `weekday` (0 = Sunday) at HH:MM local time. */
  | { kind: 'weekly'; weekday: number; time: string }

/**
 * What a run may do without anyone clicking "allow". Chosen once, when the
 * agent is made: an automation runs unattended, so there is no approval card
 * to answer while it runs.
 */
export interface AutomationPermissions {
  /** Tool names the model is offered (web_search, file_read, …). */
  tools: string[]
  /**
   * shell_execute only: 'off' = not offered, 'read' = only inspection
   * commands (security-command-classify.ts), 'all' = any command.
   */
  shell: 'off' | 'read' | 'all'
}

export type RunStatus = 'running' | 'ok' | 'warning' | 'critical' | 'failed' | 'stopped'

export interface AutomationRun {
  id: string
  startedAt: number
  finishedAt?: number
  status: RunStatus
  /** The final answer / report. */
  report: string
  /** Raw tool output, kept short, for "show details". */
  details?: string
  /** Commands or tool calls that were refused by the permission rule. */
  refused?: string[]
  trigger: 'schedule' | 'manual'
}

export interface Automation {
  id: string
  kind: AutomationKind
  name: string
  /** What the agent should do, in the user's own words. */
  instructions: string
  /** Security checks this automation runs (kind 'security'), by id. */
  checks?: string[]
  permissions: AutomationPermissions
  schedule: AutomationSchedule
  enabled: boolean
  /** Raise an alert (header badge + desktop notification) on these outcomes. */
  alertOn: 'never' | 'warning' | 'critical'
  createdAt: number
  updatedAt: number
  lastRunAt?: number
  nextRunAt?: number
  runs: AutomationRun[]
}
