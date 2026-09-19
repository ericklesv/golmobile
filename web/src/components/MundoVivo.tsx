import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { create } from 'zustand';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { Shield } from './Shield';
import { Panel, TopList } from './ui';
import { X1King } from './X1King';
import { countdown, pct } from '../lib/format';
import type { Vitrine } from '../lib/types';

/**
 * O jogo acontecendo, para quem ainda NÃO entrou (dono, 19/09/2026: "alguns usuários abrem o site e dão de
 * cara com o login… isso faz eles desanimarem… era ideal mostrar um mundo vivo").
 *
 * Nada de frase de propaganda: o que prova que o jogo está vivo é o PLACAR DE VERDADE. A ordem da tela de
 * entrada é a que o dono pediz: o jogo da rodada, os artilheiros, o rei do X1 e **o formulário por último** —
 * com um botão "Entrar" no topo para quem só quer logar e já sabe o caminho.
 *
 * Os quadros são os MESMOS do jogo por dentro (`Panel`, `TopList`, `X1King`): foto, escudo, nome com os
 * distintivos e o número — quem chega já vê a cara do jogo. Os links ficam inertes aqui, porque o perfil do
 * jogador está atrás do login: clicar levaria a lugar nenhum.
 *
 * Tudo vem de `GET /api/vitrine` (pública, cache de 15 s no servidor), recarregada a cada 30 s. API fora do
 * ar = os blocos somem e a tela de entrada funciona igual.
 */

const RECARGA_MS = 30_000;
/** Links inertes: nesta página o perfil e o X1 estão atrás do login. */
const INERTE = '[&_a]:pointer-events-none';

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

/** Botão do topo: quem já tem conta não precisa rolar até o fim. */
export function BotaoEntrarNoTopo() {
  const irAoFormulario = () => document.getElementById('entrar')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return (
    <button onClick={irAoFormulario} className="btn btn-blue btn-sm absolute right-0 top-0 z-20">Entrar</button>
  );
}

/** O placar da partida mais disputada da rodada, com quantos estão jogando agora. */
export function PlacarDaRodada() {
  const v = useMundoVivo();
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (!v?.match) return null;
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
      <Panel title="JOGO DA RODADA" ribbon="blue">
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
      </Panel>
    </div>
  );
}

/** Artilheiros do dia e o pódio do X1 — os mesmos quadros de dentro do jogo. */
export function RankingsDaVitrine() {
  const v = useMundoVivo();
  if (!v || (!v.scorers.length && !v.x1.length)) return null;
  return (
    <div className={`relative mt-5 flex flex-col gap-5 ${INERTE}`}>
      {v.scorers.length > 0 && (
        <Panel title="ARTILHEIROS DE HOJE" ribbon="green"><TopList rows={v.scorers} empty="Sem gols na rodada." /></Panel>
      )}
      {v.x1.length > 0 && <X1King rows={v.x1} />}
    </div>
  );
}

/** Fecho da página, embaixo do formulário. */
export function RodapeDaVitrine() {
  return (
    <p className="relative mt-5 text-center text-[12px] font-bold text-white/90 drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]">
      Cada gol seu entra no placar do seu time. <Link to="/bem-vindo" className="text-gold underline">Como funciona</Link>
    </p>
  );
}
