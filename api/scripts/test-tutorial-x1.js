/**
 * Etapa do X1 do tutorial, ponta a ponta contra a API LOCAL rodando (TX_API, padrão http://localhost:4320).
 *
 * O que ele prova (e que o teste de tela não pegou em 18/09/2026): o jogador no passo do X1 desafia, ninguém
 * de verdade aceita, e em TUTORIAL.botAcceptSec um bot entra — **e JOGA**. O bug que passou foi exatamente
 * esse: o bot entrava na partida e perdia a vez, porque a função que faz a jogada só aceitava o bot de
 * TREINO (`bot`) e não o do tutorial (`ai`). Aqui a gente espera a jogada dele chegar.
 *
 * Também confere que a partida é DE VERDADE (aposta cobrada, sem cara de treino), como o dono decidiu.
 *
 * Uso (na pasta api/, com a API local no ar e X1_JOGO=FUTPREGO no .env dela):
 *   node scripts/test-tutorial-x1.js   → "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-tutorial-x1.js só roda no banco LOCAL (cria jogador de teste).');
  process.exit(1);
}
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
const { prisma } = await import('../src/prisma.js');
const { FUTPREGO: F, TUTORIAL } = await import('../src/lib/rules.js');
const { config } = await import('../src/config.js');

const API = process.env.TX_API || 'http://localhost:4320';
const WS = API.replace(/^http/, 'ws') + '/api/ws/x1';
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── precisa de pelo menos um bot livre, de outro time e com dinheiro
const time = await prisma.team.findFirst();
const bots = await prisma.user.count({ where: { isBot: true, money: { gte: F.bet }, teamId: { not: time.id } } });
if (!bots) {
  console.error(`Sem bot no banco local para o teste. Rode antes:\n  node scripts/bots.js criar\nE dê dinheiro a eles (money >= ${F.bet}).`);
  process.exit(1);
}

const nick = `tx${Date.now() % 1e6}`;
const jogador = await prisma.user.create({
  data: {
    nick, nickLower: nick, email: `${nick}@local.test`, passwordHash: 'x', teamId: time.id,
    money: F.bet, tutorialStep: TUTORIAL.steps, // no passo do X1: é o que libera o bot
  },
});
const token = jwt.sign({ uid: jogador.id, nick: jogador.nick }, config.jwtSecret, { expiresIn: '1d' });

/** Conecta como se fosse o celular dele (IP próprio: a trava de internet não atrapalha). */
const ws = new WebSocket(`${WS}?token=${encodeURIComponent(token)}&mode=game`, { headers: { 'X-Real-IP': '198.51.100.77' } });
const recebidas = [];
ws.on('message', (raw) => { try { recebidas.push(JSON.parse(raw.toString())); } catch {} });
const espera = async (tipo, segundos) => {
  for (let i = 0; i < segundos * 10; i++) {
    const m = recebidas.find((x) => x.t === tipo);
    if (m) return m;
    await sleep(100);
  }
  return null;
};

await espera('hello', 5);
ws.send(JSON.stringify({ t: 'challenge' }));
check(!!(await espera('waiting', 5)), 'o desafio abriu e ficou esperando alguém aceitar');

// ── o bot entra sozinho
const partida = await espera('match', TUTORIAL.botAcceptSec + 15);
check(!!partida, `um bot aceitou o desafio em até ${TUTORIAL.botAcceptSec + 15} s`);
if (partida) {
  const adversario = partida.players[1 - partida.you];
  check(!adversario.bot, `na tela ele aparece como jogador normal (${adversario.nick}), sem marca de bot`);
  check(partida.training === false && partida.bet === F.bet, `a partida vale de verdade: aposta de R$ ${partida.bet}, sem cara de treino`);
  const u = await prisma.user.findUnique({ where: { id: jogador.id } });
  check(u.money === 0, `a aposta foi cobrada do jogador (sobrou R$ ${u.money})`);
  const linha = await prisma.x1Match.findFirst({ where: { aId: jogador.id }, orderBy: { id: 'desc' } });
  check(!!linha && linha.bet === F.bet, 'a partida foi gravada no histórico do X1, como qualquer outra');

  // ── O QUE FALTAVA: o bot tem de JOGAR, não perder a vez
  const minhaVez = partida.turn === partida.you;
  const jogada = await espera('shot', minhaVez ? 5 : F.turnSec + 12);
  if (minhaVez) {
    check(true, '(a primeira vez saiu para o jogador; a do bot vem depois)');
    // devolve a vez para o bot com um peteleco qualquer e espera o dele
    ws.send(JSON.stringify({ t: 'flick', dx: 0, dy: -1, power: 0.5 }));
    const dele = await espera('shot', F.turnSec + 14);
    check(!!dele, 'o bot jogou quando chegou a vez dele (não deixou o tempo acabar)');
  } else {
    check(!!jogada, 'o bot jogou quando chegou a vez dele (não deixou o tempo acabar)');
    check(!!jogada && jogada.side === 1 - partida.you, 'e o peteleco saiu do lado dele mesmo');
  }
}

ws.close();
await prisma.$transaction([
  prisma.x1Match.deleteMany({ where: { OR: [{ aId: jogador.id }, { bId: jogador.id }] } }),
  prisma.user.delete({ where: { id: jogador.id } }),
]);
await prisma.$disconnect();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
