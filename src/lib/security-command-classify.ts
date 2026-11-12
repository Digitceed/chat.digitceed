/**
 * Digitceed AI — which shell commands a Security check or a read-only agent
 * may run WITHOUT anyone clicking "allow".
 *
 * Automations run unattended (24/7, window in the tray), so there is nobody
 * to answer an approval card. The rule here is therefore deliberately narrow
 * and works as an allowlist, never a blocklist:
 *
 *  - one command line, no chaining (`;`, `&&`, `||`), no redirection (`>`),
 *    no backticks, no `$(`, no newlines;
 *  - a pipe `|` is allowed only into a known formatting cmdlet
 *    (Select-Object, Where-Object, Format-Table …), which can not change the
 *    system;
 *  - the first word must be an inspection command: a PowerShell `Get-*` /
 *    `Test-*` cmdlet from the list below, or a known read-only tool such as
 *    `netstat`, `ipconfig`, `whoami`, `ss`, `ufw status`.
 *
 * Anything else is refused, and the run reports which command it skipped.
 * This file has no imports on purpose: it is a pure function with its own
 * tests, so a change to the allowlist is always visible in review.
 */

/** PowerShell cmdlets a check may start with (compared case-insensitively). */
const PS_READ_CMDLETS = new Set([
  'get-nettcpconnection', 'get-netudpendpoint', 'get-netfirewallprofile', 'get-netfirewallrule',
  'get-netadapter', 'get-netipaddress', 'get-netipconfiguration', 'get-netconnectionprofile',
  'get-mpcomputerstatus', 'get-mppreference', 'get-mpthreat', 'get-mpthreatdetection',
  'get-hotfix', 'get-computerinfo', 'get-ciminstance', 'get-wmiobject',
  'get-localuser', 'get-localgroup', 'get-localgroupmember',
  'get-service', 'get-process', 'get-scheduledtask', 'get-scheduledtaskinfo',
  'get-itemproperty', 'get-childitem', 'get-item', 'get-acl',
  'get-winevent', 'get-eventlog', 'get-smbshare', 'get-smbserverconfiguration',
  'get-bitlockervolume', 'get-tpm', 'get-secureBootUEFI'.toLowerCase(), 'confirm-securebootuefi',
  'get-dnsclientserveraddress', 'get-dnsclientcache', 'get-netroute', 'get-netneighbor',
  'get-volume', 'get-psdrive', 'get-date', 'get-executionpolicy', 'get-windowsoptionalfeature',
  'get-appxpackage', 'get-package', 'test-netconnection', 'resolve-dnsname',
])

/** Cmdlets a pipe may lead into: they only shape output. */
const PS_PIPE_FORMATTERS = new Set([
  'select-object', 'select', 'where-object', 'where', '?', 'sort-object', 'sort',
  'format-table', 'ft', 'format-list', 'fl', 'measure-object', 'measure',
  'group-object', 'group', 'convertto-json', 'convertto-csv', 'out-string',
  'select-string',
])

/** Plain executables (Windows and Unix) that only report. The value, when set,
 *  restricts the allowed argument forms for tools that can also change state. */
const READ_TOOLS: Record<string, ((args: string[]) => boolean) | true> = {
  netstat: true,
  ipconfig: (a) => a.every((x) => /^\/(all|displaydns)$/i.test(x)),
  whoami: true,
  systeminfo: true,
  hostname: true,
  ver: true,
  tasklist: true,
  'gpresult': (a) => a.every((x) => /^\/(r|z|scope|user|computer)$/i.test(x) || /^(user|computer)$/i.test(x)),
  'auditpol': (a) => a[0]?.toLowerCase() === '/get',
  'schtasks': (a) => a[0]?.toLowerCase() === '/query' && !a.some((x) => /^\/(create|delete|change|run|end)$/i.test(x)),
  'sc': (a) => ['query', 'queryex', 'qc', 'qdescription'].includes((a[0] ?? '').toLowerCase()),
  // `net user bob /add` creates an account, so only the bare listing forms.
  net: (a) => {
    const s = a.map((x) => x.toLowerCase()).join(' ')
    return ['accounts', 'share', 'user', 'localgroup', 'localgroup administrators', 'session', 'use', 'start'].includes(s)
  },
  // Unix
  ss: true,
  uname: true,
  id: true,
  who: true,
  w: true,
  last: true,
  lastlog: true,
  uptime: true,
  ps: true,
  df: true,
  lsblk: true,
  'ip': (a) => ['a', 'addr', 'address', 'r', 'route', 'link', 'neigh'].includes((a[0] ?? '').toLowerCase()) && a.length <= 3,
  ufw: (a) => a[0] === 'status',
  'firewall-cmd': (a) => a.every((x) => /^--(state|list-all|list-ports|list-services|get-active-zones)$/.test(x)),
  'systemctl': (a) => ['list-units', 'list-unit-files', 'list-timers', 'status', 'is-active', 'is-enabled'].includes(a[0] ?? ''),
  'journalctl': (a) => !a.some((x) => /^--(vacuum|rotate|flush)/.test(x)),
  'apt': (a) => a[0] === 'list',
  'softwareupdate': (a) => a[0] === '-l' || a[0] === '--list',
  'fdesetup': (a) => a[0] === 'status',
  'spctl': (a) => a[0] === '--status',
  'csrutil': (a) => a[0] === 'status',
  'lsof': (a) => a.every((x) => /^-(i|n|P|nP|iTCP|sTCP:LISTEN|i4|i6)$/.test(x) || /^-i(TCP|UDP)?(:\d+)?$/.test(x)),
}

/** Tokens that make a line more than one command, or write somewhere. */
const FORBIDDEN = /[;`\r\n>]|&&|\|\||\$\(|<\(|(^|\s)&(\s|$)|\b(Set|New|Remove|Add|Clear|Disable|Enable|Stop|Start|Restart|Invoke|Install|Uninstall|Update|Register|Unregister|Rename|Move|Copy|Out-File|Export)-/i

/** No method calls (`.Delete(`), no static calls (`[IO.File]::`), no
 *  subexpressions: a read cmdlet must not be able to smuggle a write in. */
const CODE_IN_LINE = /::|\.\w+\s*\(|@\(|\$\{/

/**
 * A `{ … }` script block (Where-Object's filter) may only compare: `$_.Prop`,
 * `-eq`-style operators, quoted strings, numbers and $true/$false/$null. A bare
 * word is allowed only right after an operator (`-eq Listen`), so a block can
 * not start a command such as `iex` or `rm`.
 */
function scriptBlocksAreFilters(line: string): boolean {
  const blocks = line.match(/\{[^{}]*\}/g) ?? []
  if ((line.match(/[{}]/g) ?? []).length !== blocks.length * 2) return false
  for (const b of blocks) {
    const body = b.slice(1, -1).replace(/'[^']*'|"[^"$`]*"/g, ' Q ')
    const toks = body.split(/\s+/).filter(Boolean)
    let prevOp = false
    for (const t of toks) {
      if (/^-[a-z]+$/i.test(t)) { prevOp = true; continue }
      if (t === 'Q' || /^\d+(\.\d+)?$/.test(t) || /^\$(true|false|null)$/i.test(t) || /^\$_(\.\w+)*$/.test(t)) { prevOp = false; continue }
      if (/^\w+$/.test(t) && prevOp) { prevOp = false; continue }
      return false
    }
  }
  return true
}

/** Split on `|` outside quotes. Returns null when quotes do not balance. */
function pipeSegments(line: string): string[] | null {
  const out: string[] = []
  let cur = ''
  let q: '"' | "'" | null = null
  for (const ch of line) {
    if (q) { cur += ch; if (ch === q) q = null; continue }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue }
    if (ch === '|') { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (q) return null
  out.push(cur)
  return out.map((s) => s.trim())
}

function words(segment: string): string[] {
  return segment.split(/\s+/).filter(Boolean)
}

/** Strip a leading `powershell -Command` / `pwsh -c` wrapper, one level. */
function unwrapPowerShell(line: string): string {
  const m = line.match(/^(?:powershell(?:\.exe)?|pwsh)\s+(?:-NoProfile\s+)?(?:-Command|-c)\s+(["']?)([\s\S]*)\1$/i)
  return m ? m[2].trim() : line
}

function firstSegmentIsRead(segment: string): boolean {
  const [head, ...rest] = words(segment)
  if (!head) return false
  const name = head.toLowerCase().replace(/\.exe$/, '')
  if (PS_READ_CMDLETS.has(name)) return true
  const rule = READ_TOOLS[name]
  if (rule === true) return true
  if (typeof rule === 'function') return rule(rest)
  return false
}

/**
 * May this command run unattended in a Security check or a read-only agent?
 */
export function isSafeSecurityCommand(command: string): boolean {
  const line = unwrapPowerShell((command ?? '').trim())
  if (!line || line.length > 600) return false
  if (FORBIDDEN.test(line) || CODE_IN_LINE.test(line)) return false
  if (!scriptBlocksAreFilters(line)) return false
  const segs = pipeSegments(line)
  if (!segs || segs.some((s) => !s)) return false
  if (!firstSegmentIsRead(segs[0])) return false
  for (const seg of segs.slice(1)) {
    const head = (words(seg)[0] ?? '').toLowerCase()
    if (!PS_PIPE_FORMATTERS.has(head)) return false
  }
  return true
}

/** One line the model and the user can read: what the read-only rule allows. */
export const SECURITY_COMMAND_HINT =
  'Only inspection commands run: PowerShell Get-* cmdlets for network, firewall, Defender, updates, users, services and events '
  + '(pipe only into Select-Object, Where-Object, Sort-Object, Format-Table/List), or netstat, ipconfig, whoami, systeminfo, '
  + 'net accounts/user/localgroup/share, schtasks /query, auditpol /get on Windows; ss, ufw status, systemctl list-units, last, '
  + 'journalctl on Linux. One command per call, no chaining, no redirection, nothing that changes the system.'
