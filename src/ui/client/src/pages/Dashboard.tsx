import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, today } from '../hooks/useApi.ts';
import { useAgentsEnabled, HealthBanner } from '../contexts/HealthContext.tsx';
import { PipelineStageModal } from '../components/PipelineStageModal.tsx';
import { PIPELINE_GROUPS, stagesByGroup, type StageMeta } from '../lib/pipeline-stages.ts';

interface PipelineStageState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

interface StatusData {
  daemon: boolean;
  timezone: string;
  activeHours: { start: number; end: number };
  pipelineEnabled: boolean;
  pipelineStartHour: number;
  nextPipelineRun: string | null;
  pipelineStages?: Record<string, PipelineStageState>;
  pipelineRunStartedAt?: string | null;
  pipelineRunCompletedAt?: string | null;
  platforms: Array<{ platform: string; enabled: boolean; auto_run: boolean; handle: string }>;
  platformSchedules: Array<{ platform: string; nextRun: string | null; running?: boolean }>;
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
  const { data: agents, refetch: refetchAgents } = useApi<Array<{ platform: string; limits: { daily: Record<string, { limit: number; current: number }>; weekly?: Record<string, { limit: number; current: number }> } | null }>>('/api/agents');
  const autoRunCount = status?.platforms.filter((p) => p.auto_run).length || 0;
  const [openStage, setOpenStage] = useState<{ id: string; label: string } | null>(null);

  // Auto-refresh dashboard every 10 seconds
  useEffect(() => {
    const id = setInterval(() => { refetch(); refetchActivity(); refetchAgents(); }, 10000);
    return () => clearInterval(id);
  }, [refetch, refetchActivity, refetchAgents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="mono text-sm animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>
          Connecting to agents...
        </div>
      </div>
    );
  }

  // Count meaningful actions from limits (comments, reactions, posts, etc.)
  const actionsByPlatform: Record<string, number> = {};
  agents?.forEach((a) => {
    if (!a.limits) return;
    let count = 0;
    for (const v of Object.values(a.limits.daily)) count += v.current || 0;
    if (a.limits.weekly) for (const v of Object.values(a.limits.weekly)) count += v.current || 0;
    actionsByPlatform[a.platform] = count;
  });

  const lastRun: Record<string, StatusData['recentRuns'][0]> = {};
  status?.recentRuns?.forEach((r) => { if (!lastRun[r.agent_name]) lastRun[r.agent_name] = r; });

  const totalActions = Object.values(actionsByPlatform).reduce((a, b) => a + b, 0);
  const totalAgents = status?.platforms.length || 0;
  const enabledAgents = status?.platforms.filter((p) => p.enabled).length || 0;
  const runsToday = status?.recentRuns?.length || 0;
  const completedToday = status?.recentRuns?.filter((r) => r.status === 'completed').length || 0;

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
      </div>

      {/* ── First-run hint: no auto-run agents ───────── */}
      {autoRunCount === 0 && runsToday === 0 && (
        <div className="panel noise animate-fade-up" style={{ background: 'rgba(45,212,191,0.04)', border: '1px solid rgba(45,212,191,0.2)' }}>
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="text-xl shrink-0">💡</div>
            <div className="text-[13px]" style={{ color: 'var(--c-text-dim)' }}>
              No agents are set to auto-run. Go to the <strong style={{ color: 'var(--c-teal)' }}>Agents</strong> tab and enable auto-run on individual agents to have them run automatically on a schedule.
            </div>
          </div>
        </div>
      )}

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
          label="Actions"
          value={totalActions}
          sub={totalActions > 0 ? 'comments, reactions, posts' : 'no actions yet'}
        />
        <KpiCard
          label="Auto-Run"
          value={`${autoRunCount}/${totalAgents}`}
          sub={autoRunCount > 0 ? `${autoRunCount} on schedule` : 'none scheduled'}
          accent={autoRunCount > 0 ? 'green' : undefined}
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
            const acts = actionsByPlatform[p.platform] || 0;
            const agentData = agents?.find((a) => a.platform === p.platform);
            const comments = agentData?.limits?.daily?.comments?.current || agentData?.limits?.daily?.responses?.current || 0;
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
                      <div className="text-2xl font-semibold tabular-nums leading-none" style={{ color: comments > 0 ? 'var(--c-text)' : 'var(--c-text-muted)' }}>
                        {comments}
                      </div>
                    </div>
                  </div>

                  {/* Footer: schedule or last run */}
                  <div className="flex items-center justify-between mono text-[12px] pt-2" style={{ borderTop: '1px solid var(--c-border-dim)', color: 'var(--c-text-muted)' }}>
                    {run?.status === 'running' ? (
                      <span className="flex items-center gap-1.5" style={{ color: 'var(--c-blue)' }}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--c-blue)' }}></span>
                        running now
                      </span>
                    ) : sched && sched.nextRun ? (
                      <Countdown target={sched.nextRun} />
                    ) : p.auto_run ? (
                      <span style={{ color: 'var(--c-green)' }}>auto-run</span>
                    ) : (
                      <span>manual only</span>
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

      {/* ── Recent Runs (compact, last 5) ──────────────────────── */}
      <div className="panel noise animate-fade-up stagger-3">
        <div className="panel-header flex items-center justify-between">
          <span>// Recent Runs</span>
          {runsToday > 0 && (
            <button
              onClick={() => navigate('/activity')}
              className="mono text-[13px] normal-case tracking-normal transition-colors hover:underline"
              style={{ color: 'var(--c-teal-dim)' }}
            >
              {runsToday > 5 ? `View all ${runsToday} runs →` : `${runsToday} today`}
            </button>
          )}
        </div>
        {status?.recentRuns && status.recentRuns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                  <th className="text-left px-5 py-2.5 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Agent</th>
                  <th className="text-left px-5 py-2.5 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Status</th>
                  <th className="text-left px-5 py-2.5 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Started</th>
                  <th className="text-right px-5 py-2.5 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {status.recentRuns.slice(0, 5).map((run) => {
                  const day = run.started_at?.split('T')[0] || today();
                  return (
                    <tr
                      key={run.id}
                      className="transition-colors hover:bg-white/[0.03] cursor-pointer"
                      style={{ borderBottom: '1px solid var(--c-border-dim)' }}
                      onClick={() => navigate(`/activity?date=${day}&platform=${run.agent_name}&session=${run.id}`)}
                      title="Open in Activity Log"
                    >
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: PLATFORM_COLORS[run.agent_name] || '#888' }} />
                          <span className="capitalize text-sm font-medium" style={{ color: 'var(--c-text)' }}>{run.agent_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5"><StatusBadge status={run.status} /></td>
                      <td className="px-5 py-2.5 mono text-[13px]" style={{ color: 'var(--c-text-dim)' }}>
                        {run.started_at ? new Date(run.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'}
                      </td>
                      <td className="px-5 py-2.5 text-right mono text-[13px] tabular-nums" style={{ color: 'var(--c-text-muted)' }}>
                        {run.duration_ms ? `${Math.floor(run.duration_ms / 60000)}m ${Math.floor((run.duration_ms % 60000) / 1000)}s` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="text-sm mb-1" style={{ color: 'var(--c-text-dim)' }}>No runs today</div>
            <div className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>
              {status?.daemon ? 'Waiting for next scheduled run' : 'Start agents or trigger a manual run from the Agents tab'}
            </div>
          </div>
        )}
      </div>

      {/* ── Content Pipeline ──────────────────────────────────── */}
      {status?.pipelineEnabled && (
        <div className="panel noise animate-fade-up stagger-4">
          <div className="panel-header flex items-center justify-between gap-4">
            <span>// Content Pipeline</span>
            <div className="flex items-center gap-2 mono text-[13px] normal-case tracking-normal">
              {status?.pipelineRunCompletedAt && (
                <span style={{ color: 'var(--c-text-muted)' }}>
                  last <span style={{ color: 'var(--c-text-dim)' }}>{new Date(status.pipelineRunCompletedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                </span>
              )}
              {status?.pipelineRunCompletedAt && status?.daemon && status?.nextPipelineRun && (
                <span style={{ color: 'var(--c-border)' }}>·</span>
              )}
              {status?.daemon && status?.nextPipelineRun && (
                <span style={{ color: 'var(--c-text-muted)' }}>
                  next <span style={{ color: 'var(--c-teal)' }}>{new Date(status.nextPipelineRun).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                </span>
              )}
            </div>
          </div>
          <div className="p-5">
            <p className="text-[13px] mb-5" style={{ color: 'var(--c-text-muted)' }}>
              A daily three-step factory: <span style={{ color: 'var(--c-text-dim)' }}>research</span> what's happening, <span style={{ color: 'var(--c-text-dim)' }}>analyze</span> what to act on, then <span style={{ color: 'var(--c-text-dim)' }}>plan and write</span> today's posts.
            </p>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {PIPELINE_GROUPS.map((group, gi) => (
                <div key={group.name} className="relative">
                  <div className="rounded-lg p-3 h-full" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--c-border-dim)' }}>
                    <div className="flex items-baseline justify-between mb-3">
                      <div className="flex items-baseline gap-2">
                        <span className="mono text-[11px] font-semibold" style={{ color: 'var(--c-teal)' }}>{group.step}.</span>
                        <span className="text-[14px] font-semibold" style={{ color: 'var(--c-text)' }}>{group.name}</span>
                        {stagesByGroup(group.name).length > 1 && stagesByGroup(group.name)[0].parallel && (
                          <span className="mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: 'var(--c-teal-dim)', background: 'rgba(94, 234, 212, 0.08)' }}>parallel</span>
                        )}
                      </div>
                    </div>
                    <p className="text-[12px] mb-3" style={{ color: 'var(--c-text-muted)' }}>{group.subtitle}</p>
                    <div className="flex flex-col gap-2">
                      {stagesByGroup(group.name).map((stage) => (
                        <PipelineStageTile
                          key={stage.id}
                          stage={stage}
                          run={status?.pipelineStages?.[stage.id]}
                          onClick={() => setOpenStage({ id: stage.id, label: stage.label })}
                        />
                      ))}
                    </div>
                  </div>
                  {gi < PIPELINE_GROUPS.length - 1 && (
                    <div className="hidden lg:flex absolute top-1/2 -right-2.5 -translate-y-1/2 items-center justify-center w-5 h-5 rounded-full pointer-events-none" style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border-dim)', zIndex: 1 }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5h6M5.5 2.5L8 5l-2.5 2.5" stroke="var(--c-text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mono text-[11px] mt-4 flex items-center gap-3 flex-wrap" style={{ color: 'var(--c-text-muted)' }}>
              <span style={{ opacity: 0.6 }}>status:</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-green)' }} /> done</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-blue)' }} /> running</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-red)' }} /> failed</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-text-muted)' }} /> not yet run today</span>
              <span className="ml-auto opacity-60">click any stage to view its outputs</span>
            </div>
          </div>
        </div>
      )}

      {openStage && (
        <PipelineStageModal
          stageId={openStage.id}
          stageLabel={openStage.label}
          date={today()}
          onClose={() => setOpenStage(null)}
        />
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
    return <span style={{ color: 'var(--c-teal)' }}>starting soon</span>;
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

interface StageRun {
  status: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

function fmtStageTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtStageDuration(ms?: number): string {
  if (ms == null) return '';
  if (ms < 1000) return '<1s';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function PipelineStageTile({ stage, run, onClick }: { stage: StageMeta; run?: StageRun; onClick: () => void }) {
  const status = run?.status || 'idle';
  const dotColor =
    status === 'completed' ? 'var(--c-green)' :
    status === 'running'   ? 'var(--c-blue)'  :
    status === 'failed'    ? 'var(--c-red)'   :
                             'var(--c-text-muted)';

  let meta: ReactNode = null;
  if (status === 'completed' && run?.completedAt) {
    meta = (
      <span className="mono text-[10.5px] tabular-nums" style={{ color: 'var(--c-text-muted)' }}>
        {fmtStageTime(run.completedAt)}{run.durationMs != null && ` · ${fmtStageDuration(run.durationMs)}`}
      </span>
    );
  } else if (status === 'running') {
    meta = (
      <span className="mono text-[10.5px] flex items-center gap-1" style={{ color: 'var(--c-blue)' }}>
        <span className="status-dot online" />
        running
      </span>
    );
  } else if (status === 'failed') {
    meta = (
      <span className="mono text-[10.5px]" style={{ color: 'var(--c-red)' }}>failed</span>
    );
  } else {
    meta = (
      <span className="mono text-[10.5px]" style={{ color: 'var(--c-text-muted)', opacity: 0.6 }}>not yet today</span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-md px-2.5 py-2 transition-colors cursor-pointer group"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--c-border-dim)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--c-teal-dim)'; e.currentTarget.style.background = 'rgba(94, 234, 212, 0.04)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--c-border-dim)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
      title={run?.error ? `Failed: ${run.error}` : 'View outputs'}
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
        <span className="text-[12.5px] font-medium truncate flex-1" style={{ color: 'var(--c-text)' }}>{stage.label}</span>
        {meta}
      </div>
      <div className="text-[11.5px] mt-1 ml-4" style={{ color: 'var(--c-text-muted)' }}>{stage.tagline}</div>
    </button>
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
