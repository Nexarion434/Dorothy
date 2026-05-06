import { BrowserWindow, protocol, app, Menu, clipboard } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getAppBasePath } from '../utils';
import { MIME_TYPES } from '../constants';

// Global reference to the main window
let mainWindow: BrowserWindow | null = null;

/**
 * Get the main window instance
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * Set the main window instance
 */
export function setMainWindow(window: BrowserWindow | null) {
  mainWindow = window;
}

/**
 * Create the main application window
 */
export function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    title: 'Dorothy',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#F0E8D5',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the Next.js app
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, use the custom app:// protocol to properly serve static files
    // This fixes issues with absolute paths like /logo.png not resolving correctly
    mainWindow.loadURL('app://-/index.html');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle loading errors
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', validatedURL, errorCode, errorDescription);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded successfully');
  });

  // ── Copy/paste hard-wiring (Windows fix) ───────────────────────────────────
  // The application menu accelerators are unreliable when the title bar is
  // hidden, so we intercept Ctrl+C / Ctrl+V / Ctrl+X / Ctrl+A directly via
  // `before-input-event` and call the WebContents edit commands manually.
  // Works in form fields and falls through harmlessly elsewhere.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = process.platform === 'darwin' ? input.meta : input.control;
    if (!mod) return;
    if (input.alt) return; // don't shadow Alt+Ctrl combos
    const wc = mainWindow?.webContents;
    if (!wc) return;
    // Native Chromium + Application Menu accelerators are unreliable on
    // Windows when the title bar is hidden — the menu bar never renders so
    // its accelerators never fire. We forward the standard edit shortcuts to
    // the WebContents commands directly. This is exactly what worked in rc23.
    switch (input.key.toLowerCase()) {
      case 'c': if (!input.shift) wc.copy(); break;
      case 'v': if (!input.shift) wc.paste(); break;
      case 'x': if (!input.shift) wc.cut(); break;
      case 'z': input.shift ? wc.redo() : wc.undo(); break;
      case 'y': wc.redo(); break;
      case 'a':
        if (input.shift) break;
        // wc.selectAll() races with renderer's native handler in inputs and
        // gets reverted; do the selection imperatively instead.
        wc.executeJavaScript(`(() => {
          const el = document.activeElement;
          if (!el) return;
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            try { el.select(); } catch {}
          } else if (el.isContentEditable) {
            const r = document.createRange();
            r.selectNodeContents(el);
            const s = window.getSelection();
            if (s) { s.removeAllRanges(); s.addRange(r); }
          } else {
            try { document.execCommand('selectAll'); } catch {}
          }
        })();`, true).catch(() => {});
        break;
    }
  });

  // ── Right-click context menu with copy/paste ──────────────────────────────
  // Electron has no default context menu on Windows, which made users think
  // copy/paste was broken. Build a minimal one based on what the click landed on.
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const items: Electron.MenuItemConstructorOptions[] = [];
    const hasSelection = params.selectionText && params.selectionText.trim().length > 0;
    if (params.isEditable) {
      items.push(
        { label: 'Undo', role: 'undo', enabled: params.editFlags.canUndo },
        { label: 'Redo', role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll },
      );
    } else if (hasSelection) {
      items.push(
        { label: 'Copy', click: () => clipboard.writeText(params.selectionText) },
      );
    }
    if (items.length === 0) return;
    Menu.buildFromTemplate(items).popup({ window: mainWindow! });
  });
}

/**
 * Register custom protocol for serving static files
 * This must be called before app.whenReady()
 */
export function registerProtocolSchemes() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
    {
      scheme: 'local-file',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

/**
 * Setup the custom app:// protocol handler for serving static files
 * This should be called after app.whenReady() and before loading the window
 */
export function setupProtocolHandler() {
  // Serve local files via local-file:// protocol (for vault image previews etc.)
  // URLs are encoded as: local-file://host/path where host is empty
  // e.g. local-file:///Users/charlie/Desktop/photo.png
  protocol.handle('local-file', (request) => {
    try {
      // Parse as URL to properly decode path components
      const url = new URL(request.url);
      const filePath = decodeURIComponent(url.pathname);

      if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
        return new Response(fs.readFileSync(filePath), {
          headers: { 'Content-Type': mimeType },
        });
      }
      console.error('local-file:// not found:', filePath);
    } catch (err) {
      console.error('local-file:// error:', err, request.url);
    }
    return new Response('Not Found', { status: 404 });
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev) {
    const basePath = getAppBasePath();
    console.log('Registering app:// protocol with basePath:', basePath);

    protocol.handle('app', (request) => {
      // Parse the URL properly so we can strip the query string. Next.js App
      // Router prefetches RSC payloads via `?_rsc=<hash>` and references like
      // `/agents/__next.tree.txt`; if we keep the query in the filesystem path
      // the lookup always fails and the renderer logs a 404 to the DevTools
      // console for every page transition.
      const url = new URL(request.url);
      let urlPath = url.pathname; // already without query, host stripped

      const isRscPrefetch = url.searchParams.has('_rsc')
        || urlPath.endsWith('__next.tree.txt')
        || urlPath.endsWith('.rsc');

      // Default to index.html for directory requests
      if (urlPath === '/' || urlPath === '') {
        urlPath = '/index.html';
      }

      // Handle page routes (e.g., /agents/, /settings/) - serve their index.html
      if (urlPath.endsWith('/')) {
        urlPath = urlPath + 'index.html';
      }

      // Remove leading slash for path.join
      const relativePath = urlPath.startsWith('/') ? urlPath.substring(1) : urlPath;
      const filePath = path.join(basePath, relativePath);

      // Check if file exists
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

        return new Response(fs.readFileSync(filePath), {
          headers: { 'Content-Type': mimeType },
        });
      }

      // If it's a page route without .html, try adding index.html
      const htmlPath = path.join(basePath, relativePath, 'index.html');
      if (fs.existsSync(htmlPath)) {
        return new Response(fs.readFileSync(htmlPath), {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      // Next.js RSC prefetch: static export doesn't ship the .rsc / .tree.txt
      // payloads. Returning 404 floods the DevTools console; return an empty
      // 200 instead so the client treats the prefetch as a no-op.
      if (isRscPrefetch) {
        return new Response('', {
          status: 200,
          headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
        });
      }

      console.error(`File not found: ${filePath}`);
      return new Response('Not Found', { status: 404 });
    });
  }
}
