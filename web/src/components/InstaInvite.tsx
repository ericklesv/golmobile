import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { passSettled } from './Pass';
import { seriesNoticeSettled } from './SeriesNotice';
import { x1SwitchSettled } from './X1GameSwitch';
import { whatsSettled } from './WhatsInvite';
import { api } from '../lib/api';

/**
 * Convite para seguir o JogaGol no Instagram (COMMUNITY.instagram em api/src/lib/rules.js; pedido do dono,
 * 17/09/2026): **seguir vale 3 VIP e repostar a publicação vale 7**, e o jogador se identifica na DM para
 * receber — quem entrega o VIP é o admin, não o jogo (por isso a janela não promete nada automático).
 *
 * Aparece **UMA VEZ SÓ por jogador** (dono, 17/09/2026: "depois que viram não aparece mais") — diferente do
 * convite do WhatsApp, que volta de tempos em tempos. O "já viu" fica no JOGADOR (`User.avisosVistos.instagram`,
 * POST /api/me/aviso/instagram), não no aparelho: quem vê no celular não vê de novo no PC.
 * Como as outras janelas: só nas telas com abas (Layout — nunca no meio de um chute ou minigame) e depois que a
 * Presença da Semana, o aviso das séries, a troca do X1 e o convite do WhatsApp saíram da frente.
 */

const AVISO = 'instagram';

let showing = false;
/** A janela do Instagram já saiu da frente (a do WhatsApp espera por isto). */
export const instaSettled = () => !showing;

/** O glifo do Instagram no traço do kit: quadrado arredondado, lente e o pontinho. */
function InstaGlyph({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="mx-auto drop-shadow-[0_3px_0_rgba(0,0,0,0.25)]">
      <defs>
        <linearGradient id="ig" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FFC63D" />
          <stop offset="0.35" stopColor="#FF8A2A" />
          <stop offset="0.65" stopColor="#FF5470" />
          <stop offset="1" stopColor="#B388FF" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="42" height="42" rx="13" fill="url(#ig)" stroke="#FFFFFF" strokeWidth="3" />
      <circle cx="24" cy="24" r="9.5" fill="none" stroke="#FFFFFF" strokeWidth="3.6" />
      <circle cx="35" cy="13" r="2.6" fill="#FFFFFF" />
    </svg>
  );
}

export function InstaInviteWatcher() {
  const me = useAuth((s) => s.me);
  const setMe = useAuth((s) => s.setMe);
  const insta = useAuth((s) => s.meta?.community?.instagram);
  const [open, setOpen] = useState(false);
  const id = me?.id;
  const jaViu = !!me?.avisos?.[AVISO];
  const tutorial = !!me?.tutorial?.pending;

  useEffect(() => {
    if (tutorial) return; // tutorial de boas-vindas na frente
    if (id === undefined || !insta?.url || jaViu) return;
    const iv = window.setInterval(() => {
      if (!passSettled(id) || !seriesNoticeSettled() || !x1SwitchSettled() || !whatsSettled()) return;
      window.clearInterval(iv);
      window.setTimeout(() => {
        if (!whatsSettled()) return; // a do WhatsApp abriu nesses 3 s: esta vem na próxima vez que ele abrir o jogo
        showing = true;
        setOpen(true);
        // marca como visto assim que aparece: viu uma vez, não volta mais (nem em outro aparelho)
        api.avisoVisto(AVISO).then(setMe).catch(() => {});
      }, 3000);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [id, insta?.url, jaViu, setMe]);

  const fechar = () => { showing = false; setOpen(false); };
  const jaSegui = () => fechar();

  return (
    <AnimatePresence>
      {open && insta?.url && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-labelledby="insta-title"
          className="fixed inset-y-0 left-1/2 z-[91] flex w-full max-w-[480px] -translate-x-1/2 flex-col overflow-y-auto bg-navy-deep/80 backdrop-blur-[2px]">
          <motion.div initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="relative m-auto w-full max-w-sm px-4 py-6">
            <div className="relative pt-7">
              <div className="absolute inset-x-0 top-0 z-10 flex justify-center"><div id="insta-title" className="ribbon ribbon-orange text-[18px]">SIGA E GANHE VIP</div></div>
              <div className="panel pt-8 text-center text-navy-ink">
                <InstaGlyph />
                <div className="t-display mt-1 text-[21px] leading-tight">O JogaGol está no Instagram</div>
                <p className="mt-1 text-[13px] font-bold leading-snug text-muted">Siga a gente em <b className="text-navy-ink">{insta.handle ?? '@jogagolbr'}</b> e leve VIP por isso.</p>

                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2 rounded-xl bg-sky/10 p-2 text-left">
                    <img src="/ui/ico-crown_silver.png" className="h-8 w-8 shrink-0" alt="" />
                    <span className="text-[13px] font-bold leading-snug">Seguiu o perfil: <b className="t-display text-[15px] text-grass-deep">{insta.vipFollow ?? 3} VIP</b></span>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-gold/20 p-2 text-left">
                    <img src="/ui/ico-gift_purple.png" className="h-8 w-8 shrink-0" alt="" />
                    <span className="text-[13px] font-bold leading-snug">Repostou a publicação: <b className="t-display text-[15px] text-grass-deep">{insta.vipRepost ?? 7} VIP</b></span>
                  </div>
                </div>

                <p className="mt-3 text-[12px] font-bold leading-snug text-muted">
                  Depois, mande uma mensagem na DM do Instagram dizendo o seu nick aqui do jogo — é assim que a gente
                  sabe para quem mandar o VIP.
                </p>

                <a href={insta.url} target="_blank" rel="noopener noreferrer" onClick={jaSegui} className="btn btn-orange btn-lg mt-4 w-full">Seguir no Instagram</a>
                <button onClick={fechar} className="btn btn-blue btn-sm mt-2 w-full">Agora não</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Botão fixo (Perfil) para quem quiser seguir depois. */
export function InstaButton() {
  const insta = useAuth((s) => s.meta?.community?.instagram);
  if (!insta?.url) return null;
  return (
    <a href={insta.url} target="_blank" rel="noopener noreferrer" className="btn btn-orange btn-md w-full">
      <InstaGlyph size={24} /> JogaGol no Instagram: {insta.vipFollow ?? 3} VIP para quem segue
    </a>
  );
}
