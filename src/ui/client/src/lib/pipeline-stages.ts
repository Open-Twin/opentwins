// Single source of truth for pipeline stage metadata. Used by the dashboard
// pipeline section and the PipelineStageModal so descriptions stay in sync.

export interface StageMeta {
  id: string;
  label: string;
  group: 'Research' | 'Analysis' | 'Content';
  parallel: boolean;
  tagline: string;       // short, inline — fits in a stage tile
  description: string;   // longer, plain-language — shown in the modal header
}

export interface GroupMeta {
  name: 'Research' | 'Analysis' | 'Content';
  step: number;
  subtitle: string;
}

export const PIPELINE_GROUPS: GroupMeta[] = [
  { name: 'Research', step: 1, subtitle: 'Gather signals from outside' },
  { name: 'Analysis', step: 2, subtitle: 'Decide what to act on' },
  { name: 'Content',  step: 3, subtitle: 'Plan and write the posts' },
];

export const PIPELINE_STAGES: StageMeta[] = [
  {
    id: 'trend-scout',
    label: 'Trend Scout',
    group: 'Research',
    parallel: true,
    tagline: 'Predicts breakout topics',
    description:
      'Scans the web for emerging trends and news in your niche, then predicts which topics are about to break out.',
  },
  {
    id: 'competitive-intel',
    label: 'Competitive Intel',
    group: 'Research',
    parallel: true,
    tagline: 'Tracks competitor moves',
    description:
      'Watches what your top competitors are saying, posting, and shipping — and summarises the moves worth reacting to.',
  },
  {
    id: 'engagement-tracker',
    label: 'Engagement Tracker',
    group: 'Research',
    parallel: true,
    tagline: 'Measures recent post performance',
    description:
      'Measures how your recent posts performed (likes, comments, replies) and tracks which platforms are trending up or down.',
  },
  {
    id: 'network-mapper',
    label: 'Network Mapper',
    group: 'Research',
    parallel: true,
    tagline: 'Maps key people in your space',
    description:
      'Builds a list of the people you should stay close to — active commenters, mutuals, and rising voices in your space.',
  },
  {
    id: 'amplification',
    label: 'Amplification',
    group: 'Analysis',
    parallel: false,
    tagline: 'Picks yesterday\u2019s wins to reshare',
    description:
      'Picks your best-performing content from yesterday and decides what should be reshared, quoted, or boosted today.',
  },
  {
    id: 'content-planner',
    label: 'Content Planner',
    group: 'Content',
    parallel: false,
    tagline: 'Plans today\u2019s posts',
    description:
      'Plans the day\u2019s content: which topics to cover, which platforms to post on, and how each piece fits your strategy.',
  },
  {
    id: 'content-writer',
    label: 'Content Writer',
    group: 'Content',
    parallel: false,
    tagline: 'Writes the actual posts',
    description:
      'Writes the actual posts, threads, and articles for each platform \u2014 ready for the platform agents to publish.',
  },
];

export function stagesByGroup(group: GroupMeta['name']): StageMeta[] {
  return PIPELINE_STAGES.filter((s) => s.group === group);
}

export function getStageMeta(id: string): StageMeta | undefined {
  return PIPELINE_STAGES.find((s) => s.id === id);
}
