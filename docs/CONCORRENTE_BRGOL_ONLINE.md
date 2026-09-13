# Concorrente: brgol.online ("BR GOL 2.0") — o que ele tem e o que vale copiar

Levantado em 13/09/2026 a partir da conta do Guilherme (regras, loja, perfil, home).
Legenda: **COPIAR** (entra no roadmap) · **ADAPTAR** (entra com mudanças) · **NÃO** (descartado).

## Regras de jogo
| Recurso | Como é lá | Decisão |
|---|---|---|
| Partida de 24 h, 3 pts vitória; **empate se diferença < 5 %** só na Copa BRGol | igual ao original | ADAPTAR — hoje empate só com gols iguais; aplicar 5 % nas copas quando existirem |
| VIP: auto-chute **offline**, nick azul-claro, cargo no time (P/D/C); tempos 5/5/5/2:30 vs 10/10/10/10 | | COPIAR o auto-chute offline para VIP (hoje precisa do app aberto) |
| Ações: Chutar / **Secar** / **Seguir ordem** | | COPIAR (já no roadmap) |
| **Secar** atualizado: só presidente ativa; 1 alvo por rodada; mesma divisão; não pode ser o adversário atual; encerra no fim da rodada; boosts Gatorade (bloqueio 10/20/30 %) e Energético (gol duplo 10/20/40 %) comprados pelo presidente | | ADAPTAR — copiar as regras; boosts entram como itens do caixa do time |
| Títulos no perfil (ícones por competição: estadual, brasileirão, copa, mundial) | | COPIAR quando as copas existirem |

## Loja
| Item | Como é lá | Decisão |
|---|---|---|
| Chuteiras com nome de jogador (CR7 +2 % … Kaká +10 %), 30 dias, mercado entre jogadores | | ADAPTAR — **sem nomes de jogadores**: usar os nomes dos níveis originais (Chuteira de Bronze/Prateada/Dourada + níveis intermediários), mesmo efeito (+2 % a +10 %), duração 30 dias, mercado depois |
| Estádio do time (+10/20/35 % de renda) | | COPIAR (depois do caixa do time) |
| Gramado do time (nerf de 2–5 % no adversário) | | ADAPTAR — efeito pequeno, avaliar equilíbrio |
| Energia do chute nv 1–5 (reduz recarga, 28 h) | | COPIAR |
| Boost Auto (−60 s no chute direto, 28 h) | | COPIAR |
| Caneleira (última linha da trilha: 50 % dois livres / 5 % três livres / 45 % um livre; VIP 1 ou R$ 80 mil) | | COPIAR |
| Nerfar / Removedor de nerf (nerf dura 1 h, reduz acerto) — **eles vão descontinuar** | | NÃO como item; manter o nerf de destreza do original (lvl 14+) |
| Troca de nome / e-mail / cor do nick | | COPIAR (cor do nick já era habilidade de nível no original) |
| Caixa do clube (dinheiro e VIP para o banco do time) | | COPIAR junto com cargos |
| Transferir VIP/dinheiro entre jogadores, histórico da loja | | COPIAR |

## Sistemas
| Sistema | Como é lá | Decisão |
|---|---|---|
| **Desafio 1x1** (aposta em dinheiro/VIP, modo "hora atual", 1 pendente por vez, expira em 5 min, trava de 24 h no mesmo confronto, ELO) | | COPIAR (já no roadmap) |
| **Missões** de rodada/temporada em tiers (fáceis → secreta), resgate manual, ranking de missões | | COPIAR — ótimo para retenção |
| Bola de Ouro (fórmula em BRGOL_ORIGINAL.md) + Ranking de Fama | | COPIAR |
| Itens temporários (Espionagem da Trilha, Impulso, Potência, Boost Premiado) | | COPIAR (já no roadmap) |
| Roleta da Sorte / Giro Premiado diário | | COPIAR |
| Configuração de cards (ocultar players online, acesso rápido, marcadores de cargo) | | NÃO por enquanto (nossa UI é mobile, menos cards) |
| Multi-conta ("Adicionar conta", "Contas logadas") | | NÃO — incentiva bots |
| Replay, Histórico, Tutorial, Convidar, APK Android | | ADAPTAR — tutorial/convite fáceis; APK vira o PWA/Capacitor |
| Narrador ("XV de Jau Vorcaro fez um gol brilhante") | | já temos (feed narrado) |
| Progresso ⚽ 31 ➜ 70 (nível), "à frente / atrás no Top Geral" | | COPIAR o "à frente/atrás" no perfil |
| Regras/proibições: proxy, flood, auto-penalty, acesso remoto, 1 login por IP fixo | | COPIAR o texto para a tela de regras |

## Visual (tela do pênalti)
Trave frontal com goleiro, três **setas verdes** (esquerda curva, cima, direita curva) sobre a
bola — implementado com setas SVG próprias em `web/src/components/KickArrows.tsx` (não copiamos
os arquivos deles).
