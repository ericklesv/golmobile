import { useState } from 'react';
import type { Team } from '../lib/types';

type T = Pick<Team, 'slug' | 'abbr'> & Partial<Pick<Team, 'name' | 'colorPrimary' | 'colorSecondary'>>;

// Escudos reais em /escudos/<slug>.svg|png (projeto privado, grupo fechado)
const PNG = new Set(['fortaleza', 'juventude', 'ferroviaria', 'mirassol', 'america-rn', 'csa', 'brasiliense']);
export const crestUrl = (slug: string) => `/escudos/${slug}.${PNG.has(slug) ? 'png' : 'svg'}`;

export function Shield({ team, size = 40, className = '' }: { team: T | null | undefined; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!team || broken) {
    return (
      <span className={`inline-flex items-center justify-center rounded-full bg-navy-deep font-display text-white ${className}`} style={{ width: size, height: size, fontSize: size * 0.32 }}>
        {team?.abbr ?? '?'}
      </span>
    );
  }
  return (
    <img src={crestUrl(team.slug)} alt={team.name ?? team.abbr} width={size} height={size} onError={() => setBroken(true)}
      className={`inline-block shrink-0 object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)] ${className}`} style={{ width: size, height: size }} />
  );
}
