import { useState } from 'react';
import type { GroupView, StoredTab } from '@/shared/types';
import { GroupColumn } from './GroupColumn';
import { activeGroupDrag } from '../dragState';

interface Props {
  groups: GroupView[];
  allGroups: GroupView[];
  onRestoreTab: (tab: StoredTab) => void;
  onDeleteTab: (tabId: string, groupId: string) => void;
  onRenameGroup: (groupId: string, label: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onRestoreGroup: (groupId: string) => Promise<void>;
  onMoveTab: (tabId: string, fromGroupId: string, toGroupId: string, newLabel?: string) => void;
  onSetGroupColor: (groupId: string, color: string) => void;
  onReorderGroups: (newOrder: string[]) => void;
  onMergeGroups: (sourceGroupId: string, targetGroupId: string) => void;
  expandSignal: number;
  collapseSignal: number;
  perGroupExpandTriggers: Record<string, number>;
}

export function GroupList({
  groups, allGroups,
  onRestoreTab, onDeleteTab,
  onRenameGroup, onDeleteGroup, onRestoreGroup,
  onMoveTab, onSetGroupColor, onReorderGroups, onMergeGroups,
  expandSignal, collapseSignal, perGroupExpandTriggers,
}: Props) {
  const [pendingMerge, setPendingMerge] = useState<{ sourceId: string; targetId: string } | null>(null);

  function handleGroupDrop(targetGroupId: string, action: 'before' | 'after' | 'merge') {
    const draggedId = activeGroupDrag.current;
    if (!draggedId || draggedId === targetGroupId) return;

    if (action === 'merge') {
      setPendingMerge({ sourceId: draggedId, targetId: targetGroupId });
      return;
    }

    // Build new order: insert dragged group before or after the target
    const currentOrder = allGroups.map(g => g.id);
    const fromIdx = currentOrder.indexOf(draggedId);
    const toIdx   = currentOrder.indexOf(targetGroupId);
    if (fromIdx === -1 || toIdx === -1) return;

    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    const insertAt = newOrder.indexOf(targetGroupId) + (action === 'after' ? 1 : 0);
    newOrder.splice(insertAt, 0, draggedId);

    onReorderGroups(newOrder);
  }

  const sourceGroup = pendingMerge ? allGroups.find(g => g.id === pendingMerge.sourceId) : null;
  const targetGroup = pendingMerge ? allGroups.find(g => g.id === pendingMerge.targetId) : null;

  return (
    <>
      <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
        {groups.map(group => (
          <div key={group.id} className="break-inside-avoid mb-4">
            <GroupColumn
              group={group}
              allGroups={allGroups}
              onRestoreTab={onRestoreTab}
              onDeleteTab={onDeleteTab}
              onRename={label => onRenameGroup(group.id, label)}
              onDelete={() => onDeleteGroup(group.id)}
              onRestoreAll={() => onRestoreGroup(group.id)}
              onMoveTab={onMoveTab}
              onSetColor={color => onSetGroupColor(group.id, color)}
              onGroupDrop={handleGroupDrop}
              expandSignal={expandSignal}
              collapseSignal={collapseSignal}
              autoExpandTrigger={perGroupExpandTriggers[group.id] ?? 0}
            />
          </div>
        ))}
      </div>

      {/* Merge confirmation modal */}
      {pendingMerge && sourceGroup && targetGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4">
            <p className="text-slate-100 text-sm mb-1 font-semibold">Merge groups?</p>
            <p className="text-slate-400 text-sm mb-5">
              All {sourceGroup.tabs.length} tab{sourceGroup.tabs.length !== 1 ? 's' : ''} from{' '}
              <span className="text-slate-200 font-medium">"{sourceGroup.label}"</span> will be moved into{' '}
              <span className="text-slate-200 font-medium">"{targetGroup.label}"</span>.
              The source group will be deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPendingMerge(null)}
                className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition rounded-lg hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onMergeGroups(pendingMerge.sourceId, pendingMerge.targetId);
                  setPendingMerge(null);
                }}
                className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition rounded-lg"
              >
                Merge
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
