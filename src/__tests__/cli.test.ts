import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { VALID_CONFIG } from './fixtures/config.js';

// Shared temp home for all tests.
let tmpDir: string;

// All CLI commands use these paths transitively. We mock them up front.
vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getOpenTwinsHome: () => tmpDir,
    getConfigPath: () => resolve(tmpDir, 'config.json'),
    getDatabasePath: () => resolve(tmpDir, 'data.db'),
    getWorkspacesDir: () => resolve(tmpDir, 'workspaces'),
    getPlatformWorkspaceDir: (p: string) => resolve(tmpDir, 'workspaces', `agent-${p}`),
    getPipelineWorkspaceDir: () => resolve(tmpDir, 'workspaces', 'pipeline'),
    getLocksDir: () => resolve(tmpDir, 'locks'),
    getLockFile: (n: string) => resolve(tmpDir, 'locks', `${n}.lock`),
    getLastHeartbeatFile: (n: string) => resolve(tmpDir, 'locks', `${n}.last_heartbeat`),
    getPidFile: () => resolve(tmpDir, 'opentwins.pid'),
    getBrowserProfilesDir: () => resolve(tmpDir, 'browser-profiles'),
    getBrowserProfilesConfigPath: () => resolve(tmpDir, 'browser-profiles', 'profiles.json'),
  };
});

// Claude subprocess: always succeed.
vi.mock('../util/claude.js', () => ({
  runClaudeAgent: vi.fn(async () => ({ output: 'ok', durationMs: 1, exitCode: 0 })),
  validateAuth: vi.fn(async () => true),
  isClaudeInstalled: vi.fn(async () => true),
}));

// Scheduler/daemon: mock the spawn + pid check so we don't spawn real processes.
const stopDaemonMock = vi.fn(async () => false);
const isDaemonRunningMock = vi.fn(async () => false);
const startDaemonMock = vi.fn(async () => 12345);
vi.mock('../scheduler/daemon.js', () => ({
  stopDaemon: stopDaemonMock,
  isDaemonRunning: isDaemonRunningMock,
  startDaemon: startDaemonMock,
}));

describe('cli/error-handler handleAction', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('calls the wrapped fn and passes arguments through', async () => {
    const { handleAction } = await import('../cli/error-handler.js');
    const spy = vi.fn(async (_a: string, _b: number) => {});
    const wrapped = handleAction(spy);
    await wrapped('hello', 42);
    expect(spy).toHaveBeenCalledWith('hello', 42);
  });

  it('logs the error and exits on throw', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_: number) => {
      throw new Error('process.exit called');
    }) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { handleAction } = await import('../cli/error-handler.js');
    const wrapped = handleAction(async () => { throw new Error('boom'); });

    await expect(wrapped()).rejects.toThrow(/process\.exit called/);
    expect(errSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('stringifies non-Error throws before logging', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_: number) => {
      throw new Error('x');
    }) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { handleAction } = await import('../cli/error-handler.js');
    const wrapped = handleAction(async () => { throw 'plain string'; });
    await expect(wrapped()).rejects.toThrow();

    // console.error was called with chalk-formatted output that includes the string.
    const joined = errSpy.mock.calls.map((c) => c.join(' ')).join(' ');
    expect(joined).toContain('plain string');
    exitSpy.mockRestore();
  });
});

describe('cli command registration', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-cli-reg-'));
    vi.resetModules();
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('registers all top-level commands on the commander program', async () => {
    const { program } = await import('../cli/index.js');
    const names = program.commands.map((c) => c.name());

    // The CLI must surface every command we advertise.
    for (const expected of ['init', 'start', 'stop', 'status', 'run', 'browser', 'config', 'ui', 'logs', 'audit']) {
      expect(names).toContain(expected);
    }
  });

  it('browser command has subcommands for setup/login/list/health', async () => {
    const { program } = await import('../cli/index.js');
    const browser = program.commands.find((c) => c.name() === 'browser');
    expect(browser).toBeDefined();
    const subs = browser!.commands.map((c) => c.name());
    expect(subs).toContain('setup');
    expect(subs).toContain('login');
    expect(subs).toContain('list');
    expect(subs).toContain('health');
  });

  it('run command has a --stage option', async () => {
    const { program } = await import('../cli/index.js');
    const run = program.commands.find((c) => c.name() === 'run');
    expect(run).toBeDefined();
    const opt = run!.options.find((o) => o.long === '--stage');
    expect(opt).toBeDefined();
  });

  it('start command has a --daemon flag', async () => {
    const { program } = await import('../cli/index.js');
    const start = program.commands.find((c) => c.name() === 'start');
    const opt = start!.options.find((o) => o.long === '--daemon');
    expect(opt).toBeDefined();
  });
});

describe('cli stop command', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-cli-stop-'));
    vi.resetModules();
    stopDaemonMock.mockReset();
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('calls stopDaemon and logs success when a daemon was stopped', async () => {
    stopDaemonMock.mockResolvedValueOnce(true);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { program } = await import('../cli/index.js');
    await program.parseAsync(['node', 'opentwins', 'stop']);

    expect(stopDaemonMock).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('warns when no daemon is running', async () => {
    stopDaemonMock.mockResolvedValueOnce(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { program } = await import('../cli/index.js');
    await program.parseAsync(['node', 'opentwins', 'stop']);

    expect(stopDaemonMock).toHaveBeenCalled();
    // We don't assert exact log output — chalk escape codes are noisy — just
    // confirm the "!" warning prefix appeared somewhere.
    const joined = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(joined).toMatch(/No running daemon/);
    logSpy.mockRestore();
  });
});

describe('cli status command', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-cli-status-'));
    vi.resetModules();
    isDaemonRunningMock.mockReset();
    isDaemonRunningMock.mockResolvedValue(false);
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('exits 1 when no config exists', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_: number) => {
      throw new Error('exit');
    }) as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { program } = await import('../cli/index.js');
    await expect(program.parseAsync(['node', 'opentwins', 'status'])).rejects.toThrow(/exit/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('prints status when config exists', async () => {
    writeFileSync(resolve(tmpDir, 'config.json'), JSON.stringify(VALID_CONFIG), 'utf-8');
    isDaemonRunningMock.mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { program } = await import('../cli/index.js');
    await program.parseAsync(['node', 'opentwins', 'status']);

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('OpenTwins Status');
    expect(output).toContain('linkedin');
    expect(output).toContain('twitter');
    logSpy.mockRestore();
  });
});

describe('cli logs command', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-cli-logs-'));
    vi.resetModules();
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('reports no activity log when the file is missing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { program } = await import('../cli/index.js');
    await program.parseAsync(['node', 'opentwins', 'logs', 'linkedin']);

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('No activity log');
    logSpy.mockRestore();
  });

  it('prints the file contents when the log exists', async () => {
    const today = new Date().toISOString().split('T')[0];
    const memDir = resolve(tmpDir, 'workspaces', 'agent-linkedin', 'memory');
    mkdirSync(memDir, { recursive: true });
    writeFileSync(resolve(memDir, `${today}.md`), '# entry\nsome text', 'utf-8');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { program } = await import('../cli/index.js');
    await program.parseAsync(['node', 'opentwins', 'logs', 'linkedin']);

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('# entry');
    logSpy.mockRestore();
  });
});

describe('cli audit command', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-cli-audit-'));
    vi.resetModules();
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('reports missing summary when today_summary.json does not exist', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { program } = await import('../cli/index.js');
    await program.parseAsync(['node', 'opentwins', 'audit', 'linkedin']);

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('No summary data');
    logSpy.mockRestore();
  });

  it('prints the quality report when today_summary.json exists', async () => {
    const memDir = resolve(tmpDir, 'workspaces', 'agent-linkedin', 'memory');
    mkdirSync(memDir, { recursive: true });
    writeFileSync(
      resolve(memDir, 'today_summary.json'),
      JSON.stringify({
        date: new Date().toISOString().split('T')[0],
        comments: 4,
        avg_words: 22,
        disagreements: 1,
        questions: 2,
        last_style: 'short',
        styles: { insight: 2, short: 2 },
      }),
      'utf-8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { program } = await import('../cli/index.js');
    await program.parseAsync(['node', 'opentwins', 'audit', 'linkedin']);

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Quality Audit');
    expect(output).toContain('Comments: 4');
    expect(output).toContain('Avg words: 22');
    expect(output).toContain('insight');
    logSpy.mockRestore();
  });
});
