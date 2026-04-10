import { execa, execaCommand } from 'execa';
import { resolve } from 'node:path';
import type { AuthConfig } from '../config/schema.js';

export interface ClaudeRunOptions {
  workingDir: string;
  model: 'sonnet' | 'opus' | 'haiku';
  systemPrompt?: string;
  prompt: string;
  timeoutMs: number;
  auth: AuthConfig;
}

export interface ClaudeRunResult {
  output: string;
  durationMs: number;
  exitCode: number;
}

function buildAuthEnv(auth: AuthConfig): Record<string, string> {
  if (auth.mode === 'api_key') {
    return { ANTHROPIC_API_KEY: auth.api_key! };
  }
  return { CLAUDE_CODE_OAUTH_TOKEN: auth.claude_token! };
}

export async function runClaudeAgent(opts: ClaudeRunOptions): Promise<ClaudeRunResult> {
  const start = Date.now();

  const args = [
    '-p',
    '--model', opts.model,
    '--dangerously-skip-permissions',
    '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}',
    '--disable-slash-commands',
    '--settings', '{"enabledPlugins":{}}',
  ];

  if (opts.systemPrompt) {
    args.push('--append-system-prompt', opts.systemPrompt);
  }

  args.push(opts.prompt);

  try {
    const result = await execa('claude', args, {
      cwd: resolve(opts.workingDir),
      timeout: opts.timeoutMs,
      env: {
        ...extendedEnv(),
        ...buildAuthEnv(opts.auth),
      },
      reject: false,
    });

    return {
      output: result.stdout + (result.stderr ? '\n' + result.stderr : ''),
      durationMs: Date.now() - start,
      exitCode: result.exitCode ?? 1,
    };
  } catch (err) {
    return {
      output: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
      exitCode: 1,
    };
  }
}

export async function validateAuth(auth: AuthConfig): Promise<boolean> {
  try {
    const result = await execa('claude', ['-p', '--model', 'sonnet', 'say ok'], {
      timeout: 30000,
      env: {
        ...extendedEnv(),
        ...buildAuthEnv(auth),
      },
      reject: false,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

// Extend PATH for child processes so we find CLIs in common non-standard locations
const EXTRA_PATHS = [
  `${process.env.HOME}/.local/bin`,
  `${process.env.HOME}/.nvm/versions/node/${process.version}/bin`,
  '/usr/local/bin',
  '/opt/homebrew/bin',
].join(':');

function extendedEnv(): Record<string, string> {
  return { ...process.env as Record<string, string>, PATH: `${EXTRA_PATHS}:${process.env.PATH || ''}` };
}

export async function isClaudeInstalled(): Promise<boolean> {
  try {
    const result = await execaCommand('claude --version', {
      timeout: 5000,
      shell: true,
      reject: false,
      env: extendedEnv(),
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function isOpenClawInstalled(): Promise<boolean> {
  try {
    const result = await execaCommand('openclaw --version', {
      timeout: 5000,
      shell: true,
      reject: false,
      env: extendedEnv(),
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
