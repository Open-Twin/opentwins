import { input, confirm, checkbox, select } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { mkdirSync } from 'node:fs';
import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import { OpenTwinsConfigSchema, type OpenTwinsConfig, type AuthConfig, type ContentPillar } from '../../config/schema.js';
import { saveConfig, configExists } from '../../config/loader.js';
import { generateAgentFiles } from '../../config/generator.js';
import { DEFAULT_LIMITS } from '../../config/defaults.js';
import { isClaudeInstalled, isOpenClawInstalled, validateAuth } from '../../util/claude.js';
import { getOpenTwinsHome } from '../../util/paths.js';
import { PLATFORM_TYPES, PLATFORM_DISPLAY_NAMES, PLATFORM_HANDLE_LABELS, PLATFORM_URLS } from '../../util/platform-types.js';
import type { PlatformType } from '../../util/platform-types.js';
import * as log from '../../util/logger.js';

program
  .command('init')
  .description('Initialize OpenTwins with your identity and platforms')
  .option('--force', 'Overwrite existing config')
  .action(handleAction(async (opts: { force?: boolean }) => {
    console.log('');
    console.log(chalk.bold('  Welcome to OpenTwins'));
    console.log(chalk.dim('  Your autonomous digital twins across every social platform'));
    console.log('');

    if (configExists() && !opts.force) {
      log.warn('Config already exists. Use --force to overwrite.');
      return;
    }

    // ── Step 1: Prerequisites ─────────────────────────────────────
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
      process.exit(1);
    }
    log.success('Claude Code CLI found');

    const openclawOk = await isOpenClawInstalled();
    if (!openclawOk) {
      log.warn('OpenClaw CLI not found.');
      console.log('');
      console.log('  OpenClaw provides browser automation for platform agents.');
      console.log('  Without it, agents cannot interact with social platforms.');
      console.log('');
      console.log('  Install OpenClaw:');
      console.log(chalk.cyan('    npm install -g openclaw'));
      console.log('');
      const continueAnyway = await confirm({
        message: 'Continue without OpenClaw? (you can install it later)',
        default: true,
      });
      if (!continueAnyway) {
        process.exit(0);
      }
    } else {
      log.success('OpenClaw CLI found');
    }

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
    console.log('     opentwins start --ui');
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
