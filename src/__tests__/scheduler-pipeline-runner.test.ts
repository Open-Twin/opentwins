import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { VALID_CONFIG } from './fixtures/config.js';

let tmpDir: string;
const runClaudeAgentMock = vi.fn();

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getOpenTwinsHome: () => tmpDir,
    getWorkspacesDir: () => resolve(tmpDir, 'workspaces'),
    getPipelineWorkspaceDir: () => resolve(tmpDir, 'workspaces', 'pipeline'),
  };
});

vi.mock('../util/claude.js', () => ({
  runClaudeAgent: (opts: unknown) => runClaudeAgentMock(opts),
}));

describe('scheduler/pipeline-runner runPipeline', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-pipeline-'));
    mkdirSync(resolve(tmpDir, 'workspaces', 'pipeline'), { recursive: true });
    runClaudeAgentMock.mockReset();
    runClaudeAgentMock.mockResolvedValue({ output: 'ok', durationMs: 100, exitCode: 0 });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs every stage from PIPELINE_STAGES when no stage is specified', async () => {
    const { runPipeline } = await import('../scheduler/pipeline-runner.js');
    const { PIPELINE_STAGES } = await import('../config/defaults.js');
    await runPipeline(VALID_CONFIG);

    // Number of invocations = number of stages (parallel + sequential).
    expect(runClaudeAgentMock).toHaveBeenCalledTimes(PIPELINE_STAGES.length);
  });

  it('only runs the matching stage when a name is given', async () => {
    const { runPipeline } = await import('../scheduler/pipeline-runner.js');
    await runPipeline(VALID_CONFIG, 'trend-scout');
    expect(runClaudeAgentMock).toHaveBeenCalledTimes(1);

    const opts = runClaudeAgentMock.mock.calls[0][0];
    expect(opts.systemPrompt).toMatch(/Trend Scout/);
    expect(opts.workingDir).toContain('pipeline');
    expect(opts.auth).toEqual(VALID_CONFIG.auth);
  });

  it('runs sequential stages in declared order after parallel stages', async () => {
    const { runPipeline } = await import('../scheduler/pipeline-runner.js');
    const { PIPELINE_STAGES } = await import('../config/defaults.js');

    const callOrder: string[] = [];
    runClaudeAgentMock.mockImplementation(async (opts: { systemPrompt: string }) => {
      // Identify the stage from its system prompt
      const stage = PIPELINE_STAGES.find((s) => opts.systemPrompt === s.systemPrompt);
      if (stage) callOrder.push(stage.name);
      return { output: 'ok', durationMs: 1, exitCode: 0 };
    });

    await runPipeline(VALID_CONFIG);

    const sequential = PIPELINE_STAGES.filter((s) => !s.parallel).map((s) => s.name);
    // The sequential stages should appear in the recorded order.
    const seqIndexes = sequential.map((name) => callOrder.indexOf(name));
    for (let i = 1; i < seqIndexes.length; i++) {
      expect(seqIndexes[i]).toBeGreaterThan(seqIndexes[i - 1]);
    }
  });

  it('continues after a parallel stage rejects (uses Promise.allSettled)', async () => {
    const { runPipeline } = await import('../scheduler/pipeline-runner.js');
    const { PIPELINE_STAGES } = await import('../config/defaults.js');

    // First call (first parallel stage) rejects; rest succeed.
    let first = true;
    runClaudeAgentMock.mockImplementation(async () => {
      if (first) { first = false; throw new Error('boom'); }
      return { output: 'ok', durationMs: 1, exitCode: 0 };
    });

    await expect(runPipeline(VALID_CONFIG)).resolves.toBeUndefined();
    // All stages are still attempted.
    expect(runClaudeAgentMock).toHaveBeenCalledTimes(PIPELINE_STAGES.length);
  });

  it('returns without running anything when stage name is unknown', async () => {
    const { runPipeline } = await import('../scheduler/pipeline-runner.js');
    await runPipeline(VALID_CONFIG, 'no-such-stage');
    expect(runClaudeAgentMock).not.toHaveBeenCalled();
  });
});
