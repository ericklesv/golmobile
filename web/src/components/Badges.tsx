import type { ClubRole, TopBadge, TopScope, TopTally } from '../lib/types';

/**
 * Distintivos ao lado do nome (api/src/services/badges.js): P/D do cargo no time e **um** ícone de top 3 —
 * hora = estrela, rodada = medalha, temporada = troféu; 1º ouro, 2º prata, 3º bronze. Desde 17/09/2026 o
 * ícone é do período que JÁ FECHOU (a hora passada, a rodada passada) e o jogador ostenta só o de maior
 * prestígio, escolhido no servidor. E o quadro de top 10 do perfil (quantas vezes em cada posição).
 */

const METAL = ['gold', 'silver', 'bronze'] as const;
// Ranking X1 (pedido do dono, 15/09/2026): caveira = rodada, caveira coroada ("super caveira") = temporada,
// caveira com louros = geral. Ícones gerados do pack Layer Lab (FantasyRPG icon_skull + crown + laurel, tingidos).
const FILE: Record<TopScope, string> = { HOUR: 'ico-star', ROUND: 'ico-medal', SEASON: 'ico-trophy', X1_ROUND: 'ico-skull', X1_SEASON: 'ico-skullking', X1_ALL: 'ico-skullwreath' };
export const topIcon = (scope: TopScope, pos: number) => `/ui/${FILE[scope]}_${METAL[pos - 1]}.png`;
const OF: Record<TopScope, string> = { HOUR: 'da hora', ROUND: 'da rodada', SEASON: 'da temporada', X1_ROUND: 'do X1 na rodada', X1_SEASON: 'do X1 na temporada', X1_ALL: 'do X1 geral' };
/** Como o ícone se apresenta: ele é sempre do período fechado (o geral do X1 é de todos os tempos). */
const QUANDO: Record<TopScope, string> = { HOUR: 'passada', ROUND: 'passada', SEASON: 'passada', X1_ROUND: 'passada', X1_SEASON: 'passada', X1_ALL: '' };
const NAME: Record<TopScope, string> = { HOUR: 'Hora', ROUND: 'Rodada', SEASON: 'Temporada', X1_ROUND: 'Rodada', X1_SEASON: 'Temporada', X1_ALL: 'Geral' };
/** O servidor já manda um ícone só; aqui ficam os que podem aparecer ao lado do nick. */
const NAME_SCOPES: TopScope[] = ['HOUR', 'ROUND', 'SEASON', 'X1_ROUND', 'X1_SEASON', 'X1_ALL'];

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
  const shown = tops?.filter((t) => NAME_SCOPES.includes(t.scope));
  if (!shown?.length) return null;
  return (
    <>
      {shown.map((t) => (
        <img key={t.scope} src={topIcon(t.scope, t.pos)} title={`${t.pos}º ${OF[t.scope]} ${QUANDO[t.scope]}`.trim()} alt={`${t.pos}º ${OF[t.scope]}`}
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
export function TopHistory({ history, scopes = ['HOUR', 'ROUND', 'SEASON'], emptyText = 'Ainda não ficou no top 10 de uma hora fechada. Marque gols para aparecer aqui.' }: { history: Record<TopScope, TopTally>; scopes?: TopScope[]; emptyText?: string }) {
  const none = scopes.every((s) => !history[s] || history[s].top10 === 0);
  return (
    <div className="flex flex-col gap-1.5">
      {scopes.map((s) => {
        const h = history[s] ?? { gold: 0, silver: 0, bronze: 0, top10: 0 };
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
      {none && <p className="text-center text-[11px] font-bold text-muted">{emptyText}</p>}
    </div>
  );
}

/** Posição de agora num recorte do Ranking X1, com a caveira quando está no top 3 (rodada/temporada: só entre os elegíveis). */
export function X1Now({ scope, position, eligible, size = 28 }: { scope: TopScope; position: number | null; eligible?: boolean; size?: number }) {
  const medal = position !== null && position <= 3 && (scope === 'X1_ALL' || eligible);
  return medal
    ? <img src={topIcon(scope, position!)} alt={`${position}º`} title={`${position}º ${OF[scope]} agora`} className="object-contain" style={{ width: size, height: size }} />
    : <span className="font-display leading-none text-navy-ink" style={{ fontSize: Math.round(size * 0.7) }}>{position ? `${position}º` : '–'}</span>;
}
