import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'bin/opentwins': 'bin/opentwins.ts',
    'src/cli/index': 'src/cli/index.ts',
    'src/scheduler/pipeline-runner': 'src/scheduler/pipeline-runner.ts',
    'src/scheduler/agent-runner': 'src/scheduler/agent-runner.ts',
  },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  splitting: true,
  clean: true,
  dts: false,
  sourcemap: true,
  // Keep node_modules external, bundle everything in src/
  packages: 'external',
});
