import { beforeEach, describe, expect, it } from 'vitest';
import * as tracker from '../../background/idle-tracker';

// Reset state between tests
beforeEach(() => {
  for (const e of tracker.snapshot()) tracker.removeTab(e.tabId);
});

describe('idle-tracker', () => {
  it('tracks a tab on markActive', () => {
    tracker.markActive(1, { url: 'https://example.com', title: 'Example', faviconUrl: '' });
    expect(tracker.getEntry(1)).toMatchObject({ tabId: 1, url: 'https://example.com' });
  });

  it('preserves openedAt across repeated markActive calls', () => {
    tracker.markActive(1, { url: 'https://x.com', title: 'X', faviconUrl: '' });
    const first = tracker.getEntry(1)!.openedAt;
    tracker.markActive(1, { url: 'https://x.com', title: 'X updated', faviconUrl: '' });
    expect(tracker.getEntry(1)!.openedAt).toBe(first);
  });

  it('removes a tab', () => {
    tracker.markActive(1, { url: 'https://x.com', title: 'X', faviconUrl: '' });
    tracker.removeTab(1);
    expect(tracker.getEntry(1)).toBeUndefined();
  });

  it('does not return pinned tabs as idle', () => {
    tracker.markActive(1, { url: 'https://x.com', title: 'X', faviconUrl: '' });
    tracker.setPinned(1, true);
    tracker.hydrate([{ ...tracker.getEntry(1)!, lastActiveAt: Date.now() - 999_999 }]);
    expect(tracker.getIdleTabs(1_000)).toHaveLength(0);
  });

  it('does not return grace-period tabs as newly idle', () => {
    tracker.markActive(1, { url: 'https://x.com', title: 'X', faviconUrl: '' });
    tracker.hydrate([{ ...tracker.getEntry(1)!, lastActiveAt: Date.now() - 999_999 }]);
    tracker.startGrace(1, 'notif-1');
    expect(tracker.getIdleTabs(1_000)).toHaveLength(0);
    expect(tracker.getGracePeriodTabs()).toHaveLength(1);
  });

  it('cancelGrace removes grace state', () => {
    tracker.markActive(1, { url: 'https://x.com', title: 'X', faviconUrl: '' });
    tracker.startGrace(1, 'notif-1');
    tracker.cancelGrace(1);
    expect(tracker.getEntry(1)?.graceStartedAt).toBeUndefined();
    expect(tracker.getEntry(1)?.notificationId).toBeUndefined();
  });

  it('expiredGrace returns true when grace period elapsed', () => {
    tracker.markActive(1, { url: 'https://x.com', title: 'X', faviconUrl: '' });
    tracker.hydrate([{
      ...tracker.getEntry(1)!,
      graceStartedAt: Date.now() - 1_000_000,
      notificationId: 'n',
    }]);
    expect(tracker.expiredGrace(1, 1_000)).toBe(true);
    expect(tracker.expiredGrace(1, 9_999_999)).toBe(false);
  });

  it('setPinned cancels any active grace', () => {
    tracker.markActive(1, { url: 'https://x.com', title: 'X', faviconUrl: '' });
    tracker.startGrace(1, 'notif-1');
    tracker.setPinned(1, true);
    expect(tracker.getEntry(1)?.pinned).toBe(true);
    expect(tracker.getEntry(1)?.graceStartedAt).toBeUndefined();
  });

  it('hydrate restores state from storage', () => {
    const entries = [
      { tabId: 10, url: 'https://a.com', title: 'A', faviconUrl: '', openedAt: 1000, lastActiveAt: 2000, pinned: false },
      { tabId: 20, url: 'https://b.com', title: 'B', faviconUrl: '', openedAt: 1000, lastActiveAt: 2000, pinned: true },
    ];
    tracker.hydrate(entries);
    expect(tracker.getEntry(10)?.url).toBe('https://a.com');
    expect(tracker.getEntry(20)?.pinned).toBe(true);
  });
});
