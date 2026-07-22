import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header';
import { AssistantBanner } from './components/AssistantBanner';
import { GroupList } from './components/GroupList';
import { UndoToast } from './components/UndoToast';
import { useVault } from './hooks/useVault';
import { getSettings, getDismissedAlerts, saveDismissedAlerts, appendLog } from '@/shared/storage';
import { detectAIProvider } from '@/shared/ai-provider';

export default function App() {
  const {
    state, restoreTab, deleteTabPermanently,
    renameGroup, deleteGroupWithTabs, restoreGroup,
    moveTab, reorderGroups, mergeGroups,
    createGroup,
    purgeAll, snapshotAll, downloadBackup, reorganizeWithAI,
    setGroupColor, clearDuplicates, importTabs,
    clearVault,
    expandGroupSignal,
    undoEntry, performUndo, clearUndo,
  } = useVault();

  const [search,           setSearch]           = useState('');
  const [hasApiKey,        setHasApiKey]        = useState(false);
  const [dismissedAlerts,  setDismissedAlerts]  = useState<string[]>([]);
  const [allExpanded,              setAllExpanded]              = useState(false);
  const [expandSignal,             setExpandSignal]             = useState(0);
  const [collapseSignal,           setCollapseSignal]           = useState(0);
  const [perGroupExpandTriggers,   setPerGroupExpandTriggers]   = useState<Record<string, number>>({});

  // Expand the specific group that just received a new tab
  useEffect(() => {
    if (!expandGroupSignal) return;
    setPerGroupExpandTriggers(prev => ({
      ...prev,
      [expandGroupSignal.groupId]: expandGroupSignal.seq,
    }));
  }, [expandGroupSignal]);

  // Auto-expand groups when search becomes active; auto-collapse when cleared
  const prevSearchRef = useRef('');
  useEffect(() => {
    const prev = prevSearchRef.current;
    prevSearchRef.current = search;
    const wasSearching = !!prev.trim();
    const isSearching  = !!search.trim();
    if (!wasSearching && isSearching) setExpandSignal(s => s + 1);
    if (wasSearching  && !isSearching) setCollapseSignal(s => s + 1);
  }, [search]);

  const handleToggleExpandAll = useCallback(() => {
    if (allExpanded) {
      setCollapseSignal(s => s + 1);
      setAllExpanded(false);
    } else {
      setExpandSignal(s => s + 1);
      setAllExpanded(true);
    }
  }, [allExpanded]);

  useEffect(() => {
    const refreshApiKey = () => getSettings().then(s => setHasApiKey(!!detectAIProvider(s.llmApiKey)));
    refreshApiKey();
    getDismissedAlerts().then(setDismissedAlerts);
    const onStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local' && changes.settings) refreshApiKey();
    };
    chrome.storage.onChanged.addListener(onStorageChanged);
    return () => chrome.storage.onChanged.removeListener(onStorageChanged);
  }, []);

  const handleDismissAlert = useCallback((key: string, text: string) => {
    setDismissedAlerts(current => {
      const next = current.includes(key) ? current : [...current, key];
      saveDismissedAlerts(next).catch(() => {});
      return next;
    });
    appendLog({ type: 'alert_dismissed', message: `Dismissed alert: ${text}`, timestamp: Date.now() }).catch(() => {});
  }, []);

  const visibleGroups = useMemo(() => {
    if (!search.trim()) return state.groups;
    const q = search.trim().toLowerCase();
    return state.groups
      .map(g => ({
        ...g,
        tabs: g.label.toLowerCase().includes(q)
          ? g.tabs
          : g.tabs.filter(t => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)),
      }))
      .filter(g => g.tabs.length > 0);
  }, [state.groups, search]);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400 text-lg animate-pulse">Loading vault…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        tabCount={state.totalTabs}
        search={search}
        onSearchChange={setSearch}
        onPurge={purgeAll}
        onSnapshot={snapshotAll}
        onDownloadBackup={downloadBackup}
        onClearDuplicates={clearDuplicates}
        onImport={importTabs}
        onCreateGroup={createGroup}
        onClearVault={clearVault}
        onReorganizeWithAI={reorganizeWithAI}
        allExpanded={allExpanded}
        onToggleExpandAll={handleToggleExpandAll}
        hasApiKey={hasApiKey}
      />
      <main className="flex-1 p-6 max-w-screen-2xl mx-auto w-full">
        <AssistantBanner
          groups={state.groups}
          dismissedAlerts={dismissedAlerts}
          onDismiss={handleDismissAlert}
        />
        {visibleGroups.length === 0 ? (
          <EmptyState hasSearch={!!search.trim()} />
        ) : (
          <GroupList
            groups={visibleGroups}
            allGroups={state.groups}
            onRestoreTab={restoreTab}
            onDeleteTab={deleteTabPermanently}
            onRenameGroup={renameGroup}
            onDeleteGroup={deleteGroupWithTabs}
            onRestoreGroup={restoreGroup}
            onMoveTab={moveTab}
            onSetGroupColor={setGroupColor}
            onReorderGroups={reorderGroups}
            onMergeGroups={mergeGroups}
            expandSignal={expandSignal}
            collapseSignal={collapseSignal}
            perGroupExpandTriggers={perGroupExpandTriggers}
          />
        )}
      </main>

      {undoEntry && (
        <UndoToast
          entry={undoEntry}
          onUndo={performUndo}
          onDismiss={clearUndo}
        />
      )}
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-slate-500 gap-3">
      <span className="text-5xl">🗄️</span>
      <p className="text-xl font-medium">
        {hasSearch ? 'No tabs match your search.' : 'Your vault is empty.'}
      </p>
      {!hasSearch && <p className="text-sm">Archive tabs manually, or enable automatic idle archiving in Settings.</p>}
    </div>
  );
}
