import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useMutation, today } from '../hooks/useApi.ts';
import { useAgentsEnabled, HealthBanner } from '../contexts/HealthContext.tsx';

interface StatusData {
  daemon: boolean;
  timezone: string;
  activeHours: { start: number; end: number };
  pipelineEnabled: boolean;
  pipelineStartHour: number;
  nextPipelineRun: string | null;
  platforms: Array<{ platform: string; enabled: boolean; handle: string }>;
  platformSchedules: Array<{ platform: string; nextRun: string }>;
  recentRuns: Array<{
    id: string;
    agent_name: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    error: string | null;
  }>;
}

interface QualitySummary {
  platform: string;
  comments: number;
  styles: string;
  disagreements: number;
  avg_words: number;
  last_style: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#FF4500', twitter: '#1DA1F2', linkedin: '#0A66C2', bluesky: '#0085FF',
  threads: '#888', medium: '#00AB6C', substack: '#FF6719', devto: '#3B49DF',
  ph: '#DA552F', ih: '#4F46E5',
};

// Pipeline stages — shown as a compact vertical timeline
const PIPELINE_STAGES = [
  { id: 'trend-scout',         label: 'Trend Scout',        group: 'Research',  parallel: true  },
  { id: 'competitive-intel',   label: 'Competitive Intel',  group: 'Research',  parallel: true  },
  { id: 'engagement-tracker',  label: 'Engagement Tracker', group: 'Research',  parallel: true  },
  { id: 'network-mapper',      label: 'Network Mapper',     group: 'Research',  parallel: true  },
  { id: 'amplification',       label: 'Amplification',      group: 'Analysis',  parallel: false },
  { id: 'content-planner',     label: 'Content Planner',    group: 'Content',   parallel: false },
  { id: 'content-writer',      label: 'Content Writer',     group: 'Content',   parallel: false },
];

// Shorten a handle/URL to a clean display form
function cleanHandle(handle: string): string {
  if (!handle) return '';
  // If it's a URL, extract the last path segment
  if (handle.startsWith('http')) {
    try {
      const url = new URL(handle);
      const segs = url.pathname.split('/').filter(Boolean);
      return '@' + (segs[segs.length - 1] || url.hostname);
    } catch { /* fallthrough */ }
  }
  return handle.startsWith('@') ? handle : '@' + handle;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; dot: string }> = {
    completed:  { bg: 'rgba(52, 211, 153, 0.12)', color: 'var(--c-green)', dot: 'online'  },
    running:    { bg: 'rgba(96, 165, 250, 0.12)', color: 'var(--c-blue)',  dot: 'online'  },
    incomplete: { bg: 'rgba(251, 191, 36, 0.12)', color: 'var(--c-amber)', dot: 'pending' },
    failed:     { bg: 'rgba(248, 113, 113, 0.12)', color: 'var(--c-red)',  dot: 'offline' },
  };
  const s = styles[status] || { bg: 'rgba(148,163,184,0.1)', color: 'var(--c-text-muted)', dot: 'pending' };
  return (
    <span className="mono inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium uppercase tracking-wider" style={{ background: s.bg, color: s.color }}>
      <span className={`status-dot ${s.dot}`} />
      {status}
    </span>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: 'teal' | 'green' | 'amber' }) {
  const accentColor = accent === 'teal' ? 'var(--c-teal)' : accent === 'green' ? 'var(--c-green)' : accent === 'amber' ? 'var(--c-amber)' : 'var(--c-text)';
  return (
    <div className="panel noise p-5">
      <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>{label}</div>
      <div className="text-3xl font-semibold tabular-nums leading-none" style={{ color: accentColor }}>{value}</div>
      {sub && <div className="mono text-[12px] mt-2" style={{ color: 'var(--c-text-muted)' }}>{sub}</div>}
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { enabled: agentsEnabled, reason: agentsDisabledReason } = useAgentsEnabled();
  const { data: status, loading, refetch } = useApi<StatusData>('/api/status');
  const { data: activityResp, refetch: refetchActivity } = useApi<{ sessions: Array<{ platform: string; toolCount: number; eventCount: number }> }>(`/api/activity?date=${today()}`);
  const { data: quality } = useApi<QualitySummary[]>(`/api/quality?date=${today()}`);
  const { mutate: startScheduler, loading: startingScheduler } = useMutation('/api/scheduler/start', 'POST');
  const { mutate: stopScheduler, loading: stoppingScheduler } = useMutation('/api/scheduler/stop', 'POST');
  const [schedulerFlash, setSchedulerFlash] = useState<string | null>(null);

  // Auto-refresh dashboard every 10 seconds
  useEffect(() => {
    const id = setInterval(() => { refetch(); refetchActivity(); }, 10000);
    return () => clearInterval(id);
  }, [refetch, refetchActivity]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="mono text-sm animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>
          Connecting to agents...
        </div>
      </div>
    );
  }

  const activityByPlatform: Record<string, number> = {};
  activityResp?.sessions?.forEach((s) => {
    activityByPlatform[s.platform] = (activityByPlatform[s.platform] || 0) + s.toolCount;
  });

  const qualityByPlatform: Record<string, QualitySummary> = {};
  quality?.forEach((q) => { qualityByPlatform[q.platform] = q; });

  const lastRun: Record<string, StatusData['recentRuns'][0]> = {};
  status?.recentRuns?.forEach((r) => { if (!lastRun[r.agent_name]) lastRun[r.agent_name] = r; });

  const totalActions = Object.values(activityByPlatform).reduce((a, b) => a + b, 0);
  const totalAgents = status?.platforms.length || 0;
  const enabledAgents = status?.platforms.filter((p) => p.enabled).length || 0;
  const runsToday = status?.recentRuns?.length || 0;
  const completedToday = status?.recentRuns?.filter((r) => r.status === 'completed').length || 0;

  const toggleScheduler = async () => {
    if (status?.daemon) {
      const r = await stopScheduler({});
      if (r) { setSchedulerFlash('Automation stopped'); refetch(); setTimeout(() => setSchedulerFlash(null), 3000); }
    } else {
      const r = await startScheduler({});
      if (r) { setSchedulerFlash('Automation started'); refetch(); setTimeout(() => setSchedulerFlash(null), 3000); }
    }
  };

  return (
    <div className="space-y-8">
      {!agentsEnabled && <HealthBanner reason={agentsDisabledReason} />}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="animate-fade-up flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>
            Mission Control
          </h1>
          <div className="mono text-sm mt-1.5 flex items-center gap-2" style={{ color: 'var(--c-text-muted)' }}>
            <span>{today()}</span>
            <span style={{ color: 'var(--c-border)' }}>·</span>
            <span>{status?.timezone}</span>
            <span style={{ color: 'var(--c-border)' }}>·</span>
            <span>active window {status?.activeHours.start}:00–{status?.activeHours.end}:00</span>
          </div>
        </div>

        {/* Primary action: Automation toggle */}
        <div className="flex items-center gap-3">
          {schedulerFlash && (
            <span className="mono text-[13px] px-3 py-1.5 rounded-full animate-fade-up" style={{ color: 'var(--c-teal)', background: 'var(--c-teal-glow)' }}>
              {schedulerFlash}
            </span>
          )}
          <button
            onClick={toggleScheduler}
            disabled={startingScheduler || stoppingScheduler || (!agentsEnabled && !status?.daemon)}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: status?.daemon ? 'rgba(52,211,153,0.12)' : 'var(--c-panel)',
              border: `1px solid ${status?.daemon ? 'rgba(52,211,153,0.3)' : 'var(--c-border-dim)'}`,
              color: status?.daemon ? 'var(--c-green)' : 'var(--c-text-dim)',
              boxShadow: status?.daemon ? '0 0 20px rgba(52,211,153,0.08)' : undefined,
            }}
            title={
              !agentsEnabled && !status?.daemon ? (agentsDisabledReason || 'Agents unavailable') :
              status?.daemon ? 'Pause all agent heartbeats and pipeline' :
              'Start hourly agent heartbeats and daily pipeline'
            }
          >
            <span className={`status-dot ${status?.daemon ? 'online' : 'offline'}`} />
            {startingScheduler ? 'Starting…' : stoppingScheduler ? 'Stopping…' : status?.daemon ? 'Automation On' : 'Automation Off'}
          </button>
        </div>
      </div>

      {/* ── KPI row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up stagger-1">
        <KpiCard
          label="Agents"
          value={`${enabledAgents}/${totalAgents}`}
          sub={enabledAgents === totalAgents ? 'all enabled' : `${totalAgents - enabledAgents} paused`}
          accent="teal"
        />
        <KpiCard
          label="Runs Today"
          value={runsToday}
          sub={runsToday > 0 ? `${completedToday} completed` : 'no runs yet'}
          accent={runsToday > 0 ? 'green' : undefined}
        />
        <KpiCard
          label="Tool Calls"
          value={totalActions}
          sub="across all sessions"
        />
        <KpiCard
          label="Automation"
          value={status?.daemon ? 'On' : 'Off'}
          sub={status?.daemon ? 'agents auto-run hourly' : 'manual runs only'}
          accent={status?.daemon ? 'green' : 'amber'}
        />
      </div>

      {/* ── Platform Agents ─────────────────────────────────────── */}
      <div className="animate-fade-up stagger-2">
        <div className="flex items-center justify-between mb-4">
          <div className="section-title">Platform Agents</div>
          <button
            onClick={() => navigate('/agents')}
            className="mono text-[13px] px-2.5 py-1 rounded-md transition-colors hover:bg-white/[0.03]"
            style={{ color: 'var(--c-teal-dim)' }}
          >
            manage →
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {status?.platforms.map((p, i) => {
            const run = lastRun[p.platform];
            const acts = activityByPlatform[p.platform] || 0;
            const q = qualityByPlatform[p.platform];
            const color = PLATFORM_COLORS[p.platform] || '#888';
            const sched = status.platformSchedules?.find((s) => s.platform === p.platform);

            return (
              <div
                key={p.platform}
                className={`panel noise animate-fade-up stagger-${Math.min(i + 1, 5)} cursor-pointer transition-all duration-200 hover:border-white/10`}
                style={{ opacity: p.enabled ? 1 : 0.5 }}
                onClick={() => navigate('/agents')}
              >
                <div className="p-5">
                  {/* Card header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: color, boxShadow: `0 0 12px ${color}50` }}
                      />
                      <div className="min-w-0">
                        <div className="text-base font-semibold capitalize leading-tight" style={{ color: 'var(--c-text)' }}>
                          {p.platform}
                        </div>
                        <div className="mono text-[12px] truncate" style={{ color: 'var(--c-text-muted)' }}>
                          {cleanHandle(p.handle)}
                        </div>
                      </div>
                    </div>
                    {run && <StatusBadge status={run.status} />}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3 mb-3 pt-3" style={{ borderTop: '1px solid var(--c-border-dim)' }}>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-muted)' }}>Actions</div>
                      <div className="text-2xl font-semibold tabular-nums leading-none" style={{ color: acts > 0 ? 'var(--c-text)' : 'var(--c-text-muted)' }}>
                        {acts}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-text-muted)' }}>Comments</div>
                      <div className="text-2xl font-semibold tabular-nums leading-none" style={{ color: (q?.comments || 0) > 0 ? 'var(--c-text)' : 'var(--c-text-muted)' }}>
                        {q?.comments || 0}
                      </div>
                    </div>
                  </div>

                  {/* Footer: schedule or last run */}
                  <div className="flex items-center justify-between mono text-[12px] pt-2" style={{ borderTop: '1px solid var(--c-border-dim)', color: 'var(--c-text-muted)' }}>
                    {status?.daemon && sched ? (
                      <Countdown target={sched.nextRun} />
                    ) : (
                      <span>scheduler off</span>
                    )}
                    {run?.duration_ms && (
                      <span>{(run.duration_ms / 1000).toFixed(0)}s</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Recent Runs (full width) ────────────────────────────── */}
      <div className="panel noise animate-fade-up stagger-3">
        <div className="panel-header flex items-center justify-between">
          <span>// Recent Runs</span>
          <span className="mono text-[13px] normal-case tracking-normal" style={{ color: 'var(--c-text-muted)' }}>
            {runsToday} today
          </span>
        </div>
        {status?.recentRuns && status.recentRuns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                  <th className="text-left px-5 py-3 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Agent</th>
                  <th className="text-left px-5 py-3 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Status</th>
                  <th className="text-left px-5 py-3 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Started</th>
                  <th className="text-left px-5 py-3 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Ended</th>
                  <th className="text-right px-5 py-3 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {status.recentRuns.slice(0, 12).map((run) => {
                  const day = run.started_at?.split('T')[0] || today();
                  return (
                    <tr
                      key={run.id}
                      className="transition-colors hover:bg-white/[0.03] cursor-pointer"
                      style={{ borderBottom: '1px solid var(--c-border-dim)' }}
                      onClick={() => navigate(`/activity?date=${day}&platform=${run.agent_name}&session=${run.id}`)}
                      title="Open in Activity Log"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: PLATFORM_COLORS[run.agent_name] || '#888' }} />
                          <span className="capitalize text-sm font-medium" style={{ color: 'var(--c-text)' }}>{run.agent_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5"><StatusBadge status={run.status} /></td>
                      <td className="px-5 py-3.5 mono text-[13px]" style={{ color: 'var(--c-text-dim)' }}>
                        {run.started_at ? new Date(run.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'}
                      </td>
                      <td className="px-5 py-3.5 mono text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
                        {run.completed_at ? new Date(run.completed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right mono text-[13px] tabular-nums" style={{ color: 'var(--c-text-muted)' }}>
                        {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(0)}s` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="text-base mb-2" style={{ color: 'var(--c-text-dim)' }}>No runs today</div>
            <div className="mono text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
              {status?.daemon ? 'Waiting for next scheduled run' : 'Start automation or trigger a manual run from the Agents tab'}
            </div>
          </div>
        )}
      </div>

      {/* ── Content Pipeline (collapsed, compact timeline) ─────── */}
      {status?.pipelineEnabled && (
        <div className="panel noise animate-fade-up stagger-4">
          <div className="panel-header flex items-center justify-between">
            <span>// Content Pipeline</span>
            {status?.daemon && status?.nextPipelineRun && (
              <span className="mono text-[13px] normal-case tracking-normal" style={{ color: 'var(--c-text-muted)' }}>
                next at {new Date(status.nextPipelineRun).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            )}
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 flex-wrap">
              {PIPELINE_STAGES.flatMap((stage, i) => {
                const run = lastRun[stage.id] || lastRun['pipeline'];
                const groupChange = i > 0 && PIPELINE_STAGES[i - 1].group !== stage.group;
                const nodes = [];

                if (groupChange) {
                  nodes.push(
                    <div key={`sep-${stage.id}`} className="flex items-center mx-1">
                      <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                        <path d="M1 6h12M9 2l4 4-4 4" stroke="var(--c-border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  );
                }

                nodes.push(
                  <div
                    key={stage.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--c-border-dim)',
                    }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{
                      background: run?.status === 'completed' ? 'var(--c-green)' :
                                  run?.status === 'running'   ? 'var(--c-blue)' :
                                  run?.status === 'failed'    ? 'var(--c-red)' :
                                  'var(--c-text-muted)',
                    }} />
                    <span className="text-[13px] font-medium" style={{ color: 'var(--c-text-dim)' }}>{stage.label}</span>
                  </div>
                );

                return nodes;
              })}
            </div>
            <div className="mono text-[12px] mt-4 flex items-center gap-4" style={{ color: 'var(--c-text-muted)' }}>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-green)' }} />
                <span>completed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-blue)' }} />
                <span>running</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-text-muted)' }} />
                <span>idle</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Quality (kept compact) ──────────────────────────────── */}
      {quality && quality.length > 0 && (
        <div className="animate-fade-up stagger-5">
          <div className="section-title mb-4">Signal Quality</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {quality.map((q) => {
              const styles = JSON.parse(q.styles || '{}');
              const styleCount = Object.keys(styles).length;
              const disagreeRate = q.comments > 0 ? Math.round((q.disagreements / q.comments) * 100) : 0;
              const color = PLATFORM_COLORS[q.platform] || '#888';

              return (
                <div key={q.platform} className="panel noise p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    <span className="text-sm font-semibold capitalize" style={{ color: 'var(--c-text)' }}>{q.platform}</span>
                  </div>
                  <div className="space-y-2">
                    <QualityRow label="Avg words" value={q.avg_words} warn={q.avg_words > 100} />
                    <QualityRow label="Disagree" value={`${disagreeRate}%`} warn={disagreeRate > 35} />
                    <QualityRow label="Styles" value={styleCount} />
                    <QualityRow label="Last" value={q.last_style} dim />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, new Date(target).getTime() - now);
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (diff <= 0) {
    return <span style={{ color: 'var(--c-teal)' }}>running soon...</span>;
  }

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  parts.push(`${String(s).padStart(2, '0')}s`);

  return (
    <span className="tabular-nums">
      next in <span style={{ color: 'var(--c-teal)' }}>{parts.join(' ')}</span>
    </span>
  );
}

function QualityRow({ label, value, warn, dim }: { label: string; value: string | number; warn?: boolean; dim?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="mono text-[12px] uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>{label}</span>
      <span className="mono text-sm font-medium" style={{
        color: warn ? 'var(--c-amber)' : dim ? 'var(--c-text-muted)' : 'var(--c-text-dim)',
      }}>{value}</span>
    </div>
  );
}
