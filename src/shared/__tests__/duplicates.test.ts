import { describe, expect, it } from 'vitest';
import type { StoredTab } from '../types';
import { planDuplicateRemoval } from '../duplicates';

function tab(id: string, url: string): StoredTab {
  return {
    id,
    url,
    title: `Tab ${id}`,
    faviconUrl: '',
    openedAt: 1,
    lastActiveAt: 1,
    parkedAt: 1,
    groupId: 'group-1',
    pinned: false,
  };
}

describe('duplicate removal planning', () => {
  it('keeps Google Slides sections for review instead of deleting them automatically', () => {
    const first = tab(
      'first',
      'https://docs.google.com/presentation/d/19d6YdOAlhdm9Jy21Ux13j5eOA_kLUZLLUgwoTKrNnPc/edit?slide=id.p#slide=id.p',
    );
    const second = tab(
      'second',
      'https://docs.google.com/presentation/d/19d6YdOAlhdm9Jy21Ux13j5eOA_kLUZLLUgwoTKrNnPc/edit?slide=id.g3ec32ff24c0_0_65#slide=id.g3ec32ff24c0_0_65',
    );

    expect(planDuplicateRemoval([first, second])).toEqual({
      exactDuplicates: [],
      googleDocsCandidates: [{ keep: first, remove: second }],
    });
  });

  it('reviews Google Docs locations that differ only by the URL fragment', () => {
    const first = tab('first', 'https://docs.google.com/presentation/d/deck-id/edit#slide=id.p');
    const second = tab('second', 'https://docs.google.com/presentation/d/deck-id/edit#slide=id.roadmap');

    expect(planDuplicateRemoval([first, second])).toEqual({
      exactDuplicates: [],
      googleDocsCandidates: [{ keep: first, remove: second }],
    });
  });

  it('still removes ordinary exact duplicates automatically', () => {
    const first = tab('first', 'https://example.com/article#intro');
    const second = tab('second', 'https://example.com/article#details');

    expect(planDuplicateRemoval([first, second])).toEqual({
      exactDuplicates: [second],
      googleDocsCandidates: [],
    });
  });

  it('does not conflate different Google document IDs', () => {
    const first = tab('first', 'https://docs.google.com/document/d/document-one/edit?tab=t.0');
    const second = tab('second', 'https://docs.google.com/document/d/document-two/edit?tab=t.0');

    expect(planDuplicateRemoval([first, second])).toEqual({
      exactDuplicates: [],
      googleDocsCandidates: [],
    });
  });
});
