import { useRef, useState } from 'react';
import { LogPanel } from './LogPanel';
import type { ReactNode } from 'react';

interface HeaderProps {
  tabCount: number;
  search: string;
  onSearchChange: (v: string) => void;
  onPurge: () => Promise<{ parked: number; groups: number; usedAI: boolean }>;
  onSnapshot: () => Promise<{ saved: number; groups: number; usedAI: boolean }>;
  onDownloadBackup: () => Promise<void>;
  onClearDuplicates: () => Promise<number>;
  onImport: (content: string) => Promise<{ tabs: number; groups: number }>;
  onCreateGroup: (label: string) => Promise<{ label: string }>;
  onClearVault: () => Promise<void>;
  onReorganizeWithAI: () => Promise<{ tabs: number; groups: number }>;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  hasApiKey: boolean;
}

// ── Tooltip with 1-second hover delay ────────────────────────────────────────

function Tip({ text, children }: { text: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    timer.current = setTimeout(() => setVisible(true), 1000);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  }

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 pointer-events-none">
          <div className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-2 shadow-xl max-w-[200px] text-center leading-snug whitespace-normal">
            {text}
          </div>
          <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-slate-700 border-l border-t border-slate-600 rotate-45" />
        </div>
      )}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

export function Header({
  tabCount, search, onSearchChange,
  onPurge, onSnapshot, onDownloadBackup, onClearDuplicates, onImport,
  onCreateGroup,
  onClearVault, onReorganizeWithAI, allExpanded, onToggleExpandAll,
  hasApiKey,
}: HeaderProps) {
  const [purgeState, setPurgeState] = useState<
    'idle' | 'confirm' | 'purging' | { parked: number; groups: number; usedAI: boolean }
  >('idle');
  const [snapState,    setSnapState]    = useState<'idle' | 'snapping' | { saved: number; groups: number }>('idle');
  const [downloading,  setDownloading]  = useState(false);
  const [dedupState,   setDedupState]   = useState<'idle' | 'running' | number>('idle');
  const [showLogs,     setShowLogs]     = useState(false);
  const [importState,  setImportState]  = useState<'idle' | 'reading' | { tabs: number; groups: number } | 'error'>('idle');
  const [folderState,  setFolderState]  = useState<'idle' | 'editing' | 'saving' | { label: string } | 'error'>('idle');
  const [folderName,   setFolderName]   = useState('');
  const [clearVaultState, setClearVaultState] = useState<'idle' | 'confirm' | 'clearing'>('idle');
  const [aiReorganizeState, setAiReorganizeState] = useState<
    'idle' | 'confirm' | 'running' | { tabs: number; groups: number }
  >('idle');
  const [actionError, setActionError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected
    e.target.value = '';

    setImportState('reading');
    try {
      const content = await file.text();
      const result  = await onImport(content);
      setImportState(result);
      setTimeout(() => setImportState('idle'), 5000);
    } catch {
      setImportState('error');
      setTimeout(() => setImportState('idle'), 4000);
    }
  }

  const importLabel = () => {
    if (importState === 'reading') return 'Importing…';
    if (importState === 'error')   return '⚠ Import failed';
    if (typeof importState === 'object') {
      const { tabs } = importState;
      return `✓ ${tabs} tab${tabs !== 1 ? 's' : ''} imported`;
    }
    return '📥 Import';
  };

  async function handleSnapshot() {
    if (snapState !== 'idle') return;
    setSnapState('snapping');
    setActionError('');
    try {
      const result = await onSnapshot();
      setSnapState(result);
      setTimeout(() => setSnapState('idle'), 4000);
    } catch (error) {
      setSnapState('idle');
      setActionError(errorMessage(error));
    }
  }

  async function handleDownloadBackup() {
    if (downloading) return;
    setDownloading(true);
    setActionError('');
    try {
      await onDownloadBackup();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setDownloading(false);
    }
  }

  async function handleClearDuplicates() {
    if (dedupState === 'running') return;
    setDedupState('running');
    setActionError('');
    try {
      const removed = await onClearDuplicates();
      setDedupState(removed);
      setTimeout(() => setDedupState('idle'), 4000);
    } catch (error) {
      setDedupState('idle');
      setActionError(errorMessage(error));
    }
  }

  async function handlePurge() {
    if (purgeState === 'idle')    { setPurgeState('confirm'); return; }
    if (purgeState === 'confirm') {
      setPurgeState('purging');
      setActionError('');
      try {
        const result = await onPurge();
        setPurgeState(result);
        setTimeout(() => setPurgeState('idle'), 4000);
      } catch (error) {
        setPurgeState('idle');
        setActionError(errorMessage(error));
      }
    }
  }

  async function handleCreateFolder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (folderState === 'saving') return;
    setFolderState('saving');
    try {
      const result = await onCreateGroup(folderName);
      setFolderName('');
      setFolderState({ label: result.label });
      setTimeout(() => setFolderState('idle'), 3500);
    } catch {
      setFolderState('error');
      setTimeout(() => setFolderState('editing'), 2500);
    }
  }

  async function handleClearVault() {
    if (clearVaultState === 'idle') {
      setClearVaultState('confirm');
      return;
    }
    if (clearVaultState !== 'confirm') return;
    setClearVaultState('clearing');
    setActionError('');
    try {
      await onClearVault();
      setClearVaultState('idle');
    } catch (error) {
      setClearVaultState('idle');
      setActionError(errorMessage(error));
    }
  }

  async function handleReorganizeWithAI() {
    if (aiReorganizeState === 'idle') {
      setAiReorganizeState('confirm');
      return;
    }
    if (aiReorganizeState !== 'confirm') return;
    setAiReorganizeState('running');
    setActionError('');
    try {
      const result = await onReorganizeWithAI();
      setAiReorganizeState(result);
      setTimeout(() => setAiReorganizeState('idle'), 5000);
    } catch (error) {
      setAiReorganizeState('idle');
      setActionError(errorMessage(error));
    }
  }

  const snapLabel  = () => {
    if (snapState === 'snapping')      return 'Saving…';
    if (typeof snapState === 'object') return `✓ ${snapState.saved} tabs saved`;
    return '📸 Snapshot';
  };
  const purgeLabel = () => {
    if (purgeState === 'confirm')        return '⚠️ Confirm purge?';
    if (purgeState === 'purging')        return 'Purging…';
    if (typeof purgeState === 'object')  return `✓ ${purgeState.parked} tabs archived`;
    return hasApiKey ? '🤖 Purge all tabs' : '🧹 Purge all tabs';
  };

  const btnBase = 'text-sm font-medium px-3 py-1.5 rounded-lg border transition whitespace-nowrap disabled:opacity-50';

  return (
    <>
      <header className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur border-b border-slate-800 px-6 py-3">
        <div className="max-w-screen-2xl mx-auto flex flex-col gap-2">

          {/* Row 1: logo + search + count */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-2xl">🗄️</span>
              <h1 className="text-xl font-bold text-white tracking-tight">TabVault</h1>
            </div>

            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">🔍</span>
              <input
                type="text"
                placeholder="Search archived tabs…"
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
              {search && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm transition"
                >✕</button>
              )}
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-400 shrink-0">
              <span className="bg-indigo-600 text-white px-2.5 py-1 rounded-full font-medium text-xs tabular-nums">
                {tabCount}
              </span>
              <span>archived</span>
            </div>
          </div>

          {/* Hidden file input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,text/markdown,text/plain"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Row 2: action buttons */}
          <div className="flex items-center gap-2 flex-wrap">

            {folderState === 'editing' || folderState === 'saving' ? (
              <form
                onSubmit={handleCreateFolder}
                className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1"
              >
                <input
                  autoFocus
                  value={folderName}
                  onChange={e => setFolderName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setFolderName('');
                      setFolderState('idle');
                    }
                  }}
                  placeholder="Folder name"
                  disabled={folderState === 'saving'}
                  className="w-36 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={folderState === 'saving'}
                  className="text-xs font-medium text-indigo-300 hover:text-indigo-200 disabled:opacity-50 transition"
                >
                  {folderState === 'saving' ? 'Creating…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => { setFolderName(''); setFolderState('idle'); }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <Tip text="Create an empty folder so you can manually organize archived tabs.">
                <button
                  onClick={() => setFolderState('editing')}
                  className={`${btnBase} ${
                    typeof folderState === 'object'
                      ? 'bg-emerald-900/30 border-emerald-700/60 text-emerald-300'
                      : folderState === 'error'
                      ? 'bg-red-900/30 border-red-700/60 text-red-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-indigo-600 hover:text-indigo-300'
                  }`}
                >
                  {typeof folderState === 'object'
                    ? `✓ ${folderState.label}`
                    : folderState === 'error'
                    ? '⚠ Folder failed'
                    : '📁 New Folder'}
                </button>
              </Tip>
            )}

            <Tip text={allExpanded ? 'Collapse all groups' : 'Expand all groups for full link visibility'}>
              <button
                onClick={onToggleExpandAll}
                className={`${btnBase} bg-slate-800 border-slate-700 text-slate-300 hover:border-indigo-500 hover:text-indigo-300`}
              >
                {allExpanded ? '⊟ Collapse All' : '⊞ Expand All'}
              </button>
            </Tip>

            <Tip text="Captures all currently open tabs and saves them to the Vault without closing them.">
              <button
                onClick={handleSnapshot}
                disabled={snapState === 'snapping'}
                className={`${btnBase} ${
                  typeof snapState === 'object'
                    ? 'bg-emerald-900/30 border-emerald-700/60 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-teal-600 hover:text-teal-300'
                }`}
              >
                {snapLabel()}
              </button>
            </Tip>

            <Tip text="Downloads a tabvault-backup.md file to your Downloads folder with all archived tabs.">
              <button
                onClick={handleDownloadBackup}
                disabled={downloading}
                className={`${btnBase} bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200`}
              >
                {downloading ? 'Saving…' : '⬇ Backup'}
              </button>
            </Tip>

            <Tip text="Import a tabvault-backup.md file. Tabs are added to matching groups or new ones. Run 'Clear dupes' after if needed.">
              <button
                onClick={handleImportClick}
                disabled={importState === 'reading'}
                className={`${btnBase} ${
                  importState === 'error'
                    ? 'bg-red-900/30 border-red-700/60 text-red-300'
                    : typeof importState === 'object'
                    ? 'bg-emerald-900/30 border-emerald-700/60 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                {importLabel()}
              </button>
            </Tip>

            <Tip text="Scans for duplicate URLs across all groups and removes extras. Group order determines which copy is kept.">
              <button
                onClick={handleClearDuplicates}
                disabled={dedupState === 'running'}
                className={`${btnBase} ${
                  typeof dedupState === 'number'
                    ? dedupState > 0
                      ? 'bg-emerald-900/30 border-emerald-700/60 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                {dedupState === 'running'
                  ? 'Scanning…'
                  : typeof dedupState === 'number'
                  ? dedupState > 0 ? `✓ Removed ${dedupState} dupe${dedupState !== 1 ? 's' : ''}` : '✓ No dupes found'
                  : '🗂 Clear dupes'}
              </button>
            </Tip>

            <Tip text="Parks all currently open browser tabs into the Vault and closes them. Requires confirmation.">
              <button
                onClick={handlePurge}
                disabled={purgeState === 'purging'}
                onMouseLeave={() => { if (purgeState === 'confirm') setPurgeState('idle'); }}
                className={`${btnBase} ${
                  purgeState === 'confirm'
                    ? 'bg-orange-900/30 border-orange-600/60 text-orange-300'
                    : typeof purgeState === 'object'
                    ? 'bg-emerald-900/30 border-emerald-700/60 text-emerald-300'
                    : hasApiKey
                    ? 'bg-violet-900/20 border-violet-700/50 text-violet-300 hover:bg-violet-900/40'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                {purgeLabel()}
              </button>
            </Tip>

            <Tip text={hasApiKey
              ? 'Sends all saved tab titles and URLs to your connected AI provider, then reorganizes the vault. You can undo the result.'
              : 'Add an Anthropic or OpenAI API key in Settings to enable AI reorganization.'}
            >
              <button
                onClick={handleReorganizeWithAI}
                disabled={!hasApiKey || tabCount === 0 || aiReorganizeState === 'running'}
                onMouseLeave={() => { if (aiReorganizeState === 'confirm') setAiReorganizeState('idle'); }}
                className={`${btnBase} ${
                  aiReorganizeState === 'confirm'
                    ? 'bg-violet-900/50 border-violet-500 text-violet-200'
                    : typeof aiReorganizeState === 'object'
                    ? 'bg-emerald-900/30 border-emerald-700/60 text-emerald-300'
                    : 'bg-violet-900/20 border-violet-700/50 text-violet-300 hover:bg-violet-900/40'
                }`}
              >
                {aiReorganizeState === 'confirm'
                  ? '⚠ Confirm AI reorganization?'
                  : aiReorganizeState === 'running'
                  ? 'AI is reorganizing…'
                  : typeof aiReorganizeState === 'object'
                  ? `✓ Organized into ${aiReorganizeState.groups} groups`
                  : '🤖 Reorganize with AI'}
              </button>
            </Tip>

            <Tip text="Permanently remove every archived tab and folder. You can undo this from the confirmation toast.">
              <button
                onClick={handleClearVault}
                disabled={clearVaultState === 'clearing' || tabCount === 0}
                onMouseLeave={() => { if (clearVaultState === 'confirm') setClearVaultState('idle'); }}
                className={`${btnBase} ${
                  clearVaultState === 'confirm'
                    ? 'bg-red-900/40 border-red-600/70 text-red-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-red-600/60 hover:text-red-400'
                }`}
              >
                {clearVaultState === 'confirm'
                  ? '⚠️ Confirm clear?'
                  : clearVaultState === 'clearing'
                  ? 'Clearing…'
                  : '🗑 Clear Vault'}
              </button>
            </Tip>

            <Tip text="View a history of Vault activity: backups, purges, deletions, moves, and dismissed alerts.">
              <button
                onClick={() => setShowLogs(true)}
                className={`${btnBase} bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200`}
              >
                📋 Logs
              </button>
            </Tip>

          </div>
          {actionError && (
            <div role="alert" className="text-xs text-red-300 bg-red-950/50 border border-red-900/60 rounded-lg px-3 py-2">
              {actionError}
            </div>
          )}
        </div>
      </header>

      <LogPanel open={showLogs} onClose={() => setShowLogs(false)} />
    </>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'TabVault action failed';
}
