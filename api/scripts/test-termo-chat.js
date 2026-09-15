/**
 * Chat sem spoiler do Termo (lib/termo/spoiler.js; pedido do dono, 15/09/2026). Duas partes:
 *   1) as regras, sem banco: palavra inteira, maiúscula/minúscula, com/sem acento, letras separadas, esticadas e com
 *      número viram *****; "santos", "está rindo" e mensagens normais ficam iguais;
 *   2) ponta a ponta contra a API LOCAL no ar (FP_API, padrão http://localhost:4320): quem manda a palavra de HOJE
 *      recebe de volta com *****, quem lê o chat também, e o banco guarda o texto real (a denúncia vê o que foi escrito).
 * Cria 1 jogador de teste (nick tq…) e 2 mensagens na sala geral do banco local.
 *
 * Uso (na pasta api/, com a API local no ar):  node scripts/test-termo-chat.js   → "TUDO OK".
 */
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('test-termo-chat.js só roda no banco LOCAL (cria jogador e mensagens de teste).');
  process.exit(1);
}
import jwt from 'jsonwebtoken';
const { maskWord, maskTermo } = await import('../src/lib/termo/spoiler.js');
const { wordOfDay } = await import('../src/lib/termo/answers.js');
const { dayNumber } = await import('../src/lib/time.js');

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${label}`); if (!ok) fails++; };
const same = (text, answer, want) => { const got = maskWord(text, answer); check(got === want, `${answer}: "${text}" → "${got}"${got === want ? '' : ` (esperava "${want}")`}`); };

// ── 1) as regras
same('a palavra de hoje é santo', 'SANTO', 'a palavra de hoje é *****');
same('SANTO!!! fácil demais', 'SANTO', '*****!!! fácil demais');
same('é Sânto kkk', 'SANTO', 'é ***** kkk');
same('s a n t o', 'SANTO', '*****');
same('s.a.n.t.o', 'SANTO', '*****');
same('S-A-N-T-O', 'SANTO', '*****');
same('santooooo', 'SANTO', '*****');
same('s4nt0', 'SANTO', '*****');
same('@santo sabe', 'SANTO', '@***** sabe');
same('santo ou santo?', 'SANTO', '***** ou *****?');
same('jogo do Santos hoje', 'SANTO', 'jogo do Santos hoje');
same('bom dia, galera', 'SANTO', 'bom dia, galera');
same('era tacas', 'TAÇAS', 'era *****');
same('TAÇAS', 'TAÇAS', '*****');
same('taças', 'TAÇAS', '*****'); // ç escrito em duas partes (c + cedilha)
same('você está rindo', 'ESTAR', 'você está rindo');
same('é estar, confia', 'ESTAR', 'é *****, confia');
same('passo', 'PASSO', '*****');
same('pas so', 'PASSO', '*****');
same('passos largos', 'PASSO', 'passos largos');
same('Klose!', 'KLOSE', '*****!');

// a de hoje (dayNumber + wordOfDay, o mesmo do Termo)
const word = wordOfDay(dayNumber());
check(maskTermo(`hoje é ${word.toLowerCase()}`) === 'hoje é *****', `a palavra de HOJE (${word}) vira *****`);
const other = wordOfDay(dayNumber() + 1);
check(maskTermo(`amanhã é ${other}`) === `amanhã é ${other}`, `a de amanhã (${other}) não é escondida`);

// ── 2) ponta a ponta
const API = process.env.FP_API || 'http://localhost:4320';
const { prisma } = await import('../src/prisma.js');
const { config } = await import('../src/config.js');
let up = false;
for (let i = 0; i < 20 && !up; i++) { try { up = (await fetch(`${API}/api/health`)).ok; } catch { await new Promise((r) => setTimeout(r, 500)); } }
if (!up) { console.error(`API local fora do ar em ${API}: suba a API (PORT=4320) e rode de novo.`); process.exit(1); }
const team = await prisma.team.findFirst({ orderBy: { id: 'asc' } });
const nick = `tq${Date.now() % 1e6}`;
const u = await prisma.user.create({ data: { nick, nickLower: nick, email: `${nick}@local.test`, passwordHash: 'x', gender: 'M', teamId: team.id } });
const auth = { authorization: `Bearer ${jwt.sign({ uid: u.id, nick }, config.jwtSecret, { expiresIn: '1h' })}`, 'content-type': 'application/json' };
const raw = `acertei, era ${word.toLowerCase()} kkk`;
const sent = await (await fetch(`${API}/api/chat/geral`, { method: 'POST', headers: auth, body: JSON.stringify({ text: raw }) })).json();
check(sent.text === 'acertei, era ***** kkk', `quem mandou recebe de volta: "${sent.text}"`);
const list = await (await fetch(`${API}/api/chat/geral`, { headers: auth })).json();
const seen = list.messages?.find((m) => m.id === sent.id);
check(seen?.text === 'acertei, era ***** kkk', `quem lê o chat vê: "${seen?.text}"`);
const row = await prisma.chatMessage.findUnique({ where: { id: sent.id } });
check(row?.text === raw, 'no banco fica o texto real (a denúncia vê o que foi escrito)');
await new Promise((r) => setTimeout(r, 3100)); // 3 s entre mensagens
const normal = await (await fetch(`${API}/api/chat/geral`, { method: 'POST', headers: auth, body: JSON.stringify({ text: 'bom jogo pra todos' }) })).json();
check(normal.text === 'bom jogo pra todos', 'mensagem sem a palavra passa igual');

await prisma.$disconnect();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
