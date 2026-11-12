/**
 * Digitceed AI — the built-in Security checks.
 *
 * Each check is a fixed list of inspection commands per platform plus what
 * the model should look for in their output. The commands are fixed on
 * purpose: a small local model writes a better report from real `netstat`
 * output than from commands it had to invent, and a fixed list can be
 * reviewed once and then run unattended every night. Every command here must
 * pass `isSafeSecurityCommand` (a test checks that), so a check can never
 * change the machine it inspects.
 */

export type SecurityPlatform = 'windows' | 'unix'

export interface SecurityCheck {
  id: string
  name: string
  /** One line for the card. */
  description: string
  /** Lucide icon name, resolved in the view. */
  icon: 'Network' | 'Shield' | 'ShieldCheck' | 'RefreshCw' | 'Users' | 'KeyRound' | 'Rocket' | 'FolderLock' | 'Activity'
  commands: Record<SecurityPlatform, string[]>
  /** What the analysis step should judge, appended to the report prompt. */
  focus: string
}

export const SECURITY_CHECKS: readonly SecurityCheck[] = [
  {
    id: 'sec-open-ports',
    name: 'Open ports',
    description: 'Which ports listen on this machine, and which program owns them',
    icon: 'Network',
    commands: {
      windows: [
        "Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess | Sort-Object LocalPort | Format-Table -AutoSize",
        'Get-Process | Select-Object Id,ProcessName,Path | Format-Table -AutoSize',
      ],
      unix: ['ss -tulpn'],
    },
    focus: 'List every port that listens on all interfaces (0.0.0.0, ::) and say which program owns it. '
      + 'Flag remote-access and file-sharing ports reachable from the network (RDP 3389, SMB 445, Telnet 23, FTP 21, VNC 5900, databases 3306/5432/1433/27017, Redis 6379) as risks, and anything you can not attribute to a known program.',
  },
  {
    id: 'sec-firewall',
    name: 'Firewall',
    description: 'Is the firewall on for every network profile',
    icon: 'Shield',
    commands: {
      windows: [
        'Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction | Format-Table -AutoSize',
        "Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow | Select-Object DisplayName,Profile | Format-Table -AutoSize",
      ],
      unix: ['ufw status verbose'],
    },
    focus: 'Say whether the firewall is enabled for every profile (Domain, Private, Public). A disabled profile, or inbound default Allow, is CRITICAL. '
      + 'Point out inbound allow rules on the Public profile that look unnecessary.',
  },
  {
    id: 'sec-antivirus',
    name: 'Antivirus & threats',
    description: 'Microsoft Defender status, signatures and recent detections',
    icon: 'ShieldCheck',
    commands: {
      windows: [
        'Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,AntispywareEnabled,BehaviorMonitorEnabled,AntivirusSignatureLastUpdated,QuickScanEndTime,FullScanEndTime | Format-List',
        'Get-MpThreatDetection | Select-Object InitialDetectionTime,ThreatID,ActionSuccess,Resources | Format-List',
      ],
      unix: ['systemctl list-units --type=service --state=running'],
    },
    focus: 'Real-time protection off is CRITICAL. Signatures older than 3 days or no scan in 7 days is a WARNING. '
      + 'List any detected threats with date and whether they were removed. On Linux, say whether an antivirus or EDR service (clamav, crowdstrike, sentinelone, wazuh) is running.',
  },
  {
    id: 'sec-updates',
    name: 'Updates',
    description: 'When the last security updates were installed',
    icon: 'RefreshCw',
    commands: {
      windows: [
        'Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 10 HotFixID,Description,InstalledOn | Format-Table -AutoSize',
        'Get-ComputerInfo | Select-Object OsName,OsVersion,OsBuildNumber,WindowsVersion | Format-List',
      ],
      unix: ['apt list --upgradable', 'uname -a'],
    },
    focus: 'Say how many days ago the newest update was installed. More than 30 days is a WARNING, more than 60 days CRITICAL. '
      + 'Mention the Windows version and whether it is still supported if you know it.',
  },
  {
    id: 'sec-accounts',
    name: 'User accounts',
    description: 'Who is administrator, which accounts are enabled, password rules',
    icon: 'Users',
    commands: {
      windows: [
        'Get-LocalUser | Select-Object Name,Enabled,LastLogon,PasswordRequired,PasswordLastSet | Format-Table -AutoSize',
        'net localgroup administrators',
        'net accounts',
      ],
      unix: ['last -n 20', 'who'],
    },
    focus: 'List the administrators. Flag: an enabled Guest account, enabled accounts that never logged on or not in 90 days, accounts without a required password, '
      + 'more than two administrators, no account lockout threshold, a minimum password length below 12.',
  },
  {
    id: 'sec-remote-access',
    name: 'Remote access',
    description: 'RDP, SMB shares and remote services that are switched on',
    icon: 'KeyRound',
    commands: {
      windows: [
        "Get-ItemProperty -Path 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -Name fDenyTSConnections",
        'Get-SmbShare | Select-Object Name,Path,Description | Format-Table -AutoSize',
        'Get-SmbServerConfiguration | Select-Object EnableSMB1Protocol,EnableSMB2Protocol,RequireSecuritySignature | Format-List',
        "Get-Service -Name TermService,RemoteRegistry,WinRM,sshd -ErrorAction SilentlyContinue | Select-Object Name,Status,StartType | Format-Table -AutoSize",
      ],
      unix: ['systemctl list-units --type=service --state=running'],
    },
    focus: 'fDenyTSConnections = 0 means Remote Desktop is ON: a WARNING unless the user needs it. SMB1 enabled is CRITICAL. '
      + 'Shares other than the default admin shares (C$, ADMIN$, IPC$) should be listed with their path. RemoteRegistry running is a WARNING.',
  },
  {
    id: 'sec-startup',
    name: 'Startup & scheduled tasks',
    description: 'Programs that start on their own, a common hiding place for malware',
    icon: 'Rocket',
    commands: {
      windows: [
        "Get-CimInstance -ClassName Win32_StartupCommand | Select-Object Name,Command,Location,User | Format-Table -AutoSize",
        "Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' -and $_.TaskPath -notlike '\\Microsoft\\*' } | Select-Object TaskName,TaskPath,State | Format-Table -AutoSize",
      ],
      unix: ['systemctl list-timers --all', 'systemctl list-unit-files --state=enabled'],
    },
    focus: 'List startup entries and non-Microsoft scheduled tasks. Flag anything that runs from a Temp or AppData folder, has a random-looking name, '
      + 'or that you can not attribute to known software: these are where persistence of malware usually sits.',
  },
  {
    id: 'sec-disk-encryption',
    name: 'Disk encryption',
    description: 'BitLocker / FileVault status, so a stolen laptop leaks nothing',
    icon: 'FolderLock',
    commands: {
      windows: ['Get-BitLockerVolume | Select-Object MountPoint,VolumeStatus,ProtectionStatus,EncryptionPercentage | Format-Table -AutoSize'],
      unix: ['lsblk -f', 'fdesetup status'],
    },
    focus: 'The system drive not encrypted is CRITICAL for a laptop and a WARNING for a desktop. Say per drive whether protection is on.',
  },
  {
    id: 'sec-logins',
    name: 'Failed logins',
    description: 'Failed sign-in attempts in the last 24 hours (brute force)',
    icon: 'Activity',
    commands: {
      windows: [
        'Get-WinEvent -LogName Security -FilterXPath "*[System[EventID=4625]]" -MaxEvents 50 -ErrorAction SilentlyContinue | Select-Object TimeCreated,Message | Format-List',
      ],
      unix: ["journalctl -u ssh -u sshd --since today --no-pager"],
    },
    focus: 'Count failed logins and group them by account and source address. More than 10 failures from one source is a WARNING, more than 50 CRITICAL (likely brute force). '
      + 'If the log can not be read because the app is not running as administrator, say so plainly.',
  },
]

export function getSecurityCheck(id: string): SecurityCheck | undefined {
  return SECURITY_CHECKS.find((c) => c.id === id)
}

/** The instruction every Security report follows, so reports look the same
 *  and the scheduler can read the verdict from the first line. */
export const SECURITY_REPORT_FORMAT =
  'Write the report in the language of the task. Start with exactly one line: "STATUS: OK", "STATUS: WARNING" or "STATUS: CRITICAL" '
  + '(the worst finding decides). Then a short list of findings, each with what you saw and why it matters. '
  + 'End with "What to do:" and concrete steps the user can take themselves (the exact Windows setting or command to change it). '
  + 'Only state what the command output shows; if a command failed or returned nothing, say that instead of guessing.'
