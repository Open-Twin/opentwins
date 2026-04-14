import { input, confirm, checkbox, select } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { mkdirSync } from 'node:fs';
import { execaCommand } from 'execa';
import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import { OpenTwinsConfigSchema, type OpenTwinsConfig, type AuthConfig, type ContentPillar } from '../../config/schema.js';
import { saveConfig, configExists } from '../../config/loader.js';
import { generateAgentFiles } from '../../config/generator.js';
import { DEFAULT_LIMITS } from '../../config/defaults.js';
import { isClaudeInstalled, validateAuth } from '../../util/claude.js';
import { isChromeInstalled } from '../../browser/chrome.js';
import { getOpenTwinsHome } from '../../util/paths.js';
import { PLATFORM_TYPES, PLATFORM_DISPLAY_NAMES, PLATFORM_HANDLE_LABELS, PLATFORM_URLS } from '../../util/platform-types.js';
import type { PlatformType } from '../../util/platform-types.js';
import * as log from '../../util/logger.js';

async function checkPrereqs(): Promise<boolean> {
  console.log(chalk.bold.underline('Step 1: Prerequisites'));
  console.log('');

  const claudeOk = await isClaudeInstalled();
  if (!claudeOk) {
    log.error('Claude Code CLI not found.');
    console.log('');
    console.log('  Install Claude Code:');
    console.log(chalk.cyan('    npm install -g @anthropic-ai/claude-code'));
    console.log('');
    console.log('  Then run `opentwins init` again.');
    return false;
  }
  log.success('Claude Code CLI found');

  if (!isChromeInstalled()) {
    log.error('Google Chrome not found.');
    console.log('');
    console.log('  Chrome is required for browser automation.');
    console.log('  Install Google Chrome from https://www.google.com/chrome/');
    console.log('');
    console.log('  Or set CHROME_PATH env var to your Chrome/Chromium binary.');
    return false;
  }
  log.success('Google Chrome found');
  return true;
}

program
  .command('init')
  .description('Initialize OpenTwins with your identity and platforms')
  .option('--force', 'Overwrite existing config')
  .option('--cli', 'Use the interactive CLI prompts instead of the web wizard')
  .action(handleAction(async (opts: { force?: boolean; cli?: boolean }) => {
    console.log('');
    console.log(chalk.bold('  Welcome to OpenTwins'));
    console.log(chalk.dim('  Your autonomous digital twins across every social platform'));
    console.log('');

    if (configExists() && !opts.force) {
      log.warn('Config already exists. Use --force to overwrite.');
      return;
    }

    const prereqsOk = await checkPrereqs();
    if (!prereqsOk) process.exit(1);

    // Default: launch the web wizard unless --cli was requested
    if (!opts.cli) {
      console.log('');
      console.log(chalk.bold.underline('Step 2: Web Setup Wizard'));
      console.log('');
      const port = 3847;
      console.log(chalk.dim('  Launching the setup wizard in your browser…'));
      console.log(chalk.cyan(`    http://localhost:${port}/setup`));
      console.log('');

      // Start the dashboard and open the browser
      const { startDashboard } = await import('../../ui/server.js');
      await startDashboard(port);

      // Open browser (best-effort)
      try {
        await execaCommand(`open http://localhost:${port}/setup`, { shell: true, reject: false });
      } catch {
        // ignore — user can open manually
      }

      console.log(chalk.dim('  The wizard is running. Follow the steps in your browser.'));
      console.log(chalk.dim('  Press Ctrl+C here to stop the server.'));
      console.log('');
      // Keep the process alive — the dashboard server runs in-process
      return;
    }

    // ── Fallback: the old interactive CLI flow (--cli) ────────────
    console.log(chalk.dim('  Running interactive CLI flow (--cli flag set)'));
    console.log('');

    // ── Step 2: Authentication ────────────────────────────────────
    console.log('');
    console.log(chalk.bold.underline('Step 2: Authentication'));
    console.log('');

    const authMode = await select({
      message: 'How do you want to authenticate with Claude?',
      choices: [
        {
          name: 'Claude Code subscription (OAuth token)',
          value: 'subscription' as const,
          description: 'Uses your Claude Code subscription. Run: claude setup-token',
        },
        {
          name: 'Anthropic API key',
          value: 'api_key' as const,
          description: 'Uses your Anthropic API key from console.anthropic.com',
        },
      ],
    });

    let auth: AuthConfig;

    if (authMode === 'subscription') {
      console.log('');
      console.log(chalk.dim('  To generate a token:'));
      console.log(chalk.cyan('    claude setup-token'));
      console.log('');

      const claudeToken = await input({
        message: 'Paste your Claude Code auth token:',
        validate: (val) => {
          if (val.length < 20) return 'Token seems too short';
          if (val.startsWith('sk-ant-api')) return 'That looks like an API key. Choose "Anthropic API key" instead.';
          if (!val.startsWith('sk-ant-oat')) return 'OAuth token should start with sk-ant-oat...';
          return true;
        },
      });

      auth = { provider: 'anthropic', mode: 'subscription', claude_token: claudeToken };
    } else {
      console.log('');
      console.log(chalk.dim('  Get your API key at:'));
      console.log(chalk.cyan('    https://console.anthropic.com/settings/keys'));
      console.log('');

      const apiKey = await input({
        message: 'Paste your Anthropic API key:',
        validate: (val) => {
          if (val.length < 20) return 'Key seems too short';
          if (val.startsWith('sk-ant-oat')) return 'That looks like an OAuth token. Choose "Claude Code subscription" instead.';
          if (!val.startsWith('sk-ant-api')) return 'API key should start with sk-ant-api...';
          return true;
        },
      });

      auth = { provider: 'anthropic', mode: 'api_key', api_key: apiKey };
    }

    const spinner = ora('Validating credentials...').start();
    const authValid = await validateAuth(auth);
    if (!authValid) {
      spinner.fail('Authentication failed. Check your credentials and try again.');
      process.exit(1);
    }
    spinner.succeed('Authentication verified');

    // ── Step 3: About You ─────────────────────────────────────────
    console.log('');
    console.log(chalk.bold.underline('Step 3: About You'));
    console.log('');

    const name = await input({ message: "What's your full name?" });
    const displayName = await input({
      message: 'Casual/short name (used in prompts):',
      default: name.split(' ')[0],
    });
    const role = await input({
      message: 'Your current role (e.g. "Director of Engineering", "Founder"):',
    });
    const headline = await input({
      message: 'Professional headline (e.g. "Director of Engineering | Building AI Tools"):',
    });
    const bio = await input({
      message: 'Short bio - 2-3 sentences about what you do:',
    });
    const brandTagline = await input({
      message: 'How should your twins describe you in one phrase? (e.g. "The AI-Native Engineer"):',
    });
    const certsInput = await input({
      message: 'Certifications (e.g. "PMP, AWS SA", or empty):',
      default: '',
    });
    const certifications = certsInput ? certsInput.split(',').map((s) => s.trim()) : [];
    const confsInput = await input({
      message: 'Conferences you mention (e.g. "KubeCon, re:Invent", or empty):',
      default: '',
    });
    const conferenceMentions = confsInput ? confsInput.split(',').map((s) => s.trim()) : [];
    const hooksInput = await input({
      message: 'Things that make you stand out (e.g. "I manage 50 microservices, I automate everything"):',
      default: '',
    });
    const experienceHooks = hooksInput ? hooksInput.split(',').map((s) => s.trim()) : [];

    // ── Step 4: Topics & Platforms ────────────────────────────────
    console.log('');
    console.log(chalk.bold.underline('Step 4: Topics & Platforms'));
    console.log('');

    const pillarsInput = await input({
      message: 'What topics should your twins engage on? (comma-separated, e.g. "DevOps, AI Engineering, Leadership"):',
    });
    const pillars: ContentPillar[] = pillarsInput.split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({
      name,
      topics: [name.toLowerCase()],
      mention_templates: [],
      target_percentage: 0,
    }));

    if (pillars.length === 0) {
      log.error('Enter at least one topic');
      process.exit(1);
    }

    console.log('');
    const selectedPlatforms = await checkbox({
      message: 'Which platforms? (space to select)',
      choices: PLATFORM_TYPES.map((p) => ({
        name: PLATFORM_DISPLAY_NAMES[p],
        value: p,
      })),
    });

    if (selectedPlatforms.length === 0) {
      log.error('Select at least one platform');
      process.exit(1);
    }

    const platforms = [];
    for (const platform of selectedPlatforms) {
      const handle = await input({
        message: `${PLATFORM_DISPLAY_NAMES[platform]} - ${PLATFORM_HANDLE_LABELS[platform]}:`,
      });
      platforms.push({
        platform: platform as PlatformType,
        handle,
        profile_url: `${PLATFORM_URLS[platform]}${handle}`,
        enabled: true,
        limits: DEFAULT_LIMITS[platform],
      });
    }

    // ── Step 5: Preferences ───────────────────────────────────────
    console.log('');
    console.log(chalk.bold.underline('Step 5: Preferences'));
    console.log('');

    const formality = await select({
      message: 'How should your twins sound?',
      choices: [
        { name: 'Casual - "tbh", contractions, like texting a friend', value: 'casual' as const },
        { name: 'Balanced - conversational but polished', value: 'balanced' as const },
        { name: 'Professional - clean, structured, LinkedIn-style', value: 'professional' as const },
      ],
      default: 'casual',
    });

    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const timezone = await input({
      message: `Timezone:`,
      default: detectedTz,
    });

    const pipelineEnabled = await confirm({
      message: 'Enable content pipeline? (generates daily articles and briefs)',
      default: true,
    });

    // ── Generate ──────────────────────────────────────────────────
    console.log('');
    const genSpinner = ora('Generating agent files...').start();

    const home = getOpenTwinsHome();
    mkdirSync(home, { recursive: true });

    const config: OpenTwinsConfig = OpenTwinsConfigSchema.parse({
      auth,
      name,
      display_name: displayName,
      headline,
      bio,
      brand_tagline: brandTagline,
      role,
      certifications,
      conference_mentions: conferenceMentions,
      experience_hooks: experienceHooks,
      banned_phrases: [],
      pillars,
      platforms,
      voice: { formality, language: 'en' },
      timezone,
      active_hours: { start: 8, end: 23 },
      pipeline_start_hour: 6,
      pipeline_enabled: pipelineEnabled,
    });

    saveConfig(config);
    const { generated } = await generateAgentFiles(config);
    genSpinner.succeed(`Generated ${generated.length} agent files`);

    // ── Done ──────────────────────────────────────────────────────
    console.log('');
    log.success(`Config saved to ${home}/config.json`);
    console.log('');
    console.log(chalk.bold('Next steps:'));
    console.log('');
    console.log('  1. Set up browser profiles:');
    for (const p of platforms) {
      console.log(`     opentwins browser setup ${p.platform}`);
    }
    console.log('');
    console.log('  2. Start your twins:');
    console.log('     opentwins start -d   # scheduler + dashboard at http://localhost:3847');
    console.log('');

    const startDashboard = await confirm({
      message: 'Open the dashboard now?',
      default: true,
    });

    if (startDashboard) {
      const port = 3847;
      log.info(`Starting dashboard on http://localhost:${port}`);
      const { startDashboard: launch } = await import('../../ui/server.js');
      await launch(port);
    }
  }));
