/**
 * Cross-platform path helpers for the renderer process (no Node `path`).
 *
 * On Windows, `agent.projectPath` looks like
 *   `C:\Users\nicol\Documents\Claude Project\foo\monarq-branding`
 * (backslashes). On macOS/Linux it's
 *   `/Users/nicol/Documents/foo/monarq-branding`
 * (forward slashes).
 *
 * `basename` returns the last segment in either case.
 */
export function basename(p: string | undefined | null): string {
  if (!p) return '';
  // Strip trailing separators, then split on either / or \
  const trimmed = p.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || '';
}
