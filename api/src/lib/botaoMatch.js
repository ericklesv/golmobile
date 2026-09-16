/**
 * Regras de uma partida de Futebol de Botão (X1), puras e sem relógio — o servidor (realtime/x1.js) só
 * liga os tempos e as mensagens; os testes usam as mesmas funções.
 *
 * - Cada vez: BOTAO.snapsPerTurn petelecos do mesmo jogador (quem começa só dá BOTAO.firstTurnSnaps na 1ª).
 * - Gol: placar +1; se não acabou, todos voltam para a formação e quem SOFREU o gol começa a próxima vez.
 * - Quem fizer BOTAO.goalsToWin primeiro vence (hoje: o 1º gol acaba).
 * - Acabaram os BOTAO.maxTurns turnos empatado → **DEATH MATCH** (dono, 16/09/2026; não tem mais pênalti):
 *   os botões ficam onde estão, os DOIS GOLEIROS saem na hora e o jogo segue com 1 peteleco por vez, sempre
 *   na força máxima. O botão que o jogador usou sai do campo depois da jogada, até sobrar 1x1 (o último
 *   nunca sai). Perdeu o tempo sem jogar: sai o botão mais longe da bola (senão dava para enrolar e ficar
 *   com o campo cheio). Bola que PARA dentro de uma área volta para o meio — sem goleiro, ali ninguém
 *   alcança. Passadas BOTAO.death.drawAfter1v1 rodadas de 1x1 sem gol, é empate de verdade.
 */
import { BOTAO } from './rules.js';
import { BOTAO_FIELD, kickoffLayout, simulateSnap, botaoScorer } from './botao.js';

/** Partida nova: `first` começa (sorteado pelo servidor). */
export function newBotaoMatch(first) {
  const { pieces, ball } = kickoffLayout();
  return {
    phase: 'play', pieces, ball, score: [0, 0], turn: first, first, turnNo: 1, snapsLeft: BOTAO.firstTurnSnaps ?? BOTAO.snapsPerTurn,
    dm: null, over: null,
  };
}

/** Quantos botões cada lado ainda tem em campo. */
const alive = (s) => [s.pieces.filter((p) => p.side === 0).length, s.pieces.filter((p) => p.side === 1).length];

/** O que a tela precisa ver agora. */
export function botaoView(s) {
  const [a, b] = alive(s);
  return {
    phase: s.phase, pieces: s.pieces, ball: s.ball, score: s.score, turn: s.turn, turnNo: s.turnNo,
    maxTurns: BOTAO.maxTurns, snapsLeft: s.snapsLeft, snapsPerTurn: s.phase === 'death' ? BOTAO.death.snapsPerTurn : BOTAO.snapsPerTurn,
    goalsToWin: BOTAO.goalsToWin,
    // death match: quantos botões sobraram de cada lado e quantas rodadas de 1x1 faltam para o empate
    death: s.phase === 'death' ? { left: [a, b], rounds1v1: s.dm?.rounds1v1 ?? 0, drawAfter: BOTAO.death.drawAfter1v1 } : null,
    over: s.over,
  };
}

/** Os botões que `side` pode tocar agora (índices em s.pieces). */
export function movablePieces(s, side) {
  if (s.over || s.turn !== side) return [];
  return s.pieces.map((p, i) => (p.side === side ? i : -1)).filter((i) => i >= 0);
}

/** Começa o DEATH MATCH: os botões ficam onde estão e os dois goleiros saem na hora (são os primeiros). */
function startDeathMatch(s) {
  s.phase = 'death';
  s.pieces = s.pieces.filter((p) => !p.gk);
  s.dm = { rounds1v1: 0 };
  s.snapsLeft = BOTAO.death.snapsPerTurn;
  if (ballInBox(s.ball)) ballToCenter(s); // a bola já podia estar parada numa área
}

/** A bola parou dentro de uma das áreas? (sem goleiro, ali nenhum botão alcança) */
function ballInBox(ball) {
  return BOTAO_FIELD.boxes.some((b) => ball.x >= b.x0 && ball.x <= b.x1 && ball.y >= b.y0 && ball.y <= b.y1);
}

/** Devolve a bola ao meio do campo, desviando um pouco se tiver botão em cima. */
function ballToCenter(s) {
  const F = BOTAO_FIELD;
  const livre = (x, y) => s.pieces.every((p) => Math.hypot(p.x - x, p.y - y) > F.piece + F.ball + 1);
  if (livre(F.center.x, F.center.y)) { s.ball = { ...F.center }; return; }
  for (let r = 14; r <= 70; r += 14) {
    for (let a = 0; a < 8; a++) {
      const x = F.center.x + Math.cos((a * Math.PI) / 4) * r, y = F.center.y + Math.sin((a * Math.PI) / 4) * r;
      if (x > F.ball && x < F.W - F.ball && y > F.ball && y < F.H - F.ball && livre(x, y)) { s.ball = { x, y }; return; }
    }
  }
  s.ball = { ...F.center };
}

/** Tira um botão de `side` (o que ele jogou; sem índice, o mais longe da bola). O último NUNCA sai. */
function dropPiece(s, side, idx = null) {
  const meus = s.pieces.map((p, i) => ({ p, i })).filter(({ p }) => p.side === side);
  if (meus.length <= 1) return null; // 1x1: o último fica
  let alvo = idx;
  if (alvo === null || !meus.some(({ i }) => i === alvo)) {
    alvo = meus.sort((a, b) => Math.hypot(b.p.x - s.ball.x, b.p.y - s.ball.y) - Math.hypot(a.p.x - s.ball.x, a.p.y - s.ball.y))[0].i;
  }
  const fora = s.pieces[alvo];
  s.pieces = s.pieces.filter((_, i) => i !== alvo);
  return { side, x: fora.x, y: fora.y };
}

/**
 * Fim de um turno: passa a vez. No tempo normal, o último turno empatado começa o DEATH MATCH; no death
 * match, conta as rodadas de 1x1 e decreta o empate quando passa do limite. Devolve os avisos para a tela.
 */
function endTurn(s, nextSide) {
  if (s.phase === 'play' && s.turnNo >= BOTAO.maxTurns) {
    if (s.score[0] !== s.score[1]) { s.over = { winner: s.score[0] > s.score[1] ? 0 : 1, reason: 'tempo' }; return []; }
    startDeathMatch(s);
    s.turnNo += 1; s.turn = nextSide;
    return [{ t: 'deathmatch' }];
  }
  if (s.phase === 'death') {
    const [a, b] = alive(s);
    if (a === 1 && b === 1) {
      s.dm.rounds1v1 += 0.5; // cada vez é meia rodada (os dois jogam para fechar uma)
      if (s.dm.rounds1v1 >= BOTAO.death.drawAfter1v1) { s.over = { winner: null, reason: 'empate' }; return []; }
    }
    s.turnNo += 1; s.turn = nextSide; s.snapsLeft = BOTAO.death.snapsPerTurn;
    return [];
  }
  s.turnNo += 1; s.turn = nextSide; s.snapsLeft = BOTAO.snapsPerTurn;
  return [];
}

/**
 * Um peteleco de `side` no botão `idx`. Devolve { sim, events } e já atualiza o estado `s`.
 * events: 'goal' {side, own}, 'turn' {side}, 'deathmatch' (começou), 'out' {side, x, y} (botão saiu),
 * 'ball-reset' {ball} (bola parada na área voltou ao meio), 'skip', 'over'.
 */
export function applySnap(s, side, idx, dx, dy, power, rnd) {
  if (s.over || s.turn !== side || !movablePieces(s, side).includes(idx)) return null;
  const morte = s.phase === 'death';
  const forca = morte ? 1 : Math.max(0.05, Math.min(1, power)); // no death match é sempre força máxima
  const sim = simulateSnap(s, idx, dx, dy, forca);
  const events = [];
  s.ball = sim.ball; s.pieces = sim.pieces;
  const scorer = botaoScorer(sim.goal);
  if (scorer !== null) {
    s.score[scorer] += 1;
    events.push({ t: 'goal', side: scorer, own: scorer !== side, score: [...s.score] });
    if (s.score[scorer] >= BOTAO.goalsToWin) { s.over = { winner: scorer, reason: 'gols' }; events.push({ t: 'over', ...s.over }); return { sim, events }; }
    const lay = kickoffLayout();
    s.pieces = lay.pieces; s.ball = lay.ball;
    events.push(...endTurn(s, 1 - scorer)); // quem sofreu recomeça
    if (s.over) events.push({ t: 'over', ...s.over });
    else events.push({ t: 'turn', side: s.turn, reset: true });
    return { sim, events };
  }
  if (morte) {
    // o botão que jogou sai do campo (o último de cada lado fica) e bola parada na área volta ao meio
    const fora = dropPiece(s, side, idx);
    if (fora) events.push({ t: 'out', ...fora });
    if (ballInBox(s.ball)) { ballToCenter(s); events.push({ t: 'ball-reset', ball: { ...s.ball } }); }
  }
  s.snapsLeft -= 1;
  if (s.snapsLeft <= 0) {
    events.push(...endTurn(s, 1 - side));
    if (s.over) events.push({ t: 'over', ...s.over });
    else events.push({ t: 'turn', side: s.turn });
  }
  return { sim, events };
}

/**
 * Acabou o tempo do peteleco: conta como peteleco perdido. No DEATH MATCH também custa um botão — sai o mais
 * longe da bola —, senão dava para enrolar e ficar com o campo cheio enquanto o outro esvazia.
 */
export function skipSnap(s) {
  if (s.over) return [];
  const side = s.turn;
  const events = [{ t: 'skip', side }];
  if (s.phase === 'death') {
    const fora = dropPiece(s, side);
    if (fora) events.push({ t: 'out', ...fora });
  }
  s.snapsLeft -= 1;
  if (s.snapsLeft > 0) return events;
  events.push(...endTurn(s, 1 - side));
  if (s.over) events.push({ t: 'over', ...s.over });
  else events.push({ t: 'turn', side: s.turn });
  return events;
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
        // no death match a força é sempre máxima (vale para o bot também)
        const power = s.phase === 'death' ? 1 : Math.max(0.3, Math.min(1, (dist + 140) / 380 + (rnd() - 0.5) * 0.1));
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
