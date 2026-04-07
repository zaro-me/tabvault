import type { GroupView } from '@/shared/types';

const FORGOTTEN_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_MS     = 3 * 24 * 60 * 60 * 1000;

interface Hint {
  key: string;
  icon: string;
  text: string;
  severity: 'warn' | 'info';
}

interface Props {
  groups: GroupView[];
  dismissedAlerts: string[];
  onDismiss: (key: string, text: string) => void;
}

export function AssistantBanner({ groups, dismissedAlerts, onDismiss }: Props) {
  const now     = Date.now();
  const allTabs = groups.flatMap(g => g.tabs);
  const hints: Hint[] = [];

  const forgotten = allTabs.filter(t => now - t.parkedAt >= FORGOTTEN_MS);
  if (forgotten.length > 0) {
    hints.push({
      key: 'forgotten',
      icon: '⏰',
      text: `${forgotten.length} tab${forgotten.length > 1 ? 's have' : ' has'} been archived for over 7 days — worth a cleanup.`,
      severity: 'warn',
    });
  }

  const neverVisited = allTabs.filter(t => t.lastActiveAt <= t.openedAt + 5000);
  if (neverVisited.length > 0) {
    hints.push({
      key: 'unread',
      icon: '👁️',
      text: `${neverVisited.length} tab${neverVisited.length > 1 ? 's were' : ' was'} archived without ever being read.`,
      severity: 'info',
    });
  }

  const largeGroups = groups.filter(g => g.tabs.length >= 10);
  if (largeGroups.length > 0) {
    hints.push({
      key: 'large-groups',
      icon: '📦',
      text: `${largeGroups.length} group${largeGroups.length > 1 ? 's have' : ' has'} 10+ tabs — consider archiving the group entirely.`,
      severity: 'info',
    });
  }

  const staleGroups = groups.filter(g => g.tabs.every(t => now - t.parkedAt >= STALE_MS));
  if (staleGroups.length > 0) {
    hints.push({
      key: 'stale-groups',
      icon: '🧹',
      text: `${staleGroups.length} group${staleGroups.length > 1 ? 's' : ''} untouched for 3+ days.`,
      severity: 'info',
    });
  }

  const visible = hints.filter(h => !dismissedAlerts.includes(h.key));
  if (visible.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-2">
      {visible.map(hint => (
        <div
          key={hint.key}
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm border ${
            hint.severity === 'warn'
              ? 'bg-amber-950/50 border-amber-800/50 text-amber-200'
              : 'bg-indigo-950/50 border-indigo-800/50 text-indigo-200'
          }`}
        >
          <span className="text-base shrink-0">{hint.icon}</span>
          <span className="flex-1">{hint.text}</span>
          <button
            onClick={() => onDismiss(hint.key, hint.text)}
            title="Dismiss"
            className="shrink-0 opacity-50 hover:opacity-100 transition text-sm leading-none ml-2"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
