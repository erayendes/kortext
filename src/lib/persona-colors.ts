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
  Palette, Pencil, Sprout, Scale, HelpCircle,
} from 'lucide-react';

export type PersonaPalette = {
  color: string;
  initials: string;
  icon: LucideIcon;
};

const PALETTE: Record<string, PersonaPalette> = {
  '+prime':              { color: '#F59E0B', initials: '+p', icon: Compass },
  '+operation-manager':  { color: '#67E8F9', initials: 'OM', icon: Bot },
  '+product-manager':    { color: '#60A5FA', initials: 'PM', icon: Rocket },
  '+engineering-manager':{ color: '#C084FC', initials: 'EM', icon: DraftingCompass },
  '+delivery-manager':   { color: '#FB923C', initials: 'DM', icon: Package },
  '+backend-developer':  { color: '#818CF8', initials: 'BD', icon: SquareChevronRight },
  '+frontend-developer': { color: '#F472B6', initials: 'FD', icon: SquareCode },
  '+db-admin':           { color: '#2DD4BF', initials: 'DA', icon: Database },
  '+qa-engineer':        { color: '#FACC15', initials: 'QA', icon: FlaskConical },
  '+security-engineer':  { color: '#DC2626', initials: 'SE', icon: Shield },
  '+devops-engineer':    { color: '#F87171', initials: 'DE', icon: GitMerge },
  '+designer':           { color: '#34D399', initials: 'DS', icon: Palette },
  '+copywriter':         { color: '#A3E635', initials: 'CW', icon: Pencil },
  '+growth-expert':      { color: '#FB7185', initials: 'GE', icon: Sprout },
  '+compliance-expert':  { color: '#22D3EE', initials: 'CE', icon: Scale },
};

const FALLBACK: PersonaPalette = { color: '#6B6577', initials: '??', icon: HelpCircle };

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
