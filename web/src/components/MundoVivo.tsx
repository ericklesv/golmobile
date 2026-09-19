import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { create } from 'zustand';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { Shield } from './Shield';
import { countdown, pct } from '../lib/format';
import type { Vitrine } from '../lib/types';

/**
 * O jogo acontecendo, para quem ainda NÃO entrou (dono, 19/09/2026: "alguns usuários abrem o site e dão de
 * cara com o login… isso faz eles desanimarem… era ideal mostrar um mundo vivo").
 *
 * Nada de frase de propaganda: o que prova que o jogo está vivo é o PLACAR DE VERDADE. Por isso o primeiro
 * bloco da tela de entrada é a partida mais disputada da rodada, com o relógio correndo para as 19h
 * (`PlacarDaRodada`, acima do formulário); os dois rankings que mais mexem com quem joga — artilharia do dia
 * e reis do X1 — ficam abaixo dele (`RankingsDaVitrine`), para quem rolar a tela.
 *
 * Os dois bebem da MESMA chamada (`GET /api/vitrine`, pública e em cache de 15 s no servidor), recarregada a
 * cada 30 s. Se a API não responder, os blocos simplesmente não aparecem e a tela de entrada segue igual.
 */

const RECARGA_MS = 30_000;

type Store = { v: Vitrine | null; buscando: boolean; puxar: () => Promise<void> };
const useVitrine = create<Store>((set, get) => ({
  v: null, buscando: false,
  puxar: async () => {
    if (get().buscando) return;
    set({ buscando: true });
    try { set({ v: await api.vitrine() }); } catch { /* sem vitrine: a tela de entrada funciona igual */ }
    finally { set({ buscando: false }); }
  },
}));

/** Puxa uma vez e mantém atualizado enquanto qualquer bloco estiver na tela. */
function useMundoVivo() {
  const v = useVitrine((s) => s.v);
  const puxar = useVitrine((s) => s.puxar);
  useEffect(() => {
    puxar();
    const iv = setInterval(puxar, RECARGA_MS);
    return () => clearInterval(iv);
  }, [puxar]);
  return v;
}

/** O placar da partida mais disputada da rodada, com quantos estão jogando agora. */
export function PlacarDaRodada() {
  const v = useMundoVivo();
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (!v) return null;
  const m = v.match;
  const falta = v.round ? new Date(v.round.endsAt).getTime() - agora : 0;

  return (
    <div className="relative mt-4 flex flex-col gap-3">
      {v.online > 0 && (
        <p className="flex items-center justify-center gap-2 text-[13px] font-extrabold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]">
          <motion.span animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 2.2, repeat: Infinity }} className="inline-block h-2.5 w-2.5 rounded-full bg-grass" />
          {v.online === 1 ? '1 jogador chutando agora' : `${v.online} jogadores chutando agora`}
        </p>
      )}

      {m && (
        <div className="panel relative pt-9">
          <div className="absolute -top-7 left-1/2 -translate-x-1/2"><div className="ribbon ribbon-blue text-[13px]">JOGO DA RODADA</div></div>
          <div className="flex items-center justify-center gap-3">
            <div className="flex w-[33%] flex-col items-center gap-1">
              <Shield team={m.home} size={44} />
              <span className="w-full truncate text-center text-[12px] font-extrabold text-navy-ink">{m.home.name}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <motion.span key={`h${m.homeGoals}`} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="t-display text-[34px] leading-none text-navy-ink">{m.homeGoals}</motion.span>
              <span className="t-display text-[16px] text-muted">x</span>
              <motion.span key={`a${m.awayGoals}`} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="t-display text-[34px] leading-none text-navy-ink">{m.awayGoals}</motion.span>
            </div>
            <div className="flex w-[33%] flex-col items-center gap-1">
              <Shield team={m.away} size={44} />
              <span className="w-full truncate text-center text-[12px] font-extrabold text-navy-ink">{m.away.name}</span>
            </div>
          </div>
          <div className="bar mt-3"><i style={{ width: `calc(${m.pct}% + 6px)` }} /><span>{pct(m.pct)} · {pct(100 - m.pct)}</span></div>
          <p className="mt-2 text-center text-[12px] font-bold text-muted">
            Série {m.serie} · rodada {v.round?.number}
            {falta > 0 && <> · fecha em <b className="t-display text-[13px] text-orange-deep">{countdown(falta)}</b></>}
          </p>
        </div>
      )}
    </div>
  );
}

/** Linha de ranking: posição, sigla do time, nick e o número que importa. */
function Linha({ pos, nick, teamAbbr, teamColor, valor, unidade }: { pos: number; nick: string; teamAbbr?: string; teamColor?: string; valor: number; unidade: string }) {
  return (
    <li className={`flex items-center gap-2 rounded-lg px-2 py-1 ${pos % 2 ? 'bg-sky/10' : ''}`}>
      <span className={`t-display w-5 shrink-0 text-center text-[13px] ${pos === 1 ? 'text-gold-deep' : 'text-muted'}`}>{pos}</span>
      {teamAbbr && <span className="t-display shrink-0 rounded px-1 text-[10px] text-white" style={{ background: teamColor ?? '#14335F' }}>{teamAbbr}</span>}
      <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-navy-ink">{nick}</span>
      <span className="t-display shrink-0 text-[14px] text-grass-deep">{valor}<span className="ml-0.5 text-[10px] text-muted">{unidade}</span></span>
    </li>
  );
}

function Quadro({ titulo, ribbon, vazio, children }: { titulo: string; ribbon: 'green' | 'orange'; vazio: boolean; children: React.ReactNode }) {
  return (
    <div className="panel relative flex-1 pt-9">
      <div className="absolute -top-7 left-1/2 -translate-x-1/2"><div className={`ribbon ribbon-${ribbon} text-[13px]`}>{titulo}</div></div>
      {vazio ? <p className="py-2 text-center text-[12px] font-bold text-muted">Ninguém pontuou ainda nesta rodada.</p> : <ul className="flex flex-col">{children}</ul>}
    </div>
  );
}

/** Artilheiros do dia e reis do X1, abaixo do formulário. */
export function RankingsDaVitrine() {
  const v = useMundoVivo();
  if (!v || (!v.scorers.length && !v.x1.length)) return null;
  return (
    <div className="relative mt-7 flex flex-col gap-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:gap-3">
        <Quadro titulo="ARTILHEIROS DE HOJE" ribbon="green" vazio={!v.scorers.length}>
          {v.scorers.map((r, i) => (
            <Linha key={r.userId} pos={i + 1} nick={r.nick} teamAbbr={r.team?.abbr} teamColor={r.team?.colorPrimary} valor={r.goals} unidade="gols" />
          ))}
        </Quadro>
        <Quadro titulo="REIS DO X1" ribbon="orange" vazio={!v.x1.length}>
          {v.x1.map((r, i) => (
            <Linha key={r.userId} pos={i + 1} nick={r.nick} teamAbbr={r.team?.abbr} teamColor={r.team?.colorPrimary} valor={r.goals} unidade="pts" />
          ))}
        </Quadro>
      </div>
      <p className="text-center text-[12px] font-bold text-white/90 drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]">
        Cada gol seu entra no placar do seu time. <Link to="/bem-vindo" className="text-gold underline">Como funciona</Link>
      </p>
    </div>
  );
}
