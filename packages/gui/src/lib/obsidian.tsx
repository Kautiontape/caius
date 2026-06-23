import { createContext } from 'react';

export interface ObsidianConfig {
  vault: string;
  advancedUri: boolean;
}

export const ObsidianContext = createContext<ObsidianConfig>({
  vault: 'Main',
  advancedUri: false,
});

/**
 * Build an obsidian:// deep-link for a given file and optional line.
 * - Default: `obsidian://open?vault=…&file=…`
 * - advancedUri: `obsidian://adv-uri?vault=…&filepath=…&line=…` (1-based; task.line is 0-based)
 */
export function obsidianHref(
  vault: string,
  file: string,
  line: number,
  advancedUri: boolean,
): string {
  if (advancedUri) {
    return (
      `obsidian://adv-uri?vault=${encodeURIComponent(vault)}` +
      `&filepath=${encodeURIComponent(file)}` +
      `&line=${line + 1}`
    );
  }
  return (
    `obsidian://open?vault=${encodeURIComponent(vault)}` +
    `&file=${encodeURIComponent(file)}`
  );
}
