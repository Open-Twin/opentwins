export const PLATFORM_TYPES = [
  'reddit',
  'twitter',
  'linkedin',
  'bluesky',
  'threads',
  'medium',
  'substack',
  'devto',
  'ph',
  'ih',
] as const;

export type PlatformType = (typeof PLATFORM_TYPES)[number];

export const PLATFORM_DISPLAY_NAMES: Record<PlatformType, string> = {
  reddit: 'Reddit',
  twitter: 'Twitter/X',
  linkedin: 'LinkedIn',
  bluesky: 'Bluesky',
  threads: 'Threads',
  medium: 'Medium',
  substack: 'Substack',
  devto: 'Dev.to',
  ph: 'Product Hunt',
  ih: 'Indie Hackers',
};

export const PLATFORM_URLS: Record<PlatformType, string> = {
  reddit: 'https://reddit.com/user/',
  twitter: 'https://x.com/',
  linkedin: 'https://www.linkedin.com/in/',
  bluesky: 'https://bsky.app/profile/',
  threads: 'https://www.threads.net/@',
  medium: 'https://medium.com/@',
  substack: 'https://substack.com/@',
  devto: 'https://dev.to/',
  ph: 'https://www.producthunt.com/@',
  ih: 'https://www.indiehackers.com/',
};

export const PLATFORM_HANDLE_LABELS: Record<PlatformType, string> = {
  reddit: 'Reddit username (without u/)',
  twitter: 'Twitter/X handle (without @)',
  linkedin: 'LinkedIn vanity URL slug',
  bluesky: 'Bluesky handle (e.g., user.bsky.social)',
  threads: 'Threads handle (without @)',
  medium: 'Medium username (without @)',
  substack: 'Substack username (without @)',
  devto: 'Dev.to username',
  ph: 'Product Hunt username',
  ih: 'Indie Hackers username',
};

// Platforms that require API keys to function
export const PLATFORM_API_KEYS: Partial<Record<PlatformType, { key: string; label: string; hint: string }[]>> = {
  ph: [
    { key: 'ph_client_id', label: 'API Key', hint: 'From producthunt.com/v2/oauth/applications' },
    { key: 'ph_client_secret', label: 'API Secret', hint: 'From producthunt.com/v2/oauth/applications' },
  ],
  devto: [
    { key: 'devto_api_key', label: 'API Key', hint: 'From dev.to/settings/extensions' },
  ],
};

export const PLATFORM_API_KEY_INSTRUCTIONS: Partial<Record<PlatformType, string[]>> = {
  ph: [
    'Go to producthunt.com/v2/oauth/applications',
    'Click "Add an application"',
    'Name: anything (e.g. "OpenTwins")',
    'Redirect URI: https://localhost',
    'Copy the API Key and API Secret from the created app',
  ],
  devto: [
    'Go to dev.to/settings/extensions',
    'Scroll to "DEV Community API Keys"',
    'Enter a description (e.g. "OpenTwins") and click "Generate API Key"',
    'Copy the generated key',
  ],
};
