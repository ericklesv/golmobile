/**
 * Simulação do FLUXO do Frangaço — valida a máquina de estados pura (lib/frangaco.js)
 * com a SEQUÊNCIA EXATA do cliente Unity (ManagolPenalty.cs): state → run → [vez user:
 * kick] / [vez ia: incoming → suspense 0,28–0,64 s → alvo → clique ou timeout → save],
 * com timings reais de rede e animação — MAIS os casos degenerados: clique após a
 * janela, sem clique, ms negativo/absurdo, save repetido, incoming repetido (reload),
 * demora de até 30 s entre incoming e save, kick sem xReal.
 *
 * REGRA DE OURO (dono, 14/09/2026): em jogo legítimo (e nos degenerados acima) NENHUMA
 * chamada pode responder erro — o script conta throws e exige 0. Erro contratual só em
 * requisição fora de contexto (sem run e sem nada para reprisar) — testado à parte.
 *
 * A virada das 20h no meio do run (a CAUSA do "ERRO — defesa não registrada" de
 * produção) é corrigida no serviço (withFrangaco tranca a linha de ONTEM quando o run
 * ativo atravessou a virada); para a máquina pura isso equivale a "a mesma linha
 * continua", que é exatamente o que este script exercita.
 *
 * Roda SEM banco: `node scripts/frangaco-fluxo.js` na pasta api/.
 */
import {
  FRANGACO as C, stepEntry, stepIncoming, stepKick, stepSave, parseKick, raioMetros,
} from '../src/lib/frangaco.js';
import { GameError } from '../src/lib/errors.js';

/* ───────────── PRNG determinístico (mulberry32) + gaussiano ───────────── */
let seed = 0x5eed2026;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/* ───────────── harness = withFrangaco em memória (linha DailyGame falsa) ───────────── */
const clock = { now: 1_800_000_000_000 }; // relógio do servidor (ms)
let apiErrors = 0; // throws em fluxo legítimo/degenerado — TEM de terminar em 0
const failures = [];

function novaLinha() { return { state: {}, finishedAt: null, won: false }; }

/** Espelha withFrangaco: fecha pendência vencida na entrada e aplica o patch da linha. */
function request(row, fn, rotulo) {
  try {
    if (!row.finishedAt) {
      const fim = stepEntry(rand, row.state, clock.now);
      aplicarFim(row, fim);
    }
    return fn();
  } catch (e) {
    apiErrors += 1;
    if (failures.length < 10) failures.push(`${rotulo}: ${e?.code ?? e?.name} — ${e?.message}`);
    return null;
  }
}

/** Espelha applyFim do serviço (só o que afeta a linha; prêmios não importam aqui). */
function aplicarFim(row, fim) {
  if (!fim?.outcome) return;
  if (fim.outcome === 'eliminado') { row.finishedAt = clock.now; }
  if (fim.outcome === 'campeao') { row.finishedAt = clock.now; row.won = true; }
}

/* ───────────── wrappers dos endpoints (a resposta que o Unity leria) ───────────── */
const apiRun = (row) => request(row, () => {
  // espelho do frangacoRun (o sorteio real usa os times do banco)
  const st = row.state;
  if (st.run?.status === 'ativo') return st.run;
  if (row.finishedAt) throw new GameError(409, 'finished', 'já jogou');
  st.run = {
    status: 'ativo', rodada: 1, oppIds: [11, 22, 33, 44, 55],
    duel: { turn: 'user', kicks: [], defenses: [], pending: null },
    historico: [],
  };
  st.champion = false;
  return st.run;
}, 'run');

const apiIncoming = (row) => request(row, () => {
  const p = stepIncoming(rand, row.state, clock.now, !!row.finishedAt);
  return { alvo: p.alvo, janelaMs: p.janelaMs, raio: p.raio };
}, 'incoming');

const apiKick = (row, body) => request(row, () => {
  const aim = parseKick(body);
  const { r, fim } = stepKick(rand, row.state, { ...aim, pontaria: 0 }, !!row.finishedAt);
  aplicarFim(row, fim);
  return { resultado: r, fim };
}, 'kick');

const apiSave = (row, body) => request(row, () => {
  const res = stepSave(rand, row.state, body, clock.now, !!row.finishedAt);
  if (res.replay) return { resultado: res.replay.resultado, replay: true };
  aplicarFim(row, res.fim);
  return { resultado: res.d, fim: res.fim, d: res.d };
}, 'save');

/* ───────────── perfis de reação do técnico na defesa ───────────── */
// react = reflexo puro; aim = tempo de MIRA até o alvo pequeno; sigmaM = erro do clique (m)
const PROFILES = [
  { nome: '250 ms (rápido) ', react: 250, aimBase: 280, aimJit: 70, sigmaM: 0.045 },
  { nome: '400 ms (médio)  ', react: 400, aimBase: 340, aimJit: 90, sigmaM: 0.065 },
  { nome: '600 ms (lento)  ', react: 600, aimBase: 420, aimJit: 110, sigmaM: 0.095 },
];

/* ───────────── um lance de DEFESA com o timing do Unity ───────────── */
function defender(row, prof, stats) {
  const inc = apiIncoming(row);
  if (!inc) return;
  if (rand() < 0.04) { // degenerado: reload no meio → incoming repetido (mesma pendência)
    clock.now += 300 + rand() * 1500;
    const inc2 = apiIncoming(row);
    if (inc2 && (inc2.alvo.x !== inc.alvo.x || inc2.alvo.y !== inc.alvo.y)) {
      apiErrors += 1; failures.push('incoming repetido trocou o alvo (deveria re-servir a MESMA pendência)');
    }
  }
  clock.now += 120 + rand() * 300;        // resposta viaja até o navegador
  clock.now += 280 + rand() * 360;        // suspense do Unity ("FULANO VAI BATER...")

  const roll = rand();
  let body;
  if (roll < 0.02) {                      // degenerado: aba fechada ~30 s entre incoming e save
    clock.now += 20_500 + rand() * 9_500;
    body = { ms: Math.round(25_000 + rand() * 10_000) };
    stats.abaFechada += 1;
  } else if (roll < 0.035) {              // degenerado: ms negativo (cliente hostil/bugado)
    clock.now += 400;
    body = { ms: -Math.round(rand() * 5_000), x: inc.alvo.x, y: inc.alvo.y };
  } else if (roll < 0.05) {               // degenerado: ms absurdo
    clock.now += 400;
    body = { ms: 9e9, x: inc.alvo.x, y: inc.alvo.y };
  } else {
    const ms = prof.react * (0.85 + 0.3 * rand()) + prof.aimBase + Math.abs(gauss()) * prof.aimJit;
    const timeoutMs = inc.janelaMs + 76;  // margem de frame + 60 ms do Update()
    if (ms > timeoutMs) {
      clock.now += timeoutMs + 40;        // sem clique a tempo: o Unity manda só o dt
      body = { ms: Math.round(timeoutMs + rand() * 300) };
      stats.timeout += 1;
    } else {
      const x = clamp01(inc.alvo.x + (gauss() * prof.sigmaM) / C.goalW);
      const y = clamp01(inc.alvo.y + (gauss() * prof.sigmaM) / C.goalH);
      clock.now += ms;
      body = { ms: Math.round(ms), x, y };
      // degenerado: clique DEPOIS da janela mas antes do timeout do Update (vira 'tarde')
      if (rand() < 0.02) { body.ms = Math.round(inc.janelaMs + 100 + rand() * 400); stats.cliqueTarde += 1; }
    }
  }
  clock.now += 60 + rand() * 240;         // o POST /save viaja
  const res = apiSave(row, body);
  if (!res) return;
  const d = res.d ?? res.resultado;
  stats.defesas += 1;
  if (d.defendeu) stats.defendeu += 1;
  stats.motivos[d.motivo] = (stats.motivos[d.motivo] ?? 0) + 1;
  if (rand() < 0.05) {                    // degenerado: save repetido (toque duplo / retry)
    clock.now += 150 + rand() * 800;
    const dup = apiSave(row, body);
    if (dup && !dup.replay) { apiErrors += 1; failures.push('save repetido não veio como reprise'); }
    stats.saveRepetido += 1;
  }
}

/* ───────────── um lance de COBRANÇA (70% com finta, 30% sem = "kick sem xReal") ───────────── */
function bater(row, stats) {
  const xA = 0.06 + rand() * 0.88;
  const comFinta = rand() < 0.7;
  const body = { xAnunciado: xA, xReal: null };
  if (comFinta) body.xReal = xA < 0.5 ? clamp01(0.62 + rand() * 0.32) : clamp01(0.06 + rand() * 0.32);
  if (rand() < 0.03) delete body.xReal;   // degenerado: kick sem NENHUM xReal no JSON
  clock.now += 800 + rand() * 1200;       // setas + corrida do batedor
  const res = apiKick(row, body);
  if (!res) return;
  const r = res.resultado;
  const bucket = r.fintou ? stats.kickFinta : stats.kickSem;
  bucket.total += 1;
  if (r.gol) bucket.gols += 1;
}

/* ───────────── torneio completo (o loop do Unity) ───────────── */
function torneio(prof, stats) {
  const row = novaLinha();
  apiRun(row);
  let guard = 0;
  // máximo legítimo: 5 duelos × (10 lances + 6 de morte súbita) = 80 lances
  while (row.state.run?.status === 'ativo' && guard++ < 120) {
    if (row.state.run.duel.turn === 'user') bater(row, stats);
    else defender(row, prof, stats);
    clock.now += 2_000 + rand() * 3_000;  // drama/animações entre lances
  }
  if (guard >= 120) { apiErrors += 1; failures.push('torneio não terminou em 120 lances'); }
  const status = row.state.run?.status;
  if (status === 'campeao') stats.campeao += 1;
  stats.faseFinal += row.state.run?.historico?.length ?? 0;
  // degenerado: save perdido chega DEPOIS do torneio acabar → reprise, nunca erro
  if (rand() < 0.1) {
    const dup = apiSave(row, { ms: 400, x: 0.5, y: 0.5 });
    if (dup && !dup.replay) { apiErrors += 1; failures.push('save pós-torneio não veio como reprise'); }
  }
}

/* ───────────── erros contratuais ESPERADOS (fora de contexto) ───────────── */
function testesForaDeContexto() {
  let ok = 0;
  const esperaErro = (rotulo, fn, code) => {
    try { fn(); failures.push(`${rotulo}: deveria lançar ${code} e não lançou`); apiErrors += 1; }
    catch (e) { if (e instanceof GameError && e.code === code) ok += 1; else { apiErrors += 1; failures.push(`${rotulo}: erro errado (${e?.code})`); } }
  };
  esperaErro('save sem run', () => stepSave(rand, {}, { ms: 100 }, clock.now, false), 'no-run');
  esperaErro('incoming sem run', () => stepIncoming(rand, {}, clock.now, false), 'no-run');
  esperaErro('kick fora do gol', () => parseKick({ xAnunciado: 5 }), 'bad-aim');
  const st = { run: { status: 'ativo', rodada: 1, oppIds: [1, 2, 3, 4, 5], duel: { turn: 'user', kicks: [], defenses: [], pending: null }, historico: [] } };
  esperaErro('incoming na vez de bater', () => stepIncoming(rand, st, clock.now, false), 'not-your-defense');
  esperaErro('save na vez de bater (sem nada para reprisar)', () => stepSave(rand, st, { ms: 100 }, clock.now, false), 'not-your-defense');
  return ok;
}

/* ───────────── roda tudo e imprime o relatório ───────────── */
const N = 500; // torneios completos POR PERFIL
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1).padStart(5) : '  0.0');

console.log('Frangaço — simulação do fluxo do Unity (500 torneios por perfil)');
console.log(`janelas por fase: ${C.windowMs.join(' / ')} ms (morte súbita −${C.suddenWindowCut})`);
console.log(`raio por fase: ${C.saveRadiusFase.join(' / ')} → em metros: ${C.saveRadiusFase.map((r) => raioMetros(r).toFixed(3)).join(' / ')}`);
console.log(`alvo desenhado (diâmetro): ${C.saveRadiusFase.map((r) => (2 * raioMetros(r)).toFixed(2) + ' m').join(' / ')} (antes: 1,68 m!)\n`);

const kickTotal = { finta: { total: 0, gols: 0 }, sem: { total: 0, gols: 0 } };
for (const prof of PROFILES) {
  const stats = {
    defesas: 0, defendeu: 0, motivos: {}, campeao: 0, faseFinal: 0,
    timeout: 0, cliqueTarde: 0, abaFechada: 0, saveRepetido: 0,
    kickFinta: { total: 0, gols: 0 }, kickSem: { total: 0, gols: 0 },
  };
  for (let i = 0; i < N; i++) torneio(prof, stats);
  kickTotal.finta.total += stats.kickFinta.total; kickTotal.finta.gols += stats.kickFinta.gols;
  kickTotal.sem.total += stats.kickSem.total; kickTotal.sem.gols += stats.kickSem.gols;
  const m = stats.motivos;
  console.log(`perfil ${prof.nome}: defesa ${pct(stats.defendeu, stats.defesas)}% (${stats.defendeu}/${stats.defesas})  campeão ${pct(stats.campeao, N)}%`);
  console.log(`   gols da IA por motivo: gol ${m.gol ?? 0} · tirou-tinta ${m['tirou-tinta'] ?? 0} · rebote-trave ${m['rebote-trave'] ?? 0} · tarde ${m.tarde ?? 0} · parado ${m.parado ?? 0} · antecipou ${m.antecipou ?? 0} · vazou ${m.vazou ?? 0}`);
  console.log(`   defesas: firmes ${m.defendeu ?? 0} · esticou ${m.esticou ?? 0} | degenerados no caminho: timeout ${stats.timeout}, clique tarde ${stats.cliqueTarde}, aba fechada ${stats.abaFechada}, save repetido ${stats.saveRepetido}\n`);
}

console.log(`cobrança minha: gol COM finta ${pct(kickTotal.finta.gols, kickTotal.finta.total)}% (${kickTotal.finta.gols}/${kickTotal.finta.total}) · SEM finta ${pct(kickTotal.sem.gols, kickTotal.sem.total)}% (${kickTotal.sem.gols}/${kickTotal.sem.total})`);

const contratuais = testesForaDeContexto();
console.log(`erros contratuais esperados (fora de contexto): ${contratuais}/5 OK`);
console.log(`\nERROS DE API em fluxo legítimo/degenerado: ${apiErrors}${apiErrors ? '  ← FALHOU' : '  (perfeito)'}`);
for (const f of failures) console.log('  · ' + f);
process.exit(apiErrors === 0 ? 0 : 1);
