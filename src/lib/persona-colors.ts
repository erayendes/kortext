/**
 * Persona-routed colour palette — mirrored from wireframe-v4-final.html's
 * `.actor-*` stylesheet. Each persona handle (`+backend-developer`,
 * `+qa-engineer`, etc.) maps to a fixed hex value so the dashboard,
 * timeline, and approvals all show the same colour for the same persona.
 *
 * Unknown personas fall back to neutral gray.
 */

export type PersonaPalette = {
  color: string;
  initials: string;
};

const PALETTE: Record<string, PersonaPalette> = {
  '+prime': { color: '#F59E0B', initials: '+p' },
  '+operation-manager': { color: '#67E8F9', initials: 'OM' },
  '+product-manager': { color: '#60A5FA', initials: 'PM' },
  '+engineering-manager': { color: '#C084FC', initials: 'EM' },
  '+delivery-manager': { color: '#FB923C', initials: 'DM' },
  '+backend-developer': { color: '#818CF8', initials: 'BD' },
  '+frontend-developer': { color: '#F472B6', initials: 'FD' },
  '+db-admin': { color: '#2DD4BF', initials: 'DA' },
  '+qa-engineer': { color: '#FACC15', initials: 'QA' },
  '+security-engineer': { color: '#DC2626', initials: 'SE' },
  '+devops-engineer': { color: '#F87171', initials: 'DE' },
  '+designer': { color: '#34D399', initials: 'DS' },
  '+copywriter': { color: '#A3E635', initials: 'CW' },
  '+growth-expert': { color: '#FB7185', initials: 'GE' },
  '+compliance-expert': { color: '#22D3EE', initials: 'CE' },
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
