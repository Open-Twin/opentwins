import { useState } from 'react';
import { useApi, useMutation, today } from '../hooks/useApi.ts';

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
    id: number;
    agent_name: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    error: string | null;
  }>;
}

interface ActivityRow {
  id: number;
  platform: string;
  action_type: string;
  content: string | null;
  word_count: number | null;
  created_at: string;
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
  threads: '#000000', medium: '#00AB6C', substack: '#FF6719', devto: '#3B49DF',
  ph: '#DA552F', ih: '#4F46E5',
};

// Pipeline stages with human-readable names and execution groups
const PIPELINE_GROUPS = [
  {
    label: 'Research',
    description: 'Runs in parallel',
    parallel: true,
    stages: [
      { id: 'trend-scout', name: 'Trend Scout', desc: 'Predicts trending topics' },
      { id: 'competitive-intel', name: 'Competitive Intel', desc: 'Monitors competitors' },
      { id: 'engagement-tracker', name: 'Engagement Tracker', desc: 'Tracks post performance' },
      { id: 'network-mapper', name: 'Network Mapper', desc: 'Maps engagement targets' },
    ],
  },
  {
    label: 'Analysis',
    description: 'Runs after research',
    parallel: false,
    stages: [
      { id: 'amplification', name: 'Amplification', desc: 'Identifies best content to amplify' },
    ],
  },
  {
    label: 'Content',
    description: 'Runs sequentially',
    parallel: false,
    stages: [
      { id: 'content-planner', name: 'Content Planner', desc: 'Generates daily brief' },
      { id: 'content-writer', name: 'Content Writer', desc: 'Creates platform-specific content' },
    ],
  },
];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; dot: string }> = {
    completed: { bg: 'rgba(52, 211, 153, 0.08)', color: 'var(--c-green)', dot: 'online' },
    running: { bg: 'rgba(96, 165, 250, 0.08)', color: 'var(--c-blue)', dot: 'online' },
    failed: { bg: 'rgba(248, 113, 113, 0.08)', color: 'var(--c-red)', dot: 'offline' },
  };
  const s = styles[status] || { bg: 'rgba(100,100,100,0.08)', color: 'var(--c-text-muted)', dot: 'pending' };
  return (
    <span className="mono inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: s.bg, color: s.color }}>
      <span className={`status-dot ${s.dot}`} />
      {status}
    </span>
  );
}

export function Dashboard() {
  const { data: status, loading, refetch } = useApi<StatusData>('/api/status');
  const { data: activity } = useApi<ActivityRow[]>(`/api/activity?date=${today()}`);
  const { data: quality } = useApi<QualitySummary[]>(`/api/quality?date=${today()}`);
  const { mutate: startScheduler, loading: startingScheduler } = useMutation('/api/scheduler/start', 'POST');
  const { mutate: stopScheduler, loading: stoppingScheduler } = useMutation('/api/scheduler/stop', 'POST');
  const [schedulerFlash, setSchedulerFlash] = useState<string | null>(null);

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
  activity?.forEach((a) => { activityByPlatform[a.platform] = (activityByPlatform[a.platform] || 0) + 1; });

  const qualityByPlatform: Record<string, QualitySummary> = {};
  quality?.forEach((q) => { qualityByPlatform[q.platform] = q; });

  const lastRun: Record<string, StatusData['recentRuns'][0]> = {};
  status?.recentRuns?.forEach((r) => { if (!lastRun[r.agent_name]) lastRun[r.agent_name] = r; });

  const totalActions = Object.values(activityByPlatform).reduce((a, b) => a + b, 0);
  const activeAgents = status?.platforms.filter((p) => p.enabled && lastRun[p.platform]?.status === 'completed').length || 0;

  return (
    <div className="space-y-6">
      {/* Hero status bar */}
      <div className="animate-fade-up flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>
            Mission Control
          </h1>
          <div className="mono text-xs mt-1 flex items-center gap-3" style={{ color: 'var(--c-text-muted)' }}>
            <span>{today()}</span>
            <span style={{ color: 'var(--c-border)' }}>|</span>
            <span>{status?.timezone}</span>
            <span style={{ color: 'var(--c-border)' }}>|</span>
            <button
              onClick={async () => {
                if (status?.daemon) {
                  const r = await stopScheduler({});
                  if (r) { setSchedulerFlash('All automation stopped'); refetch(); setTimeout(() => setSchedulerFlash(null), 3000); }
                } else {
                  const r = await startScheduler({});
                  if (r) { setSchedulerFlash('Automation started - agents will run on schedule'); refetch(); setTimeout(() => setSchedulerFlash(null), 4000); }
                }
              }}
              disabled={startingScheduler || stoppingScheduler}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all hover:bg-white/[0.03]"
              style={{ border: `1px solid ${status?.daemon ? 'rgba(52,211,153,0.2)' : 'var(--c-border-dim)'}` }}
              title={status?.daemon
                ? 'Click to stop - pauses all agent heartbeats and pipeline runs'
                : 'Click to start - enables hourly agent heartbeats and daily content pipeline'}
            >
              <span className={`status-dot ${status?.daemon ? 'online' : 'offline'}`} />
              <span>{startingScheduler ? 'Starting...' : stoppingScheduler ? 'Stopping...' : status?.daemon ? 'Automation on' : 'Automation off'}</span>
            </button>
            {schedulerFlash && <span style={{ color: 'var(--c-teal)' }}>{schedulerFlash}</span>}
            {!status?.daemon && !schedulerFlash && (
              <span className="text-[10px]" style={{ color: 'var(--c-text-muted)' }}>Agents and pipeline paused</span>
            )}
          </div>
        </div>
        <div className="flex gap-4">
          <MiniStat label="Agents" value={`${activeAgents}/${status?.platforms.length || 0}`} />
          <MiniStat label="Actions" value={totalActions} accent />
          <MiniStat label="Window" value={`${status?.activeHours.start}:00-${status?.activeHours.end}:00`} />
        </div>
      </div>

      {/* Platform grid */}
      <div>
        <div className="section-title mb-4">Platform Agents</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {status?.platforms.map((p, i) => {
            const run = lastRun[p.platform];
            const acts = activityByPlatform[p.platform] || 0;
            const q = qualityByPlatform[p.platform];
            const color = PLATFORM_COLORS[p.platform] || '#888';

            return (
              <div
                key={p.platform}
                className={`panel noise animate-fade-up stagger-${Math.min(i + 1, 5)} group transition-all duration-300 hover:scale-[1.02]`}
                style={{ opacity: p.enabled ? 1 : 0.35 }}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: color, boxShadow: `0 0 8px ${color}40` }}
                      />
                      <span className="text-sm font-semibold capitalize" style={{ color: 'var(--c-text)' }}>
                        {p.platform}
                      </span>
                    </div>
                    {run && <StatusBadge status={run.status} />}
                  </div>

                  <div className="mono text-[11px] mb-3 flex items-center justify-between" style={{ color: 'var(--c-text-muted)' }}>
                    <span>@{p.handle}</span>
                    {status?.daemon && (() => {
                      const sched = status.platformSchedules?.find((s) => s.platform === p.platform);
                      return sched ? (
                        <span className="mono text-[9px]" style={{ color: 'var(--c-teal-dim)' }}>
                          next {new Date(sched.nextRun).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                      ) : null;
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--c-text-muted)' }}>Actions</div>
                      <div className="mono text-lg font-medium" style={{ color: acts > 0 ? 'var(--c-text)' : 'var(--c-text-muted)' }}>{acts}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--c-text-muted)' }}>Comments</div>
                      <div className="mono text-lg font-medium" style={{ color: (q?.comments || 0) > 0 ? 'var(--c-text)' : 'var(--c-text-muted)' }}>{q?.comments || 0}</div>
                    </div>
                  </div>

                  {run?.duration_ms && (
                    <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--c-border-dim)' }}>
                      <span className="mono text-[10px]" style={{ color: 'var(--c-text-muted)' }}>
                        {(run.duration_ms / 1000).toFixed(0)}s
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pipeline + Recent runs in two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline */}
        {status?.pipelineEnabled && (
          <div className="panel noise animate-fade-up stagger-2">
            <div className="panel-header flex items-center justify-between">
              <span>// Content Pipeline</span>
              {status?.daemon && status?.nextPipelineRun && (
                <span className="mono text-[10px] normal-case tracking-normal" style={{ color: 'var(--c-text-muted)' }}>
                  next: {new Date(status.nextPipelineRun).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              )}
            </div>
            <div className="p-4">
              <div className="space-y-4">
                {PIPELINE_GROUPS.map((group, gi) => (
                  <div key={group.label}>
                    {/* Group header */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="mono text-[10px] w-4 text-center" style={{ color: 'var(--c-text-muted)' }}>{gi + 1}</span>
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--c-text-dim)' }}>{group.label}</span>
                      <span className="mono text-[9px] px-1.5 py-0.5 rounded" style={{
                        color: group.parallel ? 'var(--c-teal-dim)' : 'var(--c-text-muted)',
                        background: group.parallel ? 'var(--c-teal-glow)' : 'rgba(100,100,100,0.06)',
                      }}>
                        {group.parallel ? `${group.stages.length} run together` : group.stages.length > 1 ? 'one after another' : 'after previous'}
                      </span>
                    </div>
                    {/* Stages */}
                    <div className={group.parallel ? 'grid grid-cols-2 gap-1.5' : 'space-y-1.5'}>
                      {group.stages.map((stage) => {
                        const run = lastRun[stage.id] || lastRun['pipeline'];
                        return (
                          <div key={stage.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-md transition-colors hover:bg-white/[0.02]" style={{ background: 'rgba(255,255,255,0.01)' }}>
                            <div className="min-w-0">
                              <div className="text-[11px] font-medium truncate" style={{ color: 'var(--c-text-dim)' }}>{stage.name}</div>
                              <div className="mono text-[9px] truncate" style={{ color: 'var(--c-text-muted)' }}>{stage.desc}</div>
                            </div>
                            <div className="shrink-0 ml-2">
                              {run ? <StatusBadge status={run.status} /> : (
                                <span className="mono text-[9px]" style={{ color: 'var(--c-text-muted)' }}>
                                  {status?.daemon ? 'scheduled' : 'idle'}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Arrow between groups */}
                    {gi < PIPELINE_GROUPS.length - 1 && (
                      <div className="flex justify-center py-1.5">
                        <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
                          <path d="M6 0v12M2 9l4 4 4-4" stroke="var(--c-border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent runs */}
        <div className="panel noise animate-fade-up stagger-3">
          <div className="panel-header">// Recent Runs</div>
          <div className="p-0">
            {status?.recentRuns && status.recentRuns.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                    <th className="text-left px-4 py-2 mono text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Agent</th>
                    <th className="text-left px-4 py-2 mono text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Status</th>
                    <th className="text-left px-4 py-2 mono text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Time</th>
                    <th className="text-right px-4 py-2 mono text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Dur</th>
                  </tr>
                </thead>
                <tbody>
                  {status.recentRuns.slice(0, 12).map((run) => (
                    <tr key={run.id} className="transition-colors hover:bg-white/[0.015]" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                      <td className="px-4 py-2.5 mono text-xs" style={{ color: 'var(--c-text-dim)' }}>{run.agent_name}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={run.status} /></td>
                      <td className="px-4 py-2.5 mono text-[11px]" style={{ color: 'var(--c-text-muted)' }}>{run.started_at?.split('T')[1]?.slice(0, 5) || '-'}</td>
                      <td className="px-4 py-2.5 text-right mono text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
                        {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(0)}s` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center">
                <div className="mono text-xs" style={{ color: 'var(--c-text-muted)' }}>No runs today</div>
                <div className="mono text-[10px] mt-1" style={{ color: 'var(--c-border)' }}>Run: opentwins start</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quality overview */}
      {quality && quality.length > 0 && (
        <div className="animate-fade-up stagger-4">
          <div className="section-title mb-4">Signal Quality</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {quality.map((q) => {
              const styles = JSON.parse(q.styles || '{}');
              const styleCount = Object.keys(styles).length;
              const disagreeRate = q.comments > 0 ? Math.round((q.disagreements / q.comments) * 100) : 0;
              const color = PLATFORM_COLORS[q.platform] || '#888';

              return (
                <div key={q.platform} className="panel noise p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    <span className="text-xs font-semibold capitalize" style={{ color: 'var(--c-text-dim)' }}>{q.platform}</span>
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

function MiniStat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>{label}</div>
      <div className="mono text-sm font-medium" style={{ color: accent ? 'var(--c-teal)' : 'var(--c-text)' }}>{value}</div>
    </div>
  );
}

function QualityRow({ label, value, warn, dim }: { label: string; value: string | number; warn?: boolean; dim?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>{label}</span>
      <span className="mono text-xs font-medium" style={{
        color: warn ? 'var(--c-amber)' : dim ? 'var(--c-text-muted)' : 'var(--c-text-dim)',
      }}>{value}</span>
    </div>
  );
}
