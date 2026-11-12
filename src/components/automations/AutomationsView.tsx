import { useEffect, useState } from 'react'
import { ShieldCheck, Bot, Plus, Sparkles, Globe, Newspaper, FolderSearch, Server, TrendingUp, Send, Loader2 } from 'lucide-react'
import { useAutomationStore } from '../../stores/automationStore'
import { useModelStore } from '../../stores/modelStore'
import { runAutomation } from '../../lib/automation-runner'
import { SECURITY_CHECKS } from '../../lib/security-checks'
import { AutomationCard } from './AutomationCard'
import { AutomationForm, automationFromForm, emptyForm, formFromAutomation, CHECK_ICONS, type FormValue } from './AutomationForm'
import { INPUT_CLASS } from './ScheduleEditor'
import type { AutomationKind } from '../../types/automations'

type Tab = 'security' | 'agents'

/** Ready-made agents: a starting point the user edits, not a black box. */
const AGENT_TEMPLATES: Array<{ icon: typeof Globe; title: string; blurb: string; form: Partial<FormValue> }> = [
  {
    icon: Globe, title: 'Website monitor', blurb: 'Checks every 15 min that your site is up',
    form: {
      name: 'Website monitor',
      instructions: 'Open https://www.example.com and check that the page loads and shows the contact details. If the page does not load, shows an error, or looks broken, start your answer with ALERT and say what is wrong.',
      permissions: { tools: ['web_fetch'], shell: 'off' }, schedule: { kind: 'interval', minutes: 15 },
    },
  },
  {
    icon: Newspaper, title: 'Morning briefing', blurb: 'Daily news about your industry at 07:30',
    form: {
      name: 'Morning briefing',
      instructions: 'Search the web for the most important news of the last 24 hours about [your industry] in the Netherlands. Give me the 5 most relevant items, each with one line on why it matters for my business, and the source.',
      permissions: { tools: ['web_search', 'web_fetch'], shell: 'off' }, schedule: { kind: 'daily', time: '07:30' }, alertOn: 'never',
    },
  },
  {
    icon: TrendingUp, title: 'Competitor watch', blurb: 'Watches a competitor page for price changes',
    form: {
      name: 'Competitor watch',
      instructions: 'Open https://www.competitor.example/prices and list the prices you see. If a price is lower than ours (we charge €49 for the basic plan), start your answer with ALERT.',
      permissions: { tools: ['web_fetch'], shell: 'off' }, schedule: { kind: 'daily', time: '09:00' },
    },
  },
  {
    icon: FolderSearch, title: 'Folder report', blurb: 'Weekly overview of a shared folder',
    form: {
      name: 'Folder report',
      instructions: 'List the folder C:\\Users\\Public\\Documents and report which files were added or changed this week and which large files (over 500 MB) take up space.',
      permissions: { tools: ['file_list', 'file_read'], shell: 'off' }, schedule: { kind: 'weekly', weekday: 1, time: '08:00' }, alertOn: 'never',
    },
  },
  {
    icon: Server, title: 'PC health', blurb: 'Disk space and running services every hour',
    form: {
      name: 'PC health',
      instructions: 'Check free disk space on every drive and which services are stopped that are set to start automatically. If a drive has less than 10% free, start your answer with ALERT.',
      permissions: { tools: [], shell: 'read' }, schedule: { kind: 'interval', minutes: 60 },
    },
  },
]

export function AutomationsView() {
  const automations = useAutomationStore((s) => s.automations)
  const runningId = useAutomationStore((s) => s.runningId)
  const add = useAutomationStore((s) => s.add)
  const update = useAutomationStore((s) => s.update)
  const markAlertsRead = useAutomationStore((s) => s.markAlertsRead)
  const activeModel = useModelStore((s) => s.activeModel)
  const [tab, setTab] = useState<Tab>('security')
  const [editing, setEditing] = useState<{ id: string | null; form: FormValue } | null>(null)
  const [question, setQuestion] = useState('')

  // Opening this page is reading the alerts.
  useEffect(() => { markAlertsRead() }, [markAlertsRead])

  const kind: AutomationKind = tab === 'security' ? 'security' : 'agent'
  const list = automations.filter((a) => a.kind === kind).slice().reverse()

  const save = (form: FormValue, runNow: boolean) => {
    const data = automationFromForm(form)
    let id = editing?.id ?? null
    if (id) update(id, data)
    else id = add(data)
    setEditing(null)
    if (runNow && id) void runAutomation(id, 'manual')
  }

  /** The quick path: type a question, get a report. */
  const askSecurity = (text: string, checks: string[]) => {
    const name = text.trim()
      ? (text.trim().length > 48 ? `${text.trim().slice(0, 48)}…` : text.trim())
      : 'Full security scan'
    const id = add({
      kind: 'security', name, instructions: text.trim(), checks,
      permissions: { tools: [], shell: 'read' }, schedule: { kind: 'manual' }, enabled: false, alertOn: 'never',
    })
    setQuestion('')
    void runAutomation(id, 'manual')
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-5">
          <h1 className="text-[1.25rem] font-bold text-gray-900 dark:text-white">Agents &amp; Security</h1>
          <p className="text-[0.78rem] text-gray-500 mt-1">
            Everything runs on this computer with your own model. Scheduled agents keep running when you close the window: Digitceed AI stays in the tray.
          </p>
          {!activeModel && (
            <p className="mt-2 text-[0.75rem] text-amber-700 dark:text-amber-300">Pick a model in Chat first. Agents and checks use the model that is active.</p>
          )}
        </div>

        <div className="flex gap-1 mb-5 p-1 rounded-xl bg-gray-100 dark:bg-white/[0.04] w-fit">
          {([['security', 'Security', ShieldCheck], ['agents', '24/7 Agents', Bot]] as const).map(([t, label, Icon]) => (
            <button
              key={t}
              onClick={() => { setTab(t); setEditing(null) }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[0.78rem] font-medium transition-colors ${tab === t
                ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {tab === 'security' && !editing && (
          <div className="mb-6">
            <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4">
              <div className="text-[0.85rem] font-semibold text-gray-900 dark:text-gray-100 mb-1">Ask about the security of this computer</div>
              <p className="text-[0.7rem] text-gray-500 mb-3">In your own words. The AI inspects this machine (it never changes anything) and tells you what is risky and how to fix it.</p>
              <div className="flex gap-2">
                <input
                  className={INPUT_CLASS}
                  value={question}
                  placeholder="e.g. Is my firewall on, and can anyone reach this PC from outside?"
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && question.trim() && !runningId) askSecurity(question, []) }}
                />
                <button
                  disabled={!question.trim() || runningId !== null}
                  onClick={() => askSecurity(question, [])}
                  className="lu-primary px-3 rounded-lg disabled:opacity-40 flex items-center"
                  aria-label="Ask"
                >
                  {runningId ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  disabled={runningId !== null}
                  onClick={() => askSecurity('', SECURITY_CHECKS.map((c) => c.id))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  <Sparkles size={13} /> Full security scan
                </button>
                {SECURITY_CHECKS.map((c) => {
                  const Icon = CHECK_ICONS[c.icon]
                  return (
                    <button
                      key={c.id}
                      disabled={runningId !== null}
                      title={c.description}
                      onClick={() => askSecurity('', [c.id])}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[0.7rem] border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-blue-500/50 disabled:opacity-40"
                    >
                      <Icon size={12} /> {c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'agents' && !editing && (
          <div className="mb-6">
            <div className="text-[0.75rem] font-semibold text-gray-700 dark:text-gray-300 mb-2">Start from an example</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {AGENT_TEMPLATES.map((t) => (
                <button
                  key={t.title}
                  onClick={() => setEditing({ id: null, form: { ...emptyForm('agent'), ...t.form } })}
                  className="flex items-start gap-2.5 text-left rounded-xl border border-gray-200 dark:border-white/10 hover:border-blue-500/50 px-3 py-2.5 bg-white dark:bg-white/[0.02]"
                >
                  <t.icon size={16} className="text-blue-500 mt-0.5 shrink-0" />
                  <span>
                    <span className="block text-[0.75rem] font-semibold text-gray-900 dark:text-gray-100">{t.title}</span>
                    <span className="block text-[0.66rem] text-gray-500">{t.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {editing ? (
          <div className="mb-6">
            <div className="text-[0.85rem] font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {editing.id ? 'Edit' : kind === 'security' ? 'New scheduled security check' : 'New agent'}
            </div>
            <AutomationForm
              key={editing.id ?? 'new'}
              initial={editing.form}
              submitLabel={editing.id ? 'Save' : 'Create'}
              onSubmit={save}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : (
          <button
            onClick={() => setEditing({ id: null, form: emptyForm(kind) })}
            className="mb-4 flex items-center gap-1.5 px-3 py-2 rounded-lg text-[0.75rem] border border-dashed border-gray-300 dark:border-white/15 text-gray-700 dark:text-gray-300 hover:border-blue-500/50 w-full justify-center"
          >
            <Plus size={14} /> {kind === 'security' ? 'Schedule a security check (e.g. every night)' : 'Build your own agent'}
          </button>
        )}

        <div className="space-y-2">
          {list.length === 0 ? (
            <p className="text-center text-[0.75rem] text-gray-500 py-6">
              {kind === 'security' ? 'No checks yet. Ask a question or run a full scan above.' : 'No agents yet. Pick an example or build your own.'}
            </p>
          ) : (
            list.map((a) => (
              <AutomationCard
                key={a.id}
                automation={a}
                onEdit={(id) => {
                  const found = automations.find((x) => x.id === id)
                  if (found) setEditing({ id, form: formFromAutomation(found) })
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
