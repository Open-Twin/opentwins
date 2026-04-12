import { useState, useEffect, useCallback } from 'react';

interface LogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  mod: string;
  msg: string;
  data?: Record<string, unknown>;
}

const LEVEL_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  info:  { color: 'var(--c-text-dim)',  bg: 'transparent',              label: 'INFO' },
  warn:  { color: 'var(--c-amber)',     bg: 'rgba(251,191,36,0.08)',    label: 'WARN' },
  error: { color: 'var(--c-red)',       bg: 'rgba(248,113,113,0.08)',   label: 'ERR' },
};

const MOD_COLORS: Record<string, string> = {
  browser: '#60a5fa',
  chrome:  '#2dd4bf',
  agent:   '#a78bfa',
  daemon:  '#34d399',
  server:  '#fbbf24',
  config:  '#f472b6',
  setup:   '#fb923c',
  cdp:     '#38bdf8',
};

function today(): string {
  return new Date().toISOString().split('T')[0];
}

export function Logs() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(today());
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [modFilter, setModFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('date', date);
      params.set('limit', '500');
      if (levelFilter) params.set('level', levelFilter);
      if (modFilter) params.set('mod', modFilter);
      const res = await fetch(`/api/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [date, levelFilter, modFilter]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchLogs, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchLogs]);

  // Derive available modules from entries
  const modules = [...new Set(entries.map((e) => e.mod))].sort();

  // Apply search filter client-side
  const filtered = search
    ? entries.filter((e) =>
        e.msg.toLowerCase().includes(search.toLowerCase()) ||
        JSON.stringify(e.data || {}).toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  const levelCounts = { info: 0, warn: 0, error: 0 };
  entries.forEach((e) => { if (e.level in levelCounts) levelCounts[e.level as keyof typeof levelCounts]++; });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="animate-fade-up flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>Platform Logs</h1>
          <p className="mono text-sm mt-1" style={{ color: 'var(--c-text-muted)' }}>Structured logs from all platform components</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="mono text-[12px] px-3 py-1.5 rounded-lg transition-all"
            style={{
              color: autoRefresh ? 'var(--c-green)' : 'var(--c-text-muted)',
              background: autoRefresh ? 'rgba(52,211,153,0.1)' : 'transparent',
              border: `1px solid ${autoRefresh ? 'rgba(52,211,153,0.3)' : 'var(--c-border-dim)'}`,
            }}
          >
            {autoRefresh ? '● Live' : '○ Paused'}
          </button>
          <button
            onClick={fetchLogs}
            className="mono text-[12px] px-3 py-1.5 rounded-lg transition-all"
            style={{ color: 'var(--c-text-muted)', border: '1px solid var(--c-border-dim)' }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="panel noise animate-fade-up">
        <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
          {/* Date picker */}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mono text-[13px] bg-transparent outline-none px-2 py-1.5 rounded"
            style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)' }}
          />

          {/* Level filter chips */}
          <div className="flex items-center gap-1">
            {(['', 'info', 'warn', 'error'] as const).map((level) => {
              const active = levelFilter === level;
              const count = level ? levelCounts[level as keyof typeof levelCounts] : entries.length;
              return (
                <button
                  key={level || 'all'}
                  onClick={() => setLevelFilter(level)}
                  className="mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-md transition-all"
                  style={{
                    color: active ? (level === 'error' ? 'var(--c-red)' : level === 'warn' ? 'var(--c-amber)' : 'var(--c-text)') : 'var(--c-text-muted)',
                    background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                    border: `1px solid ${active ? 'var(--c-border)' : 'transparent'}`,
                  }}
                >
                  {level || 'All'} {count > 0 && <span style={{ opacity: 0.6 }}>({count})</span>}
                </button>
              );
            })}
          </div>

          {/* Module filter */}
          <select
            value={modFilter}
            onChange={(e) => setModFilter(e.target.value)}
            className="mono text-[12px] bg-transparent outline-none px-2 py-1.5 rounded"
            style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)' }}
          >
            <option value="">All modules</option>
            {modules.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="mono text-[13px] bg-transparent outline-none px-3 py-1.5 rounded flex-1 min-w-[150px]"
            style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)' }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
          />

          <span className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>
            {filtered.length} entries
          </span>
        </div>
      </div>

      {/* Log entries */}
      <div className="panel noise animate-fade-up">
        {loading ? (
          <div className="p-8 text-center mono text-sm animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>
            Loading logs...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-sm mb-1" style={{ color: 'var(--c-text-dim)' }}>No log entries</div>
            <div className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>
              {date === today() ? 'Logs will appear as platform components run' : 'No logs for this date'}
            </div>
          </div>
        ) : (
          <div>
            {filtered.map((entry, i) => {
              const style = LEVEL_STYLES[entry.level] || LEVEL_STYLES.info;
              const modColor = MOD_COLORS[entry.mod] || '#888';
              const time = new Date(entry.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
              const hasData = entry.data && Object.keys(entry.data).length > 0;
              const isExpanded = expanded.has(i);

              return (
                <div
                  key={`${entry.ts}-${i}`}
                  className="flex items-start gap-3 px-4 py-2 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  style={{ background: style.bg }}
                  onClick={() => {
                    if (!hasData) return;
                    const next = new Set(expanded);
                    if (isExpanded) next.delete(i); else next.add(i);
                    setExpanded(next);
                  }}
                >
                  {/* Time */}
                  <span className="mono text-[12px] tabular-nums shrink-0 pt-0.5 w-[72px]" style={{ color: 'var(--c-text-muted)' }}>
                    {time}
                  </span>

                  {/* Level badge */}
                  <span className="mono text-[10px] uppercase tracking-wider font-semibold shrink-0 pt-0.5 w-[32px]" style={{ color: style.color }}>
                    {style.label}
                  </span>

                  {/* Module badge */}
                  <span
                    className="mono text-[11px] shrink-0 px-1.5 py-0.5 rounded"
                    style={{ color: modColor, background: `${modColor}15`, border: `1px solid ${modColor}25` }}
                  >
                    {entry.mod}
                  </span>

                  {/* Message + data */}
                  <div className="flex-1 min-w-0">
                    <span className="mono text-[13px]" style={{ color: style.color === 'var(--c-text-dim)' ? 'var(--c-text)' : style.color }}>
                      {entry.msg}
                    </span>
                    {hasData && !isExpanded && (
                      <span className="mono text-[11px] ml-2" style={{ color: 'var(--c-text-muted)' }}>
                        {Object.entries(entry.data!).slice(0, 3).map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 40) : v}`).join(' ')}
                      </span>
                    )}
                    {isExpanded && hasData && (
                      <pre className="mono text-[12px] mt-1 p-2 rounded whitespace-pre-wrap" style={{ color: 'var(--c-text-dim)', background: 'rgba(0,0,0,0.2)' }}>
                        {JSON.stringify(entry.data, null, 2)}
                      </pre>
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
