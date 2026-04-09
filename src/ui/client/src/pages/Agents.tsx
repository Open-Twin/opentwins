import { useState, useEffect } from 'react';
import { useApi, useMutation } from '../hooks/useApi.ts';

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
  needs_setup:    { label: 'NEEDS SETUP',    color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', dot: '' },
  needs_api_keys: { label: 'NEEDS API KEYS', color: '#fb923c', bg: 'rgba(251,146,60,0.08)', dot: '' },
  ready:       { label: 'READY',       color: '#64748b', bg: 'rgba(100,116,139,0.08)', dot: 'pending' },
  running:     { label: 'RUNNING',     color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', dot: 'online' },
  completed:   { label: 'COMPLETED',   color: '#34d399', bg: 'rgba(52,211,153,0.08)', dot: 'online' },
  failed:      { label: 'FAILED',      color: '#f87171', bg: 'rgba(248,113,113,0.08)', dot: 'offline' },
  disabled:    { label: 'DISABLED',    color: '#475569', bg: 'rgba(71,85,105,0.08)', dot: '' },
};

export function Agents() {
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
    const result = await saveConfig({ platforms: config.platforms.filter((p) => p.platform !== platform) }) as { ok?: boolean } | null;
    if (result?.ok) {
      setFlash(`Removed ${PLATFORM_LABELS[platform] || platform}`);
      if (selected === platform) setSelected(null);
      refetch(); refetchConfig();
      setTimeout(() => setFlash(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-up flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>Agent Control</h1>
          <p className="mono text-sm mt-1" style={{ color: 'var(--c-text-muted)' }}>Manage lifecycle, limits, and schedules for each agent</p>
        </div>
        <div className="flex items-center gap-2">
          {flash && <span className="mono text-[13px] px-3 py-1 rounded-full animate-fade-up" style={{ color: 'var(--c-teal)', background: 'var(--c-teal-glow)' }}>{flash}</span>}
          {availablePlatforms.length > 0 && !addingPlatform && (
            <button onClick={() => { setAddingPlatform(true); setNewPlatform(availablePlatforms[0]); setNewHandle(''); }} className="mono text-[13px] px-3 py-1.5 rounded-md font-medium transition-all" style={{ color: 'var(--c-teal)', background: 'var(--c-teal-glow)', border: '1px solid rgba(45,212,191,0.25)' }}>
              + Add Agent
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

      {/* Agent cards grid */}
      <div className="animate-fade-up stagger-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {agents?.map((a) => {
          const color = PLATFORM_COLORS[a.platform] || '#888';
          const st = STATE_CONFIG[a.state];
          const isSelected = a.platform === activePlatform;

          return (
            <button
              key={a.platform}
              onClick={() => setSelected(a.platform)}
              className="panel noise text-left transition-all duration-200 hover:scale-[1.02]"
              style={{
                borderColor: isSelected ? 'var(--c-teal-dim)' : undefined,
                boxShadow: isSelected ? '0 0 0 1px var(--c-teal-dim)' : undefined,
              }}
            >
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: a.state === 'running' ? `0 0 10px ${color}` : `0 0 6px ${color}40` }} />
                    <span className="text-sm font-semibold capitalize" style={{ color: 'var(--c-text)' }}>{a.platform}</span>
                  </div>
                </div>
                <div className="mono text-[14px] mb-2" style={{ color: 'var(--c-text-muted)' }}>@{a.handle}</div>
                <StateBadge state={a.state} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      {activePlatform && activeAgent && (
        <AgentPanel platform={activePlatform} summary={activeAgent} onRefresh={refetch} onRemove={handleRemovePlatform} />
      )}
    </div>
  );
}

function AgentPanel({ platform, summary, onRefresh, onRemove }: { platform: string; summary: AgentSummary; onRefresh: () => void; onRemove: (p: string) => void }) {
  const { data: agent, loading, refetch } = useApi<AgentDetail>(`/api/agents/${platform}`, [platform]);
  const { mutate: runAgent, loading: starting } = useMutation(`/api/agents/${platform}/run`, 'POST');
  const { mutate: stopAgent, loading: stopping } = useMutation(`/api/agents/${platform}/stop`, 'POST');
  const { mutate: saveLimits, loading: savingLimits } = useMutation(`/api/agents/${platform}/limits`);
  const { mutate: saveAgent } = useMutation(`/api/agents/${platform}`);
  const [editLimits, setEditLimits] = useState<Record<string, Record<string, number>> | null>(null);
  const [editBehavior, setEditBehavior] = useState<AgentDetail['behavior'] | null>(null);
  const [editApiKeys, setEditApiKeys] = useState<Record<string, string> | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Agent header with controls */}
      <div className="panel noise">
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-3 h-3 rounded-full" style={{ background: color, boxShadow: state === 'running' ? `0 0 12px ${color}` : `0 0 8px ${color}40` }} />
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold capitalize" style={{ color: 'var(--c-text)' }}>{platform}</span>
                  <StateBadge state={state} />
                </div>
                <div className="mono text-sm mt-0.5" style={{ color: 'var(--c-text-muted)' }}>@{agent.handle}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {flash && <span className="mono text-[13px] px-3 py-1 rounded-full animate-fade-up" style={{ color: 'var(--c-teal)', background: 'var(--c-teal-glow)' }}>{flash}</span>}

              {state === 'needs_setup' && (
                <div className="flex items-center gap-2">
                  <span className="mono text-[14px]" style={{ color: 'var(--c-amber)' }}>Browser not configured</span>
                  <CmdHint cmd={`opentwins browser setup ${platform}`} />
                </div>
              )}

              {state === 'needs_api_keys' && (
                <span className="mono text-[14px]" style={{ color: '#fb923c' }}>API keys required - configure below</span>
              )}

              {state === 'disabled' && (
                <span className="mono text-[14px]" style={{ color: 'var(--c-text-muted)' }}>Enable in Config to run</span>
              )}

              {state === 'running' && (
                <ActionBtn onClick={handleStop} loading={stopping} danger>Stop</ActionBtn>
              )}

              {(state === 'ready' || state === 'completed' || state === 'failed') && (
                <ActionBtn onClick={handleRun} loading={starting} accent>Run Now</ActionBtn>
              )}

              <button
                onClick={() => { if (confirm(`Remove ${platform} agent? This won't delete browser profiles or activity history.`)) onRemove(platform); }}
                className="mono text-[14px] px-2 py-1 rounded-md transition-all opacity-40 hover:opacity-100"
                style={{ color: 'var(--c-red)', border: '1px solid rgba(248,113,113,0.15)' }}
                title="Remove agent"
              >
                Remove
              </button>
            </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel noise">
          <div className="panel-header">// Today's Schedule</div>
          <div className="p-4">
            {scheduleEntries.length > 0 ? (
              <div className="space-y-0.5">
                {scheduleEntries.map((t, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 rounded px-2 transition-colors hover:bg-white/[0.02]">
                    <span className="mono text-[13px] shrink-0 w-12" style={{ color: 'var(--c-teal-dim)' }}>{t.time}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="mono text-[13px]" style={{ color: 'var(--c-text)' }}>{t.action}</span>
                        {t.status && (
                          <span className="mono text-[13px] px-1.5 py-0.5 rounded-full" style={{
                            color: t.status === 'completed' ? 'var(--c-teal)' : t.status === 'failed' ? 'var(--c-red)' : t.status === 'running' ? 'var(--c-amber)' : 'var(--c-text-muted)',
                            background: t.status === 'completed' ? 'var(--c-teal-glow)' : t.status === 'failed' ? 'rgba(248,113,113,0.1)' : t.status === 'running' ? 'rgba(251,191,36,0.1)' : 'transparent',
                          }}>{t.status}</span>
                        )}
                      </div>
                      {t.desc && <div className="text-[14px] mt-0.5 truncate" style={{ color: 'var(--c-text-muted)' }}>{t.desc}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="No schedule yet" hint="Generated on first heartbeat run" />
            )}
          </div>
        </div>

        <div className="panel noise">
          <div className="panel-header">// Insights</div>
          <div className="p-4">
            {agent.insights ? (
              <pre className="mono text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--c-text-muted)' }}>
                {agent.insights}
              </pre>
            ) : (
              <Empty text="No insights yet" hint="Updated after first memory cycle" />
            )}
          </div>
        </div>
      </div>

      {/* Last Run Output */}
      {agent.lastRun && (
        <div className="panel noise">
          <div className="panel-header flex items-center justify-between">
            <span>// Last Run</span>
            <div className="flex items-center gap-3">
              {agent.lastRun.exitCode !== undefined && (
                <span className="mono text-[14px] normal-case tracking-normal" style={{
                  color: agent.lastRun.exitCode === 0 ? 'var(--c-green)' : 'var(--c-red)',
                }}>
                  exit: {agent.lastRun.exitCode}
                </span>
              )}
              <span className="mono text-[14px] normal-case tracking-normal" style={{ color: 'var(--c-text-muted)' }}>
                {agent.lastRun.startedAt?.split('T')[1]?.slice(0, 5) || ''}
                {agent.lastRun.completedAt && ` - ${agent.lastRun.completedAt.split('T')[1]?.slice(0, 5)}`}
              </span>
            </div>
          </div>
          <div className="p-4 max-h-64 overflow-y-auto">
            <pre className="mono text-[13px] leading-relaxed whitespace-pre-wrap" style={{
              color: agent.lastRun.exitCode === 0 ? 'var(--c-text-muted)' : 'var(--c-red)',
            }}>
              {agent.lastRun.output || '(no output captured)'}
            </pre>
          </div>
        </div>
      )}
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
      <div className="mono text-[14px] uppercase tracking-wider mb-3" style={{ color: 'var(--c-text-muted)' }}>{title}</div>
      <div className="space-y-2.5">
        {Object.entries(limits).map(([action, val]) => {
          const limit = editing ? (editing[action] ?? val.limit) : val.limit;
          const pct = limit > 0 ? Math.min((val.current / limit) * 100, 100) : 0;
          const isDisabled = limit === 0;

          return (
            <div key={action} className="group">
              <div className="flex items-center justify-between mb-1">
                <span className="mono text-[13px]" style={{ color: isDisabled ? 'var(--c-text-muted)' : 'var(--c-text-dim)', textDecoration: isDisabled ? 'line-through' : 'none' }}>
                  {action.replace(/_/g, ' ')}
                </span>
                <div className="mono text-[13px] flex items-center gap-1" style={{ color: 'var(--c-text-muted)' }}>
                  <span>{val.current}</span>
                  <span style={{ color: 'var(--c-border)' }}>/</span>
                  {editing ? (
                    <input
                      type="number"
                      value={limit}
                      onChange={(e) => onChange(action, Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-10 bg-transparent text-right outline-none mono text-[13px] rounded px-1"
                      style={{ color: 'var(--c-teal)', borderBottom: '1px solid var(--c-teal-dim)' }}
                      min={0}
                    />
                  ) : (
                    <span>{limit}</span>
                  )}
                </div>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--c-border-dim)' }}>
                <div className="h-full rounded-full transition-all duration-700" style={{
                  width: `${pct}%`,
                  background: pct >= 90 ? 'var(--c-amber)' : color,
                  opacity: isDisabled ? 0.2 : 0.6,
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CmdHint({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="mono text-[14px] px-2.5 py-1 rounded-md transition-colors"
      style={{ background: 'rgba(251,191,36,0.06)', color: 'var(--c-amber)', border: '1px solid rgba(251,191,36,0.15)' }}
      title="Click to copy"
    >
      {copied ? 'Copied!' : cmd}
    </button>
  );
}

function ActionBtn({ children, onClick, loading: isLoading, accent, danger, disabled }: {
  children: React.ReactNode; onClick: () => void; loading?: boolean; accent?: boolean; danger?: boolean; disabled?: boolean;
}) {
  const color = danger ? 'var(--c-red)' : 'var(--c-teal)';
  const bg = danger ? 'rgba(248,113,113,0.08)' : 'var(--c-teal-glow)';
  const border = danger ? 'rgba(248,113,113,0.2)' : 'rgba(45,212,191,0.25)';
  return (
    <button
      onClick={onClick}
      disabled={isLoading || disabled}
      className="mono text-[13px] px-4 py-1.5 rounded-md font-medium transition-all duration-200 disabled:opacity-50"
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
    <div className="py-8 text-center">
      <div className="mono text-sm" style={{ color: 'var(--c-text-muted)' }}>{text}</div>
      <div className="mono text-[14px] mt-1" style={{ color: 'var(--c-border)' }}>{hint}</div>
    </div>
  );
}
