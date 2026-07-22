import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { Header } from '../Header';

afterEach(cleanup);

function renderHeader(overrides: Partial<ComponentProps<typeof Header>> = {}) {
  const props: ComponentProps<typeof Header> = {
    tabCount: 12,
    search: '',
    onSearchChange: vi.fn(),
    onPurge: vi.fn().mockResolvedValue({ parked: 0, groups: 0, usedAI: false }),
    onSnapshot: vi.fn().mockResolvedValue({ saved: 0, groups: 0, usedAI: false }),
    onDownloadBackup: vi.fn().mockResolvedValue(undefined),
    onClearDuplicates: vi.fn().mockResolvedValue(0),
    onImport: vi.fn().mockResolvedValue({ tabs: 0, groups: 0 }),
    onCreateGroup: vi.fn().mockResolvedValue({ label: 'New folder' }),
    onClearVault: vi.fn().mockResolvedValue(undefined),
    onReorganizeWithAI: vi.fn().mockResolvedValue({ tabs: 12, groups: 3 }),
    allExpanded: false,
    onToggleExpandAll: vi.fn(),
    hasApiKey: false,
    ...overrides,
  };
  render(<Header {...props} />);
  return props;
}

describe('Header everyday controls', () => {
  it('toggles all groups from the toolbar', async () => {
    const props = renderHeader();
    await userEvent.click(screen.getByRole('button', { name: '⊞ Expand All' }));
    expect(props.onToggleExpandAll).toHaveBeenCalledOnce();
  });

  it('requires confirmation before clearing the vault', async () => {
    const props = renderHeader();
    await userEvent.click(screen.getByRole('button', { name: '🗑 Clear Vault' }));
    expect(props.onClearVault).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '⚠️ Confirm clear?' }));
    expect(props.onClearVault).toHaveBeenCalledOnce();
  });

  it('shows action failures instead of leaving a busy button stuck', async () => {
    renderHeader({ onSnapshot: vi.fn().mockRejectedValue(new Error('Service worker unavailable')) });
    await userEvent.click(screen.getByRole('button', { name: '📸 Snapshot' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Service worker unavailable');
    expect(screen.getByRole('button', { name: '📸 Snapshot' })).toBeTruthy();
  });

  it('requires confirmation before reorganizing with AI', async () => {
    const props = renderHeader({ hasApiKey: true });
    await userEvent.click(screen.getByRole('button', { name: '🤖 Reorganize with AI' }));
    expect(props.onReorganizeWithAI).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '⚠ Confirm AI reorganization?' }));
    expect(props.onReorganizeWithAI).toHaveBeenCalledOnce();
  });
});
