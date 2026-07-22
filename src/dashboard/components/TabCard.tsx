import { useRef, useState, useCallback } from 'react';
import type { GroupView, StoredTab } from '@/shared/types';
import { activeDrag } from '../dragState';

interface Props {
  tab: StoredTab;
  allGroups: GroupView[];
  onRestore: () => void;
  onRestoreKeep: () => void;
  onDelete: () => void;
  onMove: (toGroupId: string, newLabel?: string) => void;
}

function formatAge(ts: number): string {
  const d = Date.now() - ts;
  const mins  = Math.floor(d / 60_000);
  const hours = Math.floor(d / 3_600_000);
  const days  = Math.floor(d / 86_400_000);
  if (days  > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins  > 0) return `${mins}m ago`;
  return 'just now';
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

export function TabCard({ tab, allGroups, onRestore, onRestoreKeep, onDelete, onMove }: Props) {
  const [showMove, setShowMove] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    activeDrag.current = { tabId: tab.id, fromGroupId: tab.groupId };
    // Firefox requires at least text/plain to be set for DnD to work
    e.dataTransfer.setData('text/plain', tab.id);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  }, [tab.id, tab.groupId]);

  const handleDragEnd = useCallback(() => {
    activeDrag.current = null;
    setDragging(false);
  }, []);

  const domain   = extractDomain(tab.url);
  const age      = formatAge(tab.parkedAt);
  const isOld    = Date.now() - tab.parkedAt > 7 * 24 * 60 * 60 * 1000;
  const neverRead = tab.lastActiveAt <= tab.openedAt + 5000;

  const otherGroups = allGroups.filter(g => g.id !== tab.groupId);

  function handleMoveToExisting(groupId: string) {
    setShowMove(false);
    setCreatingNew(false);
    onMove(groupId);
  }

  function handleStartNew() {
    setCreatingNew(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleConfirmNew() {
    const label = newGroupLabel.trim();
    if (!label) return;
    setShowMove(false);
    setCreatingNew(false);
    setNewGroupLabel('');
    onMove('__new__', label);
  }

  return (
    <div
      className={`group relative flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800/40 transition cursor-grab active:cursor-grabbing ${dragging ? 'opacity-40' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onContextMenu={e => {
        e.preventDefault();
        setShowMove(false);
        setShowContextMenu(true);
      }}
    >
      {/* Favicon */}
      <div className="shrink-0 w-5 h-5 rounded-sm overflow-hidden bg-slate-800 flex items-center justify-center">
        {tab.faviconUrl ? (
          <img
            src={tab.faviconUrl}
            alt=""
            width={20}
            height={20}
            className="object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <span className="text-[10px] text-slate-500">🌐</span>
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 font-medium truncate leading-snug" title={tab.title}>
          {tab.title || tab.url}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-slate-500 truncate max-w-[120px]">{domain}</span>
          <span className="text-slate-700 text-xs">·</span>
          <span className={`text-xs shrink-0 tabular-nums ${isOld ? 'text-amber-500' : 'text-slate-500'}`}>
            {age}
          </span>
          {neverRead && (
            <span className="text-[10px] text-slate-600 bg-slate-800 rounded px-1 shrink-0">unread</span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition">
        <button
          onClick={onRestore}
          title="Restore tab"
          className="text-indigo-400 hover:text-indigo-300 text-xs font-medium px-1.5 py-1 rounded hover:bg-indigo-900/40 transition"
        >
          ↩
        </button>
        <button
          onClick={() => { setShowMove(m => !m); setShowContextMenu(false); setCreatingNew(false); setNewGroupLabel(''); }}
          title="Move to group"
          className={`text-xs px-1.5 py-1 rounded transition ${showMove ? 'text-indigo-400 bg-indigo-900/40' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/40'}`}
        >
          ⇄
        </button>
        <button
          onClick={onDelete}
          title="Delete permanently"
          className="text-slate-600 hover:text-red-400 text-xs px-1.5 py-1 rounded hover:bg-red-900/20 transition"
        >
          ✕
        </button>
      </div>

      {/* Right-click restore menu */}
      {showContextMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowContextMenu(false)} />
          <div className="absolute right-2 top-full mt-1 z-20 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[210px]">
            <button
              onClick={() => { setShowContextMenu(false); onRestore(); }}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 transition"
            >
              ↩ Restore
            </button>
            <button
              onClick={() => { setShowContextMenu(false); onRestoreKeep(); }}
              className="w-full text-left px-3 py-1.5 text-sm text-indigo-300 hover:bg-slate-700 transition"
            >
              ↗ Restore, but keep link in vault
            </button>
          </div>
        </>
      )}

      {/* Move dropdown */}
      {showMove && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setShowMove(false); setCreatingNew(false); }} />
          <div className="absolute right-2 top-full mt-1 z-20 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[180px]">
            {otherGroups.length > 0 && (
              <>
                <p className="px-3 py-1 text-[10px] text-slate-500 uppercase tracking-wider">Move to</p>
                {otherGroups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => handleMoveToExisting(g.id)}
                    className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 truncate transition"
                  >
                    {g.label}
                    <span className="text-slate-500 text-xs ml-1">({g.tabs.length})</span>
                  </button>
                ))}
                <div className="border-t border-slate-700 my-1" />
              </>
            )}

            {creatingNew ? (
              <div className="px-3 py-2 flex flex-col gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Group name…"
                  value={newGroupLabel}
                  onChange={e => setNewGroupLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleConfirmNew();
                    if (e.key === 'Escape') { setCreatingNew(false); setNewGroupLabel(''); }
                  }}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmNew}
                    disabled={!newGroupLabel.trim()}
                    className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40 font-medium transition"
                  >
                    Create & move
                  </button>
                  <button
                    onClick={() => { setCreatingNew(false); setNewGroupLabel(''); }}
                    className="text-xs text-slate-500 hover:text-slate-300 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleStartNew}
                className="w-full text-left px-3 py-1.5 text-sm text-indigo-400 hover:bg-slate-700 transition"
              >
                + New group
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
