import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.tsx';
import { ActivityLog } from './pages/ActivityLog.tsx';
import { Quality } from './pages/Quality.tsx';
import { Config } from './pages/Config.tsx';
import { Agents } from './pages/Agents.tsx';
import { Usage } from './pages/Usage.tsx';
import { Setup } from './pages/Setup.tsx';
import { useApi } from './hooks/useApi.ts';
import { useHealth } from './contexts/HealthContext.tsx';

interface SetupStatus {
  configured: boolean;
  prereqs: { claude: boolean; chrome: boolean };
}

const navItems = [
  { to: '/', label: 'Command', icon: '~' },
  { to: '/agents', label: 'Agents', icon: '%' },
  { to: '/activity', label: 'Activity', icon: '>' },
  { to: '/usage', label: 'Usage', icon: '$' },
  { to: '/quality', label: 'Quality', icon: '#' },
  { to: '/config', label: 'Config', icon: '@' },
];

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  const { data: setupStatus, loading: setupLoading } = useApi<SetupStatus>('/api/setup/status');

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Route guard: redirect to /setup if not configured, and away from /setup if configured
  useEffect(() => {
    if (setupLoading || !setupStatus) return;
    const isSetup = location.pathname === '/setup';
    if (!setupStatus.configured && !isSetup) {
      navigate('/setup', { replace: true });
    } else if (setupStatus.configured && isSetup) {
      navigate('/', { replace: true });
    }
  }, [setupStatus, setupLoading, location.pathname, navigate]);

  // Show a minimal loader while the check is pending
  if (setupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--c-void)' }}>
        <div className="mono text-sm animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>Loading…</div>
      </div>
    );
  }

  // Setup page: render without the main app shell
  if (location.pathname === '/setup') {
    return (
      <div className="min-h-screen" style={{ background: 'var(--c-void)' }}>
        <main className="max-w-[1200px] mx-auto px-6 py-10">
          <Routes>
            <Route path="/setup" element={<Setup />} />
          </Routes>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--c-void)' }}>
      {/* Top bar */}
      <header className="sticky top-0 z-50" style={{ background: 'rgba(6, 8, 13, 0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between h-12">
          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--c-teal-glow)', border: '1px solid var(--c-teal-dim)' }}>
              <span className="mono text-sm font-bold" style={{ color: 'var(--c-teal)' }}>OT</span>
            </div>
            <span className="text-sm font-semibold tracking-wide hidden sm:inline" style={{ color: 'var(--c-text)' }}>
              OPENTWINS
            </span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1 min-w-0">
            {navItems.map((item) => {
              const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200"
                  style={{
                    color: active ? 'var(--c-teal)' : 'var(--c-text-dim)',
                    background: active ? 'var(--c-teal-glow)' : 'transparent',
                    border: active ? '1px solid rgba(45, 212, 191, 0.15)' : '1px solid transparent',
                  }}
                >
                  <span className="mono text-[13px] opacity-50 hidden md:inline">{item.icon}</span>
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          {/* Status cluster */}
          <div className="flex items-center gap-3 shrink-0">
            <HealthPills />
            <div className="mono text-[13px] hidden lg:block" style={{ color: 'var(--c-text-muted)' }}>
              {time.toLocaleTimeString('en-US', { hour12: false })}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/activity" element={<ActivityLog />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/quality" element={<Quality />} />
          <Route path="/config" element={<Config />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// ── Always-visible health pills in the top bar ────────────────

interface PillState {
  color: string;
  bg: string;
  border: string;
  dot: 'online' | 'offline' | 'pending';
  statusLabel: string;
}

function browserPillState(browser: ReturnType<typeof useHealth>['browser'], loading: boolean): PillState {
  if (loading && !browser) return { color: 'var(--c-text-muted)', bg: 'rgba(148,163,184,0.08)', border: 'var(--c-border-dim)', dot: 'pending', statusLabel: 'checking...' };
  if (!browser || browser.totalProfiles === 0) return { color: 'var(--c-text-muted)', bg: 'rgba(148,163,184,0.08)', border: 'var(--c-border-dim)', dot: 'pending', statusLabel: 'no profiles' };
  if (browser.activeProfiles > 0) return { color: 'var(--c-green)', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)', dot: 'online', statusLabel: `${browser.activeProfiles} active` };
  return { color: 'var(--c-text-muted)', bg: 'rgba(148,163,184,0.08)', border: 'var(--c-border-dim)', dot: 'pending', statusLabel: 'idle' };
}

function claudePillState(claude: ReturnType<typeof useHealth>['claude'], loading: boolean): PillState {
  if (loading && !claude) return { color: 'var(--c-text-muted)', bg: 'rgba(148,163,184,0.08)', border: 'var(--c-border-dim)', dot: 'pending', statusLabel: 'checking…' };
  if (!claude) return { color: 'var(--c-text-muted)', bg: 'rgba(148,163,184,0.08)', border: 'var(--c-border-dim)', dot: 'pending', statusLabel: 'unknown' };
  switch (claude.indicator) {
    case 'none':        return { color: 'var(--c-green)', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)',  dot: 'online',  statusLabel: 'operational' };
    case 'minor':       return { color: 'var(--c-amber)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)',  dot: 'pending', statusLabel: 'minor issue' };
    case 'major':
    case 'critical':    return { color: 'var(--c-red)',   bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.35)', dot: 'offline', statusLabel: 'outage' };
    case 'maintenance': return { color: 'var(--c-blue)',  bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)',  dot: 'pending', statusLabel: 'maintenance' };
    default:            return { color: 'var(--c-text-muted)', bg: 'rgba(148,163,184,0.08)', border: 'var(--c-border-dim)', dot: 'pending', statusLabel: 'unknown' };
  }
}

function timeSince(ms: number): string {
  if (!ms) return 'never';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function HealthPill({
  label,
  state,
  subtitle,
  href,
  onClick,
  checkedAt,
}: {
  label: string;
  state: PillState;
  subtitle: string;
  href?: string;
  onClick?: () => void;
  checkedAt: number;
}) {
  // Force the fixed label as the visible pill text; subtitle + checked-at live in the tooltip
  const tooltip = `${label} · ${state.statusLabel}\n${subtitle}\nChecked ${timeSince(checkedAt)}`;

  const body = (
    <>
      <span className={`status-dot ${state.dot}`} />
      <span className="mono text-[12px] uppercase tracking-wider font-medium">{label}</span>
    </>
  );

  const className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all duration-200 hover:brightness-125";
  const style = { background: state.bg, border: `1px solid ${state.border}`, color: state.color };

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener" className={className} style={style} title={tooltip}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style} title={tooltip}>
      {body}
    </button>
  );
}

function HealthPills() {
  const { browser, claude, loading, lastChecked, refetch } = useHealth();
  const br = browserPillState(browser, loading);
  const cl = claudePillState(claude, loading);

  const browserSubtitle = browser?.error
    ? `Probe failed: ${browser.error}`
    : browser?.totalProfiles
      ? `${browser.activeProfiles}/${browser.totalProfiles} profiles active`
      : 'No browser profiles configured';

  const claudeSubtitle = claude?.description || 'Status unavailable';

  return (
    <div className="flex items-center gap-2">
      <HealthPill
        label="Browser"
        state={br}
        subtitle={browserSubtitle}
        onClick={refetch}
        checkedAt={lastChecked}
      />
      <HealthPill
        label="Claude"
        state={cl}
        subtitle={claudeSubtitle}
        href={claude?.page_url || 'https://status.claude.com'}
        checkedAt={lastChecked}
      />
    </div>
  );
}
