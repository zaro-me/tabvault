import { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '@/shared/storage';
import { DEFAULT_SETTINGS, type VaultSettings } from '@/shared/types';
import { AI_PROVIDER_LABEL, detectAIProvider } from '@/shared/ai-provider';
import { normalizeDomain } from '@/shared/url';

export default function Options() {
  const [settings, setSettings]           = useState<VaultSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved]             = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [showKey, setShowKey]         = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  async function handleSave() {
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addDomain() {
    const domain = normalizeDomain(domainInput);
    if (!domain || settings.ignoredDomains.includes(domain)) return;
    setSettings(s => ({ ...s, ignoredDomains: [...s.ignoredDomains, domain] }));
    setDomainInput('');
  }

  function removeDomain(d: string) {
    setSettings(s => ({ ...s, ignoredDomains: s.ignoredDomains.filter(x => x !== d) }));
  }

  const idleHours = settings.idleThresholdMs / 3_600_000;
  const graceMin  = settings.gracePeriodMs  / 60_000;
  const trimmedApiKey = settings.llmApiKey?.trim() ?? '';
  const detectedProvider = detectAIProvider(trimmedApiKey);

  return (
    <div className="max-w-xl mx-auto py-12 px-6">
      <div className="flex items-center gap-3 mb-8">
        <span className="text-3xl">🗄️</span>
        <h1 className="text-2xl font-bold">TabVault Settings</h1>
      </div>

      <div className="flex flex-col gap-5">
        {/* Notifications */}
        <SettingCard
          label="Archiving mode"
          hint="Silent mode archives tabs immediately when idle (default). Notification mode shows a countdown and lets you cancel before a tab is closed."
        >
          <div className="flex gap-3">
            {([
              { value: false, label: 'Silent (default)', desc: 'Archive tabs quietly in the background' },
              { value: true,  label: 'Notify me',        desc: 'Show a countdown before archiving' },
            ] as const).map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => setSettings(s => ({ ...s, notificationsEnabled: opt.value }))}
                className={`flex-1 py-2 px-3 rounded-lg text-left text-sm border transition ${
                  settings.notificationsEnabled === opt.value
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="text-xs mt-0.5 opacity-70">{opt.desc}</div>
              </button>
            ))}
          </div>
        </SettingCard>

        {/* AI / Purge */}
        <SettingCard
          label="LLM API Key"
          hint={<>Powers AI grouping for Snapshot and Purge. Paste an Anthropic key or OpenAI key; TabVault detects the provider from the key format. Leave blank to use built-in TF-IDF grouping.</>}
        >
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              placeholder="sk-ant-... or sk-proj-..."
              value={settings.llmApiKey ?? ''}
              onChange={e => setSettings(s => ({ ...s, llmApiKey: e.target.value, anthropicApiKey: undefined }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-sm font-mono focus:outline-none focus:border-indigo-500 transition"
            />
            <button
              onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs transition"
            >
              {showKey ? 'hide' : 'show'}
            </button>
          </div>
          <p className={`mt-2 text-xs ${
            !trimmedApiKey
              ? 'text-slate-500'
              : detectedProvider
              ? 'text-emerald-400'
              : 'text-red-400'
          }`}>
            {!trimmedApiKey
              ? 'No AI provider configured.'
              : detectedProvider
              ? `Detected provider: ${AI_PROVIDER_LABEL[detectedProvider]}.`
              : 'Unrecognized key format. Use an Anthropic sk-ant- key or an OpenAI sk- key.'}
          </p>
          <p className="mt-2 text-xs text-amber-500/80 flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5">⚠️</span>
            <span>This key is stored locally in plaintext in your browser profile. Set a provider-side spending cap to limit exposure.</span>
          </p>
        </SettingCard>

        {/* Idle threshold */}
        <SettingCard
          label={<>Idle threshold: <span className="text-indigo-400">{idleHours}h</span></>}
          hint="How long a tab must be inactive before the grace-period countdown begins."
        >
          <input
            type="range" min={0.5} max={24} step={0.5} value={idleHours}
            onChange={e => setSettings(s => ({ ...s, idleThresholdMs: parseFloat(e.target.value) * 3_600_000 }))}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-1"><span>30 min</span><span>24 h</span></div>
        </SettingCard>

        {/* Grace period */}
        <SettingCard
          label={<>Grace period: <span className="text-indigo-400">{graceMin} min</span></>}
          hint="Time between the notification and the tab actually being archived."
        >
          <input
            type="range" min={1} max={60} step={1} value={graceMin}
            onChange={e => setSettings(s => ({ ...s, gracePeriodMs: parseInt(e.target.value) * 60_000 }))}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-1"><span>1 min</span><span>60 min</span></div>
        </SettingCard>

        {/* Grouping sensitivity */}
        <SettingCard
          label="Grouping sensitivity"
          hint="Controls how loosely topics are clustered. Only applies when not using AI grouping."
        >
          <div className="flex gap-3">
            {(['low', 'medium', 'high'] as const).map(level => (
              <button
                key={level}
                onClick={() => setSettings(s => ({ ...s, groupingSensitivity: level }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition capitalize ${
                  settings.groupingSensitivity === level
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </SettingCard>

        {/* Ignored domains */}
        <SettingCard
          label="Ignored domains"
          hint="Tabs on these domains will never be monitored or archived."
        >
          <div className="flex gap-2 mb-3">
            <input
              type="text" placeholder="github.com" value={domainInput}
              onChange={e => setDomainInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDomain()}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition"
            />
            <button onClick={addDomain} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition">Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {settings.ignoredDomains.map(d => (
              <span key={d} className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full px-3 py-1 text-xs text-slate-300">
                {d}
                <button onClick={() => removeDomain(d)} className="text-slate-500 hover:text-red-400 transition">✕</button>
              </span>
            ))}
            {settings.ignoredDomains.length === 0 && <span className="text-xs text-slate-600">None.</span>}
          </div>
        </SettingCard>

        <button
          onClick={handleSave}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition ${saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
        >
          {saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

function SettingCard({ label, hint, children }: {
  label: React.ReactNode;
  hint: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
      <p className="text-sm font-semibold text-slate-200 mb-0.5">{label}</p>
      <p className="text-xs text-slate-500 mb-3">{hint}</p>
      {children}
    </div>
  );
}
