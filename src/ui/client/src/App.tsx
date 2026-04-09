import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.tsx';
import { ActivityLog } from './pages/ActivityLog.tsx';
import { Quality } from './pages/Quality.tsx';
import { Config } from './pages/Config.tsx';
import { Agents } from './pages/Agents.tsx';

const navItems = [
  { to: '/', label: 'Command', icon: '~' },
  { to: '/agents', label: 'Agents', icon: '%' },
  { to: '/activity', label: 'Activity', icon: '>' },
  { to: '/quality', label: 'Quality', icon: '#' },
  { to: '/config', label: 'Config', icon: '@' },
];

export function App() {
  const location = useLocation();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: 'var(--c-void)' }}>
      {/* Top bar */}
      <header className="sticky top-0 z-50" style={{ background: 'rgba(6, 8, 13, 0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--c-border-dim)' }}>
        <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between h-12">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--c-teal-glow)', border: '1px solid var(--c-teal-dim)' }}>
              <span className="mono text-sm font-bold" style={{ color: 'var(--c-teal)' }}>OT</span>
            </div>
            <span className="text-sm font-semibold tracking-wide" style={{ color: 'var(--c-text)' }}>
              OPENTWINS
            </span>
            <span className="mono text-[13px] px-2 py-0.5 rounded" style={{ color: 'var(--c-teal-dim)', background: 'var(--c-teal-glow)' }}>
              v0.1.0
            </span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200"
                  style={{
                    color: active ? 'var(--c-teal)' : 'var(--c-text-dim)',
                    background: active ? 'var(--c-teal-glow)' : 'transparent',
                    border: active ? '1px solid rgba(45, 212, 191, 0.15)' : '1px solid transparent',
                  }}
                >
                  <span className="mono text-[13px] opacity-50">{item.icon}</span>
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          {/* Clock */}
          <div className="mono text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
            {time.toLocaleTimeString('en-US', { hour12: false })}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/activity" element={<ActivityLog />} />
          <Route path="/quality" element={<Quality />} />
          <Route path="/config" element={<Config />} />
        </Routes>
      </main>
    </div>
  );
}
