import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi.ts';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface UsageTotals {
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUsd: number;
  errors: number;
}

interface DailyUsage extends UsageTotals {
  date: string;
  platform: string;
}

interface HourlyUsage extends UsageTotals {
  hour: string; // "YYYY-MM-DDTHH"
  platform: string;
}

interface UsageReport {
  days?: DailyUsage[];
  hours?: HourlyUsage[];
  totals: UsageTotals;
  byPlatform: Record<string, UsageTotals>;
  byModel: Record<string, UsageTotals>;
  range: { start: string; end: string; days?: number; hours?: number };
}

type Timeframe = '24h' | '7' | '14' | '30';

const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#FF4500', twitter: '#1DA1F2', linkedin: '#0A66C2', bluesky: '#0085FF',
  threads: '#888', medium: '#00AB6C', substack: '#FF6719', devto: '#3B49DF',
  ph: '#DA552F', ih: '#4F46E5',
};

const MODEL_COLORS: Record<string, string> = {
  sonnet:  '#2dd4bf',
  opus:    '#a78bfa',
  haiku:   '#60a5fa',
  unknown: '#64748b',
};

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--c-surface)',
    border: '1px solid var(--c-border)',
    borderRadius: 8,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
    color: 'var(--c-text-dim)',
    padding: '8px 12px',
  },
  labelStyle: { color: 'var(--c-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

export function Usage() {
  const [timeframe, setTimeframe] = useState<Timeframe>('7');
  const [platform, setPlatform] = useState<string>('all');
  const isHourly = timeframe === '24h';

  const { data: statusData } = useApi<{ platforms: Array<{ platform: string }> }>('/api/status');
  const platforms = ['all', ...(statusData?.platforms.map((p) => p.platform) || [])];

  const qs = isHourly ? 'hours=24' : `days=${timeframe}`;
  const url = platform === 'all'
    ? `/api/usage?${qs}`
    : `/api/usage?${qs}&platform=${platform}`;

  const { data, loading } = useApi<UsageReport>(url, [timeframe, platform]);

  // Derive chart data — fill in missing buckets so the chart shows a continuous range
  const chartData = useMemo(() => {
    if (!data) return [];

    type Bucket = {
      key: string;
      label: string;
      input: number;
      output: number;
      cacheWrite: number;
      cacheRead: number;
      cost: number;
      errors: number;
    };

    const byKey: Record<string, Bucket> = {};

    if (isHourly && data.hours) {
      // Build 24 hourly buckets using LOCAL time
      const end = new Date();
      end.setMinutes(0, 0, 0);
      const pad = (n: number) => String(n).padStart(2, '0');
      for (let i = 23; i >= 0; i--) {
        const d = new Date(end.getTime() - i * 3600000);
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`;
        byKey[key] = { key, label: `${pad(d.getHours())}:00`, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0, errors: 0 };
      }

      for (const h of data.hours) {
        // API keys are UTC — convert to local hour key to match our buckets
        const utc = new Date(h.hour + ':00:00Z');
        const key = `${utc.getFullYear()}-${pad(utc.getMonth() + 1)}-${pad(utc.getDate())}T${pad(utc.getHours())}`;
        const entry = byKey[key];
        if (!entry) continue;
        entry.input += h.inputTokens;
        entry.output += h.outputTokens;
        entry.cacheWrite += h.cacheCreateTokens;
        entry.cacheRead += h.cacheReadTokens;
        entry.cost += h.costUsd;
        entry.errors += h.errors;
      }
    } else if (data.days && data.range.start && data.range.end) {
      const startD = new Date(data.range.start);
      const endD = new Date(data.range.end);
      for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split('T')[0];
        byKey[key] = { key, label: key.slice(5), input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0, errors: 0 };
      }
      for (const d of data.days) {
        const entry = byKey[d.date];
        if (!entry) continue;
        entry.input += d.inputTokens;
        entry.output += d.outputTokens;
        entry.cacheWrite += d.cacheCreateTokens;
        entry.cacheRead += d.cacheReadTokens;
        entry.cost += d.costUsd;
        entry.errors += d.errors;
      }
    }

    return Object.values(byKey).sort((a, b) => a.key.localeCompare(b.key));
  }, [data, isHourly]);

  // Per-platform table rows
  const platformRows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.byPlatform)
      .map(([p, totals]) => ({ platform: p, ...totals }))
      .sort((a, b) => b.costUsd - a.costUsd);
  }, [data]);

  const totals = data?.totals;
  const hasErrors = (totals?.errors ?? 0) > 0;
  const numDays = data?.range.days ?? 0;
  const numHours = data?.range.hours ?? 0;
  const spanDays = isHourly ? numHours / 24 : numDays;
  const dailyAvgCost = totals && spanDays > 0 ? totals.costUsd / spanDays : 0;
  const projectedMonth = dailyAvgCost * 30;
  const spanLabel = isHourly ? `${numHours}h` : `${numDays}d`;

  // Cache hit rate: how much of the input context came from cache
  // (cache_read) / (input + cache_read + cache_write) — higher is better
  const cacheDenominator = totals
    ? totals.inputTokens + totals.cacheReadTokens + totals.cacheCreateTokens
    : 0;
  const cacheHitRate = cacheDenominator > 0 && totals
    ? Math.round((totals.cacheReadTokens / cacheDenominator) * 100)
    : 0;

  // Average cost per session — more meaningful than "tokens per session"
  const avgCostPerSession = totals && totals.sessions > 0
    ? totals.costUsd / totals.sessions
    : 0;

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="animate-fade-up">
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>Usage & Costs</h1>
        <p className="mono text-sm mt-1.5" style={{ color: 'var(--c-text-muted)' }}>
          Token consumption, estimated spend, and error trends · computed from Claude session files
        </p>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className="animate-fade-up stagger-1 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="mono text-[12px] uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Platform</span>
          <div className="flex gap-1 flex-wrap">
            {platforms.map((p) => {
              const isActive = platform === p;
              const color = PLATFORM_COLORS[p] || '#888';
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
                  {p !== 'all' && <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
                  {p === 'all' ? 'All' : p}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-6 w-px" style={{ background: 'var(--c-border-dim)' }} />

        <div className="flex items-center gap-2">
          <span className="mono text-[12px] uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Timeframe</span>
          <div className="flex gap-1">
            {(['24h', '7', '14', '30'] as const).map((tf) => {
              const isActive = timeframe === tf;
              const label = tf === '24h' ? '24 hours' : `${tf} days`;
              return (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200"
                  style={{
                    background: isActive ? 'var(--c-panel)' : 'transparent',
                    color: isActive ? 'var(--c-text)' : 'var(--c-text-dim)',
                    border: `1px solid ${isActive ? 'var(--c-teal-dim)' : 'var(--c-border-dim)'}`,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── KPI row ────────────────────────────────────────────── */}
      {loading ? (
        <div className="panel noise py-16 text-center mono text-sm animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>
          Crunching usage…
        </div>
      ) : !totals ? (
        <div className="panel noise py-16 text-center">
          <div className="text-base" style={{ color: 'var(--c-text-dim)' }}>No usage data yet</div>
          <div className="mono text-[13px] mt-2" style={{ color: 'var(--c-text-muted)' }}>
            Trigger an agent run to start tracking tokens
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up stagger-2">
            <KpiCard
              label="Estimated Cost"
              value={formatCost(totals.costUsd)}
              sub={`${spanLabel} · avg ${formatCost(isHourly ? totals.costUsd / Math.max(1, numHours) : dailyAvgCost)}/${isHourly ? 'hr' : 'day'}`}
              accent="teal"
            />
            <KpiCard
              label="Output Tokens"
              value={formatTokens(totals.outputTokens)}
              sub={`${totals.sessions} session${totals.sessions !== 1 ? 's' : ''} · avg ${formatCost(avgCostPerSession)}/run`}
            />
            <KpiCard
              label="Cache Hit Rate"
              value={`${cacheHitRate}%`}
              sub={`${formatTokens(totals.cacheReadTokens)} cached reads`}
              accent={cacheHitRate >= 80 ? 'green' : cacheHitRate >= 50 ? 'teal' : 'amber'}
            />
            <KpiCard
              label="Errors"
              value={totals.errors}
              sub={hasErrors ? `across ${totals.sessions} session${totals.sessions > 1 ? 's' : ''}` : 'clean'}
              accent={hasErrors ? 'red' : 'green'}
            />
          </div>

          {/* Projection banner */}
          {dailyAvgCost > 0 && (
            <div
              className="flex items-start gap-3 px-4 py-3 rounded-lg animate-fade-up stagger-3"
              style={{ background: 'rgba(45,212,191,0.04)', border: '1px solid var(--c-border-dim)' }}
            >
              <div className="text-lg leading-none mt-0.5">📈</div>
              <div className="flex-1">
                <div className="text-sm" style={{ color: 'var(--c-text-dim)' }}>
                  API-equivalent monthly spend at current rate:{' '}
                  <span className="font-semibold" style={{ color: 'var(--c-teal)' }}>{formatCost(projectedMonth)}</span>
                </div>
                <div className="mono text-[11px] mt-1" style={{ color: 'var(--c-text-muted)' }}>
                  Based on {isHourly ? '24-hour' : `${numDays}-day`} average · If you're on Claude Code subscription, actual billing is the flat fee
                </div>
              </div>
            </div>
          )}

          {/* ── Charts ────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-up stagger-4">
            {/* Cost over time */}
            <ChartPanel title={isHourly ? 'Hourly Cost' : 'Daily Cost'} subtitle={isHourly ? `USD per hour · last 24h` : `USD per day · ${numDays} days`}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} barSize={18} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v.toFixed(2)}`}
                  />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
                  />
                  <Bar dataKey="cost" fill="#2dd4bf" radius={[4, 4, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            {/* Output tokens over time — what Claude actually generated */}
            <ChartPanel title={isHourly ? 'Hourly Output' : 'Daily Output'} subtitle={isHourly ? 'Tokens per hour' : 'Tokens Claude generated per day'}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} barSize={18} margin={{ top: 10, right: 10, left: -5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatTokens(v)}
                  />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                    formatter={(value: number) => [formatTokens(value), 'Output']}
                  />
                  <Bar dataKey="output" fill="#60a5fa" radius={[4, 4, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            {/* Errors over time */}
            <ChartPanel
              title="Errors"
              subtitle={isHourly ? 'Tool failures per hour' : 'Tool failures per day'}
              isEmpty={chartData.every((d) => d.errors === 0)}
              emptyHint="No errors recorded in this range"
            >
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Line
                    type="monotone"
                    dataKey="errors"
                    stroke="#f87171"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#f87171', stroke: 'none' }}
                    activeDot={{ r: 5, stroke: '#f87171', strokeWidth: 2, fill: '#111827' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>

            {/* Cost breakdown by category */}
            <ChartPanel
              title="Cost Breakdown"
              subtitle="Where the dollars go"
              isEmpty={totals.costUsd === 0}
              emptyHint="No cost recorded yet"
            >
              <CostBreakdown totals={totals} models={data!.byModel} />
            </ChartPanel>
          </div>

          {/* ── Per-platform breakdown table ──────────────── */}
          {platformRows.length > 0 && (
            <div className="panel noise animate-fade-up stagger-5">
              <div className="panel-header flex items-center justify-between">
                <span>// Per Platform</span>
                <span className="mono text-[13px] normal-case tracking-normal" style={{ color: 'var(--c-text-muted)' }}>
                  sorted by cost
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                      <th className="text-left px-5 py-3 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Platform</th>
                      <th className="text-right px-5 py-3 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Sessions</th>
                      <th className="text-right px-5 py-3 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Input</th>
                      <th className="text-right px-5 py-3 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Output</th>
                      <th className="text-right px-5 py-3 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Cached</th>
                      <th className="text-right px-5 py-3 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Errors</th>
                      <th className="text-right px-5 py-3 mono text-[12px] font-medium uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformRows.map((row) => {
                      const shareOfTotal = totals.costUsd > 0 ? (row.costUsd / totals.costUsd) * 100 : 0;
                      return (
                        <tr
                          key={row.platform}
                          className="transition-colors hover:bg-white/[0.015]"
                          style={{ borderBottom: '1px solid var(--c-border-dim)' }}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full" style={{ background: PLATFORM_COLORS[row.platform] || '#888' }} />
                              <span className="capitalize text-sm font-medium" style={{ color: 'var(--c-text)' }}>{row.platform}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right mono text-sm tabular-nums" style={{ color: 'var(--c-text-dim)' }}>{row.sessions}</td>
                          <td className="px-5 py-3.5 text-right mono text-sm tabular-nums" style={{ color: 'var(--c-text-muted)' }}>{formatTokens(row.inputTokens)}</td>
                          <td className="px-5 py-3.5 text-right mono text-sm tabular-nums" style={{ color: 'var(--c-text-dim)' }}>{formatTokens(row.outputTokens)}</td>
                          <td className="px-5 py-3.5 text-right mono text-sm tabular-nums" style={{ color: 'var(--c-text-muted)' }}>
                            {formatTokens(row.cacheCreateTokens + row.cacheReadTokens)}
                          </td>
                          <td className="px-5 py-3.5 text-right mono text-sm tabular-nums" style={{
                            color: row.errors > 0 ? 'var(--c-red)' : 'var(--c-text-muted)',
                          }}>{row.errors}</td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="mono text-sm font-semibold tabular-nums" style={{ color: 'var(--c-teal)' }}>
                              {formatCost(row.costUsd)}
                            </div>
                            <div className="mono text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
                              {shareOfTotal.toFixed(0)}% of total
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Pricing note ─────────────────────────────── */}
          <div className="mono text-[12px] px-4 py-3 rounded-lg animate-fade-up stagger-5" style={{
            background: 'rgba(255,255,255,0.015)',
            border: '1px solid var(--c-border-dim)',
            color: 'var(--c-text-muted)',
          }}>
            <span style={{ color: 'var(--c-text-dim)' }}>💡 Pricing note:</span> costs are computed from published Anthropic API rates
            (Sonnet $3/$15 per M input/output, cache write $3.75, cache read $0.30).
            If you're on a Claude Code subscription, your actual billing is a flat monthly fee — this is the equivalent pay-per-use cost.
          </div>
        </>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: 'teal' | 'green' | 'red' | 'amber' }) {
  const color =
    accent === 'teal'  ? 'var(--c-teal)' :
    accent === 'green' ? 'var(--c-green)' :
    accent === 'red'   ? 'var(--c-red)' :
    accent === 'amber' ? 'var(--c-amber)' :
    'var(--c-text)';
  return (
    <div className="panel noise p-5">
      <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>{label}</div>
      <div className="text-3xl font-semibold tabular-nums leading-none" style={{ color }}>{value}</div>
      {sub && <div className="mono text-[12px] mt-2" style={{ color: 'var(--c-text-muted)' }}>{sub}</div>}
    </div>
  );
}

function CostBreakdown({ totals, models }: { totals: UsageTotals; models: Record<string, UsageTotals> }) {
  // Compute per-category dollar spend
  // Use the "sonnet" model family as the default assumption since that's what agents run on
  // We can't know exact per-turn model from totals, so we attribute at family level via byModel
  const rows: Array<{ label: string; value: number; color: string }> = [];

  // Approximate per-category spend by backing out from known pricing for the dominant model family
  // Pick the dominant model by cost
  const dominantFamily = Object.entries(models).sort((a, b) => b[1].costUsd - a[1].costUsd)[0]?.[0];
  const PRICE: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
    sonnet:  { input: 3,  output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
    opus:    { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
    haiku:   { input: 1,  output: 5,  cacheWrite: 1.25, cacheRead: 0.10 },
    unknown: { input: 3,  output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  };
  const p = PRICE[dominantFamily || 'sonnet'] || PRICE.sonnet;

  const outputCost = totals.outputTokens * p.output / 1_000_000;
  const cacheWriteCost = totals.cacheCreateTokens * p.cacheWrite / 1_000_000;
  const cacheReadCost = totals.cacheReadTokens * p.cacheRead / 1_000_000;
  const inputCost = totals.inputTokens * p.input / 1_000_000;

  rows.push({ label: 'Output',      value: outputCost,     color: '#2dd4bf' });
  rows.push({ label: 'Cache write', value: cacheWriteCost, color: '#a78bfa' });
  rows.push({ label: 'Cache read',  value: cacheReadCost,  color: '#60a5fa' });
  rows.push({ label: 'Input',       value: inputCost,      color: '#64748b' });

  const max = Math.max(...rows.map((r) => r.value), 0.01);

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const pct = max > 0 ? (row.value / max) * 100 : 0;
        const sharePct = totals.costUsd > 0 ? (row.value / totals.costUsd) * 100 : 0;
        return (
          <div key={row.label}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{row.label}</span>
              </div>
              <div className="flex items-center gap-3 mono text-sm tabular-nums">
                <span style={{ color: 'var(--c-text)' }}>{formatCost(row.value)}</span>
                <span className="text-[12px] w-10 text-right" style={{ color: 'var(--c-text-muted)' }}>{sharePct.toFixed(0)}%</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-border-dim)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: row.color, opacity: 0.75 }}
              />
            </div>
          </div>
        );
      })}
      {/* Per-model summary when there's more than one */}
      {Object.keys(models).length > 1 && (
        <div className="pt-3 mt-4" style={{ borderTop: '1px solid var(--c-border-dim)' }}>
          <div className="text-[11px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>By model</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(models).map(([name, t]) => (
              <span
                key={name}
                className="mono text-[12px] px-2.5 py-1 rounded-full"
                style={{
                  background: `${MODEL_COLORS[name] || '#888'}15`,
                  color: MODEL_COLORS[name] || '#888',
                  border: `1px solid ${MODEL_COLORS[name] || '#888'}40`,
                }}
              >
                {name} · {formatCost(t.costUsd)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartPanel({ title, subtitle, isEmpty, emptyHint, children }: {
  title: string;
  subtitle?: string;
  isEmpty?: boolean;
  emptyHint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel noise">
      <div className="panel-header flex items-center justify-between">
        <span>// {title}</span>
        {subtitle && (
          <span className="mono text-[12px] normal-case tracking-normal" style={{ color: 'var(--c-text-muted)' }}>
            {subtitle}
          </span>
        )}
      </div>
      <div className="p-5">
        {isEmpty ? (
          <div className="h-[240px] flex flex-col items-center justify-center">
            <div className="text-sm mb-1.5" style={{ color: 'var(--c-text-dim)' }}>No data</div>
            {emptyHint && <div className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>{emptyHint}</div>}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
