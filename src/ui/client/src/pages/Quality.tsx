import { useState } from 'react';
import { useApi, today } from '../hooks/useApi.ts';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine,
} from 'recharts';

interface QualityData {
  today: {
    platform: string;
    date: string;
    comments: number;
    styles: string;
    disagreements: number;
    questions: number;
    avg_words: number;
    last_style: string;
  } | null;
  history: Array<{
    date: string;
    hour?: string; // present when bucketed by hour
    styles: string;
    comments: number;
    disagreements: number;
    avg_words: number;
  }>;
  emDashViolations: number;
  range?: { days?: number; hours?: number };
}

type QualityTimeframe = '24h' | '7' | '14' | '30';

const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#FF4500', twitter: '#1DA1F2', linkedin: '#0A66C2', bluesky: '#0085FF',
  threads: '#888', medium: '#00AB6C', substack: '#FF6719', devto: '#3B49DF',
  ph: '#DA552F', ih: '#4F46E5',
};

const STYLE_COLORS = ['#2dd4bf', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#ec4899', '#34d399', '#fb923c'];

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

// Targets for quality metrics — used to color KPI cards
const TARGETS = {
  avgWords: { good: 80, warn: 100 },     // avg words per comment; >100 is too verbose
  disagreePct: { target: 25, range: 10 }, // 25% ± 10% is healthy
  emDash: { good: 0 },                    // zero is the goal
};

export function Quality() {
  const { data: statusData } = useApi<{ platforms: Array<{ platform: string }> }>('/api/status');
  const platforms = statusData?.platforms.map((p) => p.platform) || [];
  const [platform, setPlatform] = useState('');
  const [days, setDays] = useState<QualityTimeframe>('14');

  const activePlatform = platform || platforms[0] || 'linkedin';
  const isHourly = days === '24h';

  const qs = isHourly ? 'hours=24' : `days=${days}`;
  const { data, loading } = useApi<QualityData>(
    `/api/quality?platform=${activePlatform}&date=${today()}&${qs}`,
    [activePlatform, days]
  );

  const styleData = data?.today
    ? Object.entries(JSON.parse(data.today.styles || '{}')).map(([name, value]) => ({ name, value: value as number }))
    : [];

  const historyData = data?.history?.map((h) => {
    let label: string;
    if (h.hour) {
      // Hour key is already server-local time ("YYYY-MM-DDTHH") — the
      // memory log timestamps it came from have no timezone, and the
      // server used local getHours() when building the range. Just
      // render HH from the string.
      label = `${h.hour.slice(11, 13)}:00`;
    } else {
      label = h.date.slice(5); // MM-DD
    }
    return {
      date: label,
      comments: h.comments,
      disagreeRate: h.comments > 0 ? Math.round((h.disagreements / h.comments) * 100) : 0,
      avgWords: h.avg_words,
    };
  }) || [];

  const todayComments = data?.today?.comments || 0;
  const todayAvgWords = data?.today?.avg_words || 0;
  const todayDisagreePct = data?.today?.comments ? Math.round((data.today.disagreements / data.today.comments) * 100) : 0;
  const todayEmDash = data?.emDashViolations || 0;

  // Determine KPI health states
  const avgWordsState: KpiState =
    todayComments === 0 ? 'idle' :
    todayAvgWords > TARGETS.avgWords.warn ? 'warn' :
    todayAvgWords > TARGETS.avgWords.good ? 'caution' : 'good';

  const disagreeState: KpiState =
    todayComments === 0 ? 'idle' :
    Math.abs(todayDisagreePct - TARGETS.disagreePct.target) <= TARGETS.disagreePct.range ? 'good' : 'warn';

  const emDashState: KpiState =
    todayEmDash === 0 ? 'good' : 'warn';

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="animate-fade-up flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>Signal Quality</h1>
          <p className="mono text-sm mt-1.5" style={{ color: 'var(--c-text-muted)' }}>
            Voice consistency and detection avoidance metrics
          </p>
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className="animate-fade-up stagger-1 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="mono text-[12px] uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Platform</span>
          <div className="flex gap-1 flex-wrap">
            {platforms.length === 0 ? (
              <span className="mono text-[13px] px-3 py-1.5" style={{ color: 'var(--c-text-muted)' }}>no platforms configured</span>
            ) : platforms.map((p) => {
              const isActive = activePlatform === p;
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
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  {p}
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
              const isActive = days === tf;
              const label = tf === '24h' ? '24 hours' : `${tf} days`;
              return (
                <button
                  key={tf}
                  onClick={() => setDays(tf)}
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

      {loading ? (
        <div className="panel noise py-16 text-center mono text-sm animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>
          Analyzing signal...
        </div>
      ) : (
        <>
          {/* ── Today's snapshot ─────────────────────────────── */}
          <div className="animate-fade-up stagger-2">
            <div className="flex items-center justify-between mb-4">
              <div className="section-title">Today's Snapshot</div>
              <span className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>{today()}</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Comments"
                value={todayComments}
                sub={todayComments > 0 ? 'posted today' : 'no activity yet'}
                state={todayComments > 0 ? 'good' : 'idle'}
              />
              <KpiCard
                label="Avg Words"
                value={todayAvgWords}
                sub={
                  avgWordsState === 'warn' ? `too verbose (>${TARGETS.avgWords.warn})` :
                  avgWordsState === 'caution' ? `watch length (>${TARGETS.avgWords.good})` :
                  avgWordsState === 'good' ? `within target ≤${TARGETS.avgWords.good}` :
                  'per comment'
                }
                state={avgWordsState}
              />
              <KpiCard
                label="Disagree"
                value={`${todayDisagreePct}%`}
                sub={`target ${TARGETS.disagreePct.target}% ±${TARGETS.disagreePct.range}%`}
                state={disagreeState}
              />
              <KpiCard
                label="Em-dash"
                value={todayEmDash}
                sub={emDashState === 'warn' ? 'violations found' : 'clean · target 0'}
                state={emDashState}
              />
            </div>
          </div>

          {/* ── Charts ──────────────────────────────────────── */}
          <div className="animate-fade-up stagger-3">
            <div className="section-title mb-4">Trends · {isHourly ? 'last 24 hours' : `${days} days`}</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Style Distribution */}
              <ChartPanel
                title="Style Distribution"
                subtitle="How reply styles mix today"
                isEmpty={styleData.length === 0}
                emptyHint="Run the agent to generate style data"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={styleData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                      label={renderPieLabel}
                      labelLine={false}
                    >
                      {styleData.map((_, i) => (
                        <Cell key={i} fill={STYLE_COLORS[i % STYLE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartPanel>

              {/* Volume */}
              <ChartPanel
                title="Volume"
                subtitle={isHourly ? 'Comments posted per hour' : 'Comments posted per day'}
                isEmpty={historyData.length === 0}
                emptyHint="History builds up as the agent runs"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={historyData} barSize={18} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                    <Tooltip {...TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                    <Bar dataKey="comments" fill="#2dd4bf" radius={[4, 4, 0, 0]} opacity={0.85} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>

              {/* Disagreement Rate */}
              <ChartPanel
                title="Disagreement Rate"
                subtitle={`Target: ${TARGETS.disagreePct.target}% — shown as dashed line`}
                isEmpty={historyData.length === 0}
                emptyHint="Needs a few days of comments to plot"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={historyData} margin={{ top: 10, right: 20, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} domain={[0, 50]} unit="%" />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <ReferenceLine y={TARGETS.disagreePct.target} stroke="#2dd4bf" strokeDasharray="5 5" strokeOpacity={0.5} label={{ value: 'target', position: 'right', fill: '#2dd4bf', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                    <Line type="monotone" dataKey="disagreeRate" stroke="#fbbf24" strokeWidth={2.5} dot={{ r: 3, fill: '#fbbf24', stroke: 'none' }} activeDot={{ r: 5, stroke: '#fbbf24', strokeWidth: 2, fill: '#111827' }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>

              {/* Avg Word Count */}
              <ChartPanel
                title="Word Density"
                subtitle={`Avg words/comment — target ≤${TARGETS.avgWords.good}`}
                isEmpty={historyData.length === 0}
                emptyHint="Needs a few days of comments to plot"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={historyData} margin={{ top: 10, right: 20, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <ReferenceLine y={TARGETS.avgWords.good} stroke="#2dd4bf" strokeDasharray="5 5" strokeOpacity={0.5} label={{ value: 'target', position: 'right', fill: '#2dd4bf', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                    <Line type="monotone" dataKey="avgWords" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3, fill: '#34d399', stroke: 'none' }} activeDot={{ r: 5, stroke: '#34d399', strokeWidth: 2, fill: '#111827' }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────

// Pie label positioned outside the donut with a short connector.
function renderPieLabel(props: {
  cx: number; cy: number; midAngle: number; outerRadius: number;
  name: string; percent?: number;
}) {
  const { cx, cy, midAngle, outerRadius, name, percent = 0 } = props;
  const RAD = Math.PI / 180;
  const sin = Math.sin(-RAD * midAngle);
  const cos = Math.cos(-RAD * midAngle);
  const connectorStart = { x: cx + outerRadius * cos, y: cy + outerRadius * sin };
  const connectorEnd   = { x: cx + (outerRadius + 12) * cos, y: cy + (outerRadius + 12) * sin };
  const labelX = cx + (outerRadius + 16) * cos;
  const labelY = cy + (outerRadius + 16) * sin;
  const anchor: 'start' | 'end' = cos >= 0 ? 'start' : 'end';
  return (
    <g>
      <polyline
        points={`${connectorStart.x},${connectorStart.y} ${connectorEnd.x},${connectorEnd.y} ${labelX},${labelY}`}
        stroke="#475569"
        strokeWidth={1}
        fill="none"
      />
      <text
        x={labelX + (anchor === 'start' ? 4 : -4)}
        y={labelY}
        fill="#e2e8f0"
        fontSize={11}
        fontFamily="JetBrains Mono, monospace"
        textAnchor={anchor}
        dominantBaseline="central"
      >
        {`${name} ${Math.round(percent * 100)}%`}
      </text>
    </g>
  );
}

type KpiState = 'good' | 'caution' | 'warn' | 'idle';

function KpiCard({ label, value, sub, state }: { label: string; value: number | string; sub?: string; state: KpiState }) {
  const color =
    state === 'good'    ? 'var(--c-green)' :
    state === 'caution' ? 'var(--c-amber)' :
    state === 'warn'    ? 'var(--c-red)' :
    'var(--c-text)';
  return (
    <div className="panel noise p-5 relative overflow-hidden">
      {/* Status accent stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5"
        style={{
          background:
            state === 'good'    ? 'var(--c-green)' :
            state === 'caution' ? 'var(--c-amber)' :
            state === 'warn'    ? 'var(--c-red)' :
            'var(--c-border-dim)',
        }}
      />
      <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>{label}</div>
      <div className="text-3xl font-semibold tabular-nums leading-none" style={{ color }}>{value}</div>
      {sub && <div className="mono text-[12px] mt-2" style={{ color: 'var(--c-text-muted)' }}>{sub}</div>}
    </div>
  );
}

function ChartPanel({ title, subtitle, isEmpty, emptyHint, children }: {
  title: string;
  subtitle?: string;
  isEmpty: boolean;
  emptyHint: string;
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
            <div className="text-sm mb-1.5" style={{ color: 'var(--c-text-dim)' }}>No data yet</div>
            <div className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>{emptyHint}</div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
