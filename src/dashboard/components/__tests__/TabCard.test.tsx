import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabCard } from '../TabCard';
import type { GroupView, StoredTab } from '@/shared/types';

afterEach(cleanup);

describe('TabCard restore menu', () => {
  it('offers a right-click restore that keeps the saved link', async () => {
    const tab: StoredTab = {
      id: 't1', groupId: 'g1', url: 'https://example.com', title: 'Example', faviconUrl: '',
      openedAt: 1, lastActiveAt: 2, parkedAt: 3, pinned: false,
    };
    const group: GroupView = {
      id: 'g1', label: 'Examples', keywords: [], tabIds: ['t1'], createdAt: 1, tabs: [tab],
    };
    const onRestoreKeep = vi.fn();
    render(
      <TabCard
        tab={tab}
        allGroups={[group]}
        onRestore={vi.fn()}
        onRestoreKeep={onRestoreKeep}
        onDelete={vi.fn()}
        onMove={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByText('Example'));
    await userEvent.click(screen.getByRole('button', { name: '↗ Restore, but keep link in vault' }));
    expect(onRestoreKeep).toHaveBeenCalledOnce();
  });
});
