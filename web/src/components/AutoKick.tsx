/**
 * Chute direto automático — o motor de quem deixa o JogaGol aberto no PC.
 *
 * Antes isso morava na tela Jogar (Home.tsx) e só disparava se a aba estivesse VISÍVEL no segundo
 * exato em que o contador zerava. Com a janela minimizada, coberta por outra (no Windows o Chrome
 * trata janela totalmente ocluída como oculta) ou numa aba de trás, o chute não saía — e não voltava
 * a sair: o contador ficava parado em 0, o `readyAt` volta IGUAL do /api/me e nada re-disparava o
 * efeito. Quem deixava o jogo aberto passava horas sem marcar (e o jogo vive disso).
 *
 * Agora o relógio é um só, montado no App: vale em TODAS as telas (Liga, Chat, Loja, X1, minigames),
 * mede pelo horário do servidor (`readyAt`, nunca por tick acumulado) e se re-arma a cada 60 s no
 * máximo. Assim o atraso do navegador em aba de fundo, o congelamento da aba e a suspensão do PC só
 * ADIAM o chute — nunca o cancelam. Voltar para a aba, focar a janela ou a internet voltar conferem
 * na hora. Erro de rede/servidor não queima a recarga: tenta de novo, dobrando a espera.
 *
 * Onde o gol aparece: na aba Jogar, a mesma tela de "GOOOL" de sempre; em qualquer outra tela, um
 * aviso discreto — nunca cobrir uma partida de X1 ou um minigame com um overlay de tela cheia.
 *
 * Duas abas abertas não fazem gol dobrado: a recarga é reservada de forma atômica na API
 * (`claimCooldown` em services/play.js), a segunda leva 429 e só atualiza o tempo na tela.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { create } from 'zustand';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import { GoalOverlay } from './GoalOverlay';
import { toast } from './Toast';
import { money as fmtMoney } from '../lib/format';

/** Erro de rede/servidor: espera 20 s, 40 s, 60 s… até 2 min — sem nunca desistir da recarga. */
const RETRY_MS = 20_000;
const RETRY_MAX = 120_000;
/** O relógio se re-arma pelo menos de minuto em minuto: em aba de fundo o navegador ATRASA o timer
 *  (mínimo de ~1/min), então esperar o tempo cheio de uma vez deixaria o chute muito para trás. */
const MAX_WAIT = 60_000;

interface AutoKickResult { goal: boolean; text: string; money: number; at: number }

interface AutoKickState {
  busy: boolean;
  /** Último chute direto (o `at` é o carimbo que a tela usa para saber que chegou um novo). */
  last: AutoKickResult | null;
  /** Bate o chute. `manual` = o jogador tocou no card (só aí o erro vira aviso na tela).
   *  Devolve false quando vale a pena tentar de novo (rede/servidor fora). */
  fire: (manual?: boolean) => Promise<boolean>;
  clear: () => void;
}

export const useAutoKick = create<AutoKickState>((set, get) => ({
  busy: false,
  last: null,
  clear: () => set({ last: null }),
  fire: async (manual = false) => {
    if (get().busy) return true;
    set({ busy: true });
    try {
      const r = await api.autoKick();
      set({ last: { goal: r.goal, text: r.text, money: r.money, at: Date.now() } });
      await useAuth.getState().refresh();
      return true;
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      // recarga, nível, sessão caída ou multiconta: insistir não resolve — o /api/me traz o tempo certo
      if (err && (err.code === 'cooldown' || err.code === 'locked' || err.status === 401 || err.status === 403)) {
        if (manual) toast(err.code === 'cooldown' ? 'Chute direto ainda em recarga.' : err.message);
        await useAuth.getState().refresh();
        return true;
      }
      if (manual) toast((e as Error).message, 'error'); // no automático o erro é silencioso: tenta de novo sozinho
      return false;
    } finally { set({ busy: false }); }
  },
}));

export function AutoKickWatcher() {
  const logado = useAuth((s) => !!s.me);
  // o horário do servidor para o próximo chute: mudou (chutou, virou VIP, comprou Boost, voltou para a aba
  // e o /api/me trouxe outro tempo) ⇒ o relógio se re-arma na hora, sem esperar a volta do minuto
  const readyAt = useAuth((s) => s.me?.cooldowns.AUTO.readyAt ?? 0);
  const team = useAuth((s) => s.me?.team) ?? null;
  const last = useAutoKick((s) => s.last);
  const clear = useAutoKick((s) => s.clear);
  const naAbaJogar = useLocation().pathname === '/';
  const visto = useRef(0); // carimbo do gol que já apareceu no "GOOOL" da aba Jogar

  useEffect(() => {
    if (!logado) return;
    let vivo = true;
    let timer = 0;
    let erros = 0;

    const agenda = () => {
      if (!vivo) return;
      window.clearTimeout(timer);
      const { me, now } = useAuth.getState();
      const cd = me?.cooldowns.AUTO;
      const falta = cd?.unlocked ? cd.readyAt - now() : MAX_WAIT;
      const espera = erros
        ? Math.min(RETRY_MS * erros, RETRY_MAX)
        : Math.min(Math.max(falta + 400, 1_000), MAX_WAIT);
      timer = window.setTimeout(tick, espera);
    };

    const tick = async () => {
      if (!vivo) return;
      const { me, now } = useAuth.getState();
      const cd = me?.cooldowns.AUTO;
      if (cd?.unlocked && cd.readyAt - now() <= 0) {
        const alvo = cd.readyAt;
        const ok = await useAutoKick.getState().fire();
        // a recarga andou? Se não (conta suspensa, sessão caída, /api/me fora do ar), espera mais em vez
        // de martelar a API de segundo em segundo — o relógio fica em 0 até alguém responder.
        const andou = useAuth.getState().me?.cooldowns.AUTO.readyAt !== alvo;
        erros = ok && andou ? 0 : erros + 1;
      } else erros = 0;
      agenda();
    };

    agenda();
    // voltou para a aba, focou a janela ou a internet voltou: confere na hora (o timer pode ter ficado para trás)
    const conferir = () => { if (document.visibilityState === 'visible' && !useAutoKick.getState().busy) void tick(); };
    document.addEventListener('visibilitychange', conferir);
    window.addEventListener('focus', conferir);
    window.addEventListener('online', conferir);
    return () => {
      vivo = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', conferir);
      window.removeEventListener('focus', conferir);
      window.removeEventListener('online', conferir);
    };
  }, [logado, readyAt]);

  // o "GOOOL" de tela cheia só na aba Jogar
  useEffect(() => { if (last && naAbaJogar) visto.current = last.at; }, [last?.at, naAbaJogar]);
  // em qualquer outra tela o gol entra como aviso discreto (e sai de cena para não reaparecer velho)
  useEffect(() => {
    if (!last || naAbaJogar) return;
    if (visto.current !== last.at) toast(last.goal ? `GOL de chute direto! +${fmtMoney(last.money)}` : 'Chute direto: não foi dessa vez.', 'success');
    clear();
  }, [last?.at, naAbaJogar]);

  return (
    <GoalOverlay open={!!last && naAbaJogar} goal={last?.goal ?? false} text={last?.text} money={last?.money} team={team} onClose={clear} />
  );
}
