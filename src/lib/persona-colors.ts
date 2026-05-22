/**
 * Persona-routed colour palette — mirrored from the v3 mockup.
 *
 * Each persona handle (`+backend-developer`, `+qa-engineer`, etc.) maps to a
 * fixed hex value so the dashboard, timeline, and approvals all show the same
 * colour for the same persona. `initials` is the 2-character mono badge used
 * in avatar circles ("BD", "QA", "EM"…).
 *
 * Unknown personas fall back to neutral gray.
 */

export type PersonaPalette = {
  color: string;
  initials: string;
};

const PALETTE: Record<string, PersonaPalette> = {
  '+prime': { color: '#F59E0B', initials: '+p' },
  '+operation-manager': { color: '#06B6D4', initials: 'OM' },
  '+product-manager': { color: '#3B82F6', initials: 'PM' },
  '+engineering-manager': { color: '#8B5CF6', initials: 'EM' },
  '+delivery-manager': { color: '#F97316', initials: 'DM' },
  '+backend-developer': { color: '#6366F1', initials: 'BD' },
  '+frontend-developer': { color: '#EC4899', initials: 'FD' },
  '+db-admin': { color: '#14B8A6', initials: 'DA' },
  '+qa-engineer': { color: '#EAB308', initials: 'QA' },
  '+security-engineer': { color: '#EF4444', initials: 'SE' },
  '+devops-engineer': { color: '#A855F7', initials: 'DO' },
  '+designer': { color: '#22D3EE', initials: 'DS' },
  '+copywriter': { color: '#FBBF24', initials: 'CW' },
  '+growth-expert': { color: '#10B981', initials: 'GE' },
  '+compliance-expert': { color: '#84CC16', initials: 'CE' },
};

const FALLBACK: PersonaPalette = { color: '#6B6577', initials: '??' };

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
