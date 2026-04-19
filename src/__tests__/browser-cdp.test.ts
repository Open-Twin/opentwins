import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// A tiny mock WebSocket that records what was sent and lets the test drive
// 'message' events back to the cdp client.
class FakeWs extends EventEmitter {
  sent: Array<{ id: number; method: string; params: unknown }> = [];
  closed = false;

  constructor(public url: string) { super(); }

  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  close() { this.closed = true; }
}

let lastWs: FakeWs | null = null;

vi.mock('ws', () => ({
  WebSocket: class WebSocketShim extends FakeWs {
    constructor(url: string) {
      super(url);
      lastWs = this;
      // Fire 'open' on the microtask queue so callers get a chance to register
      // listeners first. queueMicrotask drains before the next test `await`.
      queueMicrotask(() => this.emit('open'));
    }
  },
}));

async function flush() {
  // Wait until lastWs has received a `send` (or bail after a short timeout).
  // The evaluate flow awaits a fetch, then dynamically imports 'ws', then
  // constructs a WebSocket — several async boundaries to cross.
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (lastWs && lastWs.sent.length > 0) return;
    await new Promise((r) => setTimeout(r, 5));
  }
}

// Silence getProfilePort's dependency on real chrome.ts — cdp only uses it to
// derive a port number; we fix it to 19200 so we know what fetch URLs to expect.
vi.mock('../browser/chrome.js', () => ({
  getProfilePort: () => 19200,
}));

type FetchFn = (url: string, init?: unknown) => Promise<Response>;
let fetchMock: FetchFn;

beforeEach(() => {
  lastWs = null;
  fetchMock = vi.fn();
  // @ts-expect-error node globals
  global.fetch = fetchMock;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper to make a fetch Response-like object
function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    // Two calls happen: cdpHttp reads .text(), not .json()
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  } as unknown as Response;
}

function errResponse(status: number, text = 'nope'): Response {
  return {
    ok: false,
    status,
    text: async () => text,
  } as unknown as Response;
}

describe('cdp openTab', () => {
  it('PUTs /json/new with URL-encoded target and returns tab info', async () => {
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okResponse({ id: 'tab-1', type: 'page', title: 'hi', url: 'https://example.com' }),
    );
    const { openTab } = await import('../browser/cdp.js');

    const result = JSON.parse(await openTab('ot-linkedin', 'https://example.com'));
    expect(result).toEqual({
      ok: true,
      tabId: 'tab-1',
      url: 'https://example.com',
      title: 'hi',
    });

    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('http://127.0.0.1:19200/json/new?');
    expect(call[0]).toContain(encodeURIComponent('https://example.com'));
    expect(call[1].method).toBe('PUT');
  });

  it('throws when CDP HTTP returns non-ok', async () => {
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(errResponse(500, 'kaboom'));
    const { openTab } = await import('../browser/cdp.js');

    await expect(openTab('ot-linkedin', 'https://example.com')).rejects.toThrow(/CDP HTTP 500/);
  });
});

describe('cdp getTabInfo', () => {
  it('filters to page-type tabs and returns id/title/url', async () => {
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okResponse([
      { id: 'a', type: 'page', title: 'Home', url: 'https://a', webSocketDebuggerUrl: 'ws://x' },
      { id: 'b', type: 'background_page', title: 'bg', url: 'chrome://bg' },
      { id: 'c', type: 'page', title: 'X', url: 'https://c', webSocketDebuggerUrl: 'ws://y' },
    ]));
    const { getTabInfo } = await import('../browser/cdp.js');

    const tabs = JSON.parse(await getTabInfo('ot-linkedin')) as Array<{ id: string }>;
    expect(tabs.map((t) => t.id)).toEqual(['a', 'c']);
  });
});

describe('cdp evaluate', () => {
  it('sends Runtime.evaluate via websocket and returns the value', async () => {
    // First fetch: listTabs for getActivePage
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okResponse([
      { id: 'a', type: 'page', title: 'Home', url: 'https://a', webSocketDebuggerUrl: 'ws://x' },
    ]));
    const { evaluate } = await import('../browser/cdp.js');

    const promise = evaluate('ot-linkedin', '1 + 1');

    // Wait a tick for the WS constructor to run and 'open' to fire.
    await flush();
    expect(lastWs).not.toBeNull();
    expect(lastWs!.sent).toHaveLength(1);
    expect(lastWs!.sent[0].method).toBe('Runtime.evaluate');

    // Drive a response back with the same id.
    const { id } = lastWs!.sent[0];
    lastWs!.emit('message', Buffer.from(JSON.stringify({ id, result: { result: { value: 2 } } })));

    const result = JSON.parse(await promise);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it('wraps function-declaration expressions in an IIFE', async () => {
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okResponse([
      { id: 'a', type: 'page', title: 'Home', url: 'https://a', webSocketDebuggerUrl: 'ws://x' },
    ]));
    const { evaluate } = await import('../browser/cdp.js');

    const promise = evaluate('ot-linkedin', 'function(){return 42}');

    await flush();
    const sent = lastWs!.sent[0];
    expect((sent.params as { expression: string }).expression).toBe('(function(){return 42})()');

    lastWs!.emit('message', Buffer.from(JSON.stringify({
      id: sent.id,
      result: { result: { value: 42 } },
    })));
    await promise;
  });

  it('reports CDP exceptionDetails as an error in the JSON payload', async () => {
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okResponse([
      { id: 'a', type: 'page', title: 'Home', url: 'https://a', webSocketDebuggerUrl: 'ws://x' },
    ]));
    const { evaluate } = await import('../browser/cdp.js');

    const promise = evaluate('ot-linkedin', 'throw new Error("boom")');
    await flush();
    const sent = lastWs!.sent[0];

    lastWs!.emit('message', Buffer.from(JSON.stringify({
      id: sent.id,
      result: {
        exceptionDetails: { exception: { description: 'Error: boom' } },
      },
    })));

    const result = JSON.parse(await promise);
    expect(result.error).toBe('Error: boom');
  });

  it('rejects when getActivePage finds no page tab', async () => {
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okResponse([
      { id: 'bg', type: 'background_page', title: 'bg', url: 'chrome://bg' },
    ]));
    const { evaluate } = await import('../browser/cdp.js');

    await expect(evaluate('ot-linkedin', '1')).rejects.toThrow(/No page tab found/);
  });
});

describe('cdp closeTab', () => {
  it('closes by explicit tab id', async () => {
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okResponse(''));
    const { closeTab } = await import('../browser/cdp.js');

    const result = JSON.parse(await closeTab('ot-linkedin', 'tab-xyz'));
    expect(result).toEqual({ ok: true, closed: 'tab-xyz' });

    const url = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toBe('http://127.0.0.1:19200/json/close/tab-xyz');
  });

  it('closes active tab when no id is given', async () => {
    // First call: listTabs for getActivePage
    (fetchMock as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(okResponse([
        { id: 'active', type: 'page', title: 't', url: 'https://a', webSocketDebuggerUrl: 'ws://x' },
      ]))
      .mockResolvedValueOnce(okResponse(''));

    const { closeTab } = await import('../browser/cdp.js');
    const result = JSON.parse(await closeTab('ot-linkedin'));
    expect(result).toEqual({ ok: true, closed: 'active' });
  });
});

describe('cdp uploadFile', () => {
  // Wait for the next outbound message (index `n`), acking as needed.
  async function waitForSend(n: number, timeoutMs = 500): Promise<{ id: number; method: string; params: unknown }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (lastWs && lastWs.sent.length > n) return lastWs.sent[n];
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`timed out waiting for send[${n}] (have ${lastWs?.sent.length ?? 0})`);
  }
  function ack(n: number): void {
    lastWs!.emit('message', Buffer.from(JSON.stringify({ id: lastWs!.sent[n].id, result: {} })));
  }

  it('enables Page, arms file-chooser interception, delivers file on event, then disables', async () => {
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okResponse([
      { id: 'a', type: 'page', title: 'Home', url: 'https://a', webSocketDebuggerUrl: 'ws://x' },
    ]));
    const { uploadFile } = await import('../browser/cdp.js');
    const promise = uploadFile('ot-linkedin', '/tmp/doc.pdf', 5000);

    // Arm: Page.enable, ack, then Page.setInterceptFileChooserDialog{enabled:true}
    const enable = await waitForSend(0);
    expect(enable.method).toBe('Page.enable');
    ack(0);
    const intercept = await waitForSend(1);
    expect(intercept.method).toBe('Page.setInterceptFileChooserDialog');
    expect(intercept.params).toMatchObject({ enabled: true });
    ack(1);

    // Chooser opens — driver sends setFileInputFiles + disable interception
    lastWs!.emit('message', Buffer.from(JSON.stringify({
      method: 'Page.fileChooserOpened',
      params: { backendNodeId: 42, mode: 'selectSingle' },
    })));
    const setFiles = await waitForSend(2);
    expect(setFiles.method).toBe('DOM.setFileInputFiles');
    expect(setFiles.params).toMatchObject({ files: ['/tmp/doc.pdf'], backendNodeId: 42 });
    ack(2);
    const disable = await waitForSend(3);
    expect(disable.method).toBe('Page.setInterceptFileChooserDialog');
    expect(disable.params).toMatchObject({ enabled: false });
    ack(3);

    const result = JSON.parse(await promise);
    expect(result).toEqual({ ok: true, filePath: '/tmp/doc.pdf', backendNodeId: 42 });
    expect(lastWs!.closed).toBe(true);
  });

  it('rejects when no fileChooserOpened event arrives before timeout', async () => {
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okResponse([
      { id: 'a', type: 'page', title: 'Home', url: 'https://a', webSocketDebuggerUrl: 'ws://x' },
    ]));
    const { uploadFile } = await import('../browser/cdp.js');
    const promise = uploadFile('ot-linkedin', '/tmp/doc.pdf', 50);
    // Don't ack anything — let the timeout fire.
    await expect(promise).rejects.toThrow(/Upload timeout after 50ms/);
    expect(lastWs!.closed).toBe(true);
  });

  it('selector mode: DOM.getDocument → querySelector → setFileInputFiles, no intercept', async () => {
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okResponse([
      { id: 'a', type: 'page', title: 'Home', url: 'https://a', webSocketDebuggerUrl: 'ws://x' },
    ]));
    const { uploadFile } = await import('../browser/cdp.js');
    const promise = uploadFile('ot-substack', '/tmp/note.png', 5000, 'input[type="file"]');

    const doc = await waitForSend(0);
    expect(doc.method).toBe('DOM.getDocument');
    lastWs!.emit('message', Buffer.from(JSON.stringify({ id: doc.id, result: { root: { nodeId: 1 } } })));

    const qs = await waitForSend(1);
    expect(qs.method).toBe('DOM.querySelector');
    expect(qs.params).toMatchObject({ nodeId: 1, selector: 'input[type="file"]' });
    lastWs!.emit('message', Buffer.from(JSON.stringify({ id: qs.id, result: { nodeId: 42 } })));

    const setFiles = await waitForSend(2);
    expect(setFiles.method).toBe('DOM.setFileInputFiles');
    expect(setFiles.params).toMatchObject({ files: ['/tmp/note.png'], nodeId: 42 });
    lastWs!.emit('message', Buffer.from(JSON.stringify({ id: setFiles.id, result: {} })));

    const result = JSON.parse(await promise);
    expect(result).toEqual({ ok: true, filePath: '/tmp/note.png', selector: 'input[type="file"]', nodeId: 42 });
    // Never enables Page.setInterceptFileChooserDialog in selector mode.
    expect(lastWs!.sent.find((m) => m.method === 'Page.setInterceptFileChooserDialog')).toBeUndefined();
  });

  it('selector mode: rejects when querySelector returns nodeId 0', async () => {
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okResponse([
      { id: 'a', type: 'page', title: 'Home', url: 'https://a', webSocketDebuggerUrl: 'ws://x' },
    ]));
    const { uploadFile } = await import('../browser/cdp.js');
    const promise = uploadFile('ot-substack', '/tmp/note.png', 5000, 'input.missing');

    const doc = await waitForSend(0);
    lastWs!.emit('message', Buffer.from(JSON.stringify({ id: doc.id, result: { root: { nodeId: 1 } } })));
    const qs = await waitForSend(1);
    lastWs!.emit('message', Buffer.from(JSON.stringify({ id: qs.id, result: { nodeId: 0 } })));

    await expect(promise).rejects.toThrow(/selector matched no element/);
  });

  it('rejects when fileChooserOpened event is missing backendNodeId', async () => {
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okResponse([
      { id: 'a', type: 'page', title: 'Home', url: 'https://a', webSocketDebuggerUrl: 'ws://x' },
    ]));
    const { uploadFile } = await import('../browser/cdp.js');
    const promise = uploadFile('ot-linkedin', '/tmp/doc.pdf', 5000);

    await waitForSend(0);
    ack(0);
    await waitForSend(1);
    ack(1);

    lastWs!.emit('message', Buffer.from(JSON.stringify({
      method: 'Page.fileChooserOpened',
      params: {},
    })));
    await expect(promise).rejects.toThrow(/missing backendNodeId/);
  });
});

describe('cdp clickElement', () => {
  it('evaluates a querySelector+click expression via Runtime.evaluate', async () => {
    (fetchMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okResponse([
      { id: 'a', type: 'page', title: 'Home', url: 'https://a', webSocketDebuggerUrl: 'ws://x' },
    ]));
    const { clickElement } = await import('../browser/cdp.js');

    const promise = clickElement('ot-linkedin', 'button.primary');
    await flush();
    const sent = lastWs!.sent[0];
    expect((sent.params as { expression: string }).expression).toContain("document.querySelector");
    expect((sent.params as { expression: string }).expression).toContain('button.primary');

    lastWs!.emit('message', Buffer.from(JSON.stringify({
      id: sent.id,
      result: { result: { value: { ok: true, tag: 'BUTTON', text: 'Click me' } } },
    })));

    const result = JSON.parse(await promise);
    expect(result.ok).toBe(true);
    expect(result.value.tag).toBe('BUTTON');
  });
});
