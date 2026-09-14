import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EnginePicker } from './EnginePicker';
import {
  api,
  type DocInfo,
  type EngineInfo,
  type HandshakeState,
  type Job,
  type KopengPlan,
  type Project,
  type Readiness,
  channelOf,
  type Channel,
  type VersionInfo,
} from './api';
import { DocBadges, DocDrawer, StatusBadge } from './DocDrawer';

// Show the final two path segments on the card; retain the full path in its tooltip.
function shortPath(p: string) {
  const parts = p.split('/').filter(Boolean);
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p;
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const update = useUpdate();

  const refresh = () =>
    api
      .listProjects()
      .then((r) => setProjects(r.projects))
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  // `/?project=<id>&doc=<rel>` opens straight onto a document — the menu bar
  // app links here. Read once, when the list first arrives.
  const linked = useRef(new URLSearchParams(location.search).get('project'));
  useEffect(() => {
    if (!linked.current || projects.length === 0) return;
    const p = projects.find((x) => String(x.id) === linked.current);
    linked.current = null;
    if (p) setSelected(p);
  }, [projects]);
  useEffect(() => {
    if (linked.current) return;
    const url = selected ? `/?project=${selected.id}` : '/';
    if (location.pathname + location.search !== url) history.replaceState(null, '', url);
  }, [selected]);

  const live = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  const unarchive = (p: Project) =>
    api
      .archiveProject(p.id, false)
      .then(refresh)
      .catch((e) => setError(e.message));

  // Use a separate keyboard-accessible card target to avoid nesting the Unarchive button.
  const projectCard = (p: Project) => (
    <div
      key={p.id}
      className="kx-card"
      role="button"
      tabIndex={0}
      onClick={() => setSelected(p)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') setSelected(p);
      }}
    >
      <span className="kx-card-head">
        {p.code && <span className="kx-card-code mono">{p.code}</span>}
        <span className="kx-card-name">{p.name}</span>
        {p.archived === 1 && (
          <button
            className="btn btn-link-success kx-card-action"
            onClick={(e) => {
              e.stopPropagation();
              void unarchive(p);
            }}
          >
            Unarchive
          </button>
        )}
      </span>
      <span className="kx-card-path mono" title={p.repo_path}>
        {shortPath(p.repo_path)}
      </span>
      {p.docCounts && (
        <span
          className={`kx-card-counts mono${
            p.docCounts.total > 0 && p.docCounts.settled === p.docCounts.total ? ' done' : ''
          }`}
        >
          {p.docCounts.settled}/{p.docCounts.total} documents settled
        </span>
      )}
    </div>
  );

  return (
    <div className="kx-shell">
      <header className="kx-header">
        {/* Two drawings, not one recoloured: the light mark is outlines, the
            dark one is solid. CSS shows the one the panel's theme calls for. */}
        <img className="kx-logo kx-logo-light" src="/kortext-logo-light.svg" alt="Kortext" />
        <img className="kx-logo kx-logo-dark" src="/kortext-logo-dark.svg" alt="" aria-hidden />
        <EngineBadge />
        <span className="kx-doc-spacer" />
        <ThemeSwitch />
      </header>
      {error && <div className="kx-error">{error}</div>}
      {selected ? (
        <ProjectScreen
          key={selected.id}
          project={selected}
          strip={
            <>
              <UpdateStrip {...update} />
              <CompanionStrip quiet={!!update.target} />
            </>
          }
          onBack={() => {
            setSelected(null);
            refresh();
          }}
        />
      ) : (
        <main className="kx-main">
          <div className="kx-main-head">
            <h1>Projects</h1>
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              Add project
            </button>
          </div>
          <UpdateStrip {...update} />
          <CompanionStrip quiet={!!update.target} />
          {projects.length === 0 && !adding && (
            <>
              <div className="kx-empty">
                No projects yet. Add one to start — a brief template is scaffolded into the repo,
                and your own coding agent takes it from there.
              </div>
            </>
          )}
          {adding && (
            <AddProject
              onDone={(project) => {
                setAdding(false);
                refresh();
                setSelected(project);
              }}
              onCancel={() => setAdding(false)}
            />
          )}
          <div className="kx-grid">{live.map(projectCard)}</div>
          {archived.length > 0 && (
            <details className="kx-doc-details kx-archive">
              <summary className="kx-doc-group">
                Archived
                <span className="kx-doc-count mono">{archived.length}</span>
              </summary>
              <div className="kx-grid">{archived.map(projectCard)}</div>
            </details>
          )}
          {!adding && <Siblings />}
        </main>
      )}

      {/* A status bar, not a page footer: two lines under one name — what is true
          right now, and the way to say that it is not. The credit sits opposite,
          so nothing in this column reads as branding. */}
      <footer className="kx-statusbar">
        <span className="kx-statusbar-lines">
          <span className="kx-statusbar-line">
            <ServerStatus {...update} />
          </span>
          <span className="kx-statusbar-line">
            <OtherChannel {...update} />
            <ReportIssue />
            <span className="kx-danger-sep">·</span>
            <SupportWork />
          </span>
        </span>
        <span className="kx-doc-spacer" />
        {/* The credit belongs on the first line, level with the name opposite it.
            Giving it the second row it does not use keeps both columns the same
            height, so centring lands it there whatever the gap or type size. */}
        <span className="kx-statusbar-lines">
          <span className="kx-statusbar-line">
            <MadeBy />
          </span>
          <span className="kx-statusbar-line" aria-hidden="true" />
        </span>
      </footer>
    </div>
  );
}

// The menu bar app, offered in the update strip's slot on a Mac that has no
// copy of it talking to this server. Quiet colours — an offer, not a warning —
// and a × that keeps it away; it also goes on its own once the app is heard.
// One strip at a time: while an update is on offer, this one waits its turn.
// Both screens carry it, in the update strip's slot.
function CompanionStrip({ quiet }: { quiet: boolean }) {
  const [companion, setCompanion] = useState(true);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('kx-companion') === 'hidden';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!navigator.platform.startsWith('Mac') || hidden) return;
    const look = () =>
      api.health().then(
        (h) => setCompanion(h.companion),
        () => {},
      );
    look();
    const timer = setInterval(look, 30_000);
    return () => clearInterval(timer);
  }, [hidden]);
  if (quiet || companion || hidden) return null;
  const dismiss = () => {
    try {
      localStorage.setItem('kx-companion', 'hidden');
    } catch {
      /* private mode */
    }
    setHidden(true);
  };
  return (
    <div className="kx-update kx-companion">
      <span>Kortext can live in your menu bar — a notification when a document waits on you.</span>
      <span className="kx-companion-actions">
        <a
          className="btn btn-primary"
          href="https://github.com/erayendes/kortext/releases/latest/download/Kortext.zip"
          target="_blank"
          rel="noreferrer"
        >
          Download for macOS
        </a>
        <button className="kx-companion-close" onClick={dismiss} aria-label="Not now">
          ×
        </button>
      </span>
    </div>
  );
}

// Confirm shutdown in place because some embedded browsers suppress native dialogs.
function ServerStatus({ info, note, checkNow }: ReturnType<typeof useUpdate>) {
  const [phase, setPhase] = useState<'up' | 'arming' | 'down'>('up');
  const [err, setErr] = useState('');

  // Keep polling after disconnects so an open panel recovers when the server restarts.
  useEffect(() => {
    const timer = setInterval(() => {
      api.health().then(
        () => setPhase((p) => (p === 'down' ? 'up' : p)),
        () => setPhase('down'),
      );
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (phase !== 'arming') return;
    const timer = setTimeout(() => setPhase('up'), 4000);
    return () => clearTimeout(timer);
  }, [phase]);

  const down = phase === 'down';
  const stop = () => {
    if (phase === 'up') {
      setErr('');
      setPhase('arming');
      return;
    }
    api
      .quit()
      .then(() => setPhase('down'))
      .catch((e) => {
        setErr((e as Error).message);
        setPhase('up');
      });
  };

  // Show text only for confirmation, errors and disconnection; the dot indicates normal status.
  const warning = err || (phase === 'arming' ? 'click again to stop' : '');

  return (
    <>
      {info && (
        <button
          className="kx-statusbar-link kx-version-btn"
          onClick={checkNow}
          title="Check for updates"
        >
          <ChannelMark beta={channelOf(info.current) === 'beta'} />
          {channelOf(info.current) === 'beta' ? 'Beta version' : 'Stable version'}{' '}
          <span className="kx-version mono">{pretty(info.current)}</span>
        </button>
      )}
      {note && <span className="kx-status-note">· {note}</span>}
      {
        <button
          className={`kx-power kx-power-${phase}`}
          onClick={stop}
          disabled={down}
          title={
            down
              ? 'Stopped'
              : phase === 'arming'
                ? 'Click again to stop the server'
                : 'Stop the server'
          }
          aria-label="Stop the server"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="M8 1.8v5.4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M4.6 3.9a5 5 0 106.8 0"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      }
      {down ? (
        <span className="kx-status-warn">
          stopped — type <CopyCommand command="kortext" /> in your terminal to start it again
        </span>
      ) : (
        warning && <span className="kx-status-warn">{warning}</span>
      )}
    </>
  );
}

// Keep the command visible if clipboard access is denied.
function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="kx-copy-cmd mono"
      title="Copy"
      onClick={() => {
        void navigator.clipboard
          .writeText(command)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
    >
      {command}
      {copied && <span className="kx-copy-cmd-hint">✓</span>}
    </button>
  );
}

// `3.2.0-beta.3` reads as `3.2-beta3`, `3.2.0` as `3.2`, `3.1.2` stays — the same short form as the app.
export function pretty(v: string) {
  const [core, pre] = v.split('-');
  const short = core.replace(/\.0$/, '');
  return pre ? `${short}-${pre.replace('.', '')}` : short;
}

function ChannelMark({ beta }: { beta: boolean }) {
  return beta ? (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none">
      <path
        d="M4.6 1.5h2.8M5 1.5v3.2L2.3 9.3a1 1 0 00.9 1.5h5.6a1 1 0 00.9-1.5L7 4.7V1.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none">
      <circle cx="6" cy="6" r="4.8" stroke="currentColor" strokeWidth="1" />
      <path
        d="M6 3.4v5M4 6.6 6 8.4l2-1.8"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The channel not running here — a press installs it, and the strip takes it from there.
function OtherChannel({ info, run }: ReturnType<typeof useUpdate>) {
  if (!info) return null;
  const beta = channelOf(info.current) === 'beta';
  const other = beta ? info.latest : info.beta;
  if (!other) return null; // no beta out right now
  return (
    <>
      <button
        className="kx-statusbar-link kx-version-btn"
        onClick={() => run(beta ? 'latest' : 'beta', other)}
        title={beta ? 'Back to the stable version' : 'Install the beta'}
      >
        <ChannelMark beta={!beta} />
        {beta ? 'Use stable version' : 'Try beta version'}{' '}
        <span className="kx-version mono">{pretty(other)}</span>
      </button>
      <span className="kx-danger-sep">·</span>
    </>
  );
}

// Prefill the GitHub bug-report template with the running version.
function ReportIssue() {
  const [version, setVersion] = useState('');
  useEffect(() => {
    api
      .health()
      .then((h) => setVersion(h.version))
      .catch(() => {});
  }, []);

  const href =
    'https://github.com/erayendes/kortext/issues/new?template=bug_report.yml' +
    (version ? `&version=${encodeURIComponent(version)}` : '');

  return (
    <a
      className="kx-statusbar-link kx-report"
      href={href}
      target="_blank"
      rel="noreferrer"
      title="Open a bug report on GitHub"
    >
      <BugMark />
      Something wrong? Report an issue
    </a>
  );
}

function SupportWork() {
  return (
    <a
      className="kx-statusbar-link kx-support"
      href="https://buymeacoffee.com/erayendes"
      target="_blank"
      rel="noreferrer"
      title="Support Kortext"
    >
      <HandHeart />
      Like it? Support Kortext
    </a>
  );
}

function BugMark() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none">
      <ellipse cx="6" cy="7" rx="2.6" ry="3.2" stroke="currentColor" strokeWidth="1" />
      <path
        d="M6 3.8V3M4.6 2.2 6 3.4l1.4-1.2"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M3.4 5.2 1.7 4.4M3.2 7.3H1.4M3.4 9.2l-1.6.9M8.6 5.2l1.7-.8M8.8 7.3h1.8M8.6 9.2l1.6.9"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

// No theme attribute means auto; explicit light/dark choices override the OS and are persisted.
type ThemeChoice = 'auto' | 'light' | 'dark';

function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    try {
      const v = localStorage.getItem('kx-theme');
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch {
      return 'auto';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (choice === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    try {
      if (choice === 'auto') localStorage.removeItem('kx-theme');
      else localStorage.setItem('kx-theme', choice);
    } catch {
      /* private mode — the choice lasts the session */
    }
  }, [choice]);
  // Cycle auto, light and dark; the icon displays the current setting.
  const next: Record<ThemeChoice, ThemeChoice> = { auto: 'light', light: 'dark', dark: 'auto' };
  return (
    <button
      className="kx-theme"
      onClick={() => setChoice(next[choice])}
      title={`Theme: ${choice}`}
      aria-label={`Theme: ${choice}`}
    >
      <ThemeIcon choice={choice} />
    </button>
  );
}

// Product links and descriptions. An absent URL marks an unreleased tool.
// Use short descriptions in the popover and full descriptions on cards.
const SIBLINGS: {
  name: string;
  short: string;
  what: string;
  url?: string;
}[] = [
  {
    name: 'Heimdall',
    short: 'App Store Connect MCP',
    what: "MCP server for the Apple App Store Connect API and App Store Server API (StoreKit 2). 890 tools across 13 profiles, generated from Apple's OpenAPI spec, plus one-call macros for worldwide pricing, submission readiness and metadata diffs, and confirm-before-write safety. Works with any MCP client.",
    url: 'https://github.com/erayendes/app-store-connect-mcp',
  },
  {
    name: 'Mogut',
    short: 'App Store Growth MCP',
    what: 'Read-only MCP server for Apple App Store ASO and growth intelligence: keyword research, competitor analysis, review mining, pricing, localization, and reports. Local-first, and compatible with Claude, Codex, Cursor, and any MCP client.',
  },
  {
    name: 'Kopeng',
    short: 'Local kanban for AI-driven development',
    what: "Local kanban task tracking for AI-driven development. At a glance: what's done, what awaits approval, what's in flight, what's next. No ceremonies, just status.",
  },
  {
    name: 'Oduncu',
    short: 'Silent-executor skill for coding agents',
    what: 'Silent-executor skill for coding agents. Give it a task, it says "yaparım...", works, says "tamam." Nothing in between — no explanation, no summary, no progress notes. One SKILL.md for Claude Code, Codex, Cursor, Gemini and the Agent Skills standard.',
    url: 'https://github.com/erayendes/oduncu',
  },
  {
    name: 'Mimir',
    short: 'AI usage tracker',
    what: 'AI tool usage limits tracker for your macOS menu bar — Claude, Codex & Antigravity.',
    url: 'https://github.com/erayendes/mimir',
  },
  {
    name: 'themeSwitcher',
    short: 'Light/dark/auto theme switcher',
    what: 'A lightweight, framework-agnostic light/dark/auto theme switcher component for any web project.',
    url: 'https://github.com/erayendes/themeSwitcher',
  },
];

// Show product cards on the project list and a shared, dismissible carousel on project screens.
function SiblingsSlider() {
  const [hidden, setHidden] = useState(() => siblingsHidden());
  const [arming, setArming] = useState(false);
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState(false);

  // Pause automatic transitions while the pointer is over the carousel.
  useEffect(() => {
    if (hidden || held) return;
    const timer = setInterval(() => setAt((i) => (i + 1) % SIBLINGS.length), 7000);
    return () => clearInterval(timer);
  }, [hidden, held]);

  useEffect(() => {
    if (!arming) return;
    const timer = setTimeout(() => setArming(false), 4000);
    return () => clearTimeout(timer);
  }, [arming]);

  if (hidden) return null;
  const s = SIBLINGS[at];
  const body = (
    <>
      <span className="kx-slide-name">{s.name}</span>
      <span className="kx-slide-what">{s.short}</span>
      <span className="kx-doc-spacer" />
      {s.url ? (
        <span className="kx-sib-goes">
          <GitHubMark />
        </span>
      ) : (
        <span className="kx-sib-soon">in development</span>
      )}
    </>
  );

  return (
    <div
      className="kx-slider"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
    >
      {s.url ? (
        <a className="kx-slide" key={s.name} href={s.url} target="_blank" rel="noreferrer">
          {body}
        </a>
      ) : (
        <span className="kx-slide" key={s.name}>
          {body}
        </span>
      )}
      <span className="kx-slide-dots">
        {SIBLINGS.map((o, i) => (
          <button
            key={o.name}
            className={i === at ? 'kx-slide-dot kx-slide-dot-on' : 'kx-slide-dot'}
            title={o.name}
            aria-label={o.name}
            onClick={() => setAt(i)}
          />
        ))}
      </span>
      {arming && <span className="kx-field-err">Hide this for good? Click again.</span>}
      <button
        className={arming ? 'kx-siblings-close kx-siblings-close-armed' : 'kx-siblings-close'}
        title={arming ? 'Click again to hide it for good' : 'Hide this'}
        aria-label="Hide this"
        onClick={() => {
          if (!arming) {
            setArming(true);
            return;
          }
          setHidden(true);
          hideSiblings();
        }}
      >
        <CloseMark />
      </button>
    </div>
  );
}

// Persist dismissal across both layouts; require confirmation because the panel has no undo action.
function siblingsHidden(): boolean {
  try {
    return localStorage.getItem('kx-siblings') === 'hidden';
  } catch {
    return false;
  }
}
function hideSiblings(): void {
  try {
    localStorage.setItem('kx-siblings', 'hidden');
  } catch {
    /* private mode — it stays hidden for this session */
  }
}

function CloseMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function Siblings() {
  const [hidden, setHidden] = useState(() => siblingsHidden());
  const [arming, setArming] = useState(false);

  useEffect(() => {
    if (!arming) return;
    const timer = setTimeout(() => setArming(false), 4000);
    return () => clearTimeout(timer);
  }, [arming]);

  if (hidden) return null;

  const hide = () => {
    if (!arming) {
      setArming(true);
      return;
    }
    setHidden(true);
    hideSiblings();
  };

  return (
    <div className="kx-siblings">
      <div className="kx-siblings-head">
        Also from Milowda
        <span className="kx-doc-spacer" />
        {arming && <span className="kx-field-err">Hide this for good? Click again.</span>}
        <button
          className={arming ? 'kx-siblings-close kx-siblings-close-armed' : 'kx-siblings-close'}
          title={arming ? 'Click again to hide it for good' : 'Hide this'}
          aria-label="Hide this"
          onClick={hide}
        >
          <CloseMark />
        </button>
      </div>
      <div className="kx-grid">
        {SIBLINGS.map((s) => {
          const body = (
            <>
              <span className="kx-sib-name">{s.name}</span>
              <span className="kx-sib-what">{s.what}</span>
              <span className="kx-sib-foot">
                <span className="kx-sib-tag">
                  <Licence />
                  MIT · free
                </span>

                {s.url ? (
                  <span className="kx-sib-goes">
                    <GitHubMark />
                  </span>
                ) : (
                  <span className="kx-sib-soon">in development</span>
                )}
              </span>
            </>
          );
          return s.url ? (
            <a className="kx-sib-card" key={s.name} href={s.url} target="_blank" rel="noreferrer">
              {body}
            </a>
          ) : (
            <div className="kx-sib-card" key={s.name}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Display product links in a popover opened from the credit button.
function MadeBy() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <span className="kx-made-by" ref={box}>
      {/* The whole credit is the target, not the word `milowda` alone: at 11px
          a single word is a hard hit, and the heart and the city read as part
          of the same thing anyway. */}
      <button className="kx-made-trigger" onClick={() => setOpen(!open)}>
        milowda <Heart /> istanbul
      </button>
      {open && (
        <div className="kx-made-pop">
          <div className="kx-made-pop-head">Also from Milowda</div>
          {SIBLINGS.map((s) =>
            s.url ? (
              <a
                className="kx-made-pop-row"
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noreferrer"
              >
                <span className="kx-made-pop-name">{s.name}</span>
                <span className="kx-made-pop-what">{s.short}</span>
              </a>
            ) : (
              <span className="kx-made-pop-row" key={s.name}>
                <span className="kx-made-pop-name">{s.name}</span>
                <span className="kx-made-pop-what">{s.short}</span>
                <span className="kx-sib-soon">soon</span>
              </span>
            ),
          )}
          <a
            className="kx-made-pop-link"
            href="https://milowda.com"
            target="_blank"
            rel="noreferrer"
          >
            milowda.com
          </a>
        </div>
      )}
    </span>
  );
}

// GitHub's own mark, for the cards whose link lands in a repository.
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

// lucide scale (ISC) — the balance GitHub puts next to a licence.
function Licence() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v18" />
      <path d="m19 8 3 8a5 5 0 0 1-6 0zV7" />
      <path d="M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1" />
      <path d="m5 8 3 8a5 5 0 0 1-6 0zV7" />
      <path d="M7 21h10" />
    </svg>
  );
}

// lucide heart (ISC), drawn as lucide draws it: an outline in the text colour.
function Heart() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="loves"
    >
      <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
    </svg>
  );
}

// lucide hand-heart (ISC), drawn like the heart above: an outline in the text colour.
function HandHeart() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16" />
      <path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" />
      <path d="m2 15 6 6" />
      <path d="M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z" />
    </svg>
  );
}

// Lucide 1.41.0 eclipse, sun and moon icons (ISC); paths are unmodified.
function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  const box = {
    viewBox: '0 0 24 24',
    width: 18,
    height: 18,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (choice === 'dark') {
    return (
      <svg {...box}>
        <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
      </svg>
    );
  }
  if (choice === 'light') {
    return (
      <svg {...box}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
    );
  }
  return (
    <svg {...box}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a7 7 0 1 0 10 10" />
    </svg>
  );
}

// Show a global warning only when no CLI is available; engine selection is per project.
function EngineBadge() {
  const [engines, setEngines] = useState<EngineInfo[]>([]);

  useEffect(() => {
    api
      .engines()
      .then((r) => setEngines(r.engines))
      .catch(() => {}); // no server, no warning to show
  }, []);

  if (engines.length === 0 || engines.some((e) => e.available)) return null;
  return (
    <span className="kx-engine-warn">
      No agent CLI found — required to produce documents. Install one:{' '}
      <code className="mono">{engines[0]?.installHint ?? ''}</code>
    </span>
  );
}

// One check for the whole panel — once on open, then hourly, so a release lands
// on a panel left open — and the install's outcome, which both screens show.
// The check follows the running channel; a press on the other channel installs it.
function useUpdate() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [target, setTarget] = useState<string | null>(null); // what the strip offers or installs
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'quit'>('idle');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const idle = useRef(true); // the hourly check must not retarget an install in flight
  idle.current = state === 'idle';

  const check = (fresh = false) =>
    api
      .version(fresh)
      .then((v) => {
        setInfo(v);
        if (idle.current) setTarget(v.stale ? v[channelOf(v.current)] : null);
        return v;
      })
      .catch(() => null); // no server, no strip
  useEffect(() => {
    void check();
    const t = setInterval(check, 60 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkNow = () => {
    setNote('checking…');
    void check(true).then((v) => {
      setNote(v ? (v.stale ? '' : 'up to date') : 'could not reach npm');
      setTimeout(() => setNote(''), 3000);
    });
  };
  const run = (tag?: Channel, version?: string) => {
    if (version) setTarget(version);
    setErr('');
    setState('running');
    api
      .selfUpdate(tag)
      .then(() => setState('done'))
      .catch((e) => {
        setErr((e as Error).message);
        setState('idle');
      });
  };
  const quit = () => {
    api
      .quit()
      .then(() => setState('quit'))
      .catch((e) => setErr((e as Error).message));
  };
  return { info, target, state, err, note, checkNow, run, quit };
}

// Under the heading of either screen, only when a managed install has a newer version.
function UpdateStrip({ target: latest, state, err, run, quit }: ReturnType<typeof useUpdate>) {
  if (!latest) return null;
  if (state === 'quit') {
    return (
      <div className="kx-update">
        <span>
          Kortext stopped. Start it again — <code className="mono">kortext</code> — and{' '}
          {pretty(latest)} takes over.
        </span>
      </div>
    );
  }
  if (state === 'done') {
    return (
      <div className="kx-update">
        <span>
          Updated to {pretty(latest)}. This one still runs the old version — quit and start again.
        </span>
        <button className="btn btn-primary" onClick={quit}>
          Quit
        </button>
        {err && <span className="kx-update-err">{err}</span>}
      </div>
    );
  }
  return (
    <div className="kx-update">
      <span>Version {pretty(latest)} is out.</span>
      <button className="btn btn-primary" disabled={state === 'running'} onClick={() => run()}>
        {state === 'running' ? 'Updating…' : 'Update now'}
      </button>
      {err && (
        <span className="kx-update-err">
          {err} — install it yourself: <code className="mono">npm install -g kortext</code>
        </span>
      )}
    </div>
  );
}

// Transfer = split into .kopeng/ files; the plan gets a summary + approve /
// revise round — the last act of the handshake.
function TransferPanel({ project }: { project: Project }) {
  const [plan, setPlan] = useState<KopengPlan | null>(null);
  const [splitting, setSplitting] = useState(false);
  // A stopped plan revision leaves the previous files intact; show its pending work instead of ready.
  const [stopped, setStopped] = useState(false);
  const [reviseText, setReviseText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () =>
      Promise.all([api.kopengPlan(project.id), api.jobs(project.id)])
        .then(([p, j]) => {
          setPlan(p);
          setSplitting(j.jobs.some((jb) => jb.doc_rel === '.kopeng/' && jb.status === 'running'));
          setStopped(j.jobs.find((jb) => jb.doc_rel === '.kopeng/')?.status === 'stopped');
          // The last split decides: a failed one is shown even when an older
          // project.yaml still stands, or "Plan ready" hides the failure.
          const last = j.jobs.find((jb) => jb.doc_rel === '.kopeng/');
          setErr(last?.status === 'failed' ? last.error : null);
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [project.id]);

  const transfer = (notes?: string[]) =>
    api
      .transfer(project.id, notes)
      .then(() => setSplitting(true))
      .catch((e) => setErr(e.message));

  if (splitting) {
    return (
      <div className="kx-handshake-kopeng">
        <span className="kx-running">Splitting the work into tasks… (writing .kopeng/)</span>
      </div>
    );
  }

  if (plan?.exists) {
    // Approvable only when the last split landed and left tasks; the button
    // that lets you approve an empty or failed plan is worse than no button.
    const approvable = !err && plan.tasks > 0;
    return (
      <div className="kx-handshake-plan">
        {err && <div className="kx-error">The last split failed: {err}</div>}
        <div className="kx-plan-row">
          <span className="kx-cmd-title">
            {approvable ? 'Plan ready' : 'Plan incomplete'}: {plan.versions} version · {plan.epics}{' '}
            epic · {plan.tasks} task
          </span>
          <span
            className={`kx-status kx-status-${plan.status === 'approved' ? 'approved' : 'draft'}`}
          >
            {plan.status ?? 'draft'}
          </span>
          <span className="kx-doc-spacer" />
          {plan.status !== 'approved' && (
            <button
              className="btn btn-success"
              disabled={!approvable}
              title={
                approvable
                  ? undefined
                  : 'Re-split the plan first — it has no tasks or the split failed'
              }
              onClick={() =>
                api
                  .approvePlan(project.id)
                  .then(() => setPlan({ ...plan, status: 'approved' }))
                  .catch((e) => setErr((e as Error).message))
              }
            >
              Approve plan
            </button>
          )}
        </div>
        {plan.status === 'approved' ? (
          <span className="kx-cmd-hint">
            Tasks live under .kopeng/ — open your Kopeng board; your agent pulls work from there.
          </span>
        ) : (
          <div className="kx-note-input">
            {stopped && !!project.paused && (
              <span className="kx-cmd-hint">
                A re-split was stopped by the pause — Continue picks it up with your notes.
              </span>
            )}
            <input
              className="kx-input"
              placeholder="Revision note… (re-splits the plan with your notes)"
              value={reviseText}
              onChange={(e) => setReviseText(e.target.value)}
            />
            <button
              className="btn btn-secondary"
              disabled={!reviseText.trim()}
              onClick={() => {
                transfer([reviseText.trim()]);
                setReviseText('');
              }}
            >
              Revise plan
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="kx-handshake-kopeng">
      <button className="btn btn-primary" onClick={() => transfer()}>
        Transfer to Kopeng
      </button>
      <span className="kx-cmd-hint">
        Splits the work into tasks (Version → Epic → Task) and writes the files Kopeng reads under
        .kopeng/.
      </span>
      {err && <span className="kx-doc-fail">{err}</span>}
    </div>
  );
}

// Provide an English example brief; the document language can be selected independently.
const BRIEF_EXAMPLE = `# Acme CRM

## Product Vision & Goals

A CRM for small sales teams: a card per customer, the meeting notes attached to it, and a
reminder for the next step. Today the team keeps customers in a shared spreadsheet and loses
the context between meetings — this puts the last conversation next to the customer, so
nobody walks into a call blind.

## Target Audience & Personas

Sales teams of 5-20 people, non-technical. The team lead creates the workspace and invites
the others; everyone else only ever sees their own customers.

## Interface Language

English only in v1. A second language is a later decision, not v1 scope.

## Key Performance Indicators (KPIs)

Meeting notes written per active user per week; the share of customers carrying a note from
the last 30 days; weekly active users per team.

## Future Scope & Out of Scope

No billing, no phone integration, no mobile app. The MVP customer list caps at 8 items per
view. Nothing is shared between teams.`;

function Field({
  err,
  className,
  children,
}: {
  err?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={className ? `kx-field ${className}` : 'kx-field'}>
      {children}
      {err && <span className="kx-field-err">{err}</span>}
    </span>
  );
}

/** The engine line as a control: `codex · default · high ›` opens the picker. */
function EngineButton({
  engines,
  engine,
  model,
  effort,
  onOpen,
}: {
  engines: EngineInfo[];
  engine: string | null;
  model: string;
  effort: string;
  onOpen: () => void;
}) {
  if (engines.length === 0) return null;
  return (
    <button
      className="btn btn-link-primary kx-engine-btn mono"
      onClick={onOpen}
      title="The CLI that writes this project's documents, its model and effort — press to change"
    >
      {engineLine(engines, engine, model, effort)}
      <span aria-hidden="true">›</span>
    </button>
  );
}

/** `codex · default · high` — model and effort both named; unset ones read as
 * the CLI's own default, the effort by the level its spec marks as such. */
function engineLine(engines: EngineInfo[], engine: string | null, model: string, effort: string) {
  const spec = engines.find((e) => e.id === engine) ?? engines[0];
  const defaultEffort = spec?.efforts?.find((lvl) => /CLI default/.test(spec.about?.[lvl] ?? ''));
  return [spec?.id, model || 'default', effort || defaultEffort || 'default'].join(' · ');
}

function AddProject({
  onDone,
  onCancel,
}: {
  onDone: (project: Project, hadBrief: boolean) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<'new' | 'existing'>('new');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [docLang, setDocLang] = useState('');
  const [brief, setBrief] = useState('');
  const [briefMode, setBriefMode] = useState<'write' | 'upload'>('write');
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Validate all local fields together; display server-only conflicts on the matching field.
  const [fieldErrs, setFieldErrs] = useState<{ name?: string; code?: string; repoPath?: string }>(
    {},
  );
  // Use the only installed CLI by default; otherwise let the user choose per project.
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [engine, setEngine] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    api
      .engines()
      .then(({ engines, selected }) => {
        const usable = engines.filter((e) => e.available);
        setEngines(usable);
        setEngine(selected ?? (usable.length === 1 ? usable[0].id : null));
      })
      .catch(() => {});
  }, []);

  const browse = async () => {
    const { path } = await api.pickDirectory();
    if (path) setRepoPath(path); // picked folder IS the project root
  };

  const uploadBrief = (file: File | undefined) => {
    if (!file) return;
    file.text().then((text) => {
      setBrief(text);
      setUploadName(file.name);
    });
  };

  const check = () => {
    const found: { name?: string; code?: string; repoPath?: string } = {};
    if (name.trim().length < 3) found.name = 'At least 3 characters.';
    if (!/^[A-Z]{2,8}$/.test(code.trim())) found.code = '2–8 letters, no digits.';
    // Require an absolute path because relative paths resolve against the server working directory.
    if (!repoPath.trim()) found.repoPath = 'Pick the project folder.';
    else if (!/^(\/|~\/|[A-Za-z]:[\\/])/.test(repoPath.trim())) {
      found.repoPath = 'Give the full path — Browse fills it in.';
    }
    return found;
  };

  const submit = async () => {
    setErr(null);
    const found = check();
    setFieldErrs(found);
    if (Object.keys(found).length > 0) return;
    try {
      const { project } = await api.createProject({
        engine: engine ?? undefined,
        model: model || undefined,
        effort: effort || undefined,
        name,
        repoPath,
        kind,
        code: code || undefined,
        brief: brief || undefined,
        docLang: docLang || undefined,
      });
      onDone(project, brief.trim().length > 0);
    } catch (e) {
      // Associate server validation errors with their fields where possible.
      const message = (e as Error).message;
      if (/^The code /.test(message)) setFieldErrs({ code: message });
      else if (/^This folder /.test(message)) setFieldErrs({ repoPath: message });
      else setErr(message);
    }
  };

  return (
    <div className="kx-form">
      <div className="kx-form-row">
        <button
          className={`btn ${kind === 'new' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setKind('new')}
        >
          New project
        </button>
        <button
          className={`btn ${kind === 'existing' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setKind('existing')}
        >
          Existing project
        </button>
      </div>
      <span className="kx-cmd-hint">
        {kind === 'new'
          ? 'Greenfield product: the engine runs the new-project-analysis workflow.'
          : 'Existing codebase: the engine documents the current state via existing-project-analysis.'}
      </span>
      <div className="kx-form-row">
        <Field err={fieldErrs.name}>
          <input
            className={fieldErrs.name ? 'kx-input kx-input-bad' : 'kx-input'}
            placeholder="Project name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setFieldErrs((f) => ({ ...f, name: undefined }));
            }}
          />
        </Field>
        <Field err={fieldErrs.code} className="kx-code-field">
          <input
            className={`kx-input mono kx-code-input${fieldErrs.code ? ' kx-input-bad' : ''}`}
            placeholder="Code (ACME)"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setFieldErrs((f) => ({ ...f, code: undefined }));
            }}
          />
        </Field>
      </div>
      <div className="kx-form-row">
        <Field err={fieldErrs.repoPath}>
          <input
            className={`kx-input mono${fieldErrs.repoPath ? ' kx-input-bad' : ''}`}
            placeholder="Project folder (pick with Browse)"
            value={repoPath}
            onChange={(e) => {
              setRepoPath(e.target.value);
              setFieldErrs((f) => ({ ...f, repoPath: undefined }));
            }}
          />
        </Field>
        <button className="btn btn-secondary" onClick={browse}>
          Browse…
        </button>
      </div>
      <div className="kx-form-row">
        <input
          className="kx-input kx-path"
          placeholder={
            kind === 'existing'
              ? 'Documents language — e.g. Türkçe (there is no brief to take it from)'
              : 'Documents language (optional) — leave empty to follow the brief'
          }
          value={docLang}
          onChange={(e) => setDocLang(e.target.value)}
        />
      </div>
      {kind === 'existing' && (
        <span className="kx-cmd-hint">
          No brief for an existing project — the code itself is the evidence. Nothing runs until you
          press Start.
        </span>
      )}
      {kind === 'new' && (
        <div className="kx-brief">
          <div className="kx-brief-head">
            <span className="kx-cmd-title">Brief</span>
            <span className="kx-doc-spacer" />
            <button
              className="btn btn-link-primary"
              title="Download a filled-in example BRIEF.md"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([BRIEF_EXAMPLE], { type: 'text/markdown' }),
                );
                const a = document.createElement('a');
                a.href = url;
                a.download = 'BRIEF.md';
                a.click();
                URL.revokeObjectURL(url);
                setBriefMode('upload'); // download → edit → bring it back here
              }}
            >
              Example ↓
            </button>

            <span className="seg">
              <button
                className={briefMode === 'write' ? 'on' : ''}
                onClick={() => setBriefMode('write')}
              >
                Write
              </button>
              <button
                className={briefMode === 'upload' ? 'on' : ''}
                onClick={() => setBriefMode('upload')}
              >
                Upload
              </button>
            </span>
          </div>
          {briefMode === 'write' && (
            <>
              <textarea
                className="kx-editor kx-brief-text"
                placeholder={[
                  'Write the brief in any language — the documents come back in the language you use here.',
                  '',
                  'The analysis cannot start until it answers five things:',
                  '• what you are building, and why it should exist',
                  '• who it is for',
                  '• which language the product speaks to its users, and the default if there is more than one',
                  '• how you will know it worked',
                  '• what is deliberately out of scope',
                  '',
                  'Leave it empty to fill in and approve later from Documents.',
                ].join('\n')}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
            </>
          )}
          {briefMode === 'upload' && (
            <label className="kx-drop">
              <input
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                onChange={(e) => uploadBrief(e.target.files?.[0])}
              />
              {uploadName ? (
                <span>
                  <strong>{uploadName}</strong> loaded ({brief.length} chars) — click again to
                  replace, or edit in the Write tab.
                </span>
              ) : (
                <span>Click to pick your .md / .txt brief file</span>
              )}
            </label>
          )}
          <span className="kx-cmd-hint">
            The brief lands as yours, approved — nothing is read until you press Start. If the check
            then finds it too thin, it comes back to you with the questions it needs answered.
          </span>
        </div>
      )}
      {engines.length === 0 && (
        <span className="kx-cmd-hint">
          No agent CLI found on your PATH. Install one — claude, codex, antigravity, gemini or
          another the dropdown knows — and pick it here; the project can be added now and started
          later.
        </span>
      )}
      <EnginePicker
        open={picking}
        onClose={() => setPicking(false)}
        projectId={null}
        engines={engines}
        engine={engine ?? engines[0]?.id ?? ''}
        model={model}
        effort={effort}
        onEngine={(id, m, lvl) => {
          setEngine(id);
          setModel(m);
          setEffort(lvl);
        }}
        onModel={setModel}
        onEffort={setEffort}
        onError={setErr}
      />
      <div className="kx-form-row kx-form-foot">
        <EngineButton
          engines={engines}
          engine={engine}
          model={model}
          effort={effort}
          onOpen={() => setPicking(true)}
        />
        <button className="btn btn-primary" onClick={submit}>
          Initialize
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        {err && <span className="kx-field-err">{err}</span>}
      </div>
    </div>
  );
}

// Show the handover commands when the analysis is complete.
function ProjectScreen({
  project,
  strip,
  onBack,
}: {
  project: Project;
  strip: ReactNode;
  onBack: () => void;
}) {
  const [paused, setPaused] = useState(!!project.paused);
  const [status, setStatus] = useState('');
  const [hasJobs, setHasJobs] = useState(true); // pessimistic until the first poll
  const [pending, setPending] = useState(true); // any document still unwritten
  const [settled, setSettled] = useState(false); // every document approved — the handshake
  const [checking, setChecking] = useState(false); // the gate is reading the brief
  const [err, setErr] = useState<string | null>(null);
  // Use in-place confirmation because embedded browsers may suppress native confirm dialogs.
  const [arming, setArming] = useState<'restart' | 'archive' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  // An engine change applies to subsequent steps; active steps keep their current CLI.
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [engine, setEngine] = useState<string | null>(project.engine || null);
  const [model, setModel] = useState(project.model ?? '');
  const [effort, setEffort] = useState(project.effort ?? '');
  // The engine line beside the action says what runs; pressing it opens the picker.
  const [picking, setPicking] = useState(false);
  // ⚙ beside the name opens the project's own actions under the head; Esc closes.
  const [tools, setTools] = useState(false);
  useEffect(() => {
    if (!tools) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTools(false);
        setArming(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tools]);

  useEffect(() => {
    api
      .engines()
      .then(({ engines, selected }) => {
        const usable = engines.filter((e) => e.available);
        setEngines(usable);
        setEngine((current) => current ?? selected ?? usable[0]?.id ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!arming) return;
    const t = setTimeout(() => setArming(null), 5000);
    return () => clearTimeout(t);
  }, [arming]);

  // Reading the brief is work in flight too — the gate holds the chain open.
  const running = status.length > 0 || checking;

  const start = () => {
    if (paused) return togglePause(); // unpausing kicks the chain
    // Re-enter an idle chain to retry readiness and schedule unlocked steps.
    // Display errors such as a missing CLI rather than silently ignoring the request.
    api.runNext(project.id).catch((e) => setErr((e as Error).message));
  };

  // Between Continue and the first poll that sees a step running, the button
  // still reads Continue — and a second press would pause again. Hold it until
  // the running state has moved, one way or the other.
  const [settling, setSettling] = useState(false);
  useEffect(() => setSettling(false), [running]);
  const togglePause = () => {
    setSettling(true);
    return api
      .pauseProject(project.id, !paused)
      .then((r) => setPaused(r.paused))
      .catch((e) => {
        setErr(e.message);
        setSettling(false);
      });
  };

  const doRestart = () => {
    setArming(null);
    setBusy(true);
    api
      .restartProject(project.id)
      .then(() => setPaused(true)) // restart lands ready — Start begins it
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  };

  const doArchive = () => {
    setArming(null);
    setBusy(true);
    api
      .archiveProject(project.id, !project.archived)
      .then(onBack)
      .catch((e) => {
        setErr(e.message);
        setBusy(false);
      });
  };

  const doCancel = () => {
    setArming(null);
    setBusy(true);
    api
      .cancelProject(project.id)
      .then(onBack)
      .catch((e) => {
        setErr(e.message);
        setBusy(false);
      });
  };

  return (
    <main className="kx-main">
      <div className="kx-main-nav">
        <button className="btn btn-link-primary" onClick={onBack}>
          ← Projects
        </button>
        {running ? (
          <span className="kx-nav-status kx-running">{status || 'Reading the brief…'}</span>
        ) : paused && hasJobs ? (
          <span className="kx-nav-status">
            ⏸ Paused — running steps were stopped; nothing new starts.
          </span>
        ) : pending ? (
          <span className="kx-nav-status">
            {hasJobs
              ? 'Stopped — press Continue to pick it up.'
              : 'Ready — press Start to begin the analysis.'}
          </span>
        ) : null}
      </div>
      <div className="kx-main-head">
        <div className="kx-main-title">
          <div className="kx-card-head">
            {project.code && <span className="kx-card-code mono">{project.code}</span>}
            <h1>{project.name}</h1>
            <button
              className={tools ? 'kx-gear kx-gear-on' : 'kx-gear'}
              onClick={() => {
                setTools((t) => !t);
                setArming(null);
              }}
              title="Restart, archive or remove this project"
              aria-label="Project actions"
              aria-expanded={tools}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
          <span className="kx-card-path mono" title={project.repo_path}>
            {shortPath(project.repo_path)}
          </span>
        </div>
        {/* After the handshake kortext has retired; the engine and its controls go with it. */}
        {!settled && (
          <div className="kx-proj-side">
            <div className="kx-proj-actions">
              <EngineButton
                engines={engines}
                engine={engine}
                model={model}
                effort={effort}
                onOpen={() => setPicking(true)}
              />
              {running ? (
                <button
                  className="btn btn-primary"
                  disabled={busy || settling}
                  onClick={togglePause}
                >
                  ⏸ Pause
                </button>
              ) : (
                // Offer Start when the chain is idle, even if the project is already unpaused.
                pending && (
                  <button className="btn btn-primary" disabled={busy || settling} onClick={start}>
                    {settling ? '…' : hasJobs ? '▶ Continue' : '▶ Start'}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
      {/* Under the head, the full width, while ⚙ is on: the project's own actions. */}
      {tools && (
        <div className="kx-danger-zone">
          {arming === 'restart' ? (
            <>
              <span className="kx-arm-warn">
                Reset the analysis documents? Your brief stays. Press Start when ready.
              </span>
              <button className="btn btn-link-warning" disabled={busy} onClick={doRestart}>
                Yes, restart
              </button>
              <button className="btn btn-link-primary" onClick={() => setArming(null)}>
                No
              </button>
            </>
          ) : arming === 'archive' ? (
            <>
              <span className="kx-arm-warn">
                {project.archived
                  ? 'Bring it back into the project list?'
                  : 'Fold it away? The repo and its documents are untouched.'}
              </span>
              <button className="btn btn-link-success" disabled={busy} onClick={doArchive}>
                {project.archived ? 'Yes, unarchive' : 'Yes, archive'}
              </button>
              <button className="btn btn-link-primary" onClick={() => setArming(null)}>
                No
              </button>
            </>
          ) : arming === 'cancel' ? (
            <>
              <span className="kx-arm-warn">
                Remove Kortext's analysis, including the brief and edits in .kortext/, its contract
                entries, logs and project registration? The rest of the project stays.
              </span>
              <button className="btn btn-link-danger" disabled={busy} onClick={doCancel}>
                Yes, remove
              </button>
              <button className="btn btn-link-primary" onClick={() => setArming(null)}>
                No
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-link-warning"
                disabled={busy}
                onClick={() => setArming('restart')}
              >
                Restart analysis
              </button>
              <span className="kx-danger-sep">·</span>
              <button
                className="btn btn-link-success"
                disabled={busy}
                onClick={() => setArming('archive')}
              >
                {project.archived ? 'Unarchive project' : 'Archive project'}
              </button>
              <span className="kx-danger-sep">·</span>
              <button
                className="btn btn-link-danger"
                disabled={busy}
                onClick={() => setArming('cancel')}
              >
                Remove project
              </button>
            </>
          )}
        </div>
      )}
      {strip}
      {err && <div className="kx-error">{err}</div>}
      <EnginePicker
        open={picking}
        onClose={() => setPicking(false)}
        projectId={project.id}
        engines={engines}
        engine={engine ?? engines[0]?.id ?? ''}
        model={model}
        effort={effort}
        onEngine={(id, m, lvl) => {
          setEngine(id);
          setModel(m);
          setEffort(lvl);
        }}
        onModel={setModel}
        onEffort={setEffort}
        onError={setErr}
      />
      <DocumentsTab
        project={project}
        paused={paused}
        onStatus={setStatus}
        onHasJobs={setHasJobs}
        onPending={setPending}
        onChecking={setChecking}
        onSettled={setSettled}
        onPaused={setPaused}
      />
    </main>
  );
}

function HandshakeCard({ project }: { project: Project }) {
  const [state, setState] = useState<HandshakeState | null>(null);

  useEffect(() => {
    const refresh = () =>
      api
        .handshake(project.id)
        .then(setState)
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [project.id]);

  if (!state?.analysisComplete) return null;

  const instructions = [
    {
      title: 'Analyze and start building',
      command: 'Read AGENTS.md and the .kortext/ guideline docs, then start building.',
    },
    {
      title: 'Split into tasks first',
      command: 'Read AGENTS.md, break the work into tasks first and show me the list.',
    },
    {
      title: 'Start with a specific task',
      command: 'Read AGENTS.md, then start with: <describe the task here>',
    },
  ];

  return (
    <div className="kx-handshake">
      <div className="kx-handshake-head">
        <span className="kx-handshake-title">✓ Analysis complete — handshake done</span>
        <span className="kx-cmd-hint">
          Kortext's job is done; the documents are now the project's sacred guideline. From here on
          it's between you and your client.
        </span>
        {/* A handover, not a warning: the items were deferred to the phase that
            can finally decide them, and nothing here asks prime to do it now. */}
        <span className="kx-handshake-count mono">
          {state.documents} documents
          {state.handedOver > 0 && ` · ${state.handedOver} items handed to the build phase`}
        </span>
      </div>
      {/* Kopeng is not released, so nothing advertises it: whoever has the
          binary sees the transfer panel, everyone else sees nothing rather
          than an install command that 404s. */}
      {state.kopengInstalled && <TransferPanel project={project} />}
      <div className="kx-handshake-cards">
        <span className="kx-cmd-hint">
          Click a card — the command is copied to your clipboard; paste it into your client (CLI or
          app).
        </span>
        {instructions.map((c) => (
          <CommandCard key={c.title} title={c.title} command={c.command} />
        ))}
      </div>
    </div>
  );
}

function DocumentsTab({
  project,
  paused,
  onStatus,
  onHasJobs,
  onPending,
  onChecking,
  onSettled,
  onPaused,
}: {
  project: Project;
  paused?: boolean;
  onStatus?: (text: string) => void;
  onHasJobs?: (has: boolean) => void;
  onPending?: (pending: boolean) => void;
  onChecking?: (checking: boolean) => void;
  onSettled?: (settled: boolean) => void;
  onPaused?: (paused: boolean) => void;
}) {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<DocInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gate, setGate] = useState<{ readiness: Readiness | null; checking: boolean }>({
    readiness: null,
    checking: false,
  });
  // Clear active-work indicators when disconnected; cached state cannot confirm a running step.
  const [offline, setOffline] = useState(false);

  // Keep the current project ID outside request closures to reject responses for a previous project.
  const showing = useRef(project.id);
  useEffect(() => {
    showing.current = project.id;
  });

  const refresh = () => {
    // Which project this asked about. A slow answer for the project you just
    // left must not paint its documents onto the one you opened.
    const asked = project.id;
    return Promise.all([api.listDocs(asked), api.jobs(asked), api.readiness(asked)])
      .then(([d, j, g]) => {
        if (asked !== showing.current) return;
        setDocs(d.docs);
        setOpen((current) =>
          current ? (d.docs.find((doc) => doc.rel === current.rel) ?? null) : null,
        );
        setJobs(j.jobs);
        onPaused?.(j.paused);
        setGate(g);
        onChecking?.(g.checking);
        setOffline(false);
        setErr(null);
      })
      .catch((e) => {
        if (asked !== showing.current) return;
        setOffline(true);
        setErr(
          `${e.message} — the panel has lost the Kortext server; this page may be out of date.`,
        );
      });
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const linkedDoc = useRef(new URLSearchParams(location.search).get('doc'));
  useEffect(() => {
    if (!linkedDoc.current || docs.length === 0) return;
    const d = docs.find((x) => x.rel === linkedDoc.current);
    linkedDoc.current = null;
    if (d) setOpen(d);
  }, [docs]);

  const retry = (doc: DocInfo) =>
    api
      .retryDoc(project.id, doc.rel)
      .then(refresh)
      .catch((e) => setErr(e.message));

  // Latest job per doc decides the row extras (spinner / red error).
  const jobFor = (rel: string) => jobs.find((j) => j.doc_rel === rel);

  // The running-status line lives in the nav row next to ← Projects; the
  // Start/Continue label needs to know whether anything ever ran.
  const running = offline ? [] : jobs.filter((j) => j.status === 'running');
  useEffect(() => {
    onStatus?.(running.length > 0 ? `${running.map((j) => j.doc_rel).join(' · ')} writing…` : '');
    onHasJobs?.(jobs.length > 0);
    onPending?.(docs.some((d) => d.status === 'uninitialized'));
    onSettled?.(
      docs.length > 0 &&
        docs.every((d) => d.status === 'approved' || d.status === 'not-applicable'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    running.map((j) => j.id).join(','),
    jobs.length,
    docs.map((d) => d.status).join(','),
    offline,
  ]);

  // Group by required action; completed and not-applicable groups are collapsed initially.
  // Where each document belongs is decided by the server, which can see the
  // queued rechecks and whether a run carried revision notes.
  const groups: { key: DocInfo['section']; title: string; closed?: boolean }[] = [
    { key: 'needs', title: 'Action needed' },
    { key: 'doing', title: 'Doing' },
    { key: 'todo', title: 'To do' },
    { key: 'done', title: 'Done', closed: true },
  ];
  // Keep dependency order while work is live and alphabetic order once it is not.
  const sortFor = (key: string, items: DocInfo[]) =>
    key === 'done' ? [...items].sort((a, b) => a.name.localeCompare(b.name)) : items;

  return (
    <div className="kx-docs">
      <HandshakeCard project={project} />
      <ReadinessCard
        gate={gate}
        // An existing project has no brief to open — the evidence is its code.
        onOpenBrief={(() => {
          const brief = docs.find((d) => d.rel === 'BRIEF.md');
          return brief ? () => setOpen(brief) : null;
        })()}
        onRecheck={() =>
          // run-next re-enters the chain, which re-runs the gate; a 409 just
          // means there was nothing to start, and the refresh shows the verdict.
          api
            .runNext(project.id)
            .catch(() => {})
            .then(refresh)
        }
      />
      {err && <div className="kx-error">{err}</div>}
      {groups.map((g) => {
        const items = sortFor(
          g.key,
          docs.filter((d) => d.section === g.key),
        );
        if (items.length === 0) return null;
        return (
          <details key={g.key} className="kx-doc-details" open={!g.closed}>
            <summary className="kx-doc-group">
              {g.title}
              <span className="kx-doc-count mono">{items.length}</span>
            </summary>
            {items.map((d) => {
              const job = jobFor(d.rel);
              const failed = d.state === 'failed';
              return (
                // Use separate keyboard-accessible targets for the row and Retry; do not nest buttons.
                <div
                  key={d.rel}
                  className={`kx-doc-row${failed ? ' failed' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpen(d)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      setOpen(d);
                    }
                  }}
                >
                  <span className="kx-doc-name">{d.name}</span>
                  {d.author && (
                    <span className="kx-doc-author mono">{d.author.replace(/^\+/, '')}</span>
                  )}
                  {/* The reason, in the row: a Retry the server refused writes a
                      new failed job, and a tooltip alone hides that anything happened. */}
                  {failed && job?.error && (
                    <span className="kx-doc-why mono" title={job.error}>
                      {job.error}
                    </span>
                  )}
                  <span className="kx-doc-spacer" />
                  {failed && (
                    <button
                      className="btn btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        void retry(d);
                      }}
                    >
                      Retry
                    </button>
                  )}
                  <DocBadges doc={d} />
                  <span title={failed ? (job?.error ?? '') : ''}>
                    <StatusBadge doc={d} />
                  </span>
                </div>
              );
            })}
          </details>
        );
      })}
      {/* The other tools, after the work — the way the project list carries them under the projects. */}
      <SiblingsSlider />
      <DocDrawer
        project={project}
        doc={open}
        docs={docs}
        failedError={
          open && jobFor(open.rel)?.status === 'failed'
            ? (jobFor(open.rel)?.error ?? 'no reason recorded')
            : null
        }
        onRetry={() => {
          if (open) void retry(open);
        }}
        onClose={() => setOpen(null)}
        onChanged={refresh}
      />
    </div>
  );
}

// Display readiness questions when insufficient evidence blocks analysis.
function ReadinessCard({
  gate,
  onOpenBrief,
  onRecheck,
}: {
  gate: { readiness: Readiness | null; checking: boolean };
  onOpenBrief: (() => void) | null;
  onRecheck: () => Promise<unknown>;
}) {
  const [rechecking, setRechecking] = useState(false);
  const recheck = () => {
    setRechecking(true);
    void onRecheck().finally(() => setTimeout(() => setRechecking(false), 1200));
  };
  if (gate.checking) {
    return (
      <div className="kx-gate">
        <h3>Reading the brief…</h3>
        <p>Checking whether it says enough to analyse. Nothing is being written yet.</p>
      </div>
    );
  }
  const r = gate.readiness;
  if (!r || r.ready || r.questions.length === 0) return null;
  const title = {
    error: 'The check did not finish',
    'no-engine': 'No agent CLI found',
    floor: 'Not enough to start',
    judgment: 'Not enough to start',
  }[r.stage];
  const lead = {
    error: 'Nothing was written.',
    'no-engine': 'Nothing can run until one is installed.',
    floor: 'There is not enough here to analyse, so no document was written.',
    judgment: 'There is not enough here to analyse, so no document was written.',
  }[r.stage];
  return (
    <div className="kx-gate">
      <h3>{title}</h3>
      <p>{lead}</p>
      <ul className="kx-gate-questions">
        {r.questions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      {onOpenBrief && r.stage !== 'no-engine' ? (
        <button className="btn btn-primary" onClick={onOpenBrief}>
          Open the brief
        </button>
      ) : (
        // For existing projects or missing CLIs, retry after the external issue is resolved.
        // Show feedback even when the verdict is unchanged.
        <button className="btn btn-primary" disabled={rechecking} onClick={recheck}>
          {rechecking ? 'Checking…' : 'Check again'}
        </button>
      )}
    </div>
  );
}

// Fall back to select-and-copy when the Clipboard API is unavailable in an embedded browser.
function copyText(text: string) {
  return navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  });
}

function CommandCard({ title, command }: { title: string; command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`kx-cmd-card${copied ? ' copied' : ''}`}
      onClick={() => {
        copyText(command).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <div className="kx-cmd-head">
        <span className="kx-cmd-title">{title}</span>
        <span className="kx-cmd-copy">{copied ? '✓ Copied' : 'Copy'}</span>
      </div>
      <code className="kx-cmd mono">{command}</code>
    </button>
  );
}
