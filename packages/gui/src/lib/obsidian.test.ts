import { describe, it, expect } from 'vitest';
import { obsidianHref } from './obsidian';

describe('obsidianHref', () => {
  it('produces the default obsidian://open URL (no advancedUri)', () => {
    const href = obsidianHref('Main', '10 - Project/Foo.md', 5, false);
    expect(href).toBe(
      'obsidian://open?vault=Main&file=10%20-%20Project%2FFoo.md',
    );
  });

  it('produces an obsidian://adv-uri URL with 1-based line when advancedUri=true', () => {
    const href = obsidianHref('Main', '10 - Project/Foo.md', 5, true);
    expect(href).toBe(
      'obsidian://adv-uri?vault=Main&filepath=10%20-%20Project%2FFoo.md&line=6',
    );
  });

  it('encodes a path with spaces correctly: 20 - Area/Health.md', () => {
    const href = obsidianHref('Main', '20 - Area/Health.md', 0, false);
    expect(href).toBe(
      'obsidian://open?vault=Main&file=20%20-%20Area%2FHealth.md',
    );
  });

  it('encodes a path with spaces in advancedUri mode', () => {
    const href = obsidianHref('Main', '20 - Area/Health.md', 2, true);
    expect(href).toBe(
      'obsidian://adv-uri?vault=Main&filepath=20%20-%20Area%2FHealth.md&line=3',
    );
  });
});
