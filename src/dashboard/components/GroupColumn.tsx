import { useMemo, useRef, useState } from 'react';
import { GROUP_COLORS } from '@/shared/types';
import type { GroupView, StoredTab } from '@/shared/types';
import { TabCard } from './TabCard';
import { activeDrag, activeGroupDrag } from '../dragState';

export type GroupDropAction = 'before' | 'after' | 'merge';

interface Props {
  group: GroupView;
  allGroups: GroupView[];
  onRestoreTab: (tab: StoredTab) => void;
  onDeleteTab: (tabId: string, groupId: string) => void;
  onRename: (label: string) => void;
  onDelete: () => void;
  onRestoreAll: () => void;
  onMoveTab: (tabId: string, fromGroupId: string, toGroupId: string, newLabel?: string) => void;
  onSetColor: (color: string) => void;
  onGroupDrop: (targetGroupId: string, action: GroupDropAction) => void;
}

export function GroupColumn({
  group, allGroups,
  onRestoreTab, onDeleteTab,
  onRename, onDelete, onRestoreAll,
  onMoveTab, onSetColor, onGroupDrop,
}: Props) {
  const [collapsed, setCollapsed]            = useState(true);
  const [editing, setEditing]                = useState(false);
  const [labelInput, setLabelInput]          = useState(group.label);
  const [showMenu, setShowMenu]              = useState(false);
  const [showColors, setShowColors]          = useState(false);
  const [confirmDelete, setConfirmDelete]    = useState(false);
  const [isDragOver, setIsDragOver]          = useState(false);
  const [groupDropAction, setGroupDropAction] = useState<GroupDropAction | null>(null);
  // Ref mirrors groupDropAction so handleDrop always reads the current value,
  // not the stale one captured in the React closure.
  const groupDropActionRef = useRef<GroupDropAction | null>(null);

  // ── Shared drag enter / leave ───────────────────────────────────────────────
  // Using e.relatedTarget containment instead of a counter to avoid false
  // clears when the pointer moves between child elements.

  function handleDragEnter() {
    if (activeDrag.current) setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    // Ignore if mouse is still inside the drop zone (moved to a child element)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;

    if (activeDrag.current) setIsDragOver(false);

    if (activeGroupDrag.current && activeGroupDrag.current !== group.id) {
      groupDropActionRef.current = null;
      setGroupDropAction(null);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    if (activeDrag.current) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      return;
    }

    if (activeGroupDrag.current && activeGroupDrag.current !== group.id) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      // Determine drop zone from mouse Y relative to this element
      const rect   = e.currentTarget.getBoundingClientRect();
      const pct    = (e.clientY - rect.top) / rect.height;
      const action: GroupDropAction = pct < 0.33 ? 'before' : pct > 0.67 ? 'after' : 'merge';
      groupDropActionRef.current = action;   // always current for handleDrop
      setGroupDropAction(action);            // drives the visual indicator
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();

    if (activeDrag.current) {
      setIsDragOver(false);
      const drag = activeDrag.current;
      if (drag.fromGroupId !== group.id) onMoveTab(drag.tabId, drag.fromGroupId, group.id);
      return;
    }

    if (activeGroupDrag.current && activeGroupDrag.current !== group.id) {
      const action = groupDropActionRef.current ?? 'before';
      groupDropActionRef.current = null;
      setGroupDropAction(null);
      onGroupDrop(group.id, action);
    }
  }

  // ── Group drag handle ───────────────────────────────────────────────────────
  function handleGroupDragStart(e: React.DragEvent) {
    activeGroupDrag.current = group.id;
    e.dataTransfer.setData('text/plain', group.id); // required by Firefox
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleGroupDragEnd() {
    activeGroupDrag.current = null;
    groupDropActionRef.current = null;
    setGroupDropAction(null);
  }

  function submitRename() {
    const trimmed = labelInput.trim();
    if (trimmed && trimmed !== group.label) onRename(trimmed);
    else setLabelInput(group.label);
    setEditing(false);
  }

  const sortedTabs = useMemo(
    () => group.tabs.slice().sort((a, b) => b.parkedAt - a.parkedAt),
    [group.tabs],
  );

  const colorBar = GROUP_COLORS.find(c => c.id === (group.color ?? 'none'))?.bar ?? '';

  const cardStyle = groupDropAction === 'merge'
    ? 'border-orange-400 ring-2 ring-orange-400/40 scale-[1.01]'
    : isDragOver
    ? 'border-indigo-500 ring-1 ring-indigo-500/50'
    : 'border-slate-800';

  return (
    <div className="relative">
      {/* Insert-before drop line */}
      {groupDropAction === 'before' && (
        <div
          className="absolute -top-2 inset-x-0 h-0.5 rounded-full bg-indigo-400 z-10 pointer-events-none"
          style={{ boxShadow: '0 0 6px 1px rgba(129,140,248,0.7)' }}
        />
      )}

      <div
        className={`bg-slate-900 border rounded-xl transition-all ${cardStyle}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Color stripe */}
        {colorBar && <div className={`h-1 w-full rounded-t-xl ${colorBar}`} />}

        {/* Header */}
        <div className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-800/60 border-b border-slate-700/50">

          {/* Group drag handle */}
          <div
            draggable
            onDragStart={handleGroupDragStart}
            onDragEnd={handleGroupDragEnd}
            title="Drag to reorder group"
            className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing transition shrink-0 select-none text-xs px-0.5"
          >
            ⠿
          </div>

          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-slate-500 hover:text-slate-300 transition text-[10px] w-4 shrink-0"
          >
            {collapsed ? '▶' : '▼'}
          </button>

          {editing ? (
            <input
              autoFocus
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              onBlur={submitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') submitRename();
                if (e.key === 'Escape') { setLabelInput(group.label); setEditing(false); }
              }}
              className="flex-1 bg-slate-700 text-white text-sm font-semibold rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <button
              onDoubleClick={() => { setLabelInput(group.label); setEditing(true); }}
              className="flex-1 text-left text-sm font-semibold text-slate-100 truncate"
              title="Double-click to rename"
            >
              {group.label}
            </button>
          )}

          <span className="text-[11px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded-full tabular-nums shrink-0">
            {group.tabs.length}
          </span>

          {/* Group menu */}
          <div className="relative shrink-0">
            <button
              onClick={() => { setShowMenu(m => !m); setShowColors(false); setConfirmDelete(false); }}
              className="text-slate-600 hover:text-slate-300 transition text-sm px-0.5"
            >
              ⋯
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => { setShowMenu(false); setShowColors(false); }} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[180px]">

                  {showColors ? (
                    <div className="px-3 py-2">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Color</p>
                      <div className="flex flex-wrap gap-1.5">
                        {GROUP_COLORS.map(c => (
                          <button
                            key={c.id}
                            onClick={() => { onSetColor(c.id); setShowMenu(false); setShowColors(false); }}
                            title={c.label}
                            className={`w-6 h-6 rounded-full border-2 transition ${
                              (group.color ?? 'none') === c.id
                                ? 'border-white scale-110'
                                : 'border-transparent hover:border-slate-400'
                            } ${c.bar || 'bg-slate-600'}`}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => onRestoreAll()}
                        className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 transition"
                      >
                        ↩ Restore all tabs
                      </button>
                      <button
                        onClick={() => { setEditing(true); setLabelInput(group.label); setShowMenu(false); }}
                        className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 transition"
                      >
                        ✏️ Rename
                      </button>
                      <button
                        onClick={() => setShowColors(true)}
                        className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 transition flex items-center gap-2"
                      >
                        <span
                          className={`inline-block w-3 h-3 rounded-full ${GROUP_COLORS.find(c => c.id === (group.color ?? 'none'))?.bar || 'bg-slate-600'}`}
                        />
                        Color
                      </button>
                      <div className="border-t border-slate-700 my-1" />
                      {confirmDelete ? (
                        <div className="px-3 py-1.5">
                          <p className="text-xs text-slate-400 mb-1.5">Delete {group.tabs.length} tabs?</p>
                          <div className="flex gap-2">
                            <button onClick={() => { onDelete(); setShowMenu(false); }} className="text-xs text-red-400 hover:text-red-300 font-medium transition">Confirm</button>
                            <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-500 hover:text-slate-300 transition">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(true)}
                          className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-slate-700 transition"
                        >
                          🗑️ Delete group
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tab list */}
        {!collapsed && (
          <div className="divide-y divide-slate-800/50 rounded-b-xl overflow-hidden">
            {sortedTabs.map(tab => (
              <TabCard
                key={tab.id}
                tab={tab}
                allGroups={allGroups}
                onRestore={() => onRestoreTab(tab)}
                onDelete={() => onDeleteTab(tab.id, tab.groupId)}
                onMove={(toGroupId, newLabel) => onMoveTab(tab.id, tab.groupId, toGroupId, newLabel)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Insert-after drop line */}
      {groupDropAction === 'after' && (
        <div
          className="absolute -bottom-2 inset-x-0 h-0.5 rounded-full bg-indigo-400 z-10 pointer-events-none"
          style={{ boxShadow: '0 0 6px 1px rgba(129,140,248,0.7)' }}
        />
      )}
    </div>
  );
}
