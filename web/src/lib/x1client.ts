/**
 * Versão da tela do X1, mandada como `v=` no WebSocket (24/09/2026). O servidor (CLIENT_MIN em api/src/realtime/x1.js)
 * recusa desafiar/aceitar/treinar um jogo que a tela não sabe desenhar — a tela de antes do Futgolf quebrava na partida
 * e o jogador perdia por W.O. Jogo novo no X1 = sobe este número e o do jogo lá.
 */
export const X1_CLIENT_V = 1;
