// Lightweight CDP client using raw HTTP + WebSocket
// No dependencies - just fetch for HTTP endpoints, ws for CDP protocol

import { getProfilePort } from './chrome.js';

// ── CDP HTTP API (tab management) ────────────────────────────

interface CdpTab {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

async function cdpHttp(port: number, path: string, method = 'GET', timeout = 5000): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`CDP HTTP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function listTabs(port: number): Promise<CdpTab[]> {
  return (await cdpHttp(port, '/json')) as CdpTab[];
}

async function getActivePage(port: number): Promise<CdpTab> {
  const tabs = await listTabs(port);
  const page = tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('No page tab found');
  return page;
}

// ── CDP WebSocket protocol ───────────────────────────────────

let msgId = 1;

interface CdpMessage {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

async function cdpSend(wsUrl: string, method: string, params: Record<string, unknown> = {}, timeout = 30000): Promise<unknown> {
  // Dynamic import for ws (we'll use the built-in WebSocket in Node 21+ or ws package)
  const { WebSocket } = await import('ws');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = msgId++;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`CDP timeout: ${method}`));
    }, timeout);

    ws.on('open', () => {
      ws.send(JSON.stringify({ id, method, params }));
    });

    ws.on('message', (data: Buffer) => {
      const msg: CdpMessage = JSON.parse(data.toString());
      if (msg.id === id) {
        clearTimeout(timer);
        ws.close();
        if (msg.error) reject(new Error(`CDP error: ${msg.error.message}`));
        else resolve(msg.result);
      }
    });

    ws.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ── Public API ───────────────────────────────────────────────

export async function openTab(profileName: string, url: string): Promise<string> {
  const port = getProfilePort(profileName);
  const tab = (await cdpHttp(port, `/json/new?${encodeURIComponent(url)}`, 'PUT')) as CdpTab;
  return JSON.stringify({ ok: true, tabId: tab.id, url: tab.url, title: tab.title });
}

export async function navigateTo(profileName: string, url: string): Promise<string> {
  const port = getProfilePort(profileName);
  const tab = await getActivePage(port);
  if (!tab.webSocketDebuggerUrl) throw new Error('No WebSocket URL for active tab');
  await cdpSend(tab.webSocketDebuggerUrl, 'Page.navigate', { url });
  // Wait for load
  await cdpSend(tab.webSocketDebuggerUrl, 'Page.enable');
  return JSON.stringify({ ok: true, url });
}

export async function closeTab(profileName: string, tabId?: string): Promise<string> {
  const port = getProfilePort(profileName);
  if (tabId) {
    await cdpHttp(port, `/json/close/${tabId}`);
    return JSON.stringify({ ok: true, closed: tabId });
  }
  // Close active tab
  const tab = await getActivePage(port);
  await cdpHttp(port, `/json/close/${tab.id}`);
  return JSON.stringify({ ok: true, closed: tab.id });
}

export async function evaluate(profileName: string, fn: string, data?: unknown): Promise<string> {
  const port = getProfilePort(profileName);
  const tab = await getActivePage(port);
  if (!tab.webSocketDebuggerUrl) throw new Error('No WebSocket URL for active tab');

  // Inject data as global variable if provided
  if (data !== undefined) {
    await cdpSend(tab.webSocketDebuggerUrl, 'Runtime.evaluate', {
      expression: `window.__data = ${JSON.stringify(data)}`,
      returnByValue: true,
    });
  }

  // Wrap in IIFE if it looks like a function declaration
  let expression = fn;
  if (fn.trim().startsWith('function') || fn.trim().startsWith('async')) {
    expression = `(${fn})()`;
  }

  const result = await cdpSend(tab.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    timeout: 30000,
  }) as { result?: { value?: unknown; description?: string; type?: string }; exceptionDetails?: { text?: string; exception?: { description?: string } } };

  if (result.exceptionDetails) {
    const err = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Evaluation error';
    return JSON.stringify({ error: err });
  }

  return JSON.stringify({ ok: true, value: result.result?.value ?? result.result?.description ?? null });
}

export async function clickElement(profileName: string, selector: string): Promise<string> {
  // Click by evaluating a querySelector + click in the page
  const js = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { error: 'Element not found: ${selector.replace(/'/g, "\\'")}' };
    el.scrollIntoView({ block: 'center' });
    el.click();
    return { ok: true, tag: el.tagName, text: el.textContent?.slice(0, 80) };
  })()`;
  return evaluate(profileName, js);
}

export async function snapshot(profileName: string, selector?: string, options?: { compact?: boolean; interactive?: boolean; depth?: number }): Promise<string> {
  const port = getProfilePort(profileName);
  const tab = await getActivePage(port);
  if (!tab.webSocketDebuggerUrl) throw new Error('No WebSocket URL for active tab');

  // Get accessibility tree for structured snapshot
  const depth = options?.depth ?? 6;

  const js = `(() => {
    const root = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document.body'};
    if (!root) return { error: 'Selector not found' };

    function walk(el, d) {
      if (d <= 0) return null;
      const tag = el.tagName?.toLowerCase() || '';
      const role = el.getAttribute?.('role') || '';
      const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
        ? el.textContent?.trim().slice(0, 200) : '';
      const href = el.getAttribute?.('href') || '';
      const type = el.getAttribute?.('type') || '';
      const value = el.value || '';
      const placeholder = el.getAttribute?.('placeholder') || '';
      const ariaLabel = el.getAttribute?.('aria-label') || '';

      const isInteractive = ['a', 'button', 'input', 'select', 'textarea'].includes(tag) || role;
      const hasContent = text || href || ariaLabel || placeholder;

      ${options?.interactive ? 'if (!isInteractive && !hasContent && el.children.length === 0) return null;' : ''}
      ${options?.compact ? 'if (!hasContent && el.children.length === 0 && !isInteractive) return null;' : ''}

      const node = {};
      if (tag) node.tag = tag;
      if (role) node.role = role;
      if (text) node.text = text;
      if (href) node.href = href;
      if (ariaLabel) node.label = ariaLabel;
      if (placeholder) node.placeholder = placeholder;
      if (type) node.type = type;
      if (value && tag === 'input') node.value = value.slice(0, 100);

      const kids = [];
      for (const child of el.children) {
        const c = walk(child, d - 1);
        if (c) kids.push(c);
      }
      if (kids.length > 0) node.children = kids;

      return node;
    }

    return walk(root, ${depth});
  })()`;

  return evaluate(profileName, js);
}

export async function getTabInfo(profileName: string): Promise<string> {
  const port = getProfilePort(profileName);
  const tabs = await listTabs(port);
  const pages = tabs.filter((t) => t.type === 'page');
  return JSON.stringify(pages.map((t) => ({ id: t.id, title: t.title, url: t.url })));
}
