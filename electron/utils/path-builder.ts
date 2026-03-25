import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getExtraPaths } from './platform-paths';

/**
 * Build a full PATH string that includes nvm node versions,
 * common binary locations, and the existing process PATH.
 *
 * Cross-platform: uses ';' as separator on Windows, ':' on Unix.
 *
 * @param extraPaths - Additional paths to prepend (e.g. user-configured CLI paths)
 * @returns Deduplicated PATH string
 */
export function buildFullPath(extraPaths: string[] = []): string {
  const homeDir = os.homedir();
  const existingPath = process.env.PATH || '';
  const sep = path.delimiter;

  const additionalPaths = [
    ...extraPaths,
    ...getExtraPaths(),
  ];

  // Add nvm node version directories on Unix
  if (process.platform !== 'win32') {
    const nvmDir = path.join(homeDir, '.nvm/versions/node');
    if (fs.existsSync(nvmDir)) {
      try {
        const versions = fs.readdirSync(nvmDir);
        for (const version of versions) {
          additionalPaths.push(path.join(nvmDir, version, 'bin'));
        }
      } catch {
        // Ignore errors
      }
    }
  }

  return [...new Set([...additionalPaths, ...existingPath.split(sep)])].join(sep);
}
