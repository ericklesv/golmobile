import { useAuth } from '../store/auth';
import type { SkillLevels } from '../lib/types';

/**
 * Habilidades do jogador (Recarga, Pontaria, Chute e Sorte): as trilhas que aparecem no Perfil e no perfil
 * público. Os nomes, o teto e quanto cada nível vale vêm do servidor (`meta.skills`), então mudar o número
 * lá muda a tela. Quem sobe o nível é a Loja — aqui é só leitura.
 */
export function SkillTracks({ skills, chance }: { skills: SkillLevels; chance?: { PENALTY: number; FOUL: number } }) {
  const defs = useAuth((s) => s.meta)?.skills ?? [];
  if (!defs.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {defs.map((d) => {
        const level = skills?.[d.key] ?? 0;
        const acerto = d.unit === 'acerto' && d.kind ? (chance?.[d.kind] ?? Math.min(d.cap, d.base + level * d.perLevel)) : null;
        return (
          <div key={d.key} className="flex items-center gap-3 rounded-xl bg-sky/10 p-2">
            <img src={`/ui/${d.icon}.png`} className="h-8 w-8 shrink-0 object-contain" alt="" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="t-display text-[14px] text-navy-ink">{d.name}</span>
                <span className="text-[11px] font-extrabold text-muted">nível {level} de {d.max}</span>
              </div>
              <SkillPips level={level} max={d.max} />
              {acerto !== null && <div className="text-[11px] font-extrabold text-grass-deep">{Math.round(acerto * 100)}% de acerto {d.kind === 'PENALTY' ? 'no pênalti' : 'na falta'}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Os degraus da habilidade: cheios até o nível atual. */
export function SkillPips({ level, max }: { level: number; max: number }) {
  return (
    <div className={`my-1 flex ${max > 12 ? 'gap-[2px]' : 'gap-[3px]'}`} aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={`${max > 12 ? 'h-2' : 'h-2.5'} flex-1 rounded-[2px] ${i < level ? 'bg-grass shadow-[inset_0_-2px_0_rgba(0,0,0,.18)]' : 'bg-navy-ink/15'}`} />
      ))}
    </div>
  );
}
