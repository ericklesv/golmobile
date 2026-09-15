import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { passSettled } from './Pass';
import { Shield } from './Shield';

/**
 * Aviso da troca de séries (decisão do dono, 14/09/2026). Cinco times da Série A não tinham nenhum
 * jogador e time vazio dava ponto de graça; na rodada 3 (14/09, 21h45) os 5 times com mais gols na
 * temporada fora da A subiram, os 5 vazios da A foram para a B e os 2 últimos vazios da B para a C.
 * Todos mantiveram pontos e gols; os jogos da rodada 3 foram refeitos com os gols que cada time já
 * tinha nela. A troca foi feita direto no banco (sem código) — aqui só o aviso.
 * Aparece uma vez por conta (controle no aparelho), só para contas criadas antes da troca e até 22/09,
 * depois que a Presença da Semana sai da frente; o convite do WhatsApp espera este aviso.
 */

const DONE_AT = Date.UTC(2026, 8, 15, 0, 45); // 14/09/2026 21h45 (Brasília)
const UNTIL = Date.UTC(2026, 8, 22, 3, 0); // depois de 22/09 o aviso some
const KEY = (id: number) => `brgol.avisoSeries1.${id}`;
const seen = (id: number) => { try { return localStorage.getItem(KEY(id)) === '1'; } catch { return true; } };
const markSeen = (id: number) => { try { localStorage.setItem(KEY(id), '1'); } catch {} };

// gols na temporada no momento da troca (critério: os 5 com mais gols fora da Série A)
const UP = [
  { slug: 'nautico', abbr: 'NAU', name: 'Náutico', goals: 485 },
  { slug: 'ceara', abbr: 'CEA', name: 'Ceará', goals: 237 },
  { slug: 'brasiliense', abbr: 'BRA', name: 'Brasiliense', goals: 51 },
  { slug: 'santa-cruz', abbr: 'STA', name: 'Santa Cruz', goals: 33 },
  { slug: 'xv-de-piracicaba', abbr: 'XVP', name: 'XV de Piracicaba', goals: 15 },
];
const DOWN = [
  { slug: 'botafogo', abbr: 'BOT', name: 'Botafogo' },
  { slug: 'gremio', abbr: 'GRE', name: 'Grêmio' },
  { slug: 'fortaleza', abbr: 'FOR', name: 'Fortaleza' },
  { slug: 'athletico-pr', abbr: 'CAP', name: 'Athletico-PR' },
  { slug: 'internacional', abbr: 'INT', name: 'Internacional' },
];

let showing = false;
const due = (me: { id: number; createdAt: string } | null) =>
  !!me && Date.now() < UNTIL && new Date(me.createdAt).getTime() < DONE_AT && !seen(me.id);
/** O aviso já saiu da frente (ou não vale para esta conta): as outras janelas podem vir. */
export const seriesNoticeSettled = () => !showing && !due(useAuth.getState().me);

export function SeriesNoticeWatcher() {
  const me = useAuth((s) => s.me);
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const id = me?.id, createdAt = me?.createdAt;

  useEffect(() => {
    if (id === undefined || createdAt === undefined || !due({ id, createdAt })) return;
    let t = 0;
    // espera a Presença da Semana (ela abre sozinha no começo do dia) e mais um instante
    const iv = window.setInterval(() => {
      if (!passSettled(id)) return;
      window.clearInterval(iv);
      t = window.setTimeout(() => { markSeen(id); showing = true; setOpen(true); }, 1500);
    }, 1000);
    return () => { window.clearInterval(iv); window.clearTimeout(t); };
  }, [id, createdAt]);
  useEffect(() => () => { showing = false; }, []);

  const close = () => { showing = false; setOpen(false); };
  const table = () => { close(); nav('/liga'); };

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-labelledby="series-title"
            className="fixed inset-y-0 left-1/2 z-[92] flex w-full max-w-[480px] -translate-x-1/2 flex-col overflow-y-auto bg-navy-deep/80 backdrop-blur-[2px]">
            <motion.div initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="relative m-auto w-full max-w-sm px-4 py-6">
              <div className="relative pt-7">
                <div className="absolute inset-x-0 top-0 z-10 flex justify-center"><div id="series-title" className="ribbon ribbon-blue text-[18px]">MUDANÇA NAS SÉRIES</div></div>
                <div className="panel pt-8 text-navy-ink">
                  <div className="t-display text-center text-[22px] leading-tight">Série A mais disputada</div>
                  <p className="mt-1 text-center text-[13px] font-bold leading-snug text-muted">
                    Cinco times da Série&nbsp;A não tinham nenhum jogador, e time vazio dava ponto de graça para quem jogava contra ele.
                    Trocamos esses times pelos que mais fizeram gols fora da Série&nbsp;A. Agora todo jogo da Série&nbsp;A tem jogador dos dois&nbsp;lados.
                  </p>

                  <div className="card-green mt-3">
                    <div className="t-display t-out-dark text-[17px] leading-tight">Subiram para a Série A</div>
                    <div className="text-[11px] font-bold leading-snug text-white/85">Os 5 com mais gols na temporada fora da Série&nbsp;A</div>
                    <ol className="mt-1.5 space-y-1">
                      {UP.map((t, i) => (
                        <motion.li key={t.slug} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.08 }} className="flex items-center gap-2">
                          <Shield team={t} size={30} />
                          <span className="t-display t-out-dark min-w-0 flex-1 truncate text-[15px] leading-tight">{t.name}</span>
                          {me?.team.slug === t.slug && <span className="shrink-0 rounded-full bg-white px-2 py-0.5 font-display text-[10px] text-grass-deep">seu time</span>}
                          <span className="t-display t-out-dark shrink-0 text-[15px] leading-tight">{t.goals} gols</span>
                        </motion.li>
                      ))}
                    </ol>
                  </div>

                  <div className="mt-3">
                    <div className="t-display text-[16px] leading-tight text-orange-deep">Foram para a Série B</div>
                    <div className="text-[11px] font-bold leading-snug text-muted">Os 5 times da Série&nbsp;A sem nenhum jogador</div>
                    <div className="mt-1.5 flex justify-between px-1">
                      {DOWN.map((t) => <Shield key={t.slug} team={t} size={34} className="opacity-75" />)}
                    </div>
                    <p className="mt-1 text-[12px] font-bold leading-snug">
                      Botafogo, Grêmio, Fortaleza, Athletico-PR e Internacional. Remo e Guarani, também sem jogadores, foram da Série B para a C, para cada série continuar com 16 times.
                    </p>
                  </div>

                  <div className="mt-3">
                    <div className="t-display text-[16px] leading-tight text-grass-deep">O que não muda</div>
                    <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[12px] font-bold leading-snug">
                      <li>Todos os times continuam com os pontos e os gols que já tinham.</li>
                      <li>Os jogos da rodada 3 (14/09) foram refeitos e cada time levou para o jogo novo os gols que já tinha feito nela.</li>
                      <li>Seus gols, seu nível e a artilharia continuam iguais.</li>
                    </ul>
                  </div>

                  <button onClick={table} className="btn btn-green btn-lg mt-4 w-full">Ver a tabela</button>
                  <button onClick={close} className="btn btn-blue btn-sm mt-2 w-full">Fechar</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
