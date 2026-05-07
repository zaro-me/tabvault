import { useEffect, useState } from 'react';
import type { LogEntry, LogEntryType } from '@/shared/storage';
import { getLog } from '@/shared/storage';

interface Props {
  open: boolean;
  onClose: () => void;
}

const TYPE_ICON: Record<LogEntryType, string> = {
  backup:          '⬇',
  purge:           '🧹',
  snapshot:        '📸',
  archive_tab:     '🗄️',
  create_group:    '📁',
  delete_tab:      '🗑️',
  delete_group:    '🗑️',
  move_tab:        '⇄',
  dedup:           '🗂',
  alert_dismissed: '🔕',
};

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

export function LogPanel({ open, onClose }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getLog().then(e => { setEntries(e); setLoading(false); });
  }, [open]);

  if (!open) return null;

  const dismissed = entries.filter(e => e.type === 'alert_dismissed');
  const activity  = entries.filter(e => e.type !== 'alert_dismissed');

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-sm z-50 bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-base font-semibold text-white">Vault Logs</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-slate-500 text-sm text-center py-12 animate-pulse">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-12">No activity yet.</p>
          ) : (
            <>
              {/* Dismissed alerts section */}
              {dismissed.length > 0 && (
                <section>
                  <p className="px-5 pt-5 pb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                    Dismissed Alerts
                  </p>
                  {dismissed.map(e => (
                    <LogRow key={e.id} entry={e} />
                  ))}
                </section>
              )}

              {/* Activity section */}
              {activity.length > 0 && (
                <section>
                  <p className="px-5 pt-5 pb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                    Activity
                  </p>
                  {activity.map(e => (
                    <LogRow key={e.id} entry={e} />
                  ))}
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer: refresh */}
        <div className="shrink-0 border-t border-slate-800 px-5 py-3">
          <button
            onClick={() => { setLoading(true); getLog().then(e => { setEntries(e); setLoading(false); }); }}
            className="text-xs text-slate-500 hover:text-slate-300 transition"
          >
            ↻ Refresh
          </button>
        </div>
      </div>
    </>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3 border-b border-slate-800/60 hover:bg-slate-800/30 transition">
      <span className="text-base shrink-0 mt-0.5">{TYPE_ICON[entry.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-300 leading-snug">{entry.message}</p>
        <p className="text-xs text-slate-600 mt-0.5">{formatAge(entry.timestamp)}</p>
      </div>
    </div>
  );
}
