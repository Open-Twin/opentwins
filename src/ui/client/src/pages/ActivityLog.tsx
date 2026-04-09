import { useState } from 'react';
import { useApi, today } from '../hooks/useApi.ts';

interface ActivityRow {
  id: number;
  platform: string;
  action_type: string;
  target_url: string | null;
  target_author: string | null;
  style: string | null;
  content: string | null;
  word_count: number | null;
  created_at: string;
}

// Platforms fetched from config, not hardcoded

const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#FF4500', twitter: '#1DA1F2', linkedin: '#0A66C2', bluesky: '#0085FF',
  threads: '#888', medium: '#00AB6C', substack: '#FF6719', devto: '#3B49DF',
  ph: '#DA552F', ih: '#4F46E5',
};

export function ActivityLog() {
  const { data: statusData } = useApi<{ platforms: Array<{ platform: string }> }>('/api/status');
  const platforms = ['all', ...(statusData?.platforms.map((p) => p.platform) || [])];
  const [date, setDate] = useState(today());
  const [platform, setPlatform] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const url = platform === 'all'
    ? `/api/activity?date=${date}`
    : `/api/activity?date=${date}&platform=${platform}`;

  const { data: rows, loading } = useApi<ActivityRow[]>(url, [date, platform]);

  const filtered = rows?.filter((r) =>
    search
      ? (r.content?.toLowerCase().includes(search.toLowerCase()) ||
         r.target_author?.toLowerCase().includes(search.toLowerCase()) ||
         r.action_type.toLowerCase().includes(search.toLowerCase()))
      : true
  ) || [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>Activity Log</h1>
        <p className="mono text-sm mt-1" style={{ color: 'var(--c-text-muted)' }}>Transmission records from all agents</p>
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

        <div className="flex-1 min-w-[200px] relative">
          <input
            type="text"
            placeholder="Search content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mono w-full px-3 py-1.5 rounded-md text-sm outline-none transition-colors"
            style={{
              background: 'var(--c-panel)',
              border: '1px solid var(--c-border-dim)',
              color: 'var(--c-text-dim)',
            }}
          />
        </div>

        <span className="mono text-[14px] px-2 py-1 rounded-full" style={{ color: 'var(--c-teal-dim)', background: 'var(--c-teal-glow)' }}>
          {filtered.length}
        </span>
      </div>

      {/* Table */}
      <div className="animate-fade-up stagger-2 panel noise">
        <div className="panel-header">// Transmissions</div>
        {loading ? (
          <div className="p-12 text-center mono text-sm animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>
            Scanning records...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mono text-sm" style={{ color: 'var(--c-text-muted)' }}>No transmissions found</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                  {['Time', 'Platform', 'Action', 'Style', 'Content', 'Words'].map((h, i) => (
                    <th key={h} className={`${i === 5 ? 'text-right' : 'text-left'} px-4 py-2.5 mono text-[14px] font-medium uppercase tracking-wider`} style={{ color: 'var(--c-text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const isExpanded = expanded === row.id;
                  const color = PLATFORM_COLORS[row.platform] || '#888';
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer transition-colors"
                      onClick={() => setExpanded(isExpanded ? null : row.id)}
                      style={{ borderBottom: '1px solid var(--c-border-dim)', background: isExpanded ? 'rgba(45, 212, 191, 0.02)' : undefined }}
                      onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.01)'; }}
                      onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = ''; }}
                    >
                      <td className="px-4 py-3 mono text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
                        {row.created_at?.split('T')[1]?.slice(0, 5) || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 mono text-[13px] font-medium capitalize" style={{ color: 'var(--c-text-dim)' }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                          {row.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 mono text-[13px]" style={{ color: 'var(--c-text-muted)' }}>{row.action_type}</td>
                      <td className="px-4 py-3">
                        {row.style && (
                          <span className="mono text-[14px] px-2 py-0.5 rounded-full" style={{ background: 'var(--c-teal-glow)', color: 'var(--c-teal-dim)' }}>
                            {row.style}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm max-w-lg" style={{ color: 'var(--c-text-dim)' }}>
                        {isExpanded ? (
                          <div className="whitespace-pre-wrap leading-relaxed">{row.content || '-'}</div>
                        ) : (
                          <div className="truncate">{row.content?.slice(0, 100) || '-'}</div>
                        )}
                        {row.target_author && (
                          <div className="mono text-[14px] mt-1.5" style={{ color: 'var(--c-text-muted)' }}>
                            to: {row.target_author}
                            {row.target_url && (
                              <>
                                {' '}&middot;{' '}
                                <a href={row.target_url} target="_blank" rel="noopener" className="transition-colors" style={{ color: 'var(--c-teal-dim)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--c-teal)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--c-teal-dim)'}>
                                  link
                                </a>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right mono text-[13px]" style={{ color: 'var(--c-text-muted)' }}>{row.word_count || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
