import { describe, it, expect, vi, beforeEach } from 'vitest'

const executed: Array<{ name: string; args: Record<string, unknown> }> = []
const prompts: string[] = []

vi.mock('../../api/mcp/tool-registry', () => ({
  toolRegistry: {
    execute: vi.fn(async (name: string, args: Record<string, unknown>) => {
      executed.push({ name, args })
      return 'LocalPort 3389 Listen'
    }),
    getPermissionLevelWithOverrides: () => 'confirm',
  },
}))
vi.mock('../../api/backend', () => ({ isWindows: () => true }))
vi.mock('../workflow-engine', () => ({
  WorkflowEngine: class {
    private wf: { steps: Array<{ id: string; prompt: string }> }
    constructor(wf: { steps: Array<{ id: string; prompt: string }> }) { this.wf = wf }
    cancel() {}
    async run() {
      const step = this.wf.steps[0]
      prompts.push(step.prompt)
      return [{ stepId: step.id, status: 'completed', output: 'STATUS: WARNING\n- RDP is open', startedAt: 0 }]
    }
  },
}))

import { runAutomation } from '../automation-runner'
import { useAutomationStore } from '../../stores/automationStore'
import { useModelStore } from '../../stores/modelStore'

describe('runAutomation', () => {
  beforeEach(() => {
    executed.length = 0
    prompts.length = 0
    useAutomationStore.setState({ automations: [], runningId: null, unreadAlerts: 0 })
    useModelStore.setState({ activeModel: 'test-model' })
  })

  it('runs the fixed check commands, writes a report and raises an alert', async () => {
    const id = useAutomationStore.getState().add({
      kind: 'security', name: 'Ports', instructions: '', checks: ['sec-open-ports'],
      permissions: { tools: [], shell: 'read' }, schedule: { kind: 'manual' }, enabled: false, alertOn: 'warning',
    })
    await runAutomation(id, 'manual')
    expect(executed.map((e) => e.args.shell)).toEqual(['powershell', 'powershell'])
    expect(prompts).toHaveLength(1) // no act step without own instructions
    expect(prompts[0]).toContain('LocalPort 3389')
    const a = useAutomationStore.getState().get(id)!
    expect(a.runs[0].status).toBe('warning')
    expect(a.runs[0].report).toContain('RDP')
    expect(useAutomationStore.getState().unreadAlerts).toBe(1)
    expect(useAutomationStore.getState().runningId).toBeNull()
  })

  it('fails clearly without a model', async () => {
    useModelStore.setState({ activeModel: null })
    const id = useAutomationStore.getState().add({
      kind: 'agent', name: 'A', instructions: 'do it', permissions: { tools: ['web_fetch'], shell: 'off' },
      schedule: { kind: 'manual' }, enabled: false, alertOn: 'never',
    })
    await runAutomation(id, 'manual')
    const run = useAutomationStore.getState().get(id)!.runs[0]
    expect(run.status).toBe('failed')
    expect(run.report).toMatch(/No model/)
  })

  it('an agent with instructions gets an act turn and a report turn', async () => {
    const id = useAutomationStore.getState().add({
      kind: 'agent', name: 'Monitor', instructions: 'open the site', permissions: { tools: ['web_fetch'], shell: 'off' },
      schedule: { kind: 'interval', minutes: 15 }, enabled: true, alertOn: 'never',
    })
    await runAutomation(id, 'schedule')
    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toContain('open the site')
    expect(useAutomationStore.getState().get(id)!.nextRunAt).toBeGreaterThan(Date.now())
  })
})
