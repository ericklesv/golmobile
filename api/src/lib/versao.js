/**
 * O que esta versão da API está trazendo (dono, 19/09/2026: "quando subir uma nova API mostrar quais
 * atualizações ela está trazendo"). Serve para o aviso do Telegram no `startup`.
 *
 * De onde vem: o `brgol-deploy.sh` escreve em /var/log/brgol-deploy.log uma linha
 * `[2026-09-19 03:27:43] commit <antes> -> <depois>` a cada publicação. Daí sai a faixa de commits e os
 * títulos saem do próprio git do projeto.
 *
 * Reinício que NÃO é publicação (queda, watchdog, `pm2 restart`) não repete a lista: se a última publicação
 * foi há mais de `JANELA_MIN` minutos, ou se o commit de lá não é o que está rodando, o aviso sai só com o
 * commit. Nada aqui pode derrubar a API: qualquer erro vira `null` e o aviso sai como era antes.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const LOG = process.env.DEPLOY_LOG || '/var/log/brgol-deploy.log';
const JANELA_MIN = 10; // publicou há mais que isso? então este restart não é da publicação
const LINHA = /\[([\d-]+ [\d:]+)\]\s+commit\s+([0-9a-f]{7,40})\s*->\s*([0-9a-f]{7,40})/;

/** `git` do próprio projeto, sem herdar configuração de ninguém e sem travar a subida. */
const git = (...args) =>
  execFileSync('git', ['-c', 'safe.directory=*', ...args], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** Título de commit legível: tira o "tipo(escopo):" da frente e começa com maiúscula. */
export function tituloLimpo(assunto) {
  const t = String(assunto).replace(/^[a-z]+(\([^)]+\))?!?:\s*/i, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/**
 * { commit, titulos[], extra } — `titulos` vazio quando o restart não veio de uma publicação.
 * `null` se nem o commit deu para descobrir (fora da VPS, por exemplo).
 */
export function novidades(max = 8) {
  let commit;
  try { commit = git('rev-parse', 'HEAD'); } catch { return null; }
  const vazio = { commit, titulos: [], extra: 0 };
  try {
    const linha = readFileSync(LOG, 'utf8').trimEnd().split('\n').reverse().find((l) => LINHA.test(l));
    const m = linha && linha.match(LINHA);
    if (!m) return vazio;
    const [, quando, antes, depois] = m;
    if (!depois.startsWith(commit.slice(0, 7)) && !commit.startsWith(depois.slice(0, 7))) return vazio; // rodando outro commit
    const minutos = (Date.now() - new Date(quando.replace(' ', 'T')).getTime()) / 60_000;
    if (!(minutos >= 0 && minutos <= JANELA_MIN)) return vazio; // restart avulso: não repete a lista
    const saida = git('log', '--no-merges', '--pretty=%s', `${antes}..${depois}`);
    const todos = saida ? saida.split('\n').filter(Boolean) : [];
    return { commit, titulos: todos.slice(0, max).map(tituloLimpo), extra: Math.max(0, todos.length - max) };
  } catch {
    return vazio;
  }
}

/** A mensagem pronta do Telegram (sem o "🚀", que fica com quem chama). */
export function textoDaSubida(pid, v) {
  const cabeca = `API subiu (pid ${pid}${v?.commit ? `, ${v.commit.slice(0, 7)}` : ''})`;
  if (!v?.titulos?.length) return cabeca;
  const linhas = v.titulos.map((t) => `• ${t}`);
  if (v.extra) linhas.push(`• …e mais ${v.extra}`);
  return `${cabeca}\n<b>O que entrou:</b>\n${linhas.join('\n')}`;
}
