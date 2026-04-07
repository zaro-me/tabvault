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
  onRestoreGroup: (groupId: string) => void;
  onMoveTab: (tabId: string, fromGroupId: string, toGroupId: string, newLabel?: string) => void;
  onSetGroupColor: (groupId: string, color: string) => void;
  onReorderGroups: (newOrder: string[]) => void;
}

export function GroupList({
  groups, allGroups,
  onRestoreTab, onDeleteTab,
  onRenameGroup, onDeleteGroup, onRestoreGroup,
  onMoveTab, onSetGroupColor, onReorderGroups,
}: Props) {
  function handleGroupDrop(targetGroupId: string) {
    const draggedId = activeGroupDrag.current;
    if (!draggedId || draggedId === targetGroupId) return;

    // Build new order: insert dragged group before the target
    const currentOrder = groups.map(g => g.id);
    const fromIdx = currentOrder.indexOf(draggedId);
    const toIdx   = currentOrder.indexOf(targetGroupId);
    if (fromIdx === -1 || toIdx === -1) return;

    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    const insertAt = newOrder.indexOf(targetGroupId);
    newOrder.splice(insertAt, 0, draggedId);

    onReorderGroups(newOrder);
  }

  return (
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
          />
        </div>
      ))}
    </div>
  );
}
