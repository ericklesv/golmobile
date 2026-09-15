import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { passSettled } from './Pass';
import { seriesNoticeSettled } from './SeriesNotice';

/**
 * Convite para o grupo do WhatsApp dos jogadores (COMMUNITY em api/src/lib/rules.js; pedido do dono,
 * 14/09/2026). Aparece a cada 100 h por conta (controle no aparelho), só nas telas com as abas (Layout —
 * nunca no meio de um chute ou minigame) e depois que a Presença da Semana do dia já foi resolvida.
 * "Entrar no grupo" = não aparece mais; "Agora não" = volta em 100 h. Botão fixo no Perfil: WhatsButton.
 */

type Saved = { next?: number; joined?: boolean };
const KEY = (id: number) => `brgol.grupoWhats.${id}`;
const read = (id: number): Saved => { try { return JSON.parse(localStorage.getItem(KEY(id)) || '{}'); } catch { return {}; } };
const write = (id: number, v: Saved) => { try { localStorage.setItem(KEY(id), JSON.stringify(v)); } catch {} };

export function WhatsInviteWatcher() {
  const me = useAuth((s) => s.me);
  const link = useAuth((s) => s.meta?.community?.whatsapp);
  const hours = useAuth((s) => s.meta?.community?.everyHours) ?? 100;
  const [open, setOpen] = useState(false);
  const id = me?.id;

  useEffect(() => {
    if (id === undefined || !link) return;
    const s = read(id);
    if (s.joined || (s.next && Date.now() < s.next)) return;
    // espera a Presença da Semana e o aviso da troca de séries saírem da frente, e mais uns segundos
    const iv = window.setInterval(() => {
      if (!passSettled(id) || !seriesNoticeSettled()) return;
      window.clearInterval(iv);
      window.setTimeout(() => {
        write(id, { ...read(id), next: Date.now() + hours * 3_600_000 }); // conta a partir de quando apareceu
        setOpen(true);
      }, 3000);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [id, link, hours]);

  const join = () => { if (id !== undefined) write(id, { ...read(id), joined: true }); setOpen(false); };
  return (
    <AnimatePresence>
      {open && link && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-labelledby="whats-title"
          className="fixed inset-y-0 left-1/2 z-[91] flex w-full max-w-[480px] -translate-x-1/2 flex-col overflow-y-auto bg-navy-deep/80 backdrop-blur-[2px]">
          <motion.div initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="relative m-auto w-full max-w-sm px-4 py-6">
            <div className="relative pt-7">
              <div className="absolute inset-x-0 top-0 z-10 flex justify-center"><div id="whats-title" className="ribbon ribbon-green text-[18px]">GRUPO DO JOGAGOL</div></div>
              <div className="panel pt-8 text-center text-navy-ink">
                <img src="/ui/ico-whatsapp.png" alt="WhatsApp" className="mx-auto h-16 w-16 drop-shadow-[0_3px_0_rgba(0,0,0,0.25)]" />
                <div className="t-display mt-1 text-[21px] leading-tight">A galera do JogaGol está no WhatsApp</div>
                <p className="mt-1 text-[13px] font-bold leading-snug text-muted">Novidades antes de todo mundo, dicas dos minigames e resenha com os outros jogadores.</p>
                <a href={link} target="_blank" rel="noopener noreferrer" onClick={join} className="btn btn-green btn-lg mt-4 w-full">Entrar no grupo</a>
                <button onClick={() => setOpen(false)} className="btn btn-blue btn-sm mt-2 w-full">Agora não</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Botão fixo (Perfil) para quem quiser entrar depois. */
export function WhatsButton() {
  const me = useAuth((s) => s.me);
  const link = useAuth((s) => s.meta?.community?.whatsapp);
  if (!link) return null;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => { if (me) write(me.id, { ...read(me.id), joined: true }); }} className="btn btn-green btn-md w-full">
      <img src="/ui/ico-whatsapp.png" className="h-6 w-6" alt="" /> Grupo do JogaGol no WhatsApp
    </a>
  );
}
