import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PregoBoard, type PregoBoardData, type TeamPaint } from '../components/PregoBoard';
import { BotaoField, BotaoDisc, type BotaoFieldData, type BotaoPiece } from '../components/BotaoField';
import { TriondaBall } from '../components/TriondaBall';
import { Shield } from '../components/Shield';
import { paintOf, reservePaint } from '../lib/paint';
import type { Team } from '../lib/types';

/**
 * Rota oculta (sem login) para conferir por screenshot as peças do X1 no AMISTOSO — titular (lado 0) contra o
 * uniforme reserva (lado 1, cores invertidas; lib/paint.ts). `/debug-x1-kits?times=santa-cruz,flamengo` (sem
 * `times`, todos os times). Lê /api/meta (tábua, campo, saída) e /api/teams (cores) — nada gravado.
 */
export function DebugX1KitsScreen() {
  const [params] = useSearchParams();
  const [teams, setTeams] = useState<Team[]>([]);
  const [meta, setMeta] = useState<{ board?: PregoBoardData; field?: BotaoFieldData; kickoff?: { pieces: BotaoPiece[]; ball: { x: number; y: number } } } | null>(null);
  useEffect(() => {
    fetch('/api/meta').then((r) => r.json()).then((m) => setMeta({ board: m.futprego?.board, field: m.x1?.field, kickoff: m.x1?.kickoff })).catch(() => setMeta({}));
    fetch('/api/teams').then((r) => r.json()).then((list: Team[]) => {
      const only = (params.get('times') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      setTeams(only.length ? only.map((slug) => list.find((t) => t.slug === slug)).filter((t): t is Team => !!t) : list);
    }).catch(() => {});
  }, []);
  if (!meta) return <p className="p-4 text-white">carregando…</p>;
  const only = params.get('so'); // 'botao' | 'prego' = só um dos jogos, 2 por linha (print mais legível)
  return (
    <div className="app-frame min-h-full px-3 py-4" style={{ maxWidth: 480 }}>
      <div className="t-display t-out mb-3 text-center text-[20px]">AMISTOSO: TITULAR × RESERVA</div>
      <div className={only ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
        {teams.map((t) => {
          const a = paintOf(t), b = reservePaint(a);
          const paint: [TeamPaint, TeamPaint] = [a, b];
          const botao = meta.field && meta.kickoff && (
            <BotaoField field={meta.field} className="w-full drop-shadow-[0_4px_0_rgba(0,0,0,0.25)]">
              {meta.kickoff.pieces.map((p, i) => <g key={i} transform={`translate(${p.x} ${p.y})`}><BotaoDisc p={p} r={meta.field!.piece} paint={paint[p.side]} /></g>)}
              <g transform={`translate(${meta.kickoff.ball.x} ${meta.kickoff.ball.y})`}><TriondaBall r={meta.field.ball} idle /></g>
            </BotaoField>
          );
          const prego = meta.board && (
            <PregoBoard board={meta.board} paint={paint} ball={<g transform={`translate(${meta.board.W / 2} ${meta.board.H / 2})`}><TriondaBall r={meta.board.ball} idle /></g>} className="w-full drop-shadow-[0_4px_0_rgba(0,0,0,0.25)]" />
          );
          return (
            <div key={t.slug} className="panel text-navy-ink" style={{ paddingBlock: 10 }}>
              <div className="mb-1 flex items-center gap-2"><Shield team={t} size={22} /><span className="t-display text-[14px] leading-tight">{t.name}</span></div>
              {only ? (only === 'prego' ? prego : botao) : (
                <div className="flex items-start gap-3"><div className="w-[44%]">{botao}</div><div className="w-[44%]">{prego}</div></div>
              )}
              <div className="mt-1 text-[9px] font-extrabold leading-tight text-muted">embaixo = titular · em cima = reserva</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
