import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { Shield } from './Shield';
import { sound } from '../lib/sound';

/**
 * Tutorial de boas-vindas (api/src/services/tutorial.js; dono, 18/09/2026).
 *
 * Na PRIMEIRA vez o jogador não vê pop-up nenhum — só esta janela, que se apresenta e pergunta se ele quer
 * fazer as três etapas em troca de 1 VIP. Quem segura os outros pop-ups é `me.tutorial.pending`: os
 * watchers (Presença, troca de séries, WhatsApp, Instagram, subiu de nível) saem de cena enquanto isso.
 *
 * Depois de aceitar, some a janela e fica só o CARTÃO das etapas, acima das abas, com um botão que leva ao
 * lugar certo. Ninguém precisa confirmar nada: a cada `/me` novo a tela pergunta ao servidor se a etapa já
 * está cumprida (ele confere no banco — pênalti batido, Termo jogado, partida de X1 disputada) e anda
 * sozinha. Na última, o servidor paga o VIP e a janela final comemora.
 */

type Passo = { n: 1 | 2 | 3; nome: string; icon: string; rota: string; botao: string; titulo: string; texto: string };

const PASSOS: Passo[] = [
  {
    n: 1, nome: 'Pênalti', icon: '/ui/ico-ball.png', rota: '/penalti', botao: 'Bater um pênalti',
    titulo: 'Comece pelo pênalti',
    texto: 'É a principal forma de fazer gol para o seu time. Escolha um canto e bata — a cada gol o placar da rodada sobe.',
  },
  {
    n: 2, nome: 'Termo', icon: '/ui/ico-gift_purple.png', rota: '/termo', botao: 'Jogar o Termo',
    titulo: 'Os minigames rendem gol',
    texto: 'Tem um minigame virando a cada hora e você joga cada um uma vez por dia. Subindo de nível, libera mais. Comece pelo Termo: acertar a palavra vale um gol.',
  },
  {
    n: 3, nome: 'X1', icon: '/ui/ico-x1.svg', rota: '/x1?desafiar=1', botao: 'Desafiar adversários para o X1',
    titulo: 'Encare outro jogador',
    texto: 'No X1 você joga ao vivo contra outro craque. Ganhou, seu time marca um gol; perdeu, o time perde um. Desafie e espere alguém aceitar.',
  },
];

/** Botão de prêmio: a coroa do VIP com o número, do mesmo jeito que a Presença mostra os extras. */
function PremioVip({ vip }: { vip: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/25 px-3 py-1">
      <img src="/ui/ico-crown_silver.png" alt="" className="h-6 w-6" />
      <span className="t-display text-[15px] text-navy-ink">{vip} VIP</span>
    </span>
  );
}

/** Os três passos como os cards de chute da tela inicial: o de agora aceso, os feitos com o visto verde. */
function Trilha({ atual }: { atual: number }) {
  return (
    <div className="flex items-stretch gap-1.5">
      {PASSOS.map((p) => {
        const feito = p.n < atual;
        const agora = p.n === atual;
        return (
          <div key={p.n} className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 ${agora ? 'bg-gold/25' : feito ? 'bg-grass/20' : 'bg-navy-ink/5'}`}>
            <span className="relative">
              <img src={p.icon} alt="" className={`h-6 w-6 object-contain ${agora ? '' : feito ? 'opacity-80' : 'opacity-40 grayscale'}`} />
              {feito && <img src="/ui/check-green.png" alt="" className="absolute -bottom-1 -right-1 h-3.5 w-3.5" />}
            </span>
            <span className={`t-display text-[10px] leading-none ${agora ? 'text-orange-deep' : feito ? 'text-grass-deep' : 'text-muted'}`}>{p.nome}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TutorialWatcher() {
  const me = useAuth((s) => s.me);
  const refresh = useAuth((s) => s.refresh);
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [fim, setFim] = useState<{ vip: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const tentando = useRef(0);

  const t = me?.tutorial;
  const step = t?.step ?? -1;
  const emAndamento = step >= 1 && step <= 3;

  // A cada `/me` novo: pergunta ao servidor se a etapa já está cumprida. Ele confere no banco; 409 = ainda não.
  useEffect(() => {
    if (!emAndamento) return;
    const marca = ++tentando.current;
    api.tutorialDone(step)
      .then(async (r) => {
        if (marca !== tentando.current) return;
        if (r.step === step) return; // não andou: o jogador ainda não fez
        if (r.vipGanho) { sound.play('goal'); setFim({ vip: r.vipGanho }); }
        await refresh();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, me?.goalsTotal, me?.stats.penalty.tries, me?.levelPoints]);

  if (!me || !t) return null;

  const começar = async () => {
    if (busy) return;
    setBusy(true);
    try { await api.tutorialStart(); await refresh(); } finally { setBusy(false); }
  };
  const pular = async () => {
    if (busy) return;
    setBusy(true);
    try { await api.tutorialSkip(); await refresh(); } finally { setBusy(false); }
  };

  // ── 1) Boas-vindas: a única coisa na tela de quem acaba de chegar
  if (step === 0) {
    return (
      <div className="fixed inset-0 z-[96] flex items-center justify-center bg-navy-deep/70 px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          className="panel w-full max-w-[420px] text-center text-navy-ink">
          <div className="-mt-9 flex justify-center"><div className="ribbon ribbon-green">BEM-VINDO</div></div>
          <div className="mt-3 flex justify-center"><Shield team={me.team} size={64} /></div>
          <p className="mt-3 text-[15px] font-extrabold leading-snug">
            Você joga pelo <b className="text-grass-deep">{me.team.name}</b>. Cada gol seu entra no placar do time na rodada — e a rodada fecha todo dia às 19h.
          </p>
          <p className="mt-2 text-[13px] font-bold leading-snug text-muted">
            Quer que eu te mostre as três formas de marcar? Leva dois minutos e no fim você leva {t.vip} VIP.
          </p>
          <div className="mt-3 flex justify-center"><PremioVip vip={t.vip} /></div>
          <button onClick={começar} disabled={busy} className="btn btn-green btn-lg mt-4 w-full">Fazer o tutorial</button>
          <button onClick={pular} disabled={busy} className="mt-2 w-full text-[12px] font-extrabold text-muted underline">Agora não</button>
        </motion.div>
      </div>
    );
  }

  // ── 3) Fim: o VIP caiu no banco
  if (fim) {
    return (
      <div className="fixed inset-0 z-[96] flex items-center justify-center bg-navy-deep/70 px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          className="panel w-full max-w-[420px] text-center text-navy-ink">
          <div className="-mt-9 flex justify-center"><div className="ribbon ribbon-yellow">TUTORIAL FEITO</div></div>
          <img src="/ui/ico-crown_silver.png" alt="" className="mx-auto mt-3 h-16 w-16" />
          <p className="t-display mt-1 text-[22px] text-grass-deep">+{fim.vip} VIP</p>
          <p className="mt-1 text-[13px] font-bold leading-snug text-muted">
            Está guardado no seu banco de VIP: ative quando quiser, no topo da tela. Com VIP as recargas caem pela metade.
          </p>
          <p className="mt-2 text-[13px] font-extrabold leading-snug">Agora é com você: faça gol, suba de nível e leve o {me.team.name} para o topo.</p>
          <button onClick={() => { setFim(null); nav('/'); }} className="btn btn-green btn-lg mt-4 w-full">Jogar</button>
        </motion.div>
      </div>
    );
  }

  // ── 2) Cartão das etapas, acima das abas — some nas telas de jogo, para não cobrir nada
  if (!emAndamento) return null;
  const p = PASSOS[step - 1];
  const alvo = p.rota.split('?')[0];
  const naTelaCerta = pathname === alvo || pathname.startsWith(`${alvo}/`);
  if (naTelaCerta) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 z-[60] w-full max-w-[480px] -translate-x-1/2 px-3" style={{ bottom: 'calc(var(--sab) + 78px)' }}>
      <AnimatePresence>
        <motion.div key={step} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }} className="panel pointer-events-auto relative text-navy-ink">
          <Trilha atual={step} />
          <p className="t-display mt-2 text-[16px] leading-tight">{p.titulo}</p>
          <p className="mt-1 text-[13px] font-bold leading-snug text-muted">{p.texto}</p>
          <button onClick={() => nav(p.rota)} className="btn btn-green btn-md mt-3 w-full">{p.botao}</button>
          <button onClick={pular} disabled={busy} className="mt-1.5 w-full text-[11px] font-extrabold text-muted underline">Pular tutorial</button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
