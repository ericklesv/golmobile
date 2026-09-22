import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PregoBoard, type PregoBoardData, type TeamPaint } from '../components/PregoBoard';
import { BotaoField, BotaoDisc, type BotaoFieldData, type BotaoPiece } from '../components/BotaoField';
import { TriondaBall } from '../components/TriondaBall';
import { Shield } from '../components/Shield';
import { paintOf, reservePaint, matchPaints, kitClash, kitDiff } from '../lib/paint';
import type { Team } from '../lib/types';

type Meta = { board?: PregoBoardData; field?: BotaoFieldData; kickoff?: { pieces: BotaoPiece[]; ball: { x: number; y: number } } };

/**
 * Rota oculta (sem login) para conferir por screenshot as peças do X1 (lib/paint.ts). Lê /api/meta (tábua, campo,
 * saída) e /api/teams (cores) — nada gravado.
 *   `/debug-x1-kits?times=santa-cruz,flamengo` — AMISTOSO: titular (lado 0) × reserva (lado 1); sem `times`, todos.
 *   `/debug-x1-kits?confrontos=1` — todos os confrontos que se confundem (kitClash): titular × titular e, ao lado, como
 *     fica com a reserva (matchPaints). `&times=flamengo,athletico-pr` = só os confrontos entre esses times; `&todos=1`
 *     mostra também os que NÃO se confundem (para conferir o corte).
 *   `?so=botao|prego` = só um dos jogos.
 */
export function DebugX1KitsScreen() {
  const [params] = useSearchParams();
  const [teams, setTeams] = useState<Team[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    fetch('/api/meta').then((r) => r.json()).then((m) => setMeta({ board: m.futprego?.board, field: m.x1?.field, kickoff: m.x1?.kickoff })).catch(() => setMeta({}));
    fetch('/api/teams').then((r) => r.json()).then((list: Team[]) => {
      const only = (params.get('times') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      setTeams(only.length ? only.map((slug) => list.find((t) => t.slug === slug)).filter((t): t is Team => !!t) : list);
    }).catch(() => {});
  }, []);
  if (!meta) return <p className="p-4 text-white">carregando…</p>;
  const only = params.get('so'); // 'botao' | 'prego' = só um dos jogos, 2 por linha (print mais legível)
  if (params.get('confrontos')) return <Clashes teams={teams} meta={meta} game={only === 'prego' ? 'prego' : 'botao'} all={!!params.get('todos')} />;
  return (
    <div className="app-frame min-h-full px-3 py-4" style={{ maxWidth: 480 }}>
      <div className="t-display t-out mb-3 text-center text-[20px]">AMISTOSO: TITULAR × RESERVA</div>
      <div className={only ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
        {teams.map((t) => {
          const a = paintOf(t), b = reservePaint(a);
          const paint: [TeamPaint, TeamPaint] = [a, b];
          const botao = <BotaoPreview meta={meta} paint={paint} />;
          const prego = <PregoPreview meta={meta} paint={paint} />;
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

function BotaoPreview({ meta, paint }: { meta: Meta; paint: [TeamPaint, TeamPaint] }) {
  if (!meta.field || !meta.kickoff) return null;
  return (
    <BotaoField field={meta.field} className="w-full drop-shadow-[0_4px_0_rgba(0,0,0,0.25)]">
      {meta.kickoff.pieces.map((p, i) => <g key={i} transform={`translate(${p.x} ${p.y})`}><BotaoDisc p={p} r={meta.field!.piece} paint={paint[p.side]} /></g>)}
      <g transform={`translate(${meta.kickoff.ball.x} ${meta.kickoff.ball.y})`}><TriondaBall r={meta.field.ball} idle /></g>
    </BotaoField>
  );
}

function PregoPreview({ meta, paint }: { meta: Meta; paint: [TeamPaint, TeamPaint] }) {
  if (!meta.board) return null;
  return <PregoBoard board={meta.board} paint={paint} ball={<g transform={`translate(${meta.board.W / 2} ${meta.board.H / 2})`}><TriondaBall r={meta.board.ball} idle /></g>} className="w-full drop-shadow-[0_4px_0_rgba(0,0,0,0.25)]" />;
}

/** Os confrontos que se confundem: antes (titular × titular) e depois (com a reserva que a partida usa). */
function Clashes({ teams, meta, game, all }: { teams: Team[]; meta: Meta; game: 'botao' | 'prego'; all: boolean }) {
  const pairs: [Team, Team][] = [];
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) if (all || kitClash(paintOf(teams[i]), paintOf(teams[j]))) pairs.push([teams[i], teams[j]]);
  const Preview = game === 'prego' ? PregoPreview : BotaoPreview;
  return (
    <div className="app-frame min-h-full px-3 py-4" style={{ maxWidth: 480 }}>
      <div className="t-display t-out mb-3 text-center text-[20px]">{all ? `CONFRONTOS: ${pairs.length}` : `CONFRONTOS QUE SE CONFUNDEM: ${pairs.length}`}</div>
      <div className="flex flex-col gap-3">
        {pairs.map(([a, b]) => {
          const pa = paintOf(a), pb = paintOf(b);
          const d = kitDiff(pa, pb);
          const fixed = matchPaints(pa, pb);
          return (
            <div key={`${a.slug}-${b.slug}`} className="panel text-navy-ink" style={{ paddingBlock: 10 }}>
              <div className="mb-1 flex items-center gap-2">
                <Shield team={a} size={20} /><span className="t-display text-[13px] leading-tight">{a.name} × {b.name}</span><Shield team={b} size={20} />
                <span className="ml-auto text-[9px] font-extrabold text-muted">dif. {d.total.toFixed(0)} · miolo {d.face.toFixed(0)}</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1/2"><Preview meta={meta} paint={[pa, pb]} /><div className="mt-0.5 text-center text-[9px] font-extrabold text-muted">antes</div></div>
                <div className="w-1/2"><Preview meta={meta} paint={fixed.paint} /><div className="mt-0.5 text-center text-[9px] font-extrabold text-muted">{fixed.reserve === null ? 'agora (os dois de titular)' : `agora (${fixed.reserve === 0 ? a.name : b.name} de reserva)`}</div></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
