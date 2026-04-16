import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi, today } from '../hooks/useApi.ts';
import { DatePicker } from '../components/DatePicker.tsx';

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

type EventKindFilter = 'all' | 'thinking' | 'tool' | 'error';

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

// Stable key for an error event within a session, used by the per-error
// "acknowledge" feature. Includes sessionId so the same error in a different
// session is still visible after acknowledgment.
function quickHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function errorKey(sessionId: string, ev: FeedEvent): string {
  return `${sessionId}::${ev.ts}::${quickHash(ev.summary + (ev.detail || ''))}`;
}

function statusMeta(status: SessionSummary['status']) {
  switch (status) {
    case 'running':
      return { color: 'var(--c-blue)',  bg: 'rgba(96,165,250,0.15)', border: 'rgba(96,165,250,0.35)', label: 'Running' };
    case 'completed':
      return { color: 'var(--c-green)', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)',  label: 'Completed' };
    default:
      return { color: 'var(--c-amber)', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)',  label: 'Incomplete' };
  }
}

function eventKindColor(kind: FeedEvent['kind']) {
  switch (kind) {
    case 'error':    return 'var(--c-red)';
    case 'done':     return 'var(--c-green)';
    case 'thinking': return 'var(--c-blue)';
    case 'tool':     return 'var(--c-text)';
    default:         return 'var(--c-text-muted)';
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
  const [kindFilter, setKindFilter] = useState<EventKindFilter>('all');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [ackedErrors, setAckedErrors] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('opentwins.acked-errors');
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* corrupted, ignore */ }
    return new Set();
  });

  // Persist ackedErrors whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem('opentwins.acked-errors', JSON.stringify(Array.from(ackedErrors)));
    } catch { /* quota / private mode, ignore */ }
  }, [ackedErrors]);

  const ackError = (key: string) => {
    setAckedErrors((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    focusSession ? new Set([focusSession]) : new Set()
  );
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Sync URL params when filters change
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
  const allSessions = data?.sessions || [];

  // Effective error count per session = raw errors minus the ones the user
  // acknowledged. Used everywhere: Errors KPI card, Errors metric on each
  // session card, and the errors-only filter. Acked errors stay rendered
  // (dimmed) inside the expanded view so context isn't lost.
  const effectiveErrorCount = (s: SessionSummary): number => {
    if (s.errorCount === 0) return 0;
    let acked = 0;
    for (const ev of s.events) {
      if (ev.kind === 'error' && ackedErrors.has(errorKey(s.sessionId, ev))) acked++;
    }
    return Math.max(0, s.errorCount - acked);
  };
  const sessions = errorsOnly ? allSessions.filter((s) => effectiveErrorCount(s) > 0) : allSessions;

  // Summary stats across the unfiltered set so the cards remain a stable
  // overview of the date+platform selection (clicking the Errors card to
  // narrow the list shouldn't make the cards' own numbers change).
  // Acknowledged errors are subtracted — that's the whole point of acking.
  const stats = useMemo(() => {
    let events = 0, tools = 0, errors = 0, running = 0, completed = 0, incomplete = 0, erroredSessions = 0;
    for (const s of allSessions) {
      events += s.eventCount;
      tools += s.toolCount;
      const eff = effectiveErrorCount(s);
      errors += eff;
      if (eff > 0) erroredSessions++;
      if (s.status === 'running') running++;
      else if (s.status === 'completed') completed++;
      else incomplete++;
    }
    return { events, tools, errors, running, completed, incomplete, erroredSessions };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSessions, ackedErrors]);

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

  const expandAll = () => {
    setExpandedSessions(new Set(sessions.map((s) => s.sessionId)));
  };
  const collapseAll = () => {
    setExpandedSessions(new Set());
    setExpandedEvents(new Set());
  };

  const isToday = date === today();

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="animate-fade-up">
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>Activity Log</h1>
        <p className="mono text-sm mt-1.5" style={{ color: 'var(--c-text-muted)' }}>
          Agent sessions and events
        </p>
      </div>

      {/* ── KPI summary row ────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up stagger-1">
        <StatCard label="Sessions" value={sessions.length} sub={isToday ? 'today' : date} />
        <StatCard label="Events" value={stats.events} sub={`${stats.tools} tool calls`} accent="teal" />
        <StatCard
          label="Status"
          value={stats.running > 0 ? `${stats.running} live` : stats.completed}
          sub={stats.running > 0 ? 'running now' : `${stats.completed} completed`}
          accent={stats.running > 0 ? 'blue' : 'green'}
        />
        <StatCard
          label="Errors"
          value={stats.errors}
          sub={stats.errors > 0 ? `${stats.erroredSessions} session${stats.erroredSessions === 1 ? '' : 's'} affected — click to filter` : 'clean'}
          accent={stats.errors > 0 ? 'red' : undefined}
          onClick={stats.erroredSessions > 0 ? () => setErrorsOnly((v) => !v) : undefined}
          active={errorsOnly}
        />
      </div>

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className="animate-fade-up stagger-2 flex flex-wrap items-center gap-3">
        {/* Date picker */}
        <div className="flex items-center gap-2">
          <span className="mono text-[12px] uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Date</span>
          <DatePicker value={date} onChange={setDate} />
          {!isToday && (
            <button
              onClick={() => setDate(today())}
              className="mono text-[12px] px-2 py-1 rounded transition-colors hover:bg-white/5"
              style={{ color: 'var(--c-teal-dim)' }}
            >
              today
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="h-6 w-px" style={{ background: 'var(--c-border-dim)' }} />

        {/* Platform filter */}
        <div className="flex items-center gap-2">
          <span className="mono text-[12px] uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Platform</span>
          <div className="flex gap-1 flex-wrap">
            {platforms.map((p) => {
              const isActive = platform === p;
              const platformColor = PLATFORM_COLORS[p] || '#888';
              return (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 capitalize"
                  style={{
                    background: isActive ? 'var(--c-panel)' : 'transparent',
                    color: isActive ? 'var(--c-text)' : 'var(--c-text-dim)',
                    border: `1px solid ${isActive ? 'var(--c-teal-dim)' : 'var(--c-border-dim)'}`,
                  }}
                >
                  {p !== 'all' && (
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: platformColor }} />
                  )}
                  {p === 'all' ? 'All' : p}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1" />

        {/* Expand/collapse */}
        {sessions.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={expandAll}
              className="mono text-[12px] px-2.5 py-1 rounded transition-colors hover:bg-white/5"
              style={{ color: 'var(--c-text-muted)' }}
            >
              expand all
            </button>
            <span style={{ color: 'var(--c-border)' }}>·</span>
            <button
              onClick={collapseAll}
              className="mono text-[12px] px-2.5 py-1 rounded transition-colors hover:bg-white/5"
              style={{ color: 'var(--c-text-muted)' }}
            >
              collapse all
            </button>
          </div>
        )}
      </div>

      {/* ── Sessions ───────────────────────────────────────────── */}
      {loading ? (
        <div className="p-16 text-center mono text-sm animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>
          Reading sessions...
        </div>
      ) : sessions.length === 0 ? (
        <div className="panel noise py-16 text-center">
          <div className="text-base" style={{ color: 'var(--c-text-dim)' }}>
            {errorsOnly ? 'No errored sessions for this date / platform' : 'No sessions found'}
          </div>
          <div className="mono text-[13px] mt-2" style={{ color: 'var(--c-text-muted)' }}>
            {errorsOnly ? (
              <button
                onClick={() => setErrorsOnly(false)}
                className="underline hover:text-white transition-colors"
                style={{ color: 'var(--c-teal-dim)' }}
              >
                Clear errors filter
              </button>
            ) : isToday
              ? 'Trigger a run from the Agents tab to see activity here'
              : `Try selecting a different date or platform`}
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-up stagger-3">
          {sessions.map((s) => {
            const isExpanded = expandedSessions.has(s.sessionId);
            const isFocused = focusSession === s.sessionId;
            const color = PLATFORM_COLORS[s.platform] || '#888';
            const st = statusMeta(s.status);

            // Filter events by kind only. Acknowledged errors stay rendered
            // (dimmed, with an "acked" badge instead of an action button) so
            // context isn't lost — they just stop counting toward the Errors
            // KPI/metric. Per-error ack state lives in localStorage keyed on
            // sessionId+ts+content-hash so identical errors in future
            // sessions are still flagged by default.
            const filteredEvents = kindFilter === 'all'
              ? s.events
              : s.events.filter((e) => e.kind === kindFilter);

            return (
              <div
                key={s.sessionId}
                id={`session-${s.sessionId}`}
                className="panel noise overflow-hidden transition-all duration-200"
                style={{
                  borderColor: isFocused ? 'var(--c-teal-dim)' : undefined,
                  boxShadow: isFocused ? '0 0 0 1px var(--c-teal-dim), 0 0 32px rgba(45,212,191,0.12)'
                           : s.status === 'running' ? '0 0 0 1px rgba(96,165,250,0.25)' : undefined,
                }}
              >
                {/* Session header — clickable */}
                <div
                  className="relative cursor-pointer transition-colors hover:bg-white/[0.02]"
                  onClick={() => toggleSession(s.sessionId)}
                >
                  {/* Left accent bar (status color) */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ background: s.status === 'running' ? 'var(--c-blue)' : s.status === 'completed' ? 'var(--c-green)' : 'var(--c-amber)' }}
                  />

                  <div className={`${isExpanded ? 'p-5 pl-6' : 'px-5 pl-6 py-3'} flex items-center justify-between gap-6 flex-wrap`}>
                    {/* Identity */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          background: color,
                          boxShadow: s.status === 'running' ? `0 0 12px ${color}` : `0 0 8px ${color}40`,
                        }}
                      />
                      <span className="text-sm font-semibold capitalize" style={{ color: 'var(--c-text)' }}>
                        {s.platform}
                      </span>
                      <span
                        className="mono text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full"
                        style={{ color: st.color, background: st.bg, border: `1px solid ${st.border}` }}
                      >
                        {s.status === 'running' && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse" style={{ background: st.color }} />}
                        {st.label}
                      </span>
                      <div className="mono text-[12px] flex items-center gap-2" style={{ color: 'var(--c-text-muted)' }}>
                        <span>{formatTime(s.startedAt)} → {formatTime(s.endedAt)}</span>
                        <span style={{ color: 'var(--c-border)' }}>·</span>
                        <span>{formatDuration(s.durationMs)}</span>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-5 shrink-0">
                      <Metric label="Events" value={s.eventCount} />
                      <Metric label="Tools"  value={s.toolCount} />
                      {(() => {
                        const eff = effectiveErrorCount(s);
                        return eff > 0 ? <Metric label="Errors" value={eff} color="var(--c-red)" /> : null;
                      })()}
                      <span className="text-sm transition-transform duration-200" style={{
                        color: 'var(--c-teal-dim)',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      }}>
                        ▶
                      </span>
                    </div>
                  </div>
                </div>

                {/* Events feed (expanded) */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--c-border-dim)' }}>
                    {/* Event kind filter chips */}
                    <div className="flex items-center gap-2 px-5 py-3 flex-wrap" style={{ background: 'rgba(255,255,255,0.015)' }}>
                      <span className="mono text-[12px] uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Filter</span>
                      {(['all', 'thinking', 'tool', 'error'] as EventKindFilter[]).map((k) => {
                        const isActive = kindFilter === k;
                        const count = k === 'all' ? s.events.length : s.events.filter((e) => e.kind === k).length;
                        return (
                          <button
                            key={k}
                            onClick={(e) => { e.stopPropagation(); setKindFilter(k); }}
                            className="mono text-[12px] px-2.5 py-1 rounded-full font-medium transition-all"
                            style={{
                              background: isActive ? 'var(--c-teal-glow)' : 'transparent',
                              color: isActive ? 'var(--c-teal)' : 'var(--c-text-muted)',
                              border: `1px solid ${isActive ? 'rgba(45,212,191,0.3)' : 'var(--c-border-dim)'}`,
                            }}
                          >
                            {k} {count > 0 && <span className="opacity-60">· {count}</span>}
                          </button>
                        );
                      })}
                    </div>

                    {/* Events list */}
                    <div className="p-4 max-h-[600px] overflow-y-auto">
                      {filteredEvents.length === 0 ? (
                        <div className="py-8 text-center">
                          <div className="text-sm" style={{ color: 'var(--c-text-dim)' }}>
                            {s.events.length === 0 ? 'No events in this session' : `No ${kindFilter} events`}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {filteredEvents.map((ev, i) => {
                            const evId = `${s.sessionId}:${i}`;
                            const isEvExpanded = expandedEvents.has(evId);
                            const isAcked = ev.kind === 'error' && ackedErrors.has(errorKey(s.sessionId, ev));
                            const evColor = isAcked ? 'var(--c-text-muted)' : eventKindColor(ev.kind);

                            return (
                              <div
                                key={i}
                                className="flex items-start gap-3 py-2 px-3 rounded-lg transition-colors hover:bg-white/[0.02] cursor-pointer"
                                style={{ opacity: isAcked ? 0.55 : 1 }}
                                onClick={(e) => { e.stopPropagation(); toggleEvent(evId); }}
                              >
                                {/* Timestamp */}
                                <span className="mono text-[12px] shrink-0 w-[68px] pt-0.5" style={{ color: 'var(--c-text-muted)' }}>
                                  {formatTime(ev.ts)}
                                </span>

                                {/* Kind dot */}
                                <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-2" style={{ background: evColor, boxShadow: isAcked ? 'none' : `0 0 6px ${evColor}60` }} />

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm break-words leading-relaxed" style={{ color: evColor, textDecoration: isAcked ? 'line-through' : undefined }}>
                                    {ev.summary}
                                  </div>
                                  {ev.detail && isEvExpanded && (
                                    <pre className="mono text-[12px] mt-2 p-3 rounded-md whitespace-pre-wrap break-words" style={{
                                      color: 'var(--c-text-dim)',
                                      background: 'var(--c-void)',
                                      border: '1px solid var(--c-border-dim)',
                                    }}>{ev.detail}</pre>
                                  )}
                                  {ev.detail && !isEvExpanded && (
                                    <div className="mono text-[12px] truncate mt-0.5" style={{ color: 'var(--c-text-muted)' }}>
                                      {ev.detail}
                                    </div>
                                  )}
                                </div>

                                {/* Per-error acknowledge action. Click marks
                                    the error as acked (visible but dimmed
                                    + struck-through, dropped from counts).
                                    Click the "acked" badge again to undo. */}
                                {ev.kind === 'error' && (() => {
                                  const k = errorKey(s.sessionId, ev);
                                  return isAcked ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAckedErrors((prev) => {
                                          const next = new Set(prev);
                                          next.delete(k);
                                          return next;
                                        });
                                      }}
                                      title="Undo acknowledge — re-include this error in counts"
                                      className="mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 mt-1 transition-colors"
                                      style={{
                                        color: 'var(--c-teal)',
                                        background: 'rgba(45,212,191,0.08)',
                                        border: '1px solid var(--c-teal-dim)',
                                      }}
                                    >
                                      ✓ acked
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); ackError(k); }}
                                      title="Acknowledge — drop from error counts (still visible, dimmed)"
                                      className="mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 mt-1 transition-colors"
                                      style={{
                                        color: 'var(--c-text-muted)',
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid var(--c-border-dim)',
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--c-teal)'; e.currentTarget.style.borderColor = 'var(--c-teal-dim)'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--c-text-muted)'; e.currentTarget.style.borderColor = 'var(--c-border-dim)'; }}
                                    >
                                      ack
                                    </button>
                                  );
                                })()}

                                {/* Kind label (tiny) */}
                                <span className="mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 mt-1" style={{
                                  color: 'var(--c-text-muted)',
                                  background: 'rgba(255,255,255,0.03)',
                                }}>
                                  {ev.kind}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
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

// ── Helpers ─────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, onClick, active }: { label: string; value: string | number; sub?: string; accent?: 'teal' | 'green' | 'blue' | 'red'; onClick?: () => void; active?: boolean }) {
  const color = accent === 'teal'  ? 'var(--c-teal)'
              : accent === 'green' ? 'var(--c-green)'
              : accent === 'blue'  ? 'var(--c-blue)'
              : accent === 'red'   ? 'var(--c-red)'
              : 'var(--c-text)';
  const clickable = !!onClick;
  return (
    <div
      className={`panel noise p-5 ${clickable ? 'cursor-pointer transition-all hover:brightness-110' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={active ? { borderColor: color, boxShadow: `0 0 0 1px ${color}, 0 0 12px -4px ${color}` } : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] uppercase tracking-[0.12em] font-medium" style={{ color: 'var(--c-text-muted)' }}>{label}</div>
        {active && <span className="mono text-[10px] uppercase tracking-wider" style={{ color }}>● filter</span>}
      </div>
      <div className="text-3xl font-semibold tabular-nums leading-none" style={{ color }}>{value}</div>
      {sub && <div className="mono text-[12px] mt-2" style={{ color: 'var(--c-text-muted)' }}>{sub}</div>}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-right">
      <div className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--c-text-muted)' }}>{label}</div>
      <div className="text-lg font-semibold tabular-nums leading-none" style={{ color: color || 'var(--c-text)' }}>{value}</div>
    </div>
  );
}
