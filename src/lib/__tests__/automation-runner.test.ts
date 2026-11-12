import { describe, it, expect } from 'vitest'
import { buildAutomationGate, statusFromReport } from '../automation-runner'
import type { Automation } from '../../types/automations'

function auto(perm: Automation['permissions']): Automation {
  return {
    id: 'a', kind: 'agent', name: 'x', instructions: 'y', permissions: perm,
    schedule: { kind: 'manual' }, enabled: false, alertOn: 'never', createdAt: 0, updatedAt: 0, runs: [],
  }
}
const req = (toolName: string, args: Record<string, unknown> = {}) => ({ id: '1', toolName, args })

describe('buildAutomationGate', () => {
  it('allows only the tools the user picked', async () => {
    const refused: string[] = []
    const gate = buildAutomationGate(auto({ tools: ['web_fetch'], shell: 'off' }), refused)
    expect(await gate(req('web_fetch', { url: 'https://x' }), { name: 'web_fetch' })).toBe(true)
    expect(await gate(req('file_write', { path: 'x' }), { name: 'file_write' })).toBe(false)
    expect(await gate(req('shell_execute', { command: 'netstat' }), { name: 'shell_execute' })).toBe(false)
    expect(refused).toEqual(['file_write', 'shell: netstat'])
  })
  it('read-only shell runs inspections and refuses changes', async () => {
    const gate = buildAutomationGate(auto({ tools: [], shell: 'read' }), [])
    expect(await gate(req('shell_execute', { command: 'Get-NetFirewallProfile' }), { name: 'shell_execute' })).toBe(true)
    expect(await gate(req('shell_execute', { command: 'netsh advfirewall set allprofiles state off' }), { name: 'shell_execute' })).toBe(false)
  })
})

describe('statusFromReport', () => {
  it('reads the status line', () => {
    expect(statusFromReport('STATUS: CRITICAL\n- firewall off', 'security')).toBe('critical')
    expect(statusFromReport('**STATUS: WARNING**', 'security')).toBe('warning')
    expect(statusFromReport('STATUS: OK', 'security')).toBe('ok')
    expect(statusFromReport('ALERT: site down', 'agent')).toBe('warning')
    expect(statusFromReport('All fine', 'agent')).toBe('ok')
  })
})
