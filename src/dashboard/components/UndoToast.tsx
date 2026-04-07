import { useEffect, useRef } from 'react';
import type { UndoEntry } from '../hooks/useVault';

interface Props {
  entry: UndoEntry;
  onUndo: () => void;
  onDismiss: () => void;
  timeoutMs?: number;
}

export function UndoToast({ entry, onUndo, onDismiss, timeoutMs = 8000 }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, timeoutMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [entry, onDismiss, timeoutMs]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl px-4 py-3 text-sm animate-in">
      <span className="text-slate-300">{entry.label}</span>
      <button
        onClick={onUndo}
        className="font-semibold text-indigo-400 hover:text-indigo-300 transition whitespace-nowrap"
      >
        Undo
      </button>
      <button
        onClick={onDismiss}
        className="text-slate-600 hover:text-slate-400 transition text-xs"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
