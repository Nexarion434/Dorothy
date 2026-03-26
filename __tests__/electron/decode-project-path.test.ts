import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

import { decodeProjectPath } from '../../electron/utils/decode-project-path';

const existsSyncMock = vi.mocked(fs.existsSync);

beforeEach(() => {
  existsSyncMock.mockReset();
});

/**
 * Build a platform-aware path from segments.
 * e.g. p('Users', 'charlie') => '/Users/charlie' on Unix, '\Users\charlie' on Windows.
 */
function p(...segments: string[]): string {
  return path.join('/', ...segments);
}

/**
 * Helper: given path segments, register the path and all its prefixes as existing.
 * Uses path.join so lookups match what decodeProjectPath produces.
 */
function registerPath(segments: string[]) {
  const paths = new Set<string>(['/']);
  let current = '/';
  for (const seg of segments) {
    current = path.join(current, seg);
    paths.add(current);
  }
  existsSyncMock.mockImplementation((p: fs.PathLike) => {
    return paths.has(String(p));
  });
  return paths;
}

/**
 * Helper: register multiple paths that coexist on the same filesystem.
 */
function registerMultiplePaths(pathsList: string[][]) {
  const allPaths = new Set<string>(['/']);
  for (const segments of pathsList) {
    let current = '/';
    for (const seg of segments) {
      current = path.join(current, seg);
      allPaths.add(current);
    }
  }
  existsSyncMock.mockImplementation((p: fs.PathLike) => {
    return allPaths.has(String(p));
  });
  return allPaths;
}

describe('decodeProjectPath', () => {
  describe('simple paths (no ambiguity)', () => {
    it('decodes a basic path with no dashes or dots in names', () => {
      registerPath(['Users', 'charlie', 'Documents', 'myproject']);
      expect(decodeProjectPath('-Users-charlie-Documents-myproject'))
        .toBe(p('Users', 'charlie', 'Documents', 'myproject'));
    });
  });

  describe('paths with dashes in directory names', () => {
    it('decodes a path where a directory name contains a dash', () => {
      registerPath(['Users', 'charlie', 'Documents', 'octav-frontend-lite']);
      expect(decodeProjectPath('-Users-charlie-Documents-octav-frontend-lite'))
        .toBe(p('Users', 'charlie', 'Documents', 'octav-frontend-lite'));
    });

    it('decodes a path with a single-dash directory name', () => {
      registerPath(['Users', 'charlie', 'Documents', 'my-project']);
      expect(decodeProjectPath('-Users-charlie-Documents-my-project'))
        .toBe(p('Users', 'charlie', 'Documents', 'my-project'));
    });
  });

  describe('paths with dots in directory names (the bug)', () => {
    it('decodes docs.octav.fi correctly', () => {
      registerPath(['Users', 'charlie', 'Documents', 'docs.octav.fi']);
      expect(decodeProjectPath('-Users-charlie-Documents-docs-octav-fi'))
        .toBe(p('Users', 'charlie', 'Documents', 'docs.octav.fi'));
    });

    it('decodes nav.octav.fi correctly', () => {
      registerPath(['Users', 'charlie', 'Documents', 'nav.octav.fi']);
      expect(decodeProjectPath('-Users-charlie-Documents-nav-octav-fi'))
        .toBe(p('Users', 'charlie', 'Documents', 'nav.octav.fi'));
    });

    it('decodes perps.octav.fi correctly', () => {
      registerPath(['Users', 'charlie', 'Documents', 'perps.octav.fi']);
      expect(decodeProjectPath('-Users-charlie-Documents-perps-octav-fi'))
        .toBe(p('Users', 'charlie', 'Documents', 'perps.octav.fi'));
    });
  });

  describe('paths with mixed separators', () => {
    it('decodes a directory with both dot and dash', () => {
      registerPath(['Users', 'charlie', 'Documents', 'my-app.v2']);
      expect(decodeProjectPath('-Users-charlie-Documents-my-app-v2'))
        .toBe(p('Users', 'charlie', 'Documents', 'my-app.v2'));
    });
  });

  describe('fallback behavior', () => {
    it('falls back gracefully when directory does not exist on disk', () => {
      // Only root and /Users exist
      const usersPath = path.join('/', 'Users');
      existsSyncMock.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        return s === '/' || s === usersPath;
      });
      const result = decodeProjectPath('-Users-nonexistent-path');
      // Should still produce a valid-looking path even if not on disk
      expect(result).toContain('Users');
      expect(result).toContain('nonexistent');
      expect(result).toContain('path');
    });
  });

  describe('disambiguation when both forms exist', () => {
    it('prefers the longer (dash-joined) match when both exist', () => {
      registerMultiplePaths([
        ['Users', 'charlie', 'Documents', 'octav-server'],
        ['Users', 'charlie', 'Documents', 'octav', 'server'],
      ]);
      expect(decodeProjectPath('-Users-charlie-Documents-octav-server'))
        .toBe(p('Users', 'charlie', 'Documents', 'octav-server'));
    });
  });

  describe('real-world encoded directory names', () => {
    it('handles morpho.octav.fi', () => {
      registerPath(['Users', 'charlie', 'Documents', 'morpho.octav.fi']);
      expect(decodeProjectPath('-Users-charlie-Documents-morpho-octav-fi'))
        .toBe(p('Users', 'charlie', 'Documents', 'morpho.octav.fi'));
    });

    it('handles resolv.octav.fi', () => {
      registerPath(['Users', 'charlie', 'Documents', 'resolv.octav.fi']);
      expect(decodeProjectPath('-Users-charlie-Documents-resolv-octav-fi'))
        .toBe(p('Users', 'charlie', 'Documents', 'resolv.octav.fi'));
    });

    it('handles octav-admin-frontend-v2 (dashes only)', () => {
      registerPath(['Users', 'charlie', 'Documents', 'octav-admin-frontend-v2']);
      expect(decodeProjectPath('-Users-charlie-Documents-octav-admin-frontend-v2'))
        .toBe(p('Users', 'charlie', 'Documents', 'octav-admin-frontend-v2'));
    });
  });

  // Windows-only: drive letter paths (e.g. C:\Users\nicol\...)
  if (path.sep === '\\') {
    describe('Windows drive letter paths', () => {
      it('decodes C: drive path correctly', () => {
        const fullPath = 'C:\\Users\\nicol\\Documents\\Claude\\Project\\N8n';
        existsSyncMock.mockImplementation((p: fs.PathLike) => {
          const s = String(p);
          return ['C:\\', 'C:\\Users', 'C:\\Users\\nicol', 'C:\\Users\\nicol\\Documents',
            'C:\\Users\\nicol\\Documents\\Claude', 'C:\\Users\\nicol\\Documents\\Claude\\Project',
            'C:\\Users\\nicol\\Documents\\Claude\\Project\\N8n'].includes(s);
        });
        expect(decodeProjectPath('-C-Users-nicol-Documents-Claude-Project-N8n'))
          .toBe(fullPath);
      });
    });
  }
});
