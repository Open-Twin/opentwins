import { workerData, parentPort, isMainThread } from 'node:worker_threads';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runClaudeAgent } from '../util/claude.js';
import { getPipelineWorkspaceDir, getPipelineStatePath } from '../util/paths.js';
import { fileLog, fileError } from '../util/logger.js';
import { PIPELINE_STAGES } from '../config/defaults.js';
import type { OpenTwinsConfig } from '../config/schema.js';

type StageStatus = 'idle' | 'running' | 'completed' | 'failed';

interface StageState {
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

interface PipelineState {
  runStartedAt?: string;
  runCompletedAt?: string;
  stages: Record<string, StageState>;
}

function readState(): PipelineState {
  const path = getPipelineStatePath();
  if (!existsSync(path)) return { stages: {} };
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PipelineState;
  } catch {
    return { stages: {} };
  }
}

function writeState(state: PipelineState): void {
  const path = getPipelineStatePath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

function updateStage(name: string, patch: Partial<StageState>): void {
  const state = readState();
  state.stages[name] = { ...(state.stages[name] || { status: 'idle' }), ...patch };
  writeState(state);
}

function resetState(stageNames: string[]): void {
  const stages: Record<string, StageState> = {};
  for (const n of stageNames) stages[n] = { status: 'idle' };
  writeState({ runStartedAt: new Date().toISOString(), stages });
}

// Only run worker logic when executed as a Bree worker thread
if (!isMainThread && workerData?.configJson) {
  const config: OpenTwinsConfig = JSON.parse(workerData.configJson);
  const stageName: string | undefined = workerData.stage;

  (async () => {
    const pipelineDir = getPipelineWorkspaceDir();
    const stages = stageName
      ? PIPELINE_STAGES.filter((s) => s.name === stageName)
      : PIPELINE_STAGES;

    if (stages.length === 0) {
      fileError('pipeline', 'Unknown stage', { stage: stageName });
      parentPort?.postMessage(`Unknown stage: ${stageName}`);
      return;
    }

    if (!stageName) {
      resetState(PIPELINE_STAGES.map((s) => s.name));
    }
    fileLog('pipeline', 'Run started', { stages: stages.map((s) => s.name) });

    const parallelStages = stages.filter((s) => s.parallel);
    const sequentialStages = stages.filter((s) => !s.parallel);
    const runStart = Date.now();

    if (parallelStages.length > 0) {
      fileLog('pipeline', 'Parallel block started', { stages: parallelStages.map((s) => s.name) });
      for (const s of parallelStages) {
        updateStage(s.name, { status: 'running', startedAt: new Date().toISOString() });
        fileLog('pipeline', 'Stage started', { stage: s.name });
      }

      const starts = parallelStages.map(() => Date.now());
      const results = await Promise.allSettled(
        parallelStages.map((stage) =>
          runClaudeAgent({
            workingDir: pipelineDir,
            model: stage.model,
            systemPrompt: stage.systemPrompt,
            prompt: stage.prompt,
            timeoutMs: stage.timeoutMs,
            auth: config.auth,
          })
        )
      );

      for (let i = 0; i < parallelStages.length; i++) {
        const result = results[i];
        const stage = parallelStages[i];
        const durationMs = Date.now() - starts[i];
        if (result.status === 'fulfilled' && result.value.exitCode === 0) {
          updateStage(stage.name, { status: 'completed', completedAt: new Date().toISOString(), durationMs });
          fileLog('pipeline', 'Stage completed', { stage: stage.name, durationMs });
          parentPort?.postMessage(`${stage.name}: completed (${durationMs}ms)`);
        } else {
          const err = result.status === 'rejected' ? String(result.reason) : `exit ${result.value.exitCode}`;
          updateStage(stage.name, { status: 'failed', completedAt: new Date().toISOString(), durationMs, error: err });
          fileError('pipeline', 'Stage failed', { stage: stage.name, durationMs, error: err });
          parentPort?.postMessage(`${stage.name}: FAILED - ${err}`);
        }
      }
    }

    for (const stage of sequentialStages) {
      const stageStart = Date.now();
      updateStage(stage.name, { status: 'running', startedAt: new Date().toISOString() });
      fileLog('pipeline', 'Stage started', { stage: stage.name });
      parentPort?.postMessage(`Running: ${stage.name}`);

      try {
        const result = await runClaudeAgent({
          workingDir: pipelineDir,
          model: stage.model,
          systemPrompt: stage.systemPrompt,
          prompt: stage.prompt,
          timeoutMs: stage.timeoutMs,
          auth: config.auth,
        });

        const durationMs = Date.now() - stageStart;
        if (result.exitCode === 0) {
          updateStage(stage.name, { status: 'completed', completedAt: new Date().toISOString(), durationMs });
          fileLog('pipeline', 'Stage completed', { stage: stage.name, durationMs });
        } else {
          updateStage(stage.name, { status: 'failed', completedAt: new Date().toISOString(), durationMs, error: `exit ${result.exitCode}` });
          fileError('pipeline', 'Stage failed', { stage: stage.name, durationMs, exitCode: result.exitCode });
        }
        parentPort?.postMessage(
          `${stage.name}: ${result.exitCode === 0 ? 'completed' : 'FAILED'} (${durationMs}ms)`
        );
      } catch (err) {
        const durationMs = Date.now() - stageStart;
        const msg = err instanceof Error ? err.message : String(err);
        updateStage(stage.name, { status: 'failed', completedAt: new Date().toISOString(), durationMs, error: msg });
        fileError('pipeline', 'Stage failed', { stage: stage.name, durationMs, error: msg });
        parentPort?.postMessage(`${stage.name}: FAILED - ${msg}`);
      }
    }

    const state = readState();
    state.runCompletedAt = new Date().toISOString();
    writeState(state);
    fileLog('pipeline', 'Run completed', { durationMs: Date.now() - runStart });
    parentPort?.postMessage('Pipeline complete');
  })().catch((err) => {
    fileError('pipeline', 'Run error', { error: err instanceof Error ? err.message : String(err) });
    parentPort?.postMessage(`Pipeline error: ${err.message}`);
  });
}

export async function runPipeline(
  config: OpenTwinsConfig,
  stage?: string
): Promise<void> {
  const pipelineDir = getPipelineWorkspaceDir();
  const stages = stage
    ? PIPELINE_STAGES.filter((s) => s.name === stage)
    : PIPELINE_STAGES;

  if (!stage) resetState(PIPELINE_STAGES.map((s) => s.name));

  const parallelStages = stages.filter((s) => s.parallel);
  const sequentialStages = stages.filter((s) => !s.parallel);

  if (parallelStages.length > 0) {
    for (const s of parallelStages) updateStage(s.name, { status: 'running', startedAt: new Date().toISOString() });
    const starts = parallelStages.map(() => Date.now());
    const results = await Promise.allSettled(
      parallelStages.map((s) =>
        runClaudeAgent({
          workingDir: pipelineDir,
          model: s.model,
          systemPrompt: s.systemPrompt,
          prompt: s.prompt,
          timeoutMs: s.timeoutMs,
          auth: config.auth,
        })
      )
    );
    for (let i = 0; i < parallelStages.length; i++) {
      const r = results[i];
      const s = parallelStages[i];
      const durationMs = Date.now() - starts[i];
      if (r.status === 'fulfilled' && r.value.exitCode === 0) {
        updateStage(s.name, { status: 'completed', completedAt: new Date().toISOString(), durationMs });
      } else {
        const err = r.status === 'rejected' ? String(r.reason) : `exit ${r.value.exitCode}`;
        updateStage(s.name, { status: 'failed', completedAt: new Date().toISOString(), durationMs, error: err });
      }
    }
  }

  for (const s of sequentialStages) {
    const stageStart = Date.now();
    updateStage(s.name, { status: 'running', startedAt: new Date().toISOString() });
    try {
      const r = await runClaudeAgent({
        workingDir: pipelineDir,
        model: s.model,
        systemPrompt: s.systemPrompt,
        prompt: s.prompt,
        timeoutMs: s.timeoutMs,
        auth: config.auth,
      });
      const durationMs = Date.now() - stageStart;
      if (r.exitCode === 0) {
        updateStage(s.name, { status: 'completed', completedAt: new Date().toISOString(), durationMs });
      } else {
        updateStage(s.name, { status: 'failed', completedAt: new Date().toISOString(), durationMs, error: `exit ${r.exitCode}` });
      }
    } catch (err) {
      const durationMs = Date.now() - stageStart;
      updateStage(s.name, { status: 'failed', completedAt: new Date().toISOString(), durationMs, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const state = readState();
  state.runCompletedAt = new Date().toISOString();
  writeState(state);
}
