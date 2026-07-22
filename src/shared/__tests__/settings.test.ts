import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../types';

describe('default settings', () => {
  it('makes automatic idle archiving opt-in', () => {
    expect(DEFAULT_SETTINGS.autoArchiveEnabled).toBe(false);
  });

  it('preserves the established remove-after-restore behavior until the user changes it', () => {
    expect(DEFAULT_SETTINGS.removeOnRestore).toBe(true);
  });
});
