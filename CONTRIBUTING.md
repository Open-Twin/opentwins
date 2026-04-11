# Contributing to OpenTwins

Thanks for your interest in contributing to OpenTwins! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/opentwins.git`
3. Install dependencies: `npm install`
4. Build: `npm run build`
5. Run: `opentwins init`

## Development Setup

**Prerequisites:**
- Node.js 18+
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)


**Build and test locally:**
```bash
npm run build
npm link          # makes `opentwins` available globally
opentwins init    # run the setup wizard
```

## Making Changes

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Build and verify: `npm run build`
4. Commit with a clear message describing what and why
5. Push and open a Pull Request

## Pull Request Guidelines

- Keep PRs focused - one feature or fix per PR
- Update documentation if you change behavior
- Add/update templates? Make sure all Handlebars variables exist in `src/config/generator.ts`
- Test with at least one platform agent before submitting

## Project Structure

```
src/
  cli/           # CLI commands (init, run, browser)
  config/        # Config schema, loader, generator
  scheduler/     # Bree job scheduler, agent runner
  browser/       # Chrome browser profile management
  templates/     # Handlebars templates per platform
  ui/            # Express API + React dashboard
    api/         # REST endpoints
    client/      # Vite + React frontend
  util/          # Shared utilities
website/         # Marketing site (opentwins.ai)
```

## Adding a New Platform

1. Create template directory: `src/templates/platforms/your-platform/`
2. Add required templates: `CLAUDE.md.hbs`, `HEARTBEAT.md.hbs`, `SOUL.md.hbs`, `IDENTITY.md.hbs`, `PLAYBOOK.md.hbs`, `TOOLS.md.hbs`, and `BROWSER-*.md.hbs` files
3. Add the platform to `src/util/platform-types.ts`
4. Add login URL to `src/browser/manager.ts`
5. Add API key requirements (if any) to `src/util/platform-types.ts`

## Reporting Issues

- Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) for bugs
- Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) for ideas
- Include your Node.js version, OS, and OpenTwins version

## Code Style

- TypeScript with strict mode
- No unnecessary abstractions - keep it simple
- No comments that restate the code
- Single dash (-) only, no em dashes

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
