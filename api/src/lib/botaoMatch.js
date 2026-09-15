/**
 * Regras de uma partida de Futebol de Botão (X1), puras e sem relógio — o servidor (realtime/x1.js) só
 * liga os tempos e as mensagens; os testes usam as mesmas funções.
 *
 * - Cada vez: BOTAO.snapsPerTurn petelecos do mesmo jogador (quem começa só dá BOTAO.firstTurnSnaps na 1ª).
 * - Gol: placar +1; se não acabou, todos voltam para a formação e quem SOFREU o gol começa a próxima vez.
 * - Quem fizer BOTAO.goalsToWin primeiro vence (hoje: o 1º gol acaba). Acabaram os BOTAO.maxTurns turnos (somando os dois) com
 *   empate → pênaltis: BOTAO.penalties cobranças de cada, alternadas; depois cobrança alternada até
 *   desempatar (no máximo BOTAO.suddenDeath rodadas; se ainda empatar, empate de verdade).
 * - Pênalti: só o cobrador, o goleiro do outro lado (num lugar sorteado perto do meio do gol) e a bola.
 */
import { BOTAO } from './rules.js';
import { BOTAO_FIELD, kickoffLayout, penaltyLayout, simulateSnap, botaoScorer } from './botao.js';

/** Partida nova: `first` começa (sorteado pelo servidor). `rnd()` = sorteio 0..1 (para os pênaltis). */
export function newBotaoMatch(first) {
  const { pieces, ball } = kickoffLayout();
  return {
    phase: 'play', pieces, ball, score: [0, 0], turn: first, first, turnNo: 1, snapsLeft: BOTAO.firstTurnSnaps ?? BOTAO.snapsPerTurn,
    pen: null, over: null,
  };
}

/** O que a tela precisa ver agora. */
export function botaoView(s) {
  return {
    phase: s.phase, pieces: s.pieces, ball: s.ball, score: s.score, turn: s.turn, turnNo: s.turnNo,
    maxTurns: BOTAO.maxTurns, snapsLeft: s.snapsLeft, snapsPerTurn: BOTAO.snapsPerTurn, goalsToWin: BOTAO.goalsToWin,
    pen: s.pen ? { kicks: s.pen.kicks, kicker: s.pen.kicker, round: s.pen.round, of: BOTAO.penalties } : null,
    over: s.over,
  };
}

/** Os botões que `side` pode tocar agora (índices em s.pieces). No pênalti, só o cobrador. */
export function movablePieces(s, side) {
  if (s.over || s.turn !== side) return [];
  return s.pieces.map((p, i) => (p.side === side && (s.phase === 'play' || !p.gk) ? i : -1)).filter((i) => i >= 0);
}

function startPenalties(s, rnd) {
  const kicker = 1 - s.first; // começa quem não deu a saída da partida
  const off = Math.round((rnd() * 2 - 1) * 16);
  const lay = penaltyLayout(kicker, off);
  s.phase = 'penalties';
  s.pen = { kicks: [[], []], kicker, round: 1 };
  s.pieces = lay.pieces; s.ball = lay.ball; s.turn = kicker; s.snapsLeft = 1;
}

/** Decide os pênaltis depois de cada cobrança: vencedor, empate de verdade, ou null (continua). */
function penaltyResult(pen) {
  const [a, b] = pen.kicks, N = BOTAO.penalties;
  const ga = a.filter(Boolean).length, gb = b.filter(Boolean).length;
  if (a.length <= N && b.length <= N) {
    // melhor de N: acaba antes se um não alcança mais o outro
    const leftA = N - a.length, leftB = N - b.length;
    if (ga > gb + leftB) return { winner: 0 };
    if (gb > ga + leftA) return { winner: 1 };
    if (a.length === N && b.length === N) return ga === gb ? null : { winner: ga > gb ? 0 : 1 };
    return null;
  }
  // alternadas (morte súbita): decide quando os dois já bateram a mesma quantidade
  if (a.length !== b.length) return null;
  if (ga !== gb) return { winner: ga > gb ? 0 : 1 };
  if (a.length >= N + BOTAO.suddenDeath) return { winner: null }; // empate de verdade (raríssimo)
  return null;
}

function nextPenalty(s, rnd) {
  const r = penaltyResult(s.pen);
  if (r) { s.over = { winner: r.winner, reason: r.winner === null ? 'empate' : 'penaltis' }; return; }
  const kicker = 1 - s.pen.kicker;
  const off = Math.round((rnd() * 2 - 1) * 16);
  const lay = penaltyLayout(kicker, off);
  s.pen.kicker = kicker;
  s.pen.round = s.pen.kicks[kicker].length + 1; // cobrança nº do cobrador da vez
  s.pieces = lay.pieces; s.ball = lay.ball; s.turn = kicker; s.snapsLeft = 1;
}

/** Fim de um turno sem gol (ou depois de gol): passa a vez, ou acaba/leva aos pênaltis no limite. */
function endTurn(s, nextSide, rnd) {
  if (s.turnNo >= BOTAO.maxTurns) {
    if (s.score[0] !== s.score[1]) { s.over = { winner: s.score[0] > s.score[1] ? 0 : 1, reason: 'tempo' }; return; }
    startPenalties(s, rnd);
    return;
  }
  s.turnNo += 1; s.turn = nextSide; s.snapsLeft = BOTAO.snapsPerTurn;
}

/**
 * Um peteleco de `side` no botão `idx`. Devolve { sim, events } e já atualiza o estado `s`.
 * events: 'goal' {side, own}, 'turn' {side}, 'penalty' {kicker, scored}, 'penalties' (começaram), 'over'.
 */
export function applySnap(s, side, idx, dx, dy, power, rnd) {
  if (s.over || s.turn !== side || !movablePieces(s, side).includes(idx)) return null;
  const sim = simulateSnap(s, idx, dx, dy, Math.max(0.05, Math.min(1, power)));
  const events = [];
  s.ball = sim.ball; s.pieces = sim.pieces;
  const scorer = botaoScorer(sim.goal);
  if (s.phase === 'penalties') {
    const scored = scorer === side;
    s.pen.kicks[side].push(scored);
    events.push({ t: 'penalty', kicker: side, scored });
    nextPenalty(s, rnd);
    if (s.over) events.push({ t: 'over', ...s.over }); else events.push({ t: 'turn', side: s.turn, penalty: true });
    return { sim, events };
  }
  if (scorer !== null) {
    s.score[scorer] += 1;
    events.push({ t: 'goal', side: scorer, own: scorer !== side, score: [...s.score] });
    if (s.score[scorer] >= BOTAO.goalsToWin) { s.over = { winner: scorer, reason: 'gols' }; events.push({ t: 'over', ...s.over }); return { sim, events }; }
    const lay = kickoffLayout();
    s.pieces = lay.pieces; s.ball = lay.ball;
    endTurn(s, 1 - scorer, rnd); // quem sofreu recomeça
    if (s.over) events.push({ t: 'over', ...s.over });
    else events.push({ t: s.phase === 'penalties' ? 'penalties' : 'turn', side: s.turn, reset: true });
    return { sim, events };
  }
  s.snapsLeft -= 1;
  if (s.snapsLeft <= 0) {
    endTurn(s, 1 - side, rnd);
    if (s.over) events.push({ t: 'over', ...s.over });
    else events.push({ t: s.phase === 'penalties' ? 'penalties' : 'turn', side: s.turn });
  }
  return { sim, events };
}

/** Acabou o tempo do peteleco: conta como peteleco perdido (no pênalti, cobrança perdida). */
export function skipSnap(s, rnd) {
  if (s.over) return [];
  const side = s.turn;
  if (s.phase === 'penalties') {
    s.pen.kicks[side].push(false);
    nextPenalty(s, rnd);
    return s.over ? [{ t: 'penalty', kicker: side, scored: false }, { t: 'over', ...s.over }] : [{ t: 'penalty', kicker: side, scored: false }, { t: 'turn', side: s.turn, penalty: true }];
  }
  s.snapsLeft -= 1;
  if (s.snapsLeft > 0) return [{ t: 'skip', side }];
  endTurn(s, 1 - side, rnd);
  if (s.over) return [{ t: 'skip', side }, { t: 'over', ...s.over }];
  return [{ t: 'skip', side }, { t: s.phase === 'penalties' ? 'penalties' : 'turn', side: s.turn }];
}

/**
 * Bot (treino): mira em 3 pontos do gol (meio e os dois cantos), com os 3 botões mais perto da bola; para
 * cada um calcula onde o botão tem de bater na bola, simula e fica com a melhor jogada (às vezes pega outra,
 * para dar para vencer). `skill` 0..1.
 */
export function botaoBotMove(s, side, rnd, skill = 0.55) {
  const F = BOTAO_FIELD;
  const gy = side === 0 ? -20 : F.H + 20;
  const targets = [F.W / 2, F.goalX[0] + F.ball + 6, F.goalX[1] - F.ball - 6].map((x) => ({ x, y: gy }));
  const goal = { x: F.W / 2, y: gy };
  const mine = movablePieces(s, side)
    .map((idx) => ({ idx, d: Math.hypot(s.pieces[idx].x - s.ball.x, s.pieces[idx].y - s.ball.y) }))
    .sort((a, b) => a.d - b.d).slice(0, 3);
  const cands = [];
  for (const { idx } of mine) {
    const p = s.pieces[idx];
    for (const t of targets) {
      const tx = t.x - s.ball.x, ty = t.y - s.ball.y, tl = Math.hypot(tx, ty) || 1;
      const contact = { x: s.ball.x - (tx / tl) * (F.ball + F.piece - 2), y: s.ball.y - (ty / tl) * (F.ball + F.piece - 2) };
      const ax = contact.x - p.x, ay = contact.y - p.y, dist = Math.hypot(ax, ay);
      for (const jitter of [0, 0.04, -0.04]) {
        const ang = Math.atan2(ay, ax) + jitter + (rnd() - 0.5) * 0.03;
        const power = Math.max(0.3, Math.min(1, (dist + 140) / 380 + (rnd() - 0.5) * 0.1));
        const sim = simulateSnap(s, idx, Math.cos(ang), Math.sin(ang), power);
        const sc = botaoScorer(sim.goal);
        const score = sc === side ? 10000 : sc !== null ? -10000 : -Math.hypot(sim.ball.x - goal.x, sim.ball.y - goal.y);
        cands.push({ idx, dx: Math.cos(ang), dy: Math.sin(ang), power, score });
      }
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);
  return rnd() < skill ? cands[0] : cands[Math.min(cands.length - 1, Math.floor(rnd() * Math.min(6, cands.length)))];
}
