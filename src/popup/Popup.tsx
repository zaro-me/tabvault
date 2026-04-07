import { useEffect, useState } from 'react';

interface Status {
  tabs: number;
  entries: number;
  graceTabs: number;
  settings: { idleThresholdMs: number; gracePeriodMs: number };
}

export default function Popup() {
  const [status, setStatus]       = useState<Status | null>(null);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [pinned, setPinned]       = useState(false);
  const [parking, setParking]     = useState(false);
  const [purgeStage, setPurgeStage]   = useState<'idle' | 'confirm' | 'purging'>('idle');
  const [snapStage, setSnapStage]     = useState<'idle' | 'snapping'>('idle');

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res: Status) => setStatus(res));
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) setCurrentTab(tab);
    });
  }, []);

  function parkNow() {
    if (!currentTab?.id) return;
    setParking(true);
    chrome.runtime.sendMessage({ type: 'PARK_TAB', tabId: currentTab.id }, () => window.close());
  }

  function togglePin() {
    if (!currentTab?.id) return;
    const next = !pinned;
    chrome.runtime.sendMessage({ type: 'SET_PINNED', tabId: currentTab.id, pinned: next }, () => setPinned(next));
  }

  function openDashboard() {
    chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
    window.close();
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
    window.close();
  }

  function handlePurge() {
    if (purgeStage === 'idle') { setPurgeStage('confirm'); return; }
    if (purgeStage === 'confirm') {
      setPurgeStage('purging');
      chrome.runtime.sendMessage({ type: 'PURGE_ALL' }, () => window.close());
    }
  }

  function handleSnapshot() {
    if (snapStage !== 'idle') return;
    setSnapStage('snapping');
    chrome.runtime.sendMessage({ type: 'SNAPSHOT_ALL' }, () => window.close());
  }

  const idleHours = status ? (status.settings.idleThresholdMs / 3_600_000).toFixed(1).replace('.0', '') : '2';
  const graceMin  = status ? Math.round(status.settings.gracePeriodMs / 60_000) : 15;

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🗄️</span>
          <span className="font-bold text-base tracking-tight">TabVault</span>
        </div>
        <button onClick={openOptions} className="text-slate-500 hover:text-slate-300 text-xs transition">
          ⚙️ Settings
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard value={status?.entries ?? '…'} label="tracked" color="text-indigo-400" />
        <StatCard value={status?.tabs ?? '…'}    label="open"    color="text-emerald-400" />
      </div>

      {/* Grace period warning */}
      {(status?.graceTabs ?? 0) > 0 && (
        <div className="bg-amber-950/50 border border-amber-800/50 rounded-lg px-3 py-2 text-xs text-amber-300">
          ⏳ {status!.graceTabs} tab{status!.graceTabs > 1 ? 's' : ''} in grace — will archive soon
        </div>
      )}

      {/* Current tab actions */}
      <div className="flex flex-col gap-2">
        <button
          onClick={parkNow}
          disabled={parking || !currentTab}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg py-2.5 transition"
        >
          {parking ? 'Archiving…' : '🗄️ Archive this tab now'}
        </button>

        <button
          onClick={togglePin}
          disabled={!currentTab}
          className={`w-full text-sm font-medium rounded-lg py-2 transition border disabled:opacity-40 ${
            pinned
              ? 'border-amber-600/60 text-amber-400 hover:bg-amber-900/20'
              : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
          }`}
        >
          {pinned ? '📌 Unpin this tab' : '📌 Pin — never archive'}
        </button>

        <button
          onClick={handleSnapshot}
          disabled={snapStage === 'snapping'}
          className="w-full text-sm font-medium rounded-lg py-2 transition border disabled:opacity-40 border-slate-700 text-slate-400 hover:border-teal-600 hover:text-teal-300"
        >
          {snapStage === 'snapping' ? 'Saving…' : '📸 Snapshot all to vault'}
        </button>

        <button
          onClick={handlePurge}
          disabled={purgeStage === 'purging'}
          onMouseLeave={() => { if (purgeStage === 'confirm') setPurgeStage('idle'); }}
          className={`w-full text-sm font-medium rounded-lg py-2 transition border disabled:opacity-40 ${
            purgeStage === 'confirm'
              ? 'border-orange-600/60 text-orange-300 bg-orange-900/20'
              : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
          }`}
        >
          {purgeStage === 'confirm' ? '⚠️ Confirm — purge all tabs?' : purgeStage === 'purging' ? 'Purging…' : '🧹 Purge all to vault'}
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-800">
        <span className="text-[11px] text-slate-600">
          Idle {idleHours}h · Grace {graceMin}m
        </span>
        <button
          onClick={openDashboard}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition"
        >
          Open Vault →
        </button>
      </div>
    </div>
  );
}

function StatCard({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div className="bg-slate-800 rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">tabs {label}</div>
    </div>
  );
}
