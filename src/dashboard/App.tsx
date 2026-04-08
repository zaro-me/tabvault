import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { AssistantBanner } from './components/AssistantBanner';
import { GroupList } from './components/GroupList';
import { UndoToast } from './components/UndoToast';
import { useVault } from './hooks/useVault';
import { getSettings, getDismissedAlerts, saveDismissedAlerts, appendLog } from '@/shared/storage';

export default function App() {
  const {
    state, restoreTab, deleteTabPermanently,
    renameGroup, deleteGroupWithTabs, restoreGroup,
    moveTab, reorderGroups, mergeGroups,
    purgeAll, snapshotAll, downloadBackup,
    setGroupColor, clearDuplicates, importTabs,
    undoEntry, performUndo, clearUndo,
  } = useVault();

  const [search,           setSearch]           = useState('');
  const [hasApiKey,        setHasApiKey]        = useState(false);
  const [dismissedAlerts,  setDismissedAlerts]  = useState<string[]>([]);

  useEffect(() => {
    getSettings().then(s => setHasApiKey(!!s.anthropicApiKey?.trim()));
    getDismissedAlerts().then(setDismissedAlerts);
  }, []);

  const handleDismissAlert = useCallback(async (key: string, text: string) => {
    const next = [...dismissedAlerts, key];
    setDismissedAlerts(next);
    await saveDismissedAlerts(next);
    appendLog({ type: 'alert_dismissed', message: `Dismissed alert: ${text}`, timestamp: Date.now() }).catch(() => {});
  }, [dismissedAlerts]);

  const visibleGroups = useMemo(() => {
    if (!search.trim()) return state.groups;
    const q = search.toLowerCase();
    return state.groups
      .map(g => ({ ...g, tabs: g.tabs.filter(t => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)) }))
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
      {!hasSearch && <p className="text-sm">Idle tabs will appear here automatically.</p>}
    </div>
  );
}
