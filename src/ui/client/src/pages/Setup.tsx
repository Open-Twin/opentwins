import { useState, useEffect } from 'react';
import { useApi, useMutation } from '../hooks/useApi.ts';

// ── Types ─────────────────────────────────────────────────────

interface SetupStatus {
  configured: boolean;
  prereqs: {
    claude: boolean;
    chrome: boolean;
  };
}

interface PlatformEntry {
  platform: string;
  handle: string;
  enabled: boolean;
}

interface SetupDraft {
  auth: {
    mode: 'subscription' | 'api_key';
    claude_token?: string;
    api_key?: string;
    validated: boolean;
  };
  identity: {
    name: string;
    display_name: string;
    role: string;
    headline: string;
    bio: string;
    brand_tagline: string;
    certifications: string;
    conference_mentions: string;
    experience_hooks: string;
  };
  pillars: string;
  platforms: PlatformEntry[];
  voice: 'casual' | 'balanced' | 'professional';
  timezone: string;
  active_hours: { start: number; end: number };
  pipeline_enabled: boolean;
}

const PLATFORMS = [
  { id: 'linkedin',  label: 'LinkedIn',    color: '#0A66C2', hint: 'vanity URL slug' },
  { id: 'twitter',   label: 'Twitter / X', color: '#1DA1F2', hint: 'handle (without @)' },
  { id: 'reddit',    label: 'Reddit',      color: '#FF4500', hint: 'username (without u/)' },
  { id: 'bluesky',   label: 'Bluesky',     color: '#0085FF', hint: 'user.bsky.social' },
  { id: 'threads',   label: 'Threads',     color: '#888',    hint: 'handle (without @)' },
  { id: 'medium',    label: 'Medium',      color: '#00AB6C', hint: 'username (without @)' },
  { id: 'substack',  label: 'Substack',    color: '#FF6719', hint: 'yourname.substack.com' },
  { id: 'devto',     label: 'Dev.to',      color: '#3B49DF', hint: 'username' },
  { id: 'ph',        label: 'Product Hunt', color: '#DA552F', hint: 'username' },
  { id: 'ih',        label: 'Indie Hackers', color: '#4F46E5', hint: 'username' },
];

// ── Main wizard ───────────────────────────────────────────────

export function Setup() {
  const { data: status, loading: statusLoading } = useApi<SetupStatus>('/api/setup/status');
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<SetupDraft>(() => ({
    auth: { mode: 'subscription', claude_token: '', api_key: '', validated: false },
    identity: {
      name: '',
      display_name: '',
      role: '',
      headline: '',
      bio: '',
      brand_tagline: '',
      certifications: '',
      conference_mentions: '',
      experience_hooks: '',
    },
    pillars: '',
    platforms: [],
    voice: 'balanced',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    active_hours: { start: 8, end: 23 },
    pipeline_enabled: true,
  }));

  // Redirect if already configured — full reload so App.tsx refetches status
  useEffect(() => {
    if (status?.configured) {
      window.location.href = '/';
    }
  }, [status?.configured]);

  const update = (fn: (d: SetupDraft) => void) => {
    const next = JSON.parse(JSON.stringify(draft));
    fn(next);
    setDraft(next);
  };

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="mono text-sm animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>Checking setup...</div>
      </div>
    );
  }

  const steps = [
    { id: 1, label: 'Account',   sub: 'Prereqs & auth' },
    { id: 2, label: 'Identity',  sub: 'Who you are' },
    { id: 3, label: 'Platforms', sub: 'Topics & handles' },
    { id: 4, label: 'Voice',     sub: 'Tone & schedule' },
    { id: 5, label: 'Review',    sub: 'Generate' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="animate-fade-up text-center">
        <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>
          Welcome to OpenTwins
        </h1>
        <p className="text-base mt-2" style={{ color: 'var(--c-text-muted)' }}>
          Your autonomous digital twins across every social platform
        </p>
        <div className="mono text-[12px] mt-4 uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>
          Step {step} of {steps.length} · {steps[step - 1]?.label}
        </div>
      </div>

      {/* Stepper */}
      <div className="animate-fade-up stagger-1 flex items-center justify-center gap-1.5 flex-wrap">
        {steps.map((s, i) => {
          const isActive = s.id === step;
          const isDone = s.id < step;
          return (
            <div key={s.id} className="flex items-center gap-1.5">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
                style={{
                  background: isActive ? 'var(--c-teal-glow)' : isDone ? 'rgba(52,211,153,0.06)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(45,212,191,0.4)' : isDone ? 'rgba(52,211,153,0.25)' : 'var(--c-border-dim)'}`,
                }}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold mono shrink-0"
                  style={{
                    background: isActive ? 'var(--c-teal)' : isDone ? 'var(--c-green)' : 'var(--c-border-dim)',
                    color: isActive || isDone ? 'var(--c-void)' : 'var(--c-text-muted)',
                  }}
                >
                  {isDone ? '✓' : s.id}
                </div>
                <div className="hidden sm:block">
                  <div className="mono text-[12px] uppercase tracking-wider font-medium leading-tight" style={{
                    color: isActive ? 'var(--c-teal)' : isDone ? 'var(--c-green)' : 'var(--c-text-muted)',
                  }}>
                    {s.label}
                  </div>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="w-4 h-px" style={{ background: isDone ? 'rgba(52,211,153,0.4)' : 'var(--c-border-dim)' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step panels */}
      <div className="animate-fade-up stagger-2">
        {step === 1 && <StepWelcome status={status!} draft={draft} update={update} onNext={() => setStep(2)} />}
        {step === 2 && <StepIdentity draft={draft} update={update} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
        {step === 3 && <StepPlatforms draft={draft} update={update} onBack={() => setStep(2)} onNext={() => setStep(4)} />}
        {step === 4 && <StepVoice draft={draft} update={update} onBack={() => setStep(3)} onNext={() => setStep(5)} />}
        {step === 5 && <StepReview draft={draft} onBack={() => setStep(4)} />}
      </div>
    </div>
  );
}

// ── Step 1: Welcome + Auth ────────────────────────────────────

function StepWelcome({ status, draft, update, onNext }: {
  status: SetupStatus;
  draft: SetupDraft;
  update: (fn: (d: SetupDraft) => void) => void;
  onNext: () => void;
}) {
  const { mutate: validate, loading: validating } = useMutation<unknown, { ok: boolean; error?: string }>('/api/setup/validate-auth', 'POST');
  const [error, setError] = useState<string | null>(null);

  const allPrereqs = status.prereqs.claude && status.prereqs.chrome;

  const hasToken = draft.auth.mode === 'subscription'
    ? (draft.auth.claude_token?.length || 0) >= 20
    : (draft.auth.api_key?.length || 0) >= 20;

  // Unified action: validate then continue
  const handleContinue = async () => {
    setError(null);
    if (draft.auth.validated) {
      onNext();
      return;
    }
    const payload = draft.auth.mode === 'subscription'
      ? { mode: 'subscription', claude_token: draft.auth.claude_token }
      : { mode: 'api_key', api_key: draft.auth.api_key };
    const result = await validate(payload);
    if (result?.ok) {
      update((d) => { d.auth.validated = true; });
      onNext();
    } else {
      update((d) => { d.auth.validated = false; });
      setError(result?.error || 'Invalid credentials. Check your token and try again.');
    }
  };

  // Prereqs block: if not installed, show a prominent blocker
  if (!allPrereqs) {
    return (
      <div className="space-y-5">
        <div className="panel noise p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
              background: 'rgba(251,191,36,0.12)',
              border: '1px solid rgba(251,191,36,0.3)',
            }}>
              <span className="text-lg">⚠</span>
            </div>
            <div>
              <div className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>Missing prerequisites</div>
              <div className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>
                Install these tools before continuing
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <PrereqRow label="Claude Code CLI" ok={status.prereqs.claude} install="npm install -g @anthropic-ai/claude-code" />
            <PrereqRow label="Google Chrome"    ok={status.prereqs.chrome} install="npm install -g chrome" />
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{
              color: 'var(--c-teal)',
              background: 'var(--c-teal-glow)',
              border: '1px solid rgba(45,212,191,0.3)',
            }}
          >
            ↻ I installed them — refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Prereq check (all green) */}
      <div className="panel noise p-6">
        <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-4" style={{ color: 'var(--c-text-muted)' }}>
          Prerequisites
        </div>
        <div className="space-y-3">
          <PrereqRow label="Claude Code CLI" ok={status.prereqs.claude} install="npm install -g @anthropic-ai/claude-code" />
          <PrereqRow label="Google Chrome"    ok={status.prereqs.chrome} install="npm install -g chrome" />
        </div>
      </div>

      {/* Auth */}
      <div className="panel noise p-6">
        <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-4" style={{ color: 'var(--c-text-muted)' }}>
          Authentication
        </div>

        {/* Mode selector */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => update((d) => { d.auth.mode = 'subscription'; d.auth.validated = false; })}
            className="flex-1 px-4 py-3 rounded-lg text-left transition-all"
            style={{
              background: draft.auth.mode === 'subscription' ? 'var(--c-panel)' : 'transparent',
              border: `1px solid ${draft.auth.mode === 'subscription' ? 'var(--c-teal-dim)' : 'var(--c-border-dim)'}`,
            }}
          >
            <div className="text-sm font-semibold mb-0.5" style={{ color: 'var(--c-text)' }}>Claude Code Subscription</div>
            <div className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>OAuth token · recommended</div>
          </button>
          <button
            onClick={() => update((d) => { d.auth.mode = 'api_key'; d.auth.validated = false; })}
            className="flex-1 px-4 py-3 rounded-lg text-left transition-all"
            style={{
              background: draft.auth.mode === 'api_key' ? 'var(--c-panel)' : 'transparent',
              border: `1px solid ${draft.auth.mode === 'api_key' ? 'var(--c-teal-dim)' : 'var(--c-border-dim)'}`,
            }}
          >
            <div className="text-sm font-semibold mb-0.5" style={{ color: 'var(--c-text)' }}>Anthropic API Key</div>
            <div className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>pay-per-use</div>
          </button>
        </div>

        {/* Token input with instructions */}
        {draft.auth.mode === 'subscription' ? (
          <div className="space-y-4">
            {/* How to get a token — step-by-step */}
            <div className="rounded-lg p-4 space-y-3" style={{ background: 'rgba(45,212,191,0.04)', border: '1px solid rgba(45,212,191,0.15)' }}>
              <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>How to get your token:</div>
              <div className="space-y-2">
                <TokenStep num={1} text="Open a new terminal window" />
                <TokenStep num={2}>
                  Run this command: <CopyableCmd cmd="claude setup-token" />
                </TokenStep>
                <TokenStep num={3} text="Follow the prompts to log in (if asked)" />
                <TokenStep num={4} text="Copy the token that starts with sk-ant-oat01-..." />
                <TokenStep num={5} text="Paste it below" />
              </div>
            </div>

            <div>
              <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>
                Paste your token
              </div>
              <input
                type="password"
                value={draft.auth.claude_token || ''}
                onChange={(e) => update((d) => { d.auth.claude_token = e.target.value; d.auth.validated = false; })}
                placeholder="sk-ant-oat01-…"
                className="mono w-full bg-transparent outline-none text-sm px-3 py-2.5 rounded-lg transition-colors"
                style={{ color: 'var(--c-text)', border: '1px solid var(--c-border-dim)' }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* How to get an API key — step-by-step */}
            <div className="rounded-lg p-4 space-y-3" style={{ background: 'rgba(45,212,191,0.04)', border: '1px solid rgba(45,212,191,0.15)' }}>
              <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>How to get your API key:</div>
              <div className="space-y-2">
                <TokenStep num={1}>
                  Go to <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" className="hover:underline" style={{ color: 'var(--c-teal)' }}>console.anthropic.com/settings/keys ↗</a>
                </TokenStep>
                <TokenStep num={2} text='Click "Create Key"' />
                <TokenStep num={3} text="Copy the key that starts with sk-ant-api03-..." />
                <TokenStep num={4} text="Paste it below" />
              </div>
            </div>

            <div>
              <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>
                Paste your API key
              </div>
              <input
                type="password"
                value={draft.auth.api_key || ''}
                onChange={(e) => update((d) => { d.auth.api_key = e.target.value; d.auth.validated = false; })}
                placeholder="sk-ant-api03-…"
                className="mono w-full bg-transparent outline-none text-sm px-3 py-2.5 rounded-lg transition-colors"
                style={{ color: 'var(--c-text)', border: '1px solid var(--c-border-dim)' }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
              />
            </div>
          </div>
        )}

        {/* Validation state */}
        {(draft.auth.validated || error) && (
          <div className="mt-4">
            {draft.auth.validated && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--c-green)' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-green)', boxShadow: '0 0 8px rgba(52,211,153,0.6)' }} />
                Credentials verified
              </div>
            )}
            {error && (
              <div className="text-sm" style={{ color: 'var(--c-red)' }}>{error}</div>
            )}
          </div>
        )}
      </div>

      {!hasToken && (
        <div className="mono text-[12px] px-4 py-2.5 rounded-lg" style={{
          color: 'var(--c-amber)',
          background: 'rgba(251,191,36,0.06)',
          border: '1px solid rgba(251,191,36,0.2)',
        }}>
          Paste your {draft.auth.mode === 'subscription' ? 'OAuth token' : 'API key'} above to continue
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={handleContinue}
          disabled={!hasToken || validating}
          className="px-5 py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
          style={{ color: 'var(--c-teal)', background: 'var(--c-teal-glow)', border: '1px solid rgba(45,212,191,0.3)' }}
        >
          {validating ? 'Validating…' : draft.auth.validated ? 'Continue →' : 'Validate & Continue →'}
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Identity ──────────────────────────────────────────

function StepIdentity({ draft, update, onBack, onNext }: {
  draft: SetupDraft;
  update: (fn: (d: SetupDraft) => void) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const required = {
    name: draft.identity.name.trim(),
    display_name: draft.identity.display_name.trim(),
    role: draft.identity.role.trim(),
    headline: draft.identity.headline.trim(),
    bio: draft.identity.bio.trim(),
    brand_tagline: draft.identity.brand_tagline.trim(),
  };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k.replace('_', ' '));
  const canAdvance = missing.length === 0;

  return (
    <div className="space-y-5">
      <div className="panel noise p-6 space-y-5">
        <div className="text-[12px] uppercase tracking-[0.12em] font-medium" style={{ color: 'var(--c-text-muted)' }}>
          About you
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <LabeledInput
            label="Full name *"
            value={draft.identity.name}
            onChange={(v) => update((d) => {
              d.identity.name = v;
              if (!d.identity.display_name) d.identity.display_name = v.split(' ')[0] || '';
            })}
            placeholder="Alex Johnson"
          />
          <LabeledInput
            label="Display name *"
            value={draft.identity.display_name}
            onChange={(v) => update((d) => { d.identity.display_name = v; })}
            placeholder="Alex"
          />
        </div>

        <LabeledInput
          label="Role *"
          value={draft.identity.role}
          onChange={(v) => update((d) => { d.identity.role = v; })}
          placeholder="Director of Engineering"
        />

        <LabeledInput
          label="Headline *"
          value={draft.identity.headline}
          onChange={(v) => update((d) => { d.identity.headline = v; })}
          placeholder="Director of Engineering | Building AI-Native Tools"
        />

        <LabeledInput
          label="Bio *"
          value={draft.identity.bio}
          onChange={(v) => update((d) => { d.identity.bio = v; })}
          placeholder="2–3 sentences about what you do"
          multiline
        />

        <LabeledInput
          label="Brand tagline *"
          value={draft.identity.brand_tagline}
          onChange={(v) => update((d) => { d.identity.brand_tagline = v; })}
          placeholder="The AI-Native Engineer"
          accent
        />
      </div>

      <div className="panel noise p-6 space-y-5">
        <div className="text-[12px] uppercase tracking-[0.12em] font-medium" style={{ color: 'var(--c-text-muted)' }}>
          Professional context <span className="normal-case tracking-normal text-[11px]" style={{ color: 'var(--c-border)' }}>· optional</span>
        </div>

        <LabeledInput
          label="Certifications"
          value={draft.identity.certifications}
          onChange={(v) => update((d) => { d.identity.certifications = v; })}
          placeholder="AWS SA, CKA, PMP"
        />

        <LabeledInput
          label="Conferences you mention"
          value={draft.identity.conference_mentions}
          onChange={(v) => update((d) => { d.identity.conference_mentions = v; })}
          placeholder="KubeCon, re:Invent, QCon"
        />

        <LabeledInput
          label="Experience hooks"
          value={draft.identity.experience_hooks}
          onChange={(v) => update((d) => { d.identity.experience_hooks = v; })}
          placeholder="Things that make you stand out"
          multiline
        />
      </div>

      {missing.length > 0 && (
        <div className="mono text-[12px] px-4 py-2.5 rounded-lg" style={{
          color: 'var(--c-amber)',
          background: 'rgba(251,191,36,0.06)',
          border: '1px solid rgba(251,191,36,0.2)',
        }}>
          Required: {missing.join(' · ')}
        </div>
      )}

      <StepNav onBack={onBack} onNext={onNext} nextDisabled={!canAdvance} />
    </div>
  );
}

// ── Step 3: Topics & Platforms ────────────────────────────────

function StepPlatforms({ draft, update, onBack, onNext }: {
  draft: SetupDraft;
  update: (fn: (d: SetupDraft) => void) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const togglePlatform = (id: string) => {
    update((d) => {
      const idx = d.platforms.findIndex((p) => p.platform === id);
      if (idx >= 0) {
        d.platforms.splice(idx, 1);
      } else {
        d.platforms.push({ platform: id, handle: '', enabled: true });
      }
    });
  };

  const setHandle = (id: string, handle: string) => {
    update((d) => {
      const p = d.platforms.find((x) => x.platform === id);
      if (p) p.handle = handle;
    });
  };

  const pillarList = draft.pillars.split(',').map((s) => s.trim()).filter(Boolean);
  const hasPillars = pillarList.length > 0;
  const hasPlatforms = draft.platforms.length > 0;
  const missingHandles = draft.platforms.filter((p) => !p.handle.trim()).length;
  const canAdvance = hasPillars && hasPlatforms && missingHandles === 0;

  const missingReasons: string[] = [];
  if (!hasPillars) missingReasons.push('add at least one topic');
  if (!hasPlatforms) missingReasons.push('select at least one platform');
  if (missingHandles > 0) missingReasons.push(`fill in ${missingHandles} handle${missingHandles > 1 ? 's' : ''}`);

  return (
    <div className="space-y-5">
      {/* Topics */}
      <div className="panel noise p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[12px] uppercase tracking-[0.12em] font-medium" style={{ color: 'var(--c-text-muted)' }}>
            Topics your twins should engage on
          </div>
          {pillarList.length > 0 && (
            <div className="mono text-[12px]" style={{ color: 'var(--c-teal-dim)' }}>
              {pillarList.length} pillar{pillarList.length > 1 ? 's' : ''}
            </div>
          )}
        </div>
        <input
          value={draft.pillars}
          onChange={(e) => update((d) => { d.pillars = e.target.value; })}
          placeholder="DevOps, AI Engineering, Engineering Leadership"
          className="w-full bg-transparent outline-none text-base px-3 py-2.5 rounded-lg transition-colors"
          style={{ color: 'var(--c-text)', border: '1px solid var(--c-border-dim)' }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
        />
        {pillarList.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {pillarList.map((p, i) => (
              <span
                key={i}
                className="mono text-[12px] px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(45,212,191,0.06)', color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)' }}
              >
                {p}
              </span>
            ))}
          </div>
        ) : (
          <div className="mono text-[12px] mt-2" style={{ color: 'var(--c-text-muted)' }}>
            Comma-separated. These become your content pillars.
          </div>
        )}
      </div>

      {/* Platforms — toggleable cards with inline handle inputs */}
      <div className="panel noise p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[12px] uppercase tracking-[0.12em] font-medium" style={{ color: 'var(--c-text-muted)' }}>
            Platforms
          </div>
          <div className="mono text-[12px]" style={{ color: draft.platforms.length > 0 ? 'var(--c-teal-dim)' : 'var(--c-text-muted)' }}>
            {draft.platforms.length} selected
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PLATFORMS.map((p) => {
            const selectedEntry = draft.platforms.find((x) => x.platform === p.id);
            const selected = !!selectedEntry;
            const needsHandle = selected && !selectedEntry?.handle.trim();
            return (
              <div
                key={p.id}
                className="rounded-lg transition-all duration-200 overflow-hidden"
                style={{
                  background: selected ? 'var(--c-panel)' : 'transparent',
                  border: `1px solid ${selected ? p.color : 'var(--c-border-dim)'}`,
                  boxShadow: selected ? `0 0 20px ${p.color}15` : undefined,
                }}
              >
                <button
                  onClick={() => togglePlatform(p.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: p.color, boxShadow: selected ? `0 0 10px ${p.color}80` : undefined }}
                    />
                    <span className="text-sm font-semibold" style={{ color: selected ? 'var(--c-text)' : 'var(--c-text-dim)' }}>
                      {p.label}
                    </span>
                  </div>
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold"
                    style={{
                      background: selected ? p.color : 'transparent',
                      color: selected ? 'var(--c-void)' : 'var(--c-text-muted)',
                      border: `1px solid ${selected ? p.color : 'var(--c-border-dim)'}`,
                    }}
                  >
                    {selected ? '✓' : ''}
                  </span>
                </button>
                {selected && (
                  <div className="px-4 pb-4 pt-1" style={{ borderTop: '1px solid var(--c-border-dim)' }}>
                    <div className="text-[11px] uppercase tracking-wider font-medium mt-3 mb-1.5" style={{ color: 'var(--c-text-muted)' }}>
                      Handle
                    </div>
                    <input
                      value={selectedEntry!.handle}
                      onChange={(e) => setHandle(p.id, e.target.value)}
                      placeholder={p.hint}
                      className="mono w-full bg-transparent outline-none text-sm px-3 py-2 rounded-lg transition-colors"
                      style={{
                        color: 'var(--c-text)',
                        border: `1px solid ${needsHandle ? 'rgba(251,191,36,0.3)' : 'var(--c-border-dim)'}`,
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = p.color}
                      onBlur={(e) => e.currentTarget.style.borderColor = needsHandle ? 'rgba(251,191,36,0.3)' : 'var(--c-border-dim)'}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Validation hint */}
      {!canAdvance && missingReasons.length > 0 && (
        <div className="mono text-[12px] px-4 py-2.5 rounded-lg" style={{
          color: 'var(--c-amber)',
          background: 'rgba(251,191,36,0.06)',
          border: '1px solid rgba(251,191,36,0.2)',
        }}>
          Before continuing: {missingReasons.join(' · ')}
        </div>
      )}

      <StepNav onBack={onBack} onNext={onNext} nextDisabled={!canAdvance} />
    </div>
  );
}

// ── Step 4: Voice & Schedule ──────────────────────────────────

function StepVoice({ draft, update, onBack, onNext }: {
  draft: SetupDraft;
  update: (fn: (d: SetupDraft) => void) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="panel noise p-6 space-y-5">
        <div className="text-[12px] uppercase tracking-[0.12em] font-medium" style={{ color: 'var(--c-text-muted)' }}>
          Voice
        </div>
        <div>
          <div className="text-sm mb-3" style={{ color: 'var(--c-text-dim)' }}>How should your twins sound?</div>
          <div className="flex gap-2">
            {([
              { id: 'casual',       label: 'Casual',       sub: '"tbh", contractions, texting a friend' },
              { id: 'balanced',     label: 'Balanced',     sub: 'conversational but polished' },
              { id: 'professional', label: 'Professional', sub: 'clean, structured, LinkedIn-style' },
            ] as const).map((v) => {
              const isActive = draft.voice === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => update((d) => { d.voice = v.id; })}
                  className="flex-1 px-4 py-3 rounded-lg text-left transition-all"
                  style={{
                    background: isActive ? 'var(--c-panel)' : 'transparent',
                    border: `1px solid ${isActive ? 'var(--c-teal-dim)' : 'var(--c-border-dim)'}`,
                  }}
                >
                  <div className="text-sm font-semibold mb-0.5" style={{ color: isActive ? 'var(--c-text)' : 'var(--c-text-dim)' }}>
                    {v.label}
                  </div>
                  <div className="mono text-[11px]" style={{ color: 'var(--c-text-muted)' }}>{v.sub}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="panel noise p-6 space-y-5">
        <div className="text-[12px] uppercase tracking-[0.12em] font-medium" style={{ color: 'var(--c-text-muted)' }}>
          Schedule
        </div>

        <LabeledInput
          label="Timezone"
          value={draft.timezone}
          onChange={(v) => update((d) => { d.timezone = v; })}
          placeholder="Europe/Kyiv"
        />

        <div>
          <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>
            Active window
          </div>
          <div className="flex items-center gap-3">
            <HourInput value={draft.active_hours.start} onChange={(v) => update((d) => { d.active_hours.start = v; })} />
            <span className="mono text-base" style={{ color: 'var(--c-text-muted)' }}>→</span>
            <HourInput value={draft.active_hours.end} onChange={(v) => update((d) => { d.active_hours.end = v; })} />
            <span className="mono text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
              · {draft.active_hours.end - draft.active_hours.start} hours/day
            </span>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.pipeline_enabled}
            onChange={(e) => update((d) => { d.pipeline_enabled = e.target.checked; })}
            className="w-4 h-4 accent-teal-400"
          />
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>Enable content pipeline</div>
            <div className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>
              Generates daily articles and briefs
            </div>
          </div>
        </label>
      </div>

      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

// ── Step 5: Review ────────────────────────────────────────────

function StepReview({ draft, onBack }: {
  draft: SetupDraft;
  onBack: () => void;
}) {
  const { mutate: submitSetup, loading: submitting, error: submitError } = useMutation<unknown, { ok: boolean; regenerated?: number }>('/api/setup', 'POST');
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setServerError(null);
    const pillarList = draft.pillars.split(',').map((s) => s.trim()).filter(Boolean);
    const payload = {
      auth: {
        mode: draft.auth.mode,
        claude_token: draft.auth.claude_token,
        api_key: draft.auth.api_key,
      },
      name: draft.identity.name,
      display_name: draft.identity.display_name,
      role: draft.identity.role,
      headline: draft.identity.headline,
      bio: draft.identity.bio,
      brand_tagline: draft.identity.brand_tagline,
      certifications: draft.identity.certifications.split(',').map((s) => s.trim()).filter(Boolean),
      conference_mentions: draft.identity.conference_mentions.split(',').map((s) => s.trim()).filter(Boolean),
      experience_hooks: draft.identity.experience_hooks.split(',').map((s) => s.trim()).filter(Boolean),
      pillars: pillarList,
      platforms: draft.platforms.map((p) => ({ platform: p.platform, handle: p.handle })),
      voice: { formality: draft.voice },
      timezone: draft.timezone,
      active_hours: draft.active_hours,
      pipeline_enabled: draft.pipeline_enabled,
    };

    const result = await submitSetup(payload);
    if (result?.ok) {
      setDone(true);
      // Full page reload, not SPA nav — we need App.tsx to refetch /api/setup/status
      // otherwise the cached "configured: false" bounces us back to /setup
      setTimeout(() => { window.location.href = '/'; }, 1500);
    } else {
      setServerError(submitError || 'Setup failed. Check your inputs.');
    }
  };

  if (done) {
    return (
      <div className="panel noise py-16 px-8 text-center animate-fade-up">
        <div className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center text-3xl"
          style={{
            background: 'rgba(52,211,153,0.15)',
            border: '2px solid rgba(52,211,153,0.5)',
            boxShadow: '0 0 40px rgba(52,211,153,0.25)',
          }}>
          ✓
        </div>
        <div className="text-2xl font-bold mb-2" style={{ color: 'var(--c-green)' }}>Setup complete</div>
        <div className="text-sm mb-1" style={{ color: 'var(--c-text-dim)' }}>
          Your config has been saved and agent files generated.
        </div>
        <div className="mono text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
          Opening dashboard…
        </div>
      </div>
    );
  }

  const pillarList = draft.pillars.split(',').map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="text-center">
        <div className="text-lg font-semibold mb-1" style={{ color: 'var(--c-text)' }}>Ready to generate</div>
        <div className="mono text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
          Review your setup below. Clicking Complete will write the config and generate all agent files.
        </div>
      </div>

      {/* Identity summary */}
      <div className="panel noise p-6">
        <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-4" style={{ color: 'var(--c-text-muted)' }}>
          Identity
        </div>
        <div className="text-xl font-semibold mb-1" style={{ color: 'var(--c-text)' }}>{draft.identity.name}</div>
        <div className="mono text-sm mb-3" style={{ color: 'var(--c-text-muted)' }}>{draft.identity.role}</div>
        <div className="text-base italic" style={{ color: 'var(--c-teal)' }}>"{draft.identity.brand_tagline}"</div>
        <div className="mt-3 pt-3 text-sm leading-relaxed" style={{ borderTop: '1px solid var(--c-border-dim)', color: 'var(--c-text-dim)' }}>
          {draft.identity.bio}
        </div>
      </div>

      {/* Topics */}
      <div className="panel noise p-6">
        <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-3" style={{ color: 'var(--c-text-muted)' }}>
          Topics · {pillarList.length} pillar{pillarList.length !== 1 ? 's' : ''}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pillarList.map((p, i) => (
            <span
              key={i}
              className="mono text-[13px] px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(45,212,191,0.08)', color: 'var(--c-teal-dim)', border: '1px solid rgba(45,212,191,0.2)' }}
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* Platforms preview */}
      <div className="panel noise p-6">
        <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-4" style={{ color: 'var(--c-text-muted)' }}>
          Platforms · {draft.platforms.length}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {draft.platforms.map((p) => {
            const meta = PLATFORMS.find((x) => x.id === p.platform);
            return (
              <div
                key={p.platform}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--c-border-dim)' }}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: meta?.color || '#888', boxShadow: `0 0 8px ${meta?.color || '#888'}60` }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{meta?.label}</div>
                  <div className="mono text-[12px] truncate" style={{ color: 'var(--c-text-muted)' }}>@{p.handle}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Voice & Schedule */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="panel noise p-5">
          <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>Voice</div>
          <div className="text-lg font-semibold capitalize" style={{ color: 'var(--c-text)' }}>{draft.voice}</div>
        </div>
        <div className="panel noise p-5">
          <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>Active window</div>
          <div className="mono text-lg font-semibold tabular-nums" style={{ color: 'var(--c-text)' }}>
            {String(draft.active_hours.start).padStart(2, '0')}:00 → {String(draft.active_hours.end).padStart(2, '0')}:00
          </div>
          <div className="mono text-[12px] mt-1" style={{ color: 'var(--c-text-muted)' }}>{draft.timezone}</div>
        </div>
        <div className="panel noise p-5">
          <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>Pipeline</div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{
              background: draft.pipeline_enabled ? 'var(--c-green)' : 'var(--c-text-muted)',
              boxShadow: draft.pipeline_enabled ? '0 0 8px rgba(52,211,153,0.5)' : undefined,
            }} />
            <div className="text-lg font-semibold" style={{
              color: draft.pipeline_enabled ? 'var(--c-green)' : 'var(--c-text-muted)',
            }}>
              {draft.pipeline_enabled ? 'Enabled' : 'Disabled'}
            </div>
          </div>
        </div>
      </div>

      {serverError && (
        <div className="mono text-[12px] px-4 py-3 rounded-lg" style={{ color: 'var(--c-red)', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          onClick={onBack}
          disabled={submitting}
          className="px-4 py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
          style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)', background: 'transparent' }}
        >
          ← Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-60"
          style={{
            color: 'var(--c-teal)',
            background: 'var(--c-teal-glow)',
            border: '1px solid rgba(45,212,191,0.4)',
            boxShadow: '0 0 24px rgba(45,212,191,0.15)',
          }}
        >
          {submitting ? (
            <>
              <span className="inline-block w-3 h-3 rounded-full animate-pulse" style={{ background: 'var(--c-teal)' }} />
              Generating agent files…
            </>
          ) : (
            <>✓ Complete Setup</>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────

function PrereqRow({ label, ok, install }: { label: string; ok: boolean; install: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-2 h-2 rounded-full" style={{
          background: ok ? 'var(--c-green)' : 'var(--c-red)',
          boxShadow: ok ? '0 0 8px rgba(52,211,153,0.5)' : undefined,
        }} />
        <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{label}</span>
      </div>
      {ok ? (
        <span className="mono text-[12px]" style={{ color: 'var(--c-green)' }}>installed</span>
      ) : (
        <CopyableCmd cmd={install} />
      )}
    </div>
  );
}

function TokenStep({ num, text, children }: { num: number; text?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mono shrink-0 mt-0.5"
        style={{ background: 'rgba(45,212,191,0.15)', color: 'var(--c-teal)', border: '1px solid rgba(45,212,191,0.3)' }}
      >
        {num}
      </div>
      <div className="text-sm leading-relaxed" style={{ color: 'var(--c-text-dim)' }}>
        {text || children}
      </div>
    </div>
  );
}

function CopyableCmd({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="mono text-[12px] px-2.5 py-1 rounded transition-all"
      style={{ color: 'var(--c-amber)', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}
    >
      {copied ? 'copied ✓' : cmd}
    </button>
  );
}

function LabeledInput({ label, value, onChange, placeholder, multiline, accent }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>{label}</div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full bg-transparent outline-none resize-y rounded-lg px-3 py-2.5 text-sm transition-colors leading-relaxed"
          style={{ color: 'var(--c-text)', border: '1px solid var(--c-border-dim)' }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent outline-none rounded-lg px-3 py-2.5 text-base transition-colors"
          style={{
            color: accent ? 'var(--c-teal)' : 'var(--c-text)',
            border: '1px solid var(--c-border-dim)',
            fontWeight: accent ? 500 : 400,
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
        />
      )}
    </div>
  );
}

function HourInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        min={0}
        max={23}
        onChange={(e) => onChange(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
        className="mono text-xl font-semibold tabular-nums w-16 bg-transparent outline-none text-center rounded-lg px-2 py-1.5 transition-colors"
        style={{ color: 'var(--c-text)', border: '1px solid var(--c-border-dim)' }}
        onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
        onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
      />
      <span className="mono text-sm" style={{ color: 'var(--c-text-muted)' }}>:00</span>
    </div>
  );
}

function StepNav({ onBack, onNext, nextDisabled, nextLabel = 'Continue' }: {
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      {onBack ? (
        <button
          onClick={onBack}
          className="px-4 py-2.5 rounded-lg font-medium text-sm transition-all"
          style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)', background: 'transparent' }}
        >
          ← Back
        </button>
      ) : <div />}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="px-5 py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
        style={{ color: 'var(--c-teal)', background: 'var(--c-teal-glow)', border: '1px solid rgba(45,212,191,0.3)' }}
      >
        {nextLabel} →
      </button>
    </div>
  );
}
