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
    styles: string;
    comments: number;
    disagreements: number;
    avg_words: number;
  }>;
  emDashViolations: number;
}

// Platforms fetched from config, not hardcoded
const STYLE_COLORS = ['#2dd4bf', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#ec4899', '#34d399', '#fb923c'];

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#111827',
    border: '1px solid #1e293b',
    borderRadius: 8,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    color: '#94a3b8',
  },
  labelStyle: { color: '#64748b', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
};

export function Quality() {
  const { data: statusData } = useApi<{ platforms: Array<{ platform: string }> }>('/api/status');
  const platforms = statusData?.platforms.map((p) => p.platform) || [];
  const [platform, setPlatform] = useState('');
  const [days, setDays] = useState('14');

  // Default to first platform once loaded
  const activePlatform = platform || platforms[0] || 'reddit';

  const { data, loading } = useApi<QualityData>(
    `/api/quality?platform=${activePlatform}&date=${today()}&days=${days}`,
    [activePlatform, days]
  );

  const styleData = data?.today
    ? Object.entries(JSON.parse(data.today.styles || '{}')).map(([name, value]) => ({ name, value: value as number }))
    : [];

  const historyData = data?.history?.map((h) => ({
    date: h.date.slice(5),
    comments: h.comments,
    disagreeRate: h.comments > 0 ? Math.round((h.disagreements / h.comments) * 100) : 0,
    avgWords: h.avg_words,
  })) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-up flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>Signal Quality</h1>
          <p className="mono text-xs mt-1" style={{ color: 'var(--c-text-muted)' }}>Voice consistency and detection avoidance metrics</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1">
            {platforms.map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className="mono px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200"
                style={{
                  background: activePlatform === p ? 'var(--c-teal-glow)' : 'transparent',
                  color: activePlatform === p ? 'var(--c-teal)' : 'var(--c-text-muted)',
                  border: activePlatform === p ? '1px solid rgba(45, 212, 191, 0.2)' : '1px solid transparent',
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="mono px-2 py-1 rounded-md text-[11px] outline-none"
            style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border-dim)', color: 'var(--c-text-dim)' }}
          >
            <option value="7">7d</option>
            <option value="14">14d</option>
            <option value="30">30d</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 mono text-xs animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>
          Analyzing signal...
        </div>
      ) : (
        <>
          {/* Metric cards */}
          <div className="animate-fade-up stagger-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              label="Comments"
              value={data?.today?.comments || 0}
              sub="today"
            />
            <MetricCard
              label="Avg Words"
              value={data?.today?.avg_words || 0}
              warn={(data?.today?.avg_words || 0) > 100}
              sub="per comment"
            />
            <MetricCard
              label="Disagree %"
              value={data?.today?.comments ? `${Math.round((data.today.disagreements / data.today.comments) * 100)}%` : '0%'}
              sub="target: 25%"
              accent
            />
            <MetricCard
              label="Em-dash"
              value={data?.emDashViolations || 0}
              warn={(data?.emDashViolations || 0) > 0}
              sub="violations (target: 0)"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Style Distribution */}
            <div className="animate-fade-up stagger-2 panel noise">
              <div className="panel-header">// Style Distribution</div>
              <div className="p-5">
                {styleData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
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
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {styleData.map((_, i) => (
                          <Cell key={i} fill={STYLE_COLORS[i % STYLE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart label="No style data yet" />
                )}
              </div>
            </div>

            {/* Comments Over Time */}
            <div className="animate-fade-up stagger-3 panel noise">
              <div className="panel-header">// Volume</div>
              <div className="p-5">
                {historyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={historyData} barSize={16}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Bar dataKey="comments" fill="#2dd4bf" radius={[4, 4, 0, 0]} opacity={0.8} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart label="No history" />
                )}
              </div>
            </div>

            {/* Disagreement Rate */}
            <div className="animate-fade-up stagger-4 panel noise">
              <div className="panel-header">// Disagreement Rate</div>
              <div className="p-5">
                {historyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={historyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} domain={[0, 50]} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <ReferenceLine y={25} stroke="#1e293b" strokeDasharray="5 5" label={{ value: 'target', position: 'right', fill: '#334155', fontSize: 9, fontFamily: 'JetBrains Mono' }} />
                      <Line type="monotone" dataKey="disagreeRate" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3, fill: '#fbbf24', stroke: 'none' }} activeDot={{ r: 5, stroke: '#fbbf24', strokeWidth: 2, fill: '#111827' }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart label="No history" />
                )}
              </div>
            </div>

            {/* Avg Word Count */}
            <div className="animate-fade-up stagger-5 panel noise">
              <div className="panel-header">// Word Density</div>
              <div className="p-5">
                {historyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={historyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="avgWords" stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: '#34d399', stroke: 'none' }} activeDot={{ r: 5, stroke: '#34d399', strokeWidth: 2, fill: '#111827' }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart label="No history" />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, warn, sub, accent }: {
  label: string;
  value: number | string;
  warn?: boolean;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="panel noise p-4">
      <div className="mono text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--c-text-muted)' }}>{label}</div>
      <div className="mono text-2xl font-medium" style={{
        color: warn ? 'var(--c-amber)' : accent ? 'var(--c-teal)' : 'var(--c-text)',
      }}>{value}</div>
      {sub && <div className="mono text-[10px] mt-1" style={{ color: 'var(--c-border)' }}>{sub}</div>}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-[220px] flex items-center justify-center">
      <div className="mono text-xs" style={{ color: 'var(--c-text-muted)' }}>{label}</div>
    </div>
  );
}
