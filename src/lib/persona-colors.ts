/**
 * Persona-routed colour palette — mirrored from wireframe-v4-final.html's
 * `.actor-*` stylesheet. Each persona handle (`+backend-developer`,
 * `+qa-engineer`, etc.) maps to a fixed hex value so the dashboard,
 * timeline, and approvals all show the same colour for the same persona.
 *
 * Unknown personas fall back to neutral gray.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Compass, Bot, Rocket, DraftingCompass, Package, SquareChevronRight,
  SquareCode, Database, FlaskConical, Shield, GitMerge,
  Palette, Pencil, Sprout, Scale, Layers, HelpCircle,
} from 'lucide-react';

export type PersonaPalette = {
  color: string;
  initials: string;
  icon: LucideIcon;
};

// Identity hue per the DESIGN.md §7 roster, sourced from the §2.6 `--a-*` agent
// hue tokens (equal L/C, varied hue). These drive the identity DOT/avatar only —
// never icon fills or text. `+prime` (the human) is the solid accent exception.
const PALETTE: Record<string, PersonaPalette> = {
  '+prime':              { color: 'var(--accent)',    initials: '+p', icon: Compass },
  '+operation-manager':  { color: 'var(--a-indigo)',  initials: 'OM', icon: Bot },
  // The engine logs orchestration steps as "orchestrator" — same entity as the
  // operation-manager persona, so it shares its indigo identity.
  '+orchestrator':       { color: 'var(--a-indigo)',  initials: 'OM', icon: Bot },
  '+product-manager':    { color: 'var(--a-purple)',  initials: 'PM', icon: Rocket },
  '+engineering-manager':{ color: 'var(--a-red)',     initials: 'EM', icon: DraftingCompass },
  '+delivery-manager':   { color: 'var(--a-amber)',   initials: 'DM', icon: Package },
  '+designer':           { color: 'var(--a-pink)',    initials: 'DS', icon: Palette },
  '+growth-expert':      { color: 'var(--a-green)',   initials: 'GE', icon: Sprout },
  '+copywriter':         { color: 'var(--a-amber)',   initials: 'CW', icon: Pencil },
  '+backend-developer':  { color: 'var(--a-blue)',    initials: 'BD', icon: SquareChevronRight },
  '+frontend-developer': { color: 'var(--a-cyan)',    initials: 'FD', icon: SquareCode },
  '+db-admin':           { color: 'var(--a-teal)',    initials: 'DA', icon: Database },
  '+devops-engineer':    { color: 'var(--a-orange)',  initials: 'DE', icon: GitMerge },
  '+security-engineer':  { color: 'var(--a-red)',     initials: 'SE', icon: Shield },
  '+qa-engineer':        { color: 'var(--a-green)',   initials: 'QA', icon: FlaskConical },
  '+legal-expert':       { color: 'var(--a-purple)',  initials: 'LE', icon: Scale },
  '+compliance-expert':  { color: 'var(--a-teal)',    initials: 'CE', icon: Scale },
  '+env-agent':          { color: 'var(--a-orange)',  initials: 'EA', icon: Layers },
};

const FALLBACK: PersonaPalette = { color: 'var(--fg-muted)', initials: '??', icon: HelpCircle };

export function personaPalette(handle: string | null | undefined): PersonaPalette {
  if (!handle) return FALLBACK;
  const normalized = handle.startsWith('+') ? handle : `+${handle}`;
  return PALETTE[normalized] ?? FALLBACK;
}

export function personaColor(handle: string | null | undefined): string {
  return personaPalette(handle).color;
}

export function personaInitials(handle: string | null | undefined): string {
  return personaPalette(handle).initials;
}

export function personaIcon(handle: string | null | undefined): LucideIcon {
  return personaPalette(handle).icon;
}
