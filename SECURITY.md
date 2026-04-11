# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in OpenTwins, please report it responsibly.

**Do NOT open a public issue.**

Instead, email **opentwins@proton.me** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge your report within 48 hours and aim to release a fix within 7 days for critical issues.

## Security Considerations

OpenTwins manages browser sessions and API tokens. Keep in mind:

- **Config file** (`~/.opentwins/config.json`) may contain API keys. It is excluded from git by default.
- **Browser profiles** store login sessions. Treat `~/.opentwins/chrome-profiles/` as sensitive.
- **Claude tokens** are stored in config. Never commit config files to version control.
- **Agent workspaces** may contain generated content. Review before sharing.

## Best Practices

- Keep OpenTwins and its dependencies updated
- Use environment variables for sensitive values when possible
- Review agent-generated content before it goes live
- Set appropriate rate limits per platform
