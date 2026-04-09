import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi, today } from '../hooks/useApi.ts';

interface FeedEvent {
  ts: string;
  kind: 'thinking' | 'tool' | 'result' | 'error' | 'done';
  summary: string;
  detail?: string;
}

interface SessionSummary {
  sessionId: string;
  sessionFile: string;
  platform: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  eventCount: number;
  toolCount: number;
  errorCount: number;
  completed: boolean;
  status: 'running' | 'completed' | 'incomplete';
  events: FeedEvent[];
}

const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#FF4500', twitter: '#1DA1F2', linkedin: '#0A66C2', bluesky: '#0085FF',
  threads: '#888', medium: '#00AB6C', substack: '#FF6719', devto: '#3B49DF',
  ph: '#DA552F', ih: '#4F46E5',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
}

function formatTime(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return iso;
  }
}

export function ActivityLog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: statusData } = useApi<{ platforms: Array<{ platform: string }> }>('/api/status');
  const platforms = ['all', ...(statusData?.platforms.map((p) => p.platform) || [])];

  const initialDate = searchParams.get('date') || today();
  const initialPlatform = searchParams.get('platform') || 'all';
  const focusSession = searchParams.get('session');

  const [date, setDate] = useState(initialDate);
  const [platform, setPlatform] = useState(initialPlatform);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    focusSession ? new Set([focusSession]) : new Set()
  );
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Sync URL params when filters change (but don't keep the session param as it was one-shot)
  useEffect(() => {
    const params: Record<string, string> = {};
    if (date !== today()) params.date = date;
    if (platform !== 'all') params.platform = platform;
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, platform]);

  // Scroll the focused session into view after load
  useEffect(() => {
    if (!focusSession) return;
    const id = setTimeout(() => {
      const el = document.getElementById(`session-${focusSession}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
    return () => clearTimeout(id);
  }, [focusSession]);

  const url = platform === 'all'
    ? `/api/activity?date=${date}`
    : `/api/activity?date=${date}&platform=${platform}`;

  const { data, loading } = useApi<{ sessions: SessionSummary[] }>(url, [date, platform]);
  const sessions = data?.sessions || [];

  const toggleSession = (id: string) => {
    const next = new Set(expandedSessions);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedSessions(next);
  };

  const toggleEvent = (id: string) => {
    const next = new Set(expandedEvents);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedEvents(next);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>Activity Log</h1>
        <p className="mono text-sm mt-1" style={{ color: 'var(--c-text-muted)' }}>Agent sessions and their events</p>
      </div>

      {/* Filters */}
      <div className="animate-fade-up stagger-1 flex flex-wrap gap-2 items-center">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mono px-3 py-1.5 rounded-md text-sm outline-none transition-colors"
          style={{
            background: 'var(--c-panel)',
            border: '1px solid var(--c-border-dim)',
            color: 'var(--c-text-dim)',
          }}
        />

        <div className="flex gap-1 flex-wrap">
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className="mono px-2.5 py-1 rounded-md text-[13px] font-medium transition-all duration-200"
              style={{
                background: platform === p ? 'var(--c-teal-glow)' : 'transparent',
                color: platform === p ? 'var(--c-teal)' : 'var(--c-text-muted)',
                border: platform === p ? '1px solid rgba(45, 212, 191, 0.2)' : '1px solid transparent',
              }}
            >
              {p === 'all' ? 'All' : p}
            </button>
          ))}
        </div>

        <span className="mono text-[14px] px-2 py-1 rounded-full" style={{ color: 'var(--c-teal-dim)', background: 'var(--c-teal-glow)' }}>
          {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
        </span>
      </div>

      {/* Sessions */}
      {loading ? (
        <div className="p-12 text-center mono text-sm animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>
          Reading sessions...
        </div>
      ) : sessions.length === 0 ? (
        <div className="p-12 text-center panel noise">
          <div className="mono text-sm" style={{ color: 'var(--c-text-muted)' }}>No sessions found for this date</div>
        </div>
      ) : (
        <div className="space-y-3 animate-fade-up stagger-2">
          {sessions.map((s) => {
            const isExpanded = expandedSessions.has(s.sessionId);
            const color = PLATFORM_COLORS[s.platform] || '#888';

            return (
              <div
                key={s.sessionId}
                id={`session-${s.sessionId}`}
                className="panel noise"
                style={focusSession === s.sessionId ? { boxShadow: '0 0 0 1px var(--c-teal-dim), 0 0 24px rgba(45,212,191,0.12)' } : undefined}
              >
                {/* Session header — clickable */}
                <div
                  className="p-4 cursor-pointer transition-colors hover:bg-white/[0.02] flex items-center justify-between gap-4"
                  onClick={() => toggleSession(s.sessionId)}
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: color, boxShadow: `0 0 8px ${color}40` }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-semibold capitalize text-[15px]" style={{ color: 'var(--c-text)' }}>
                          {s.platform}
                        </span>
                        <span className="mono text-[13px]" style={{ color: 'var(--c-text-dim)' }}>
                          {formatTime(s.startedAt)} → {formatTime(s.endedAt)}
                        </span>
                        <span className="mono text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
                          {formatDuration(s.durationMs)}
                        </span>
                        <span className="mono text-[13px] px-2 py-0.5 rounded-full" style={{
                          color:
                            s.status === 'running' ? 'var(--c-blue)' :
                            s.status === 'completed' ? 'var(--c-green)' :
                            'var(--c-amber)',
                          background:
                            s.status === 'running' ? 'rgba(96,165,250,0.12)' :
                            s.status === 'completed' ? 'rgba(52,211,153,0.1)' :
                            'rgba(251,191,36,0.1)',
                        }}>
                          {s.status}
                        </span>
                      </div>
                      <div className="mono text-[13px] mt-1" style={{ color: 'var(--c-text-muted)' }}>
                        {s.sessionId.slice(0, 8)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="mono text-[13px]" style={{ color: 'var(--c-text-muted)' }}>events</div>
                      <div className="mono text-[15px] font-medium" style={{ color: 'var(--c-text)' }}>{s.eventCount}</div>
                    </div>
                    <div className="text-right">
                      <div className="mono text-[13px]" style={{ color: 'var(--c-text-muted)' }}>tools</div>
                      <div className="mono text-[15px] font-medium" style={{ color: 'var(--c-text)' }}>{s.toolCount}</div>
                    </div>
                    {s.errorCount > 0 && (
                      <div className="text-right">
                        <div className="mono text-[13px]" style={{ color: 'var(--c-text-muted)' }}>errors</div>
                        <div className="mono text-[15px] font-medium" style={{ color: 'var(--c-red)' }}>{s.errorCount}</div>
                      </div>
                    )}
                    <span className="mono text-[15px]" style={{ color: 'var(--c-teal-dim)' }}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </div>
                </div>

                {/* Events feed */}
                {isExpanded && (
                  <div className="border-t p-4 max-h-[600px] overflow-y-auto space-y-1.5" style={{ borderColor: 'var(--c-border-dim)' }}>
                    {s.events.length === 0 ? (
                      <div className="mono text-sm text-center py-4" style={{ color: 'var(--c-text-muted)' }}>
                        No events
                      </div>
                    ) : (
                      s.events.map((ev, i) => {
                        const evId = `${s.sessionId}:${i}`;
                        const isEvExpanded = expandedEvents.has(evId);
                        const evColor =
                          ev.kind === 'error' ? 'var(--c-red)' :
                          ev.kind === 'done' ? 'var(--c-green)' :
                          ev.kind === 'thinking' ? 'var(--c-blue)' :
                          ev.kind === 'tool' ? 'var(--c-text)' :
                          'var(--c-text-muted)';

                        return (
                          <div
                            key={i}
                            className="flex items-start gap-3 py-1.5 px-2 rounded transition-colors hover:bg-white/[0.02] cursor-pointer"
                            onClick={() => toggleEvent(evId)}
                          >
                            <span className="mono text-[13px] shrink-0 w-[70px]" style={{ color: 'var(--c-teal-dim)' }}>
                              {formatTime(ev.ts)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm break-words" style={{ color: evColor }}>{ev.summary}</div>
                              {ev.detail && isEvExpanded && (
                                <pre className="mono text-[13px] mt-1 p-2 rounded whitespace-pre-wrap break-words" style={{
                                  color: 'var(--c-text-muted)',
                                  background: 'rgba(255,255,255,0.02)',
                                  border: '1px solid var(--c-border-dim)',
                                }}>{ev.detail}</pre>
                              )}
                              {ev.detail && !isEvExpanded && (
                                <div className="mono text-[12px] truncate" style={{ color: 'var(--c-text-muted)' }}>{ev.detail}</div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
