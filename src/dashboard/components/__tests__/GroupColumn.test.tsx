import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupColumn } from '../GroupColumn';
import type { GroupView, StoredTab } from '@/shared/types';

afterEach(cleanup);

function makeTab(index: number): StoredTab {
  return {
    id: `t${index}`, groupId: 'g1', url: `https://example.com/${index}`, title: `Tab ${index}`,
    faviconUrl: '', openedAt: 1, lastActiveAt: 2, parkedAt: 3, pinned: false,
  };
}

describe('GroupColumn bulk restore', () => {
  it('requires a second click before opening a large group', async () => {
    const tabs = Array.from({ length: 11 }, (_, index) => makeTab(index));
    const group: GroupView = {
      id: 'g1', label: 'Large group', keywords: [], tabIds: tabs.map(tab => tab.id),
      createdAt: 1, tabs,
    };
    const onRestoreAll = vi.fn().mockResolvedValue(undefined);
    render(
      <GroupColumn
        group={group} allGroups={[group]}
        onRestoreTab={vi.fn()} onDeleteTab={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()}
        onRestoreAll={onRestoreAll} onMoveTab={vi.fn()} onSetColor={vi.fn()} onGroupDrop={vi.fn()}
        expandSignal={0} collapseSignal={0} autoExpandTrigger={0}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Large group' }));
    await userEvent.click(screen.getByRole('button', { name: '↩ Restore all tabs' }));
    expect(onRestoreAll).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '⚠ Open 11 tabs?' }));
    expect(onRestoreAll).toHaveBeenCalledOnce();
  });
});
