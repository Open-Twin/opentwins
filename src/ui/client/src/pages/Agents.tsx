import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApi, useMutation } from '../hooks/useApi.ts';
import { useAgentsEnabled, HealthBanner } from '../contexts/HealthContext.tsx';

type AgentState = 'needs_setup' | 'needs_api_keys' | 'ready' | 'running' | 'completed' | 'failed' | 'disabled';

interface AgentSummary {
  platform: string;
  handle: string;
  enabled: boolean;
  browserConfigured: boolean;
  hasWorkspace: boolean;
  running: boolean;
  state: AgentState;
  limits: {
    daily: Record<string, { limit: number; current: number }>;
    weekly?: Record<string, { limit: number; current: number }>;
  } | null;
}

interface AgentDetail {
  platform: string;
  handle: string;
  heartbeat_interval_minutes: number;
  enabled: boolean;
  browserConfigured: boolean;
  hasWorkspace: boolean;
  running: boolean;
  state: AgentState;
  limits: {
    daily: Record<string, { limit: number; current: number }>;
    weekly?: Record<string, { limit: number; current: number }>;
  } | null;
  schedule: Record<string, unknown> | null;
  queries: Record<string, unknown> | null;
  insights: string;
  behavior: {
    style_ratios: { questions: number; statements: number; reactions: number; trailing: number };
    disagree_target_pct: number;
    brand_mention_every_n: number;
    max_word_count: number;
    subreddits?: string[];
    target_accounts?: string[];
    target_companies?: string[];
    hashtags?: Record<string, string[]>;
  };
  api_keys: Record<string, string>;
  requiredApiKeys: Array<{ key: string; label: string; hint: string }> | null;
  lastRun: {
    output: string;
    startedAt: string;
    completedAt?: string;
    exitCode?: number;
  } | null;
}

const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#FF4500', twitter: '#1DA1F2', linkedin: '#0A66C2', bluesky: '#0085FF',
  threads: '#888', medium: '#00AB6C', substack: '#FF6719', devto: '#3B49DF', ph: '#DA552F', ih: '#4F46E5',
};

const ALL_PLATFORMS = ['reddit', 'twitter', 'linkedin', 'bluesky', 'threads', 'medium', 'substack', 'devto', 'ph', 'ih'];
const PLATFORM_LABELS: Record<string, string> = {
  reddit: 'Reddit', twitter: 'Twitter/X', linkedin: 'LinkedIn', bluesky: 'Bluesky',
  threads: 'Threads', medium: 'Medium', substack: 'Substack', devto: 'Dev.to', ph: 'Product Hunt', ih: 'Indie Hackers',
};
const PLATFORM_URL_PREFIX: Record<string, string> = {
  reddit: 'https://reddit.com/user/', twitter: 'https://x.com/', linkedin: 'https://www.linkedin.com/in/',
  bluesky: 'https://bsky.app/profile/', threads: 'https://www.threads.net/@', medium: 'https://medium.com/@',
  substack: 'https://', devto: 'https://dev.to/', ph: 'https://www.producthunt.com/@', ih: 'https://www.indiehackers.com/',
};
const PLATFORM_HANDLE_HINT: Record<string, string> = {
  reddit: 'username (without u/)', twitter: 'handle (without @)', linkedin: 'vanity URL slug',
  bluesky: 'user.bsky.social', threads: 'handle (without @)', medium: 'username (without @)',
  substack: 'yourname.substack.com', devto: 'username', ph: 'username', ih: 'username',
};
const DEFAULT_LIMITS: Record<string, { daily: Record<string, { limit: number }>; weekly?: Record<string, { limit: number }> }> = {
  reddit: { daily: { comments: { limit: 10 }, upvotes: { limit: 20 } }, weekly: { posts: { limit: 2 } } },
  twitter: { daily: { promo_replies: { limit: 5 }, non_promo_engagement: { limit: 20 }, strategic_replies: { limit: 5 } }, weekly: { original_tweets: { limit: 14 }, quote_tweets: { limit: 5 }, articles: { limit: 2 }, polls: { limit: 1 } } },
  linkedin: { daily: { comments: { limit: 4 }, reactions: { limit: 12 } }, weekly: { posts: { limit: 5 }, articles: { limit: 2 }, connection_requests: { limit: 120 } } },
  bluesky: { daily: { comments: { limit: 10 } }, weekly: { posts: { limit: 3 }, quotes: { limit: 4 } } },
  threads: { daily: { comments: { limit: 10 } }, weekly: { posts: { limit: 3 }, quotes: { limit: 6 } } },
  medium: { daily: { responses: { limit: 5 }, clap_sessions: { limit: 15 } } },
  substack: { daily: { comments: { limit: 4 }, likes: { limit: 8 }, subscribes: { limit: 3 } }, weekly: { newsletters: { limit: 2 } } },
  devto: { daily: { comments: { limit: 6 }, reactions: { limit: 15 } }, weekly: { articles: { limit: 2 } } },
  ph: { daily: { comments: { limit: 8 }, upvotes: { limit: 12 } } },
  ih: { daily: { comments: { limit: 4 } }, weekly: { posts: { limit: 2 } } },
};

const STATE_CONFIG: Record<AgentState, { label: string; color: string; bg: string; dot: string }> = {
  needs_setup:    { label: 'NEEDS SETUP',    color: 'var(--c-amber)', bg: 'rgba(251,191,36,0.12)', dot: '' },
  needs_api_keys: { label: 'NEEDS API KEYS', color: '#fb923c',        bg: 'rgba(251,146,60,0.12)', dot: '' },
  ready:          { label: 'READY',          color: 'var(--c-text-dim)', bg: 'rgba(148,163,184,0.1)', dot: 'pending' },
  running:        { label: 'RUNNING',        color: 'var(--c-blue)',  bg: 'rgba(96,165,250,0.12)', dot: 'online' },
  completed:      { label: 'COMPLETED',      color: 'var(--c-green)', bg: 'rgba(52,211,153,0.12)', dot: 'online' },
  failed:         { label: 'FAILED',         color: 'var(--c-red)',   bg: 'rgba(248,113,113,0.12)', dot: 'offline' },
  disabled:       { label: 'DISABLED',       color: 'var(--c-text-muted)', bg: 'rgba(100,116,139,0.08)', dot: '' },
};

// Turn a URL or raw handle into a clean @handle display
function cleanHandle(handle: string): string {
  if (!handle) return '';
  if (handle.startsWith('http')) {
    try {
      const url = new URL(handle);
      const segs = url.pathname.split('/').filter(Boolean);
      return '@' + (segs[segs.length - 1] || url.hostname);
    } catch { /* fallthrough */ }
  }
  return handle.startsWith('@') ? handle : '@' + handle;
}

// Build the canonical profile URL for a platform + handle
function profileUrl(platform: string, handle: string): string {
  if (handle.startsWith('http')) return handle;
  const prefix = PLATFORM_URL_PREFIX[platform] || '';
  return prefix + handle;
}

export function Agents() {
  const { enabled: agentsEnabled, reason: agentsDisabledReason } = useAgentsEnabled();
  const { data: agents, refetch } = useApi<AgentSummary[]>('/api/agents');
  const { data: config, refetch: refetchConfig } = useApi<{ platforms: Array<{ platform: string; handle: string; profile_url: string; enabled: boolean; limits: any }> }>('/api/config');
  const { mutate: saveConfig, loading: savingConfig } = useMutation('/api/config');
  const [selected, setSelected] = useState<string | null>(null);
  const [addingPlatform, setAddingPlatform] = useState(false);
  const [newPlatform, setNewPlatform] = useState('');
  const [newHandle, setNewHandle] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(refetch, 5000);
    return () => clearInterval(interval);
  }, [refetch]);

  const activePlatform = selected || agents?.[0]?.platform || null;
  const activeAgent = agents?.find((a) => a.platform === activePlatform);

  const existingPlatforms = new Set(agents?.map((a) => a.platform) || []);
  const availablePlatforms = ALL_PLATFORMS.filter((p) => !existingPlatforms.has(p));

  const handleAddPlatform = async () => {
    if (!newPlatform || !newHandle || !config) return;
    const entry = {
      platform: newPlatform, handle: newHandle,
      profile_url: `${PLATFORM_URL_PREFIX[newPlatform] || ''}${newHandle}`,
      enabled: true, limits: DEFAULT_LIMITS[newPlatform] || { daily: {} },
    };
    const result = await saveConfig({ platforms: [...config.platforms, entry] }) as { ok?: boolean; regenerated?: number } | null;
    if (result?.ok) {
      setAddingPlatform(false); setNewPlatform(''); setNewHandle('');
      setFlash(`Added ${PLATFORM_LABELS[newPlatform]} - ${result.regenerated} files generated`);
      refetch(); refetchConfig();
      setTimeout(() => setFlash(null), 4000);
    }
  };

  const handleRemovePlatform = async (platform: string) => {
    if (!config) return;
    const remaining = config.platforms.filter((p) => p.platform !== platform);
    if (remaining.length === 0) {
      setFlash('Cannot remove the last platform — at least one is required');
      setTimeout(() => setFlash(null), 4000);
      return;
    }
    const result = await saveConfig({ platforms: remaining }) as { ok?: boolean; error?: string } | null;
    if (result?.ok) {
      setFlash(`Removed ${PLATFORM_LABELS[platform] || platform}`);
      if (selected === platform) setSelected(null);
      refetch(); refetchConfig();
      setTimeout(() => setFlash(null), 4000);
    } else {
      setFlash(`Failed to remove: ${(result as any)?.error || 'unknown error'}`);
      setTimeout(() => setFlash(null), 4000);
    }
  };

  return (
    <div className="space-y-8">
      {!agentsEnabled && <HealthBanner reason={agentsDisabledReason} />}

      {/* Header */}
      <div className="animate-fade-up flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>Agent Control</h1>
          <p className="mono text-sm mt-1.5" style={{ color: 'var(--c-text-muted)' }}>Manage lifecycle, limits, and schedules for each agent</p>
        </div>
        <div className="flex items-center gap-3">
          {flash && <span className="mono text-[13px] px-3 py-1.5 rounded-full animate-fade-up" style={{ color: 'var(--c-teal)', background: 'var(--c-teal-glow)' }}>{flash}</span>}
          {availablePlatforms.length > 0 && !addingPlatform && (
            <button onClick={() => { setAddingPlatform(true); setNewPlatform(availablePlatforms[0]); setNewHandle(''); }} className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all" style={{ color: 'var(--c-teal)', background: 'var(--c-teal-glow)', border: '1px solid rgba(45,212,191,0.3)' }}>
              <span className="text-base leading-none">+</span> Add Agent
            </button>
          )}
        </div>
      </div>

      {/* Add platform form */}
      {addingPlatform && (
        <div className="panel noise animate-fade-up">
          <div className="panel-header">// Add Agent</div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="mono text-[14px] uppercase tracking-wider w-20 shrink-0" style={{ color: 'var(--c-text-muted)' }}>Platform</span>
              <select value={newPlatform} onChange={(e) => { setNewPlatform(e.target.value); setNewHandle(''); }} className="mono text-sm bg-transparent outline-none px-2 py-1.5 rounded flex-1" style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)' }}>
                {availablePlatforms.map((p) => (<option key={p} value={p}>{PLATFORM_LABELS[p] || p}</option>))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="mono text-[14px] uppercase tracking-wider w-20 shrink-0" style={{ color: 'var(--c-text-muted)' }}>Handle</span>
              <div className="flex-1">
                <input value={newHandle} onChange={(e) => setNewHandle(e.target.value)} placeholder={PLATFORM_HANDLE_HINT[newPlatform] || 'username'} className="mono text-sm w-full bg-transparent outline-none px-2 py-1.5 rounded transition-colors" style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)' }} onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'} onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'} />
                {newHandle && <div className="mono text-[14px] mt-1.5" style={{ color: 'var(--c-text-muted)' }}>{PLATFORM_URL_PREFIX[newPlatform]}{newHandle}</div>}
              </div>
            </div>
            {newPlatform && DEFAULT_LIMITS[newPlatform] && (
              <div>
                <span className="mono text-[14px] uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Default limits</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {Object.entries(DEFAULT_LIMITS[newPlatform].daily).map(([k, v]) => (<span key={k} className="mono text-[13px] px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--c-text-muted)', border: '1px solid var(--c-border-dim)' }}>{k}: {v.limit}/d</span>))}
                  {DEFAULT_LIMITS[newPlatform].weekly && Object.entries(DEFAULT_LIMITS[newPlatform].weekly!).map(([k, v]) => (<span key={k} className="mono text-[13px] px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--c-border)', border: '1px solid var(--c-border-dim)' }}>{k}: {v.limit}/w</span>))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--c-border-dim)' }}>
              <MiniBtn onClick={() => setAddingPlatform(false)} dim>Cancel</MiniBtn>
              <ActionBtn onClick={handleAddPlatform} accent loading={savingConfig} disabled={!newHandle}>Add {PLATFORM_LABELS[newPlatform] || newPlatform}</ActionBtn>
            </div>
          </div>
        </div>
      )}

      {/* Agent picker — segmented control (only if more than one) */}
      {agents && agents.length > 1 && (
        <div className="animate-fade-up stagger-1 flex gap-2 flex-wrap">
          {agents.map((a) => {
            const color = PLATFORM_COLORS[a.platform] || '#888';
            const isSelected = a.platform === activePlatform;
            return (
              <button
                key={a.platform}
                onClick={() => setSelected(a.platform)}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg transition-all duration-200"
                style={{
                  background: isSelected ? 'var(--c-panel)' : 'transparent',
                  border: `1px solid ${isSelected ? 'var(--c-teal-dim)' : 'var(--c-border-dim)'}`,
                  color: isSelected ? 'var(--c-text)' : 'var(--c-text-dim)',
                  boxShadow: isSelected ? '0 0 0 1px var(--c-teal-dim), 0 0 20px rgba(45,212,191,0.08)' : undefined,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: color,
                    boxShadow: a.state === 'running' ? `0 0 10px ${color}` : `0 0 6px ${color}40`,
                  }}
                />
                <span className="text-sm font-medium capitalize">{a.platform}</span>
                {a.state === 'running' && (
                  <span className="mono text-[11px] uppercase tracking-wider" style={{ color: 'var(--c-blue)' }}>● live</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Detail panel */}
      {activePlatform && activeAgent && (
        <AgentPanel platform={activePlatform} summary={activeAgent} onRefresh={refetch} onRemove={handleRemovePlatform} agentCount={agents?.length || 0} />
      )}
    </div>
  );
}

function AgentPanel({ platform, summary, onRefresh, onRemove, agentCount }: { platform: string; summary: AgentSummary; onRefresh: () => void; onRemove: (p: string) => void; agentCount: number }) {
  const { enabled: agentsEnabled, reason: agentsDisabledReason } = useAgentsEnabled();
  const { data: agent, loading, refetch } = useApi<AgentDetail>(`/api/agents/${platform}`, [platform]);
  const { mutate: runAgent, loading: starting } = useMutation(`/api/agents/${platform}/run`, 'POST');
  const { mutate: stopAgent, loading: stopping } = useMutation(`/api/agents/${platform}/stop`, 'POST');
  const { mutate: saveLimits, loading: savingLimits } = useMutation(`/api/agents/${platform}/limits`);
  const { mutate: saveAgent } = useMutation(`/api/agents/${platform}`);
  const { mutate: setupBrowser, loading: settingUpBrowser } = useMutation<unknown, { ok: boolean; message?: string; error?: string }>(`/api/agents/${platform}/browser-setup`, 'POST');
  const { mutate: confirmBrowser } = useMutation<unknown, { ok: boolean }>(`/api/agents/${platform}/browser-confirm`, 'POST');
  const [editLimits, setEditLimits] = useState<Record<string, Record<string, number>> | null>(null);
  const [editBehavior, setEditBehavior] = useState<AgentDetail['behavior'] | null>(null);
  const [editApiKeys, setEditApiKeys] = useState<Record<string, string> | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [browserSetupOpen, setBrowserSetupOpen] = useState(false);
  const [browserSetupError, setBrowserSetupError] = useState<string | null>(null);

  const state = summary.state;
  const color = PLATFORM_COLORS[platform] || '#888';

  const handleRun = async () => {
    const result = await runAgent({});
    if (result) {
      setFlash('Agent started');
      setTimeout(() => { setFlash(null); onRefresh(); refetch(); }, 2000);
    }
  };

  const handleStop = async () => {
    const result = await stopAgent({});
    if (result) {
      setFlash('Stop signal sent');
      setTimeout(() => { setFlash(null); onRefresh(); refetch(); }, 2000);
    }
  };

  const handleBrowserSetup = async () => {
    setBrowserSetupError(null);
    const result = await setupBrowser({});
    if (result?.ok) {
      setBrowserSetupOpen(true);
    } else {
      setBrowserSetupError(result?.error || 'Browser setup failed. Check that OpenClaw gateway is running.');
    }
  };

  const handleBrowserSetupDone = async () => {
    const result = await confirmBrowser({});
    setBrowserSetupOpen(false);
    setBrowserSetupError(null);
    if (result?.ok) {
      setFlash('Browser profile confirmed');
      onRefresh();
      refetch();
      setTimeout(() => setFlash(null), 3000);
    } else {
      setBrowserSetupError('Failed to confirm browser profile');
    }
  };

  const startEditLimits = () => {
    const limits = agent?.limits;
    if (!limits) return;
    const draft: Record<string, Record<string, number>> = {};
    draft.daily = {};
    for (const [k, v] of Object.entries(limits.daily)) draft.daily[k] = v.limit;
    if (limits.weekly) {
      draft.weekly = {};
      for (const [k, v] of Object.entries(limits.weekly)) draft.weekly[k] = v.limit;
    }
    setEditLimits(draft);
  };

  const handleSaveLimits = async () => {
    if (!editLimits) return;
    const body: Record<string, Record<string, { limit: number }>> = {};
    for (const period of ['daily', 'weekly'] as const) {
      if (!editLimits[period]) continue;
      body[period] = {};
      for (const [k, v] of Object.entries(editLimits[period])) body[period][k] = { limit: v };
    }
    const result = await saveLimits(body);
    if (result) {
      setEditLimits(null);
      setFlash('Limits saved');
      refetch();
      setTimeout(() => setFlash(null), 3000);
    }
  };

  if (loading) return <div className="mono text-sm animate-pulse py-8 text-center" style={{ color: 'var(--c-teal-dim)' }}>Loading agent...</div>;
  if (!agent) return null;

  // Parse schedule
  const TASK_LABELS: Record<string, { label: string; icon: string }> = {
    search_and_comment: { label: 'Search & Comment', icon: '🔍' },
    browse_and_engage: { label: 'Browse & Engage', icon: '💬' },
    create_poll: { label: 'Create Poll', icon: '📊' },
    create_post: { label: 'Create Post', icon: '✏️' },
    create_article: { label: 'Write Article', icon: '📝' },
    create_repost: { label: 'Repost', icon: '🔄' },
    update_memory: { label: 'Update Memory', icon: '🧠' },
    check_notifications: { label: 'Check Notifications', icon: '🔔' },
    reply_to_comments: { label: 'Reply to Comments', icon: '↩️' },
    connection_requests: { label: 'Send Connections', icon: '🤝' },
  };

  const scheduleEntries: Array<{ time: string; action: string; desc?: string; status?: string }> = [];
  if (agent.schedule && typeof agent.schedule === 'object') {
    const tasks = ((agent.schedule as Record<string, unknown>).tasks || []) as Array<Record<string, unknown>>;
    if (Array.isArray(tasks)) {
      for (const t of tasks) {
        const typeKey = String(t.type || t.action || 'unknown');
        const meta = TASK_LABELS[typeKey];
        const cfg = (t.config || {}) as Record<string, unknown>;

        // Build a short description from config
        let desc = t.description ? String(t.description) : '';
        if (!desc) {
          const parts: string[] = [];
          if (cfg.max_comments) parts.push(`${cfg.max_comments} comment${Number(cfg.max_comments) > 1 ? 's' : ''}`);
          if (cfg.max_likes) parts.push(`${cfg.max_likes} likes`);
          if (cfg.question) parts.push(`"${String(cfg.question).slice(0, 60)}"`);
          if (cfg.queries && Array.isArray(cfg.queries)) parts.push(`${cfg.queries.length} queries`);
          if (parts.length) desc = parts.join(', ');
        }

        scheduleEntries.push({
          time: String(t.time || t.time_scheduled || '-'),
          action: meta ? `${meta.icon} ${meta.label}` : typeKey,
          desc,
          status: t.status ? String(t.status) : undefined,
        });
      }
    }
  }

  // Compute header stats
  const scheduleTasksTotal = scheduleEntries.length;
  const scheduleTasksDone = scheduleEntries.filter((t) => t.status === 'completed').length;
  const dailyLimitsTotal = agent.limits?.daily ? Object.values(agent.limits.daily).reduce((s, v) => s + (v.current || 0), 0) : 0;
  const dailyLimitsMax = agent.limits?.daily ? Object.values(agent.limits.daily).reduce((s, v) => s + (v.limit || 0), 0) : 0;
  const fullProfileUrl = profileUrl(platform, agent.handle);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Agent hero panel */}
      <div className="panel noise" style={{
        background: `linear-gradient(135deg, var(--c-panel) 0%, var(--c-panel) 70%, ${color}08 100%)`,
      }}>
        <div className="p-6">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            {/* Identity */}
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: `${color}15`,
                  border: `1px solid ${color}30`,
                  boxShadow: state === 'running' ? `0 0 24px ${color}40` : undefined,
                }}
              >
                <div className="w-3 h-3 rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}80` }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold capitalize leading-tight" style={{ color: 'var(--c-text)' }}>
                    {PLATFORM_LABELS[platform] || platform}
                  </h2>
                  <StateBadge state={state} />
                </div>
                <a
                  href={fullProfileUrl}
                  target="_blank"
                  rel="noopener"
                  className="mono text-sm mt-1 inline-flex items-center gap-1.5 transition-colors hover:underline"
                  style={{ color: 'var(--c-text-muted)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {cleanHandle(agent.handle)}
                  <span style={{ fontSize: 10 }}>↗</span>
                </a>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {flash && (
                <span className="mono text-[13px] px-3 py-1.5 rounded-full animate-fade-up" style={{ color: 'var(--c-teal)', background: 'var(--c-teal-glow)' }}>
                  {flash}
                </span>
              )}

              {state === 'needs_setup' && (
                <button
                  onClick={handleBrowserSetup}
                  disabled={settingUpBrowser || !agentsEnabled}
                  title={!agentsEnabled ? (agentsDisabledReason || 'Agents unavailable') : 'Launch Chrome to log in'}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    color: 'var(--c-amber)',
                    background: 'rgba(251,191,36,0.08)',
                    border: '1px solid rgba(251,191,36,0.3)',
                  }}
                >
                  {settingUpBrowser ? 'Launching Chrome…' : '🌐 Set up browser'}
                </button>
              )}

              {state === 'running' && (
                <ActionBtn onClick={handleStop} loading={stopping} danger>Stop Agent</ActionBtn>
              )}

              {(state === 'ready' || state === 'completed' || state === 'failed') && (
                <ActionBtn
                  onClick={handleRun}
                  loading={starting}
                  accent
                  disabled={!agentsEnabled}
                  title={!agentsEnabled ? (agentsDisabledReason || 'Agents unavailable') : undefined}
                >
                  ▶ Run Now
                </ActionBtn>
              )}

              <button
                onClick={() => { if (confirm(`Remove ${platform} agent? This won't delete browser profiles or activity history.`)) onRemove(platform); }}
                disabled={agentCount <= 1}
                className="mono text-[13px] px-3 py-1.5 rounded-md transition-all opacity-50 hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed"
                style={{ color: 'var(--c-red)', border: '1px solid rgba(248,113,113,0.2)' }}
                title={agentCount <= 1 ? 'At least one platform is required' : 'Remove agent'}
              >
                Remove
              </button>
            </div>
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5" style={{ borderTop: '1px solid var(--c-border-dim)' }}>
            <HeroStat
              label="Today's actions"
              value={dailyLimitsTotal}
              sub={dailyLimitsMax > 0 ? `of ${dailyLimitsMax} cap` : 'no caps set'}
            />
            <HeroStat
              label="Tasks today"
              value={scheduleTasksTotal > 0 ? `${scheduleTasksDone}/${scheduleTasksTotal}` : '—'}
              sub={scheduleTasksTotal > 0 ? 'scheduled' : 'no schedule'}
            />
            <HeroStat
              label="Last run"
              value={agent.lastRun?.startedAt ? new Date(agent.lastRun.startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'}
              sub={agent.lastRun?.exitCode !== undefined ? `exit ${agent.lastRun.exitCode}` : 'no runs yet'}
            />
            <IntervalPicker
              value={agent.heartbeat_interval_minutes}
              onSave={async (minutes) => {
                const result = await saveAgent({ heartbeat_interval_minutes: minutes });
                if (result) {
                  setFlash(`Interval set to ${intervalLabel(minutes)} - restart scheduler to apply`);
                  refetch();
                  setTimeout(() => setFlash(null), 4000);
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* API Keys (for platforms that need them) */}
      {agent.requiredApiKeys && agent.requiredApiKeys.length > 0 && (
        <div className="panel noise" style={{ borderColor: state === 'needs_api_keys' ? 'rgba(251,146,60,0.3)' : undefined }}>
          <div className="panel-header flex items-center justify-between">
            <span>// API Keys</span>
            <div className="flex items-center gap-2">
              {editApiKeys ? (
                <>
                  <MiniBtn onClick={() => setEditApiKeys(null)} dim>Cancel</MiniBtn>
                  <MiniBtn onClick={async () => {
                    if (!editApiKeys) return;
                    // Save API keys via config update
                    const config = await fetch('/api/config').then(r => r.json());
                    const platforms = config.platforms.map((p: any) =>
                      p.platform === platform ? { ...p, api_keys: editApiKeys } : p
                    );
                    const result = await fetch('/api/config', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ platforms }),
                    }).then(r => r.json());
                    if (result.ok) {
                      setEditApiKeys(null);
                      setFlash('API keys saved');
                      refetch(); onRefresh();
                      setTimeout(() => setFlash(null), 3000);
                    }
                  }} accent>Save</MiniBtn>
                </>
              ) : (
                <MiniBtn onClick={() => setEditApiKeys({ ...agent.api_keys })}>
                  {state === 'needs_api_keys' ? 'Configure' : 'Edit'}
                </MiniBtn>
              )}
            </div>
          </div>
          <div className="p-5 space-y-3">
            {agent.requiredApiKeys.map((rk) => {
              const value = editApiKeys ? (editApiKeys[rk.key] || '') : (agent.api_keys[rk.key] || '');
              const isSet = value.length > 0;
              return (
                <div key={rk.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="mono text-[13px]" style={{ color: 'var(--c-text-dim)' }}>{rk.label}</span>
                    {!editApiKeys && (
                      <span className="mono text-[13px]" style={{ color: isSet ? 'var(--c-green)' : '#fb923c' }}>
                        {isSet ? 'configured' : 'missing'}
                      </span>
                    )}
                  </div>
                  {editApiKeys ? (
                    <input
                      type="password"
                      value={editApiKeys[rk.key] || ''}
                      onChange={(e) => setEditApiKeys({ ...editApiKeys, [rk.key]: e.target.value })}
                      placeholder={rk.hint}
                      className="mono text-[13px] w-full bg-transparent outline-none px-2 py-1.5 rounded transition-colors"
                      style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)' }}
                      onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
                    />
                  ) : (
                    <div className="mono text-[14px]" style={{ color: 'var(--c-text-muted)' }}>
                      {isSet ? '****' + value.slice(-4) : rk.hint}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Limits */}
      {agent.limits && (
        <div className="panel noise">
          <div className="panel-header flex items-center justify-between">
            <span>// Limits</span>
            <div className="flex items-center gap-2">
              {editLimits !== null ? (
                <>
                  <MiniBtn onClick={() => setEditLimits(null)} dim>Cancel</MiniBtn>
                  <MiniBtn onClick={handleSaveLimits} accent loading={savingLimits}>Save</MiniBtn>
                </>
              ) : (
                <MiniBtn onClick={startEditLimits}>Edit</MiniBtn>
              )}
            </div>
          </div>
          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LimitGroup
              title="Daily"
              limits={agent.limits.daily}
              editing={editLimits?.daily || null}
              color={color}
              onChange={(key, val) => editLimits && setEditLimits({ ...editLimits, daily: { ...editLimits.daily, [key]: val } })}
            />
            {agent.limits.weekly && Object.keys(agent.limits.weekly).length > 0 && (
              <LimitGroup
                title="Weekly"
                limits={agent.limits.weekly}
                editing={editLimits?.weekly || null}
                color={color}
                onChange={(key, val) => editLimits && setEditLimits({ ...editLimits, weekly: { ...(editLimits.weekly || {}), [key]: val } })}
              />
            )}
          </div>
        </div>
      )}

      {/* Behavior */}
      {agent.behavior && (
        <div className="panel noise">
          <div className="panel-header flex items-center justify-between">
            <span>// Behavior</span>
            <div className="flex items-center gap-2">
              {editBehavior ? (
                <>
                  <MiniBtn onClick={() => setEditBehavior(null)} dim>Cancel</MiniBtn>
                  <MiniBtn onClick={async () => {
                    const result = await saveAgent({ behavior: editBehavior });
                    if (result) {
                      setEditBehavior(null);
                      setFlash('Behavior saved & templates regenerated');
                      refetch();
                      setTimeout(() => setFlash(null), 3000);
                    }
                  }} accent>Save</MiniBtn>
                </>
              ) : (
                <MiniBtn onClick={() => setEditBehavior(JSON.parse(JSON.stringify(agent.behavior)))}>Edit</MiniBtn>
              )}
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Style Ratios */}
              <div>
                <div className="mono text-[14px] uppercase tracking-wider mb-3" style={{ color: 'var(--c-text-muted)' }}>Reply Style Mix</div>
                <div className="space-y-3">
                  {(['questions', 'statements', 'reactions', 'trailing'] as const).map((key) => {
                    const labels: Record<string, string> = { questions: 'Questions', statements: 'Statements', reactions: 'Short reactions', trailing: 'Trailing thoughts' };
                    const val = editBehavior ? editBehavior.style_ratios[key] : agent.behavior.style_ratios[key];
                    const total = editBehavior
                      ? Object.values(editBehavior.style_ratios).reduce((a, b) => a + b, 0)
                      : 100;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="mono text-[13px]" style={{ color: 'var(--c-text-dim)' }}>{labels[key]}</span>
                          <div className="flex items-center gap-1">
                            {editBehavior ? (
                              <input
                                type="number"
                                value={val}
                                onChange={(e) => {
                                  const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                                  setEditBehavior({ ...editBehavior, style_ratios: { ...editBehavior.style_ratios, [key]: v } });
                                }}
                                className="w-10 bg-transparent text-right outline-none mono text-[13px] rounded px-1"
                                style={{ color: 'var(--c-teal)', borderBottom: '1px solid var(--c-teal-dim)' }}
                                min={0} max={100}
                              />
                            ) : (
                              <span className="mono text-[13px]" style={{ color: 'var(--c-text-dim)' }}>{val}</span>
                            )}
                            <span className="mono text-[14px]" style={{ color: 'var(--c-text-muted)' }}>%</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-border-dim)' }}>
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${val}%`, background: color, opacity: 0.5 }} />
                        </div>
                      </div>
                    );
                  })}
                  {editBehavior && (() => {
                    const total = Object.values(editBehavior.style_ratios).reduce((a, b) => a + b, 0);
                    return total !== 100 ? (
                      <div className="mono text-[14px] mt-1" style={{ color: total > 100 ? 'var(--c-red)' : 'var(--c-amber)' }}>
                        Total: {total}% (should be 100%)
                      </div>
                    ) : (
                      <div className="mono text-[14px] mt-1" style={{ color: 'var(--c-green)' }}>Total: 100%</div>
                    );
                  })()}
                </div>
              </div>

              {/* Other behavior params */}
              <div>
                <div className="mono text-[14px] uppercase tracking-wider mb-3" style={{ color: 'var(--c-text-muted)' }}>Parameters</div>
                <div className="space-y-3">
                  <BehaviorField
                    label="Disagree target"
                    value={editBehavior?.disagree_target_pct ?? agent.behavior.disagree_target_pct}
                    suffix="%"
                    editing={!!editBehavior}
                    min={0} max={50}
                    onChange={(v) => editBehavior && setEditBehavior({ ...editBehavior, disagree_target_pct: v })}
                  />
                  <BehaviorField
                    label="Brand mention every"
                    value={editBehavior?.brand_mention_every_n ?? agent.behavior.brand_mention_every_n}
                    suffix=" comments"
                    editing={!!editBehavior}
                    min={1} max={20}
                    onChange={(v) => editBehavior && setEditBehavior({ ...editBehavior, brand_mention_every_n: v })}
                  />
                  <BehaviorField
                    label="Max word count"
                    value={editBehavior?.max_word_count ?? agent.behavior.max_word_count}
                    suffix=" words"
                    editing={!!editBehavior}
                    min={10} max={500}
                    onChange={(v) => editBehavior && setEditBehavior({ ...editBehavior, max_word_count: v })}
                  />
                </div>
              </div>
            </div>

            {/* Platform-specific lists */}
            {(agent.behavior.subreddits !== undefined || agent.behavior.target_accounts !== undefined || agent.behavior.target_companies !== undefined || agent.behavior.hashtags !== undefined) && (
              <div className="pt-4 mt-4" style={{ borderTop: '1px solid var(--c-border-dim)' }}>
                <div className="mono text-[14px] uppercase tracking-wider mb-3" style={{ color: 'var(--c-text-muted)' }}>Platform Content</div>
                <div className="space-y-3">
                  {agent.behavior.subreddits !== undefined && (
                    <ListField
                      label="Subreddits"
                      values={editBehavior?.subreddits ?? agent.behavior.subreddits ?? []}
                      editing={!!editBehavior}
                      placeholder="e.g. programming, webdev, startups"
                      onChange={(v) => editBehavior && setEditBehavior({ ...editBehavior, subreddits: v })}
                    />
                  )}
                  {agent.behavior.target_accounts !== undefined && (
                    <ListField
                      label="Target accounts"
                      values={editBehavior?.target_accounts ?? agent.behavior.target_accounts ?? []}
                      editing={!!editBehavior}
                      placeholder="e.g. levelsio, swyx, GergelyOrosz"
                      onChange={(v) => editBehavior && setEditBehavior({ ...editBehavior, target_accounts: v })}
                    />
                  )}
                  {agent.behavior.target_companies !== undefined && (
                    <ListField
                      label="Target companies"
                      values={editBehavior?.target_companies ?? agent.behavior.target_companies ?? []}
                      editing={!!editBehavior}
                      placeholder="e.g. Google, Stripe, Anthropic"
                      onChange={(v) => editBehavior && setEditBehavior({ ...editBehavior, target_companies: v })}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Schedule + Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Schedule — takes 3 columns */}
        <div className="panel noise lg:col-span-3">
          <div className="panel-header flex items-center justify-between">
            <span>// Today's Schedule</span>
            {scheduleTasksTotal > 0 && (
              <span className="mono text-[13px] normal-case tracking-normal" style={{ color: 'var(--c-text-muted)' }}>
                {scheduleTasksDone} of {scheduleTasksTotal} done
              </span>
            )}
          </div>
          <div className="p-4">
            {scheduleEntries.length > 0 ? (
              <>
                {/* Progress bar */}
                <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: 'var(--c-border-dim)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{
                    width: `${scheduleTasksTotal > 0 ? (scheduleTasksDone / scheduleTasksTotal) * 100 : 0}%`,
                    background: color,
                    opacity: 0.7,
                  }} />
                </div>
                <div className="space-y-1">
                  {scheduleEntries.map((t, i) => {
                    const statusColor =
                      t.status === 'completed' ? 'var(--c-green)' :
                      t.status === 'failed'    ? 'var(--c-red)' :
                      t.status === 'running'   ? 'var(--c-blue)' :
                      'var(--c-text-muted)';
                    return (
                      <div key={i} className="flex items-start gap-4 py-2.5 px-3 rounded-lg transition-colors hover:bg-white/[0.02]">
                        <span className="mono text-[13px] shrink-0 w-14 pt-0.5" style={{ color: 'var(--c-teal-dim)' }}>{t.time}</span>
                        <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-2" style={{ background: statusColor }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{t.action}</div>
                          {t.desc && <div className="mono text-[12px] mt-1 truncate" style={{ color: 'var(--c-text-muted)' }}>{t.desc}</div>}
                        </div>
                        {t.status && (
                          <span className="mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0" style={{
                            color: statusColor,
                            background: t.status === 'completed' ? 'rgba(52,211,153,0.1)' :
                                        t.status === 'failed'    ? 'rgba(248,113,113,0.1)' :
                                        t.status === 'running'   ? 'rgba(96,165,250,0.12)' :
                                        'rgba(148,163,184,0.08)',
                          }}>{t.status}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <Empty text="No schedule yet" hint="Generated on first heartbeat run" />
            )}
          </div>
        </div>

        {/* Insights — takes 2 columns */}
        <div className="panel noise lg:col-span-2">
          <div className="panel-header">// Insights</div>
          <div className="p-4">
            {agent.insights ? (
              <pre className="mono text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--c-text-dim)' }}>
                {agent.insights}
              </pre>
            ) : (
              <Empty text="No insights yet" hint="Updated after first memory cycle" />
            )}
          </div>
        </div>
      </div>

      {/* Live Activity Feed */}
      <AgentFeed platform={platform} running={state === 'running'} />

      {/* Browser setup modal — rendered via portal to avoid stacking context issues */}
      {browserSetupOpen && createPortal(
        <BrowserSetupModal
          platform={platform}
          color={color}
          onDone={handleBrowserSetupDone}
          onCancel={() => setBrowserSetupOpen(false)}
        />,
        document.body
      )}

      {/* Browser setup error toast — also portal */}
      {browserSetupError && createPortal(
        <div className="fixed bottom-6 right-6 max-w-sm px-4 py-3 rounded-lg shadow-2xl animate-fade-up z-50"
          style={{ background: 'var(--c-panel)', border: '1px solid rgba(248,113,113,0.4)' }}>
          <div className="flex items-start gap-3">
            <div className="text-lg" style={{ color: 'var(--c-red)' }}>⚠</div>
            <div className="flex-1">
              <div className="text-sm font-medium mb-1" style={{ color: 'var(--c-red)' }}>Browser setup failed</div>
              <div className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>{browserSetupError}</div>
            </div>
            <button
              onClick={() => setBrowserSetupError(null)}
              className="text-sm opacity-50 hover:opacity-100"
              style={{ color: 'var(--c-text-muted)' }}
            >
              ✕
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Browser Setup Modal ───────────────────────────────────────

function BrowserSetupModal({ platform, color, onDone, onCancel }: {
  platform: string;
  color: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(6,8,13,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onCancel}
    >
      <div
        className="panel noise max-w-lg w-full animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Header with platform badge */}
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${color}15`, border: `1px solid ${color}40` }}
            >
              <div className="text-xl">🌐</div>
            </div>
            <div>
              <div className="text-lg font-semibold capitalize" style={{ color: 'var(--c-text)' }}>
                {platform} browser setup
              </div>
              <div className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>
                Chrome is launching with a dedicated profile
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3 mb-6">
            <InstructionStep num={1} text={`Chrome has opened the ${platform} login page`} />
            <InstructionStep num={2} text="Sign in (complete captchas or 2FA if prompted)" />
            <InstructionStep num={3} text="Come back here and click the button below" />
          </div>

          {/* Status hint */}
          <div className="mono text-[12px] px-3 py-2 rounded-lg mb-5" style={{
            color: 'var(--c-text-muted)',
            background: 'rgba(255,255,255,0.015)',
            border: '1px solid var(--c-border-dim)',
          }}>
            OpenClaw manages a dedicated browser profile for this platform. You only need to log in once — the session persists across agent runs.
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)', background: 'transparent' }}
            >
              Cancel
            </button>
            <button
              onClick={onDone}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                color: 'var(--c-teal)',
                background: 'var(--c-teal-glow)',
                border: '1px solid rgba(45,212,191,0.3)',
              }}
            >
              ✓ I've logged in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InstructionStep({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold mono shrink-0"
        style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border-dim)', color: 'var(--c-text-dim)' }}
      >
        {num}
      </div>
      <div className="text-sm pt-0.5" style={{ color: 'var(--c-text)' }}>{text}</div>
    </div>
  );
}

// ── Live Agent Feed ───────────────────────────────────────────

interface FeedEvent {
  ts: string;
  kind: 'thinking' | 'tool' | 'result' | 'error' | 'done';
  summary: string;
  detail?: string;
}

interface FeedData {
  events: FeedEvent[];
  sessionFile: string | null;
  totalEvents: number;
}

function AgentFeed({ platform, running }: { platform: string; running: boolean }) {
  const { data, loading, refetch } = useApi<FeedData>(`/api/agents/${platform}/feed`, [platform]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Poll while running
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => refetch(), 3000);
    return () => clearInterval(id);
  }, [running, refetch]);

  const events = data?.events || [];
  const hasSession = !!data?.sessionFile;

  return (
    <div className="panel noise">
      <div className="panel-header flex items-center justify-between">
        <span>// Activity Feed {running && <span style={{ color: 'var(--c-amber)' }}>● live</span>}</span>
        <div className="flex items-center gap-3">
          <span className="mono text-[13px] normal-case tracking-normal" style={{ color: 'var(--c-text-muted)' }}>
            {events.length} events
          </span>
          <button
            onClick={() => refetch()}
            className="mono text-[13px] normal-case tracking-normal px-2 py-0.5 rounded transition-colors hover:bg-white/5"
            style={{ color: 'var(--c-teal-dim)' }}
          >
            refresh
          </button>
        </div>
      </div>
      <div className="p-4 max-h-[500px] overflow-y-auto">
        {loading && events.length === 0 ? (
          <div className="mono text-sm py-8 text-center animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>Loading activity...</div>
        ) : !hasSession ? (
          <Empty text="No activity yet" hint="Run the agent to see live progress" />
        ) : events.length === 0 ? (
          <Empty text="Session started" hint="Waiting for first event..." />
        ) : (
          <div className="space-y-1.5">
            {events.slice().reverse().map((ev, i) => {
              const time = ev.ts ? new Date(ev.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '';
              const isExpanded = expanded.has(i);
              const color =
                ev.kind === 'error' ? 'var(--c-red)' :
                ev.kind === 'done' ? 'var(--c-green)' :
                ev.kind === 'thinking' ? 'var(--c-blue)' :
                ev.kind === 'tool' ? 'var(--c-text)' :
                'var(--c-text-muted)';

              return (
                <div
                  key={i}
                  className="flex items-start gap-3 py-1.5 px-2 rounded transition-colors hover:bg-white/[0.02] cursor-pointer"
                  onClick={() => {
                    const next = new Set(expanded);
                    if (isExpanded) next.delete(i); else next.add(i);
                    setExpanded(next);
                  }}
                >
                  <span className="mono text-[13px] shrink-0 w-[70px]" style={{ color: 'var(--c-teal-dim)' }}>{time}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm break-words" style={{ color }}>{ev.summary}</div>
                    {ev.detail && isExpanded && (
                      <pre className="mono text-[13px] mt-1 p-2 rounded whitespace-pre-wrap break-words" style={{
                        color: 'var(--c-text-muted)',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--c-border-dim)',
                      }}>{ev.detail}</pre>
                    )}
                    {ev.detail && !isExpanded && (
                      <div className="mono text-[12px] truncate" style={{ color: 'var(--c-text-muted)' }}>{ev.detail}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────

function StateBadge({ state }: { state: AgentState }) {
  const c = STATE_CONFIG[state];
  return (
    <span className="mono inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[14px] font-medium" style={{ background: c.bg, color: c.color }}>
      {c.dot && <span className={`status-dot ${c.dot}`} />}
      {(state === 'needs_setup' || state === 'needs_api_keys') && <span style={{ fontSize: 8 }}>!</span>}
      {c.label}
    </span>
  );
}

function LimitGroup({ title, limits, editing, color, onChange }: {
  title: string;
  limits: Record<string, { limit: number; current: number }>;
  editing: Record<string, number> | null;
  color: string;
  onChange: (key: string, val: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="text-[11px] uppercase tracking-[0.12em] font-medium" style={{ color: 'var(--c-text-muted)' }}>{title}</div>
        <div className="h-px flex-1" style={{ background: 'var(--c-border-dim)' }} />
      </div>
      <div className="space-y-4">
        {Object.entries(limits).map(([action, val]) => {
          const limit = editing ? (editing[action] ?? val.limit) : val.limit;
          const pct = limit > 0 ? Math.min((val.current / limit) * 100, 100) : 0;
          const isDisabled = limit === 0;

          return (
            <div key={action} className="group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium capitalize" style={{
                  color: isDisabled ? 'var(--c-text-muted)' : 'var(--c-text)',
                  textDecoration: isDisabled ? 'line-through' : 'none',
                }}>
                  {action.replace(/_/g, ' ')}
                </span>
                <div className="mono text-sm flex items-baseline gap-1 tabular-nums">
                  <span style={{ color: pct >= 90 ? 'var(--c-amber)' : 'var(--c-text)' }}>{val.current}</span>
                  <span style={{ color: 'var(--c-text-muted)' }}>/</span>
                  {editing ? (
                    <input
                      type="number"
                      value={limit}
                      onChange={(e) => onChange(action, Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-12 bg-transparent text-right outline-none rounded px-1"
                      style={{ color: 'var(--c-teal)', borderBottom: '1px solid var(--c-teal-dim)' }}
                      min={0}
                    />
                  ) : (
                    <span style={{ color: 'var(--c-text-muted)' }}>{limit}</span>
                  )}
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-border-dim)' }}>
                <div className="h-full rounded-full transition-all duration-700" style={{
                  width: `${pct}%`,
                  background: pct >= 90 ? 'var(--c-amber)' : color,
                  opacity: isDisabled ? 0.2 : 0.8,
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, loading: isLoading, accent, danger, disabled, title }: {
  children: React.ReactNode; onClick: () => void; loading?: boolean; accent?: boolean; danger?: boolean; disabled?: boolean; title?: string;
}) {
  const color = danger ? 'var(--c-red)' : 'var(--c-teal)';
  const bg = danger ? 'rgba(248,113,113,0.08)' : 'var(--c-teal-glow)';
  const border = danger ? 'rgba(248,113,113,0.2)' : 'rgba(45,212,191,0.25)';
  return (
    <button
      onClick={onClick}
      disabled={isLoading || disabled}
      title={title}
      className="mono text-[13px] px-4 py-1.5 rounded-md font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {isLoading ? (danger ? 'Stopping...' : 'Starting...') : children}
    </button>
  );
}

function MiniBtn({ children, onClick, dim, accent, loading: isLoading }: {
  children: React.ReactNode; onClick: () => void; dim?: boolean; accent?: boolean; loading?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={isLoading} className="mono text-[14px] px-2 py-0.5 rounded font-medium normal-case tracking-normal transition-all duration-200 disabled:opacity-50" style={{
      background: accent ? 'var(--c-teal-glow)' : 'transparent',
      color: dim ? 'var(--c-text-muted)' : accent ? 'var(--c-teal)' : 'var(--c-text-dim)',
      border: '1px solid ' + (accent ? 'rgba(45,212,191,0.25)' : 'var(--c-border-dim)'),
    }}>
      {isLoading ? '...' : children}
    </button>
  );
}

function ListField({ label, values, editing, placeholder, onChange }: {
  label: string; values: string[]; editing: boolean; placeholder: string;
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="mono text-[13px]" style={{ color: 'var(--c-text-dim)' }}>{label}</span>
        <span className="mono text-[14px]" style={{ color: 'var(--c-text-muted)' }}>{values.length} items</span>
      </div>
      {editing ? (
        <input
          value={values.join(', ')}
          onChange={(e) => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          placeholder={placeholder}
          className="mono text-[13px] w-full bg-transparent outline-none px-2 py-1.5 rounded transition-colors"
          style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)' }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
        />
      ) : (
        <div className="flex flex-wrap gap-1">
          {values.length > 0 ? values.map((v, i) => (
            <span key={i} className="mono text-[14px] px-2 py-0.5 rounded" style={{ background: 'rgba(45,212,191,0.04)', color: 'var(--c-text-muted)', border: '1px solid var(--c-border-dim)' }}>
              {v}
            </span>
          )) : (
            <span className="mono text-[14px]" style={{ color: 'var(--c-border)' }}>none configured</span>
          )}
        </div>
      )}
    </div>
  );
}

function BehaviorField({ label, value, suffix, editing, min, max, onChange }: {
  label: string; value: number; suffix: string; editing: boolean; min: number; max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="mono text-[13px]" style={{ color: 'var(--c-text-dim)' }}>{label}</span>
      <div className="flex items-center gap-1">
        {editing ? (
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
            className="w-12 bg-transparent text-right outline-none mono text-[13px] rounded px-1"
            style={{ color: 'var(--c-teal)', borderBottom: '1px solid var(--c-teal-dim)' }}
            min={min} max={max}
          />
        ) : (
          <span className="mono text-[13px]" style={{ color: 'var(--c-text-dim)' }}>{value}</span>
        )}
        <span className="mono text-[14px]" style={{ color: 'var(--c-text-muted)' }}>{suffix}</span>
      </div>
    </div>
  );
}

function Empty({ text, hint }: { text: string; hint: string }) {
  return (
    <div className="py-10 text-center">
      <div className="text-sm" style={{ color: 'var(--c-text-dim)' }}>{text}</div>
      <div className="mono text-[12px] mt-1.5" style={{ color: 'var(--c-text-muted)' }}>{hint}</div>
    </div>
  );
}

const INTERVAL_OPTIONS = [15, 30, 60, 120, 240, 480] as const;

function intervalLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = minutes / 60;
  return h === Math.floor(h) ? `${h}h` : `${Math.floor(h)}h${minutes % 60}m`;
}

function IntervalPicker({ value, onSave }: { value: number; onSave: (minutes: number) => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    // Position dropdown below the button
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4 + window.scrollY, left: rect.left + window.scrollX });
    }
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.12em] font-medium mb-1.5" style={{ color: 'var(--c-text-muted)' }}>Run every</div>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="text-xl font-semibold tabular-nums leading-none flex items-center gap-1.5 transition-colors hover:text-teal"
        style={{ color: 'var(--c-text)' }}
      >
        {intervalLabel(value)}
        <span className="text-[10px]" style={{ color: 'var(--c-text-muted)' }}>▼</span>
      </button>
      <div className="mono text-[12px] mt-1.5" style={{ color: 'var(--c-text-muted)' }}>
        during active hours
      </div>
      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed rounded-lg overflow-hidden z-50"
          style={{ top: pos.top, left: pos.left, background: 'var(--c-panel)', border: '1px solid var(--c-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        >
          {INTERVAL_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => { onSave(opt); setOpen(false); }}
              className="block w-full text-left px-5 py-2.5 text-sm transition-colors hover:bg-white/5 whitespace-nowrap"
              style={{
                color: opt === value ? 'var(--c-teal)' : 'var(--c-text-dim)',
                fontWeight: opt === value ? 600 : 400,
              }}
            >
              {intervalLabel(opt)}
              {opt === value && <span className="ml-2 text-[10px]" style={{ color: 'var(--c-text-muted)' }}>current</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function HeroStat({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.12em] font-medium mb-1.5" style={{ color: 'var(--c-text-muted)' }}>{label}</div>
      <div className="text-xl font-semibold tabular-nums leading-none" style={{ color: warn ? 'var(--c-amber)' : 'var(--c-text)' }}>{value}</div>
      {sub && <div className="mono text-[12px] mt-1.5" style={{ color: 'var(--c-text-muted)' }}>{sub}</div>}
    </div>
  );
}
