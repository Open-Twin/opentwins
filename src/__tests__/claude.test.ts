import { describe, it, expect, beforeEach, vi } from 'vitest';

// We capture the args and env every time execa / execaCommand is invoked,
// and control the return value per test.
const execaMock = vi.fn();
const execaCommandMock = vi.fn();

vi.mock('execa', () => ({
  execa: (...args: unknown[]) => execaMock(...args),
  execaCommand: (...args: unknown[]) => execaCommandMock(...args),
}));

function lastExecaCall() {
  const call = execaMock.mock.calls.at(-1)!;
  return {
    command: call[0] as string,
    args: call[1] as string[],
    opts: call[2] as Record<string, unknown>,
  };
}

describe('util/claude runClaudeAgent', () => {
  beforeEach(() => {
    execaMock.mockReset();
    execaCommandMock.mockReset();
  });

  it('spawns the claude CLI with strict flags and the prompt as the final arg', async () => {
    execaMock.mockResolvedValue({ stdout: 'done', stderr: '', exitCode: 0 });
    const { runClaudeAgent } = await import('../util/claude.js');

    await runClaudeAgent({
      workingDir: '/tmp/workspace',
      model: 'sonnet',
      prompt: 'Run heartbeat',
      timeoutMs: 60000,
      auth: { provider: 'anthropic', mode: 'api_key', api_key: 'sk-ant-api-secret' },
    });

    const { command, args, opts } = lastExecaCall();
    expect(command).toBe('claude');

    // Non-negotiable safety flags.
    expect(args).toContain('-p');
    expect(args).toContain('--model');
    expect(args).toContain('sonnet');
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).toContain('--strict-mcp-config');
    expect(args).toContain('--disable-slash-commands');

    // Prompt is the last arg (not the model).
    expect(args[args.length - 1]).toBe('Run heartbeat');

    // Timeout and reject:false are propagated.
    expect(opts.timeout).toBe(60000);
    expect(opts.reject).toBe(false);
    expect(opts.cwd).toBe('/tmp/workspace');
  });

  it('sets ANTHROPIC_API_KEY for api_key auth mode', async () => {
    execaMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const { runClaudeAgent } = await import('../util/claude.js');

    await runClaudeAgent({
      workingDir: '/tmp',
      model: 'sonnet',
      prompt: 'x',
      timeoutMs: 1000,
      auth: { provider: 'anthropic', mode: 'api_key', api_key: 'sk-ant-api-SECRET' },
    });

    const env = lastExecaCall().opts.env as Record<string, string>;
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-api-SECRET');
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  it('sets CLAUDE_CODE_OAUTH_TOKEN for subscription auth mode', async () => {
    execaMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const { runClaudeAgent } = await import('../util/claude.js');

    await runClaudeAgent({
      workingDir: '/tmp',
      model: 'sonnet',
      prompt: 'x',
      timeoutMs: 1000,
      auth: { provider: 'anthropic', mode: 'subscription', claude_token: 'sk-ant-oat-TOKEN' },
    });

    const env = lastExecaCall().opts.env as Record<string, string>;
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('sk-ant-oat-TOKEN');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('does NOT place secrets in the argv', async () => {
    execaMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const { runClaudeAgent } = await import('../util/claude.js');

    await runClaudeAgent({
      workingDir: '/tmp',
      model: 'sonnet',
      prompt: 'hello',
      timeoutMs: 1000,
      auth: { provider: 'anthropic', mode: 'api_key', api_key: 'sk-ant-api-SENSITIVE' },
    });

    const { args } = lastExecaCall();
    expect(args.join(' ')).not.toContain('sk-ant-api-SENSITIVE');
  });

  it('includes --append-system-prompt only when systemPrompt is provided', async () => {
    execaMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const { runClaudeAgent } = await import('../util/claude.js');

    await runClaudeAgent({
      workingDir: '/tmp',
      model: 'opus',
      prompt: 'p',
      timeoutMs: 1000,
      auth: { provider: 'anthropic', mode: 'api_key', api_key: 'k' },
    });
    expect(lastExecaCall().args).not.toContain('--append-system-prompt');

    await runClaudeAgent({
      workingDir: '/tmp',
      model: 'opus',
      systemPrompt: 'You are helpful',
      prompt: 'p',
      timeoutMs: 1000,
      auth: { provider: 'anthropic', mode: 'api_key', api_key: 'k' },
    });
    const { args } = lastExecaCall();
    const idx = args.indexOf('--append-system-prompt');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('You are helpful');
  });

  it('combines stdout and stderr in the output field', async () => {
    execaMock.mockResolvedValue({ stdout: 'out', stderr: 'err', exitCode: 0 });
    const { runClaudeAgent } = await import('../util/claude.js');

    const result = await runClaudeAgent({
      workingDir: '/tmp',
      model: 'sonnet',
      prompt: 'x',
      timeoutMs: 1000,
      auth: { provider: 'anthropic', mode: 'api_key', api_key: 'k' },
    });
    expect(result.output).toBe('out\nerr');
    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns stdout only when stderr is empty', async () => {
    execaMock.mockResolvedValue({ stdout: 'out', stderr: '', exitCode: 0 });
    const { runClaudeAgent } = await import('../util/claude.js');

    const result = await runClaudeAgent({
      workingDir: '/tmp',
      model: 'sonnet',
      prompt: 'x',
      timeoutMs: 1000,
      auth: { provider: 'anthropic', mode: 'api_key', api_key: 'k' },
    });
    expect(result.output).toBe('out');
  });

  it('propagates non-zero exit codes to the result', async () => {
    execaMock.mockResolvedValue({ stdout: '', stderr: 'boom', exitCode: 3 });
    const { runClaudeAgent } = await import('../util/claude.js');

    const result = await runClaudeAgent({
      workingDir: '/tmp',
      model: 'sonnet',
      prompt: 'x',
      timeoutMs: 1000,
      auth: { provider: 'anthropic', mode: 'api_key', api_key: 'k' },
    });
    expect(result.exitCode).toBe(3);
  });

  it('returns exitCode=1 when execa throws', async () => {
    execaMock.mockRejectedValue(new Error('spawn failed'));
    const { runClaudeAgent } = await import('../util/claude.js');

    const result = await runClaudeAgent({
      workingDir: '/tmp',
      model: 'sonnet',
      prompt: 'x',
      timeoutMs: 1000,
      auth: { provider: 'anthropic', mode: 'api_key', api_key: 'k' },
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe('spawn failed');
  });

  it('defaults exitCode to 1 when execa returns undefined', async () => {
    execaMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: undefined });
    const { runClaudeAgent } = await import('../util/claude.js');

    const result = await runClaudeAgent({
      workingDir: '/tmp',
      model: 'sonnet',
      prompt: 'x',
      timeoutMs: 1000,
      auth: { provider: 'anthropic', mode: 'api_key', api_key: 'k' },
    });
    expect(result.exitCode).toBe(1);
  });

  it('extends PATH with common CLI install locations', async () => {
    execaMock.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const { runClaudeAgent } = await import('../util/claude.js');

    await runClaudeAgent({
      workingDir: '/tmp',
      model: 'sonnet',
      prompt: 'x',
      timeoutMs: 1000,
      auth: { provider: 'anthropic', mode: 'api_key', api_key: 'k' },
    });

    const env = lastExecaCall().opts.env as Record<string, string>;
    expect(env.PATH).toContain('/usr/local/bin');
    expect(env.PATH).toContain('/opt/homebrew/bin');
  });
});

describe('util/claude validateAuth', () => {
  beforeEach(() => {
    execaMock.mockReset();
    execaCommandMock.mockReset();
  });

  it('returns true when a smoke-test invocation exits 0', async () => {
    execaMock.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });
    const { validateAuth } = await import('../util/claude.js');

    const ok = await validateAuth({ provider: 'anthropic', mode: 'api_key', api_key: 'k' });
    expect(ok).toBe(true);

    const { command, args } = lastExecaCall();
    expect(command).toBe('claude');
    expect(args).toContain('-p');
    expect(args).toContain('--model');
    expect(args).toContain('sonnet');
  });

  it('returns false on non-zero exit', async () => {
    execaMock.mockResolvedValue({ stdout: '', stderr: 'unauthorized', exitCode: 1 });
    const { validateAuth } = await import('../util/claude.js');
    const ok = await validateAuth({ provider: 'anthropic', mode: 'api_key', api_key: 'bad' });
    expect(ok).toBe(false);
  });

  it('returns false when execa throws', async () => {
    execaMock.mockRejectedValue(new Error('ENOENT: claude'));
    const { validateAuth } = await import('../util/claude.js');
    const ok = await validateAuth({ provider: 'anthropic', mode: 'api_key', api_key: 'k' });
    expect(ok).toBe(false);
  });
});

describe('util/claude isClaudeInstalled', () => {
  beforeEach(() => {
    execaMock.mockReset();
    execaCommandMock.mockReset();
  });

  it('returns true when `claude --version` exits 0', async () => {
    execaCommandMock.mockResolvedValue({ exitCode: 0 });
    const { isClaudeInstalled } = await import('../util/claude.js');
    expect(await isClaudeInstalled()).toBe(true);

    expect(execaCommandMock).toHaveBeenCalledTimes(1);
    const [cmd, opts] = execaCommandMock.mock.calls[0];
    expect(cmd).toBe('claude --version');
    expect((opts as { shell: boolean }).shell).toBe(true);
  });

  it('returns false on non-zero exit', async () => {
    execaCommandMock.mockResolvedValue({ exitCode: 127 });
    const { isClaudeInstalled } = await import('../util/claude.js');
    expect(await isClaudeInstalled()).toBe(false);
  });

  it('returns false when the probe throws', async () => {
    execaCommandMock.mockRejectedValue(new Error('command not found'));
    const { isClaudeInstalled } = await import('../util/claude.js');
    expect(await isClaudeInstalled()).toBe(false);
  });
});
