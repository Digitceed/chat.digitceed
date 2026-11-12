/**
 * Digitceed AI — runs one automation (a 24/7 agent or a Security check).
 *
 * A run has up to three parts:
 *  1. Security checks: the fixed inspection commands of each selected check,
 *     executed directly (they are reviewed, read-only strings, and are
 *     re-checked against `isSafeSecurityCommand` right before they run).
 *  2. Act: one model turn with the tools the user allowed for this
 *     automation, through `WorkflowEngine` (same lane booking, sampling and
 *     tool transport as any agent turn).
 *  3. Report: one model turn without tools that turns everything gathered
 *     into the answer the user reads, with a STATUS line the scheduler reads.
 *
 * Approval: an automation runs while nobody watches, so the approval card of
 * the agent chat would wait forever. The user chose what the automation may
 * do when they made it (`AutomationPermissions`); the gate below enforces
 * exactly that list and refuses everything else, and a category the user
 * blocked in Settings stays blocked.
 */
import { v4 as uuid } from 'uuid'
import { WorkflowEngine } from './workflow-engine'
import { toolRegistry } from '../api/mcp/tool-registry'
import { usePermissionStore } from '../stores/permissionStore'
import { useModelStore } from '../stores/modelStore'
import { useAutomationStore } from '../stores/automationStore'
import { isWindows } from '../api/backend'
import { errorText } from '../types/json-guards'
import { isSafeSecurityCommand, SECURITY_COMMAND_HINT } from './security-command-classify'
import { getSecurityCheck, SECURITY_REPORT_FORMAT, type SecurityPlatform } from './security-checks'
import type { AgentWorkflow, StepResult } from '../types/agent-workflows'
import type { ApprovalGate } from '../api/agents/tool-executor'
import type { Automation, AutomationRun, RunStatus } from '../types/automations'

/** Per command output kept for the model; small local models have 8–16K. */
const MAX_OUTPUT_PER_COMMAND = 3_500
const MAX_GATHERED = 14_000

let current: { automationId: string; engine: WorkflowEngine | null; aborted: boolean } | null = null

export function isAutomationRunning(): boolean {
  return current !== null
}

/** Stop the run in progress (the Stop button). */
export function stopAutomationRun(): void {
  if (!current) return
  current.aborted = true
  current.engine?.cancel()
}

function platform(): SecurityPlatform {
  return isWindows() ? 'windows' : 'unix'
}

function cut(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n… (output cut)` : s
}

/** The gate for one automation's own tool list. Exported for tests. */
export function buildAutomationGate(a: Automation, refused: string[]): ApprovalGate {
  return async (req) => {
    const name = req.toolName
    const perms = usePermissionStore.getState().getEffectivePermissions(undefined)
    if (toolRegistry.getPermissionLevelWithOverrides(name, perms, {}) === 'blocked') {
      refused.push(`${name} (blocked in Settings → Permissions)`)
      return false
    }
    if (name === 'shell_execute') {
      const command = typeof req.args?.command === 'string' ? req.args.command : ''
      if (a.permissions.shell === 'all') return true
      if (a.permissions.shell === 'read' && !req.args?.background && isSafeSecurityCommand(command)) return true
      refused.push(command ? `shell: ${command}` : 'shell_execute')
      return false
    }
    if (a.permissions.tools.includes(name)) return true
    refused.push(name)
    return false
  }
}

/** Run a one-step prompt workflow and return its output (or throw). */
async function runPrompt(
  a: Automation,
  label: string,
  prompt: string,
  allowedTools: string[],
  gate: ApprovalGate,
): Promise<string> {
  const workflow: AgentWorkflow = {
    id: `automation-${a.id}-${label}`,
    name: a.name,
    description: '',
    icon: 'Zap',
    steps: [{ id: uuid(), type: 'prompt', label, prompt, allowedTools }],
    variables: {},
    isBuiltIn: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  let error: string | null = null
  let stopped = false
  const engine = new WorkflowEngine(workflow, `automation:${a.id}`, {
    onStepStart: () => {},
    onStepComplete: () => {},
    onStepError: (_i, e) => { error = e },
    onWaitingForInput: () => {},
    onComplete: () => {},
    onError: (e) => { error = e },
    onStopped: () => { stopped = true },
  }, gate)
  if (current) current.engine = engine
  const results: StepResult[] = await engine.run()
  if (current) current.engine = null
  if (stopped || current?.aborted) throw new StopSignal()
  const out = results[0]
  if (error || !out || out.status !== 'completed') throw new Error(error ?? out?.error ?? 'The model gave no answer.')
  return out.output
}

class StopSignal extends Error {
  constructor() { super('Stopped') }
}

/** Read the verdict from the report's first lines. */
export function statusFromReport(report: string, kind: Automation['kind']): RunStatus {
  const head = report.slice(0, 400).toUpperCase()
  if (/STATUS:\s*\**\s*(CRITICAL|KRITIEK)/.test(head)) return 'critical'
  if (/STATUS:\s*\**\s*(WARNING|WAARSCHUWING)/.test(head)) return 'warning'
  if (kind === 'agent' && /^\s*\**\s*ALERT\b/.test(head)) return 'warning'
  return 'ok'
}

function notify(a: Automation, status: RunStatus, report: string) {
  const wants = (a.alertOn === 'warning' && (status === 'warning' || status === 'critical'))
    || (a.alertOn === 'critical' && status === 'critical')
  if (!wants) return
  try {
    if (typeof Notification === 'undefined') return
    const show = () => new Notification(`Digitceed AI · ${a.name}`, {
      body: `${status === 'critical' ? 'CRITICAL' : 'Warning'}: ${report.replace(/^STATUS:.*\n?/i, '').trim().slice(0, 180)}`,
    })
    if (Notification.permission === 'granted') show()
    else if (Notification.permission !== 'denied') void Notification.requestPermission().then((p) => { if (p === 'granted') show() })
  } catch {
    // A webview without notifications still has the header badge.
  }
}

/**
 * Run one automation now. Resolves when the run is stored. Only one
 * automation runs at a time; a second call while one runs is refused.
 */
export async function runAutomation(id: string, trigger: AutomationRun['trigger']): Promise<void> {
  const store = useAutomationStore.getState()
  const a = store.get(id)
  if (!a || current) return
  current = { automationId: id, engine: null, aborted: false }
  const runId = store.beginRun(id, trigger)
  const refused: string[] = []
  const gate = buildAutomationGate(a, refused)
  const plat = platform()
  let details = ''

  try {
    if (!useModelStore.getState().activeModel) {
      throw new Error('No model is selected. Pick a model in Chat first; automations use the model that is active.')
    }

    // 1. Fixed security checks.
    const gathered: string[] = []
    for (const checkId of a.checks ?? []) {
      const check = getSecurityCheck(checkId)
      if (!check) continue
      gathered.push(`### Check: ${check.name}\nWhat to judge: ${check.focus}`)
      for (const command of check.commands[plat]) {
        if (current.aborted) throw new StopSignal()
        if (!isSafeSecurityCommand(command)) {
          refused.push(`shell: ${command}`)
          continue
        }
        const args = plat === 'windows' ? { command, shell: 'powershell' } : { command }
        let output: string
        try {
          output = await toolRegistry.execute('shell_execute', args)
        } catch (err) {
          output = `Error: ${errorText(err)}`
        }
        gathered.push(`$ ${command}\n${cut(output.trim() || '(no output)', MAX_OUTPUT_PER_COMMAND)}`)
      }
    }

    // 2. Act: the user's own instructions, with the tools they allowed.
    const tools = [...a.permissions.tools]
    if (a.permissions.shell !== 'off') tools.push('shell_execute')
    const instructions = a.instructions.trim()
    if (instructions && tools.length > 0) {
      const shellNote = a.permissions.shell === 'read'
        ? `\nShell: ${plat === 'windows' ? 'Windows PowerShell' : 'bash'}. ${SECURITY_COMMAND_HINT}`
        : a.permissions.shell === 'all' ? `\nShell: ${plat === 'windows' ? 'Windows PowerShell' : 'bash'}.` : ''
      const actPrompt = [
        a.kind === 'security'
          ? 'You are a defensive security auditor running on the user\'s own computer. You only inspect, you never change settings.'
          : `You are "${a.name}", an autonomous agent running unattended on the user's own computer. Nobody watches this run.`,
        `Task: ${instructions}`,
        gathered.length ? `Already collected:\n${cut(gathered.join('\n\n'), 4_000)}` : '',
        `Call the tools you need now to carry out the task (several calls are fine).${shellNote}`,
        'If no tool is needed, answer the task directly.',
      ].filter(Boolean).join('\n\n')
      const actOut = await runPrompt(a, 'act', actPrompt, tools, gate)
      gathered.push(`### Agent work\n${actOut}`)
    }

    if (current.aborted) throw new StopSignal()
    details = cut(gathered.join('\n\n'), MAX_GATHERED)

    // 3. Report.
    const refusedNote = refused.length
      ? `\nThese actions were refused by the automation's permissions and did not run: ${refused.join('; ')}.`
      : ''
    const reportPrompt = a.kind === 'security'
      ? [
          'You are a security expert writing a report for a small business owner who is not technical.',
          instructions ? `The user asked: ${instructions}` : 'Judge the security of this computer from the command output below.',
          `Platform: ${plat === 'windows' ? 'Windows' : 'Linux/macOS'}.`,
          `Collected output:\n${details || '(nothing was collected)'}`,
          refusedNote,
          SECURITY_REPORT_FORMAT,
        ].filter(Boolean).join('\n\n')
      : [
          `You are "${a.name}". Task: ${instructions || '(no task given)'}`,
          `What happened during this run:\n${details || '(no tools were used)'}`,
          refusedNote,
          'Write the result for the user: short, concrete, in the language of the task. '
          + 'If something needs the user\'s attention, start the answer with "ALERT:" and say what and why.',
        ].filter(Boolean).join('\n\n')
    const report = (await runPrompt(a, 'report', reportPrompt, [], gate)).trim()
    const status = statusFromReport(report, a.kind)
    useAutomationStore.getState().finishRun(id, runId, { status, report, details, refused })
    notify(a, status, report)
  } catch (err) {
    if (err instanceof StopSignal) {
      useAutomationStore.getState().finishRun(id, runId, { status: 'stopped', report: 'Stopped.', details, refused })
    } else {
      const message = errorText(err) || 'The run failed.'
      useAutomationStore.getState().finishRun(id, runId, { status: 'failed', report: message, details, refused })
      notify(a, 'critical', `Run failed: ${message}`)
    }
  } finally {
    current = null
  }
}
