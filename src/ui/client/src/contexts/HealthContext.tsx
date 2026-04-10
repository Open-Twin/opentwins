import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

export interface OpenclawHealth {
  running: boolean;
  port: number;
  error?: string;
}

export interface ClaudeStatus {
  indicator: 'none' | 'minor' | 'major' | 'critical' | 'maintenance' | 'unknown';
  description: string;
  updated_at: string;
  page_url: string;
}

export interface HealthState {
  openclaw: OpenclawHealth | null;
  claude: ClaudeStatus | null;
  loading: boolean;
  lastChecked: number;
  refetch: () => void;
}

const HealthContext = createContext<HealthState>({
  openclaw: null,
  claude: null,
  loading: true,
  lastChecked: 0,
  refetch: () => {},
});

// Poll every 20 seconds. /api/health itself caches Claude status for 60s on the server.
const POLL_INTERVAL_MS = 20_000;

export function HealthProvider({ children }: { children: ReactNode }) {
  const [openclaw, setOpenclaw] = useState<OpenclawHealth | null>(null);
  const [claude, setClaude] = useState<ClaudeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(0);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) {
        setOpenclaw({ running: false, port: 0, error: `${res.status}` });
        setClaude(null);
        setLastChecked(Date.now());
        setLoading(false);
        return;
      }
      const data = await res.json() as { openclaw: OpenclawHealth; claude: ClaudeStatus | null };
      setOpenclaw(data.openclaw);
      setClaude(data.claude);
      setLastChecked(Date.now());
      setLoading(false);
    } catch (err) {
      setOpenclaw({ running: false, port: 0, error: err instanceof Error ? err.message : 'fetch failed' });
      setClaude(null);
      setLastChecked(Date.now());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchHealth]);

  return (
    <HealthContext.Provider value={{ openclaw, claude, loading, lastChecked, refetch: fetchHealth }}>
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth(): HealthState {
  return useContext(HealthContext);
}

// Convenience helper: returns true if agents can run
export function useAgentsEnabled(): { enabled: boolean; reason: string | null } {
  const { openclaw, loading } = useHealth();
  if (loading) return { enabled: true, reason: null }; // optimistic during first load
  if (!openclaw) return { enabled: false, reason: 'Health unavailable' };
  if (!openclaw.running) return { enabled: false, reason: 'OpenClaw gateway is down' };
  return { enabled: true, reason: null };
}

// Compact single-line banner shown on Dashboard and Agents when agents are disabled.
// Pairs with the top-bar pill — this is for action context, not redundant status.
export function HealthBanner({ reason }: { reason: string | null }) {
  const { refetch, loading } = useHealth();
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 rounded-lg animate-fade-up"
      style={{
        background: 'rgba(248,113,113,0.05)',
        border: '1px solid rgba(248,113,113,0.2)',
      }}
    >
      <div className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: 'var(--c-red)' }} />
      <div className="flex-1 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium" style={{ color: 'var(--c-red)' }}>
          Agent actions paused
        </span>
        <span className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>
          · {reason || 'OpenClaw gateway is down'}
        </span>
      </div>
      <button
        onClick={refetch}
        disabled={loading}
        className="mono text-[12px] uppercase tracking-wider px-2.5 py-1 rounded transition-all disabled:opacity-50"
        style={{ color: 'var(--c-amber)', border: '1px solid rgba(251,191,36,0.2)' }}
      >
        {loading ? 'Checking…' : '↻ Retry'}
      </button>
    </div>
  );
}
