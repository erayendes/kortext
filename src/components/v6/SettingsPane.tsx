/**
 * SettingsPane — the settings-page shell + the small primitives every settings
 * screen composes from. Maps 1:1 to the `.set-*` markup in
 * wireframe-v6-hifi.html (Project info / Integrations / Environments / …).
 *
 * The owning routes (S5) import {@link SettingsPane} plus {@link SetCard},
 * {@link SetRow}, {@link Switch}, {@link Chip} and {@link SetSelect}.
 */
import type { ReactNode } from 'react';

export type SettingsPaneProps = {
  title: string;
  subtitle?: ReactNode;
  /** Wider max-width (1040px) for matrix-style screens like Environments. */
  wide?: boolean;
  children: ReactNode;
};

export function SettingsPane({ title, subtitle, wide, children }: SettingsPaneProps) {
  return (
    <div className="set-wrap">
      <div className={`set-inner${wide ? ' wide' : ''}`}>
        <div className="set-title">{title}</div>
        {subtitle !== undefined && <div className="set-sub">{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}

/** A section label above a card (e.g. "General", or "Danger zone"). */
export function SetSection({
  children,
  danger,
}: {
  children: ReactNode;
  danger?: boolean;
}) {
  return <div className={`set-sec${danger ? ' danger' : ''}`}>{children}</div>;
}

/** A bordered card grouping rows. */
export function SetCard({
  children,
  danger,
}: {
  children: ReactNode;
  danger?: boolean;
}) {
  return <div className={`set-card${danger ? ' danger' : ''}`}>{children}</div>;
}

/** A label / description on the left, a control on the right. */
export function SetRow({
  label,
  desc,
  right,
  children,
}: {
  label?: ReactNode;
  desc?: ReactNode;
  /** Right-aligned control. Alias for `children` for call-site readability. */
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="set-row">
      <div className="set-rl">
        {label !== undefined && <div className="set-lbl">{label}</div>}
        {desc !== undefined && <div className="set-desc">{desc}</div>}
      </div>
      {right ?? children}
    </div>
  );
}

/** iOS-style on/off toggle. */
export function Switch({ on, onToggle }: { on: boolean; onToggle?: () => void }) {
  return (
    <div
      className={`switch${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle?.();
        }
      }}
    />
  );
}

/** Pill toggle (platforms, options). `static` chips are display-only. */
export function Chip({
  on,
  onClick,
  children,
  staticChip,
}: {
  on?: boolean;
  onClick?: () => void;
  children: ReactNode;
  staticChip?: boolean;
}) {
  return (
    <span
      className={`chip${on ? ' on' : ''}${staticChip ? ' static' : ''}`}
      onClick={staticChip ? undefined : onClick}
    >
      {children}
    </span>
  );
}

export type SetSelectOption = { value: string; label?: string };

/** Styled native <select> (`.set-select`). */
export function SetSelect({
  value,
  onChange,
  options,
  children,
}: {
  value?: string;
  onChange?: (value: string) => void;
  options?: SetSelectOption[];
  children?: ReactNode;
}) {
  return (
    <select
      className="set-select"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {options
        ? options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label ?? o.value}
            </option>
          ))
        : children}
    </select>
  );
}
