import { workerData, parentPort, isMainThread } from 'node:worker_threads';
import { runClaudeAgent } from '../util/claude.js';
import { getPipelineWorkspaceDir } from '../util/paths.js';
import { PIPELINE_STAGES } from '../config/defaults.js';
import type { OpenTwinsConfig } from '../config/schema.js';

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
      parentPort?.postMessage(`Unknown stage: ${stageName}`);
      return;
    }

    const parallelStages = stages.filter((s) => s.parallel);
    const sequentialStages = stages.filter((s) => !s.parallel);

    if (parallelStages.length > 0) {
      parentPort?.postMessage(
        `Running parallel: ${parallelStages.map((s) => s.name).join(', ')}`
      );

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
        if (result.status === 'fulfilled') {
          parentPort?.postMessage(
            `${stage.name}: completed (${result.value.durationMs}ms)`
          );
        } else {
          parentPort?.postMessage(`${stage.name}: FAILED - ${result.reason}`);
        }
      }
    }

    for (const stage of sequentialStages) {
      parentPort?.postMessage(`Running: ${stage.name}`);

      const result = await runClaudeAgent({
        workingDir: pipelineDir,
        model: stage.model,
        systemPrompt: stage.systemPrompt,
        prompt: stage.prompt,
        timeoutMs: stage.timeoutMs,
        auth: config.auth,
      });

      parentPort?.postMessage(
        `${stage.name}: ${result.exitCode === 0 ? 'completed' : 'FAILED'} (${result.durationMs}ms)`
      );
    }

    parentPort?.postMessage('Pipeline complete');
  })().catch((err) => {
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

  const parallelStages = stages.filter((s) => s.parallel);
  const sequentialStages = stages.filter((s) => !s.parallel);

  if (parallelStages.length > 0) {
    await Promise.allSettled(
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
  }

  for (const s of sequentialStages) {
    await runClaudeAgent({
      workingDir: pipelineDir,
      model: s.model,
      systemPrompt: s.systemPrompt,
      prompt: s.prompt,
      timeoutMs: s.timeoutMs,
      auth: config.auth,
    });
  }
}
