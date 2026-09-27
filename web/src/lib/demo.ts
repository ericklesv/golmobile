/**
 * Demonstração jogável da tela de entrada (27/09/2026): quem chega pelo anúncio CHUTA antes de criar conta.
 *
 * Por quê: em 26/09 o Google Ads trouxe 11 pessoas ao site; 5 abriram a tela de cadastro e NENHUMA chegou a
 * enviar o formulário (zero recusas no log da API — elas simplesmente não clicaram em "Criar jogador"; uma
 * ficou 7 minutos na tela). No mesmo período a base geral converteu 70% de quem abre o cadastro (47 de 67).
 * Com 70% de base, dar 0 em 5 é 1 chance em 400: o pedágio de e-mail + senha + escolher entre 48 escudos
 * antes do primeiro chute é o que derruba o tráfego pago, que chega frio e só quer ver se o jogo é bom.
 *
 * Aqui fica só o que o APARELHO lembra entre a landing e o cadastro. Nada disso vale gol de verdade: o gol da
 * demonstração é uma amostra do jogo, e o texto diz isso na cara do jogador.
 */
const KEY = 'brgol.demo';
const VALE_MS = 7 * 86_400_000;

export type Demo = { gols: number; chutes: number; at: number };

/** O que este aparelho fez na demonstração nos últimos 7 dias (null = nada, ou sem armazenamento). */
export function demo(): Demo | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null') as Demo | null;
    return d && Date.now() - d.at < VALE_MS ? d : null;
  } catch { return null; }
}

/** Soma um chute (e o gol, se foi gol). Nunca atrapalha a tela: sem armazenamento, a demo só não é lembrada. */
export function somaChute(gol: boolean) {
  try {
    const d = demo() ?? { gols: 0, chutes: 0, at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify({ gols: d.gols + (gol ? 1 : 0), chutes: d.chutes + 1, at: Date.now() }));
  } catch { /* sem armazenamento */ }
}

/** Depois de criar a conta a demonstração não serve mais para nada. */
export function limpaDemo() {
  try { localStorage.removeItem(KEY); } catch { /* nada */ }
}
