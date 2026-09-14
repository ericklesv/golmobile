import type { ClubRole, TopBadge, TopScope, TopTally } from '../lib/types';

/**
 * Distintivos ao lado do nome (api/src/services/badges.js): P/D do cargo no time e o top 3 de AGORA —
 * hora = estrela, rodada = medalha, temporada = troféu; 1º ouro, 2º prata, 3º bronze. Se alguém passa
 * na frente, o ícone muda de dono. E o quadro de top 10 do perfil (quantas vezes em cada posição).
 */

const METAL = ['gold', 'silver', 'bronze'] as const;
const FILE: Record<TopScope, string> = { HOUR: 'ico-star', ROUND: 'ico-medal', SEASON: 'ico-trophy' };
export const topIcon = (scope: TopScope, pos: number) => `/ui/${FILE[scope]}_${METAL[pos - 1]}.png`;
const OF: Record<TopScope, string> = { HOUR: 'da hora', ROUND: 'da rodada', SEASON: 'da temporada' };
const NAME: Record<TopScope, string> = { HOUR: 'Hora', ROUND: 'Rodada', SEASON: 'Temporada' };

export function RoleChip({ role, size = 16 }: { role?: ClubRole | null; size?: number }) {
  if (!role) return null;
  const p = role === 'PRESIDENTE';
  return (
    <span title={p ? 'Presidente do time' : 'Diretor do time'} aria-label={p ? 'Presidente' : 'Diretor'}
      className={`inline-flex shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-white font-display leading-none shadow-sm ${p ? 'bg-gold text-navy-ink' : 'bg-sky text-white'}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.66) }}>{p ? 'P' : 'D'}</span>
  );
}

export function TopIcons({ tops, size = 16 }: { tops?: TopBadge[]; size?: number }) {
  if (!tops?.length) return null;
  return (
    <>
      {tops.map((t) => (
        <img key={t.scope} src={topIcon(t.scope, t.pos)} title={`${t.pos}º ${OF[t.scope]} agora`} alt={`${t.pos}º ${OF[t.scope]}`}
          className="ico shrink-0 object-contain" style={{ width: size, height: size }} />
      ))}
    </>
  );
}

/** P/D + ícones do top de agora, para pôr logo depois do nick. */
export function NameBadges({ role, tops, size = 16 }: { role?: ClubRole | null; tops?: TopBadge[]; size?: number }) {
  if (!role && !tops?.length) return null;
  return <span className="ml-1 inline-flex translate-y-[2px] items-center gap-0.5 align-baseline"><RoleChip role={role} size={size} /><TopIcons tops={tops} size={size + 2} /></span>;
}

/** Quadro de top 10 do perfil: por hora/rodada/temporada, quantas vezes em 1º, 2º, 3º e no top 10. */
export function TopHistory({ history }: { history: Record<TopScope, TopTally> }) {
  const scopes: TopScope[] = ['HOUR', 'ROUND', 'SEASON'];
  const none = scopes.every((s) => history[s].top10 === 0);
  return (
    <div className="flex flex-col gap-1.5">
      {scopes.map((s) => {
        const h = history[s];
        return (
          <div key={s} className="flex items-center gap-2 rounded-xl bg-sky/10 px-2 py-1.5">
            <span className="t-display w-[76px] shrink-0 text-[14px] text-navy-ink">{NAME[s]}</span>
            <div className="flex flex-1 items-center justify-around">
              {([h.gold, h.silver, h.bronze] as number[]).map((n, i) => (
                <span key={i} className={`flex items-center gap-1 ${n ? '' : 'opacity-35 grayscale'}`} title={`${i + 1}º ${OF[s]}: ${n}×`}>
                  <img src={topIcon(s, i + 1)} alt={`${i + 1}º`} className="h-7 w-7 object-contain" />
                  <span className="font-display text-[17px] tabular-nums text-navy-ink">{n}</span>
                </span>
              ))}
            </div>
            <span className="shrink-0 text-right leading-none"><span className="font-display text-[17px] tabular-nums text-grass-deep">{h.top10}</span><span className="block text-[9px] font-extrabold text-muted">no top 10</span></span>
          </div>
        );
      })}
      {none && <p className="text-center text-[11px] font-bold text-muted">Ainda não ficou no top 10 de uma hora fechada. Marque gols para aparecer aqui.</p>}
    </div>
  );
}
