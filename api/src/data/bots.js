/**
 * Lista dos bots "quase reais" (dono, 18/09/2026) — o dono pediu para validar os nicks ANTES de criar as contas
 * (nada de `criar` na VPS sem o OK dele; bot novo depois disso = mesma regra). Validação de 18/09: ele trocou os
 * nicks "nome_sobrenome" por nicks de jogador mesmo (treasure, pinok, ryuzen, sasukinho, TeNsHi…) e deixou só o
 * Ana_Beatriz com underline; "Lampard da Shopee", "Filho do Vorcaro" e "Vilão" viraram LampardShopee,
 * FilhoDoVorcaro e Vilao porque o cadastro não aceita espaço, acento nem mais de 14 letras (um nick impossível de
 * registrar entregaria o bot).
 * Cada linha vira uma conta (`node scripts/bots.js criar`, idempotente: nick que já existe é pulado) com a
 * persona guardada em `User.botJson.persona`; o motor (services/bots.js) só lê o banco — mudar aqui depois
 * de criado NÃO muda o bot (use `node scripts/bots.js persona` para regravar as personas pela lista).
 *
 * Campos:
 *  - nick (regra do cadastro: 3–14, letras/números/_ . -), gender M|F, team = slug do time
 *  - profile: casual | regular | assiduo (BOTS.profiles em rules.js)
 *  - windows: janelas do dia em que ele costuma entrar (BOTS.windows) — 1 a 3
 *  - kinds: chance de usar cada chute manual quando a recarga acaba (o chute direto é sempre 1; quem não
 *    tem TRAIL, por exemplo, "não gosta" da trilha, como vários jogadores de verdade)
 *  - skills: onde gasta os pontos de nível — AIM (pênalti), SHOT (falta) ou both (alterna); null = não gasta
 *  - x1: vontade de ir ao X1 (0 = nunca, 1 = sempre que chamado; dono, 20/09/2026) — sem o campo, vale o padrão
 *    do perfil (BOTS.x1.appetite). Mudou? `node scripts/bots.js persona` regrava.
 *  - pass: resgata a Presença da Semana quando entra (quase todo mundo resgata)
 *  - bio: texto pessoal (opcional; a maioria dos jogadores de verdade não escreve)
 *  - since: há quantos dias a conta "foi criada" (a data de cadastro fica espalhada, não todas no mesmo minuto)
 */
export const BOT_LIST = [
  // ── Série A: times que estavam sem gol (2 por time) ──
  { nick: 'treasure', gender: 'M', team: 'brasiliense', profile: 'regular', windows: ['noite', 'almoco'], kinds: { PENALTY: 0.95, FOUL: 0.9, TRAIL: 0.6 }, skills: 'AIM', x1: 0.6, pass: true, since: 4, bio: 'Jacaré do DF. Fazendo meus gols aos poucos.' },
  { nick: 'thiagolima10', gender: 'M', team: 'brasiliense', profile: 'casual', windows: ['tarde', 'noite'], kinds: { PENALTY: 0.9, FOUL: 0.7, TRAIL: 0.2 }, skills: 'SHOT', x1: 0.2, pass: true, since: 2 },
  { nick: 'Diego.Ribeiro', gender: 'M', team: 'xv-de-piracicaba', profile: 'assiduo', windows: ['madrugada', 'noite'], kinds: { PENALTY: 1, FOUL: 1, TRAIL: 0.8 }, skills: 'both', x1: 0.8, pass: true, since: 5, bio: 'Trabalho de noite, jogo de madrugada. Nhô Quim!' },
  { nick: 'pinok', gender: 'M', team: 'xv-de-piracicaba', profile: 'casual', windows: ['almoco', 'tarde'], kinds: { PENALTY: 0.8, FOUL: 0.6, TRAIL: 0 }, skills: 'AIM', x1: 0, pass: false, since: 3 },
  { nick: 'ryuzen', gender: 'M', team: 'bahia', profile: 'regular', windows: ['manha', 'noite'], kinds: { PENALTY: 0.95, FOUL: 0.85, TRAIL: 0.5 }, skills: 'both', x1: 0.5, pass: true, since: 4, bio: 'BBMP' },
  { nick: 'carol.ferreira', gender: 'F', team: 'bahia', profile: 'casual', windows: ['noite'], kinds: { PENALTY: 0.9, FOUL: 0.8, TRAIL: 0.4 }, skills: 'AIM', x1: 0.25, pass: true, since: 1 },
  { nick: 'sasukinho', gender: 'M', team: 'atletico-mg', profile: 'regular', windows: ['tarde', 'noite'], kinds: { PENALTY: 1, FOUL: 0.9, TRAIL: 0.7 }, skills: 'SHOT', x1: 0.7, pass: true, since: 5, bio: 'Galo doido desde criança' },
  { nick: 'andrecosta88', gender: 'M', team: 'atletico-mg', profile: 'casual', windows: ['manha', 'almoco'], kinds: { PENALTY: 0.8, FOUL: 0.5, TRAIL: 0.3 }, skills: null, x1: 0.1, pass: true, since: 2 },
  { nick: 'TeNsHi', gender: 'M', team: 'cruzeiro', profile: 'assiduo', windows: ['tarde', 'noite', 'madrugada'], kinds: { PENALTY: 1, FOUL: 1, TRAIL: 0.9 }, skills: 'both', x1: 0.9, pass: true, since: 5, bio: 'Maior de Minas. Vem pro Cruzeiro!' },
  { nick: 'Lolyou', gender: 'F', team: 'cruzeiro', profile: 'casual', windows: ['almoco', 'noite'], kinds: { PENALTY: 0.9, FOUL: 0.7, TRAIL: 0.3 }, skills: 'AIM', x1: 0.3, pass: true, since: 3 },
  { nick: 'LampardShopee', gender: 'M', team: 'fluminense', profile: 'regular', windows: ['noite', 'madrugada'], kinds: { PENALTY: 0.95, FOUL: 0.9, TRAIL: 0.6 }, skills: 'AIM', x1: 0.6, pass: true, since: 4 },
  { nick: 'FilhoDoVorcaro', gender: 'M', team: 'fluminense', profile: 'casual', windows: ['manha', 'tarde'], kinds: { PENALTY: 0.85, FOUL: 0.6, TRAIL: 0.2 }, skills: 'SHOT', x1: 0, pass: true, since: 1, bio: 'Só chego no fim de semana' },
  { nick: 'Satorrrri', gender: 'M', team: 'palmeiras', profile: 'regular', windows: ['tarde', 'noite'], kinds: { PENALTY: 1, FOUL: 0.9, TRAIL: 0.5 }, skills: 'both', x1: 0.5, pass: true, since: 3, bio: 'Porco desde 99' },
  { nick: 'Curinga', gender: 'M', team: 'palmeiras', profile: 'casual', windows: ['almoco', 'noite'], kinds: { PENALTY: 0.9, FOUL: 0.8, TRAIL: 0 }, skills: 'AIM', x1: 0.4, pass: false, since: 4 },
  { nick: 'Loudete', gender: 'F', team: 'santos', profile: 'regular', windows: ['manha', 'noite'], kinds: { PENALTY: 0.95, FOUL: 0.85, TRAIL: 0.7 }, skills: 'SHOT', x1: 0.35, pass: true, since: 5 },
  { nick: 'larissa.m', gender: 'F', team: 'santos', profile: 'casual', windows: ['tarde'], kinds: { PENALTY: 0.9, FOUL: 0.7, TRAIL: 0.4 }, skills: 'AIM', x1: 0.3, pass: true, since: 2, bio: 'Vila Belmiro' },
  { nick: 'Vilao', gender: 'M', team: 'corinthians', profile: 'assiduo', windows: ['noite', 'madrugada'], kinds: { PENALTY: 1, FOUL: 1, TRAIL: 0.8 }, skills: 'both', x1: 0.85, pass: true, since: 4, bio: 'Vai Corinthians!' },
  { nick: 'fabiomartins', gender: 'M', team: 'corinthians', profile: 'casual', windows: ['manha', 'almoco'], kinds: { PENALTY: 0.8, FOUL: 0.7, TRAIL: 0.3 }, skills: null, x1: 0.15, pass: true, since: 3 },
  { nick: 'mushE', gender: 'M', team: 'flamengo', profile: 'regular', windows: ['almoco', 'noite'], kinds: { PENALTY: 0.95, FOUL: 0.9, TRAIL: 0.5 }, skills: 'AIM', x1: 0.5, pass: true, since: 5 },
  { nick: 'Ana_Beatriz', gender: 'F', team: 'flamengo', profile: 'casual', windows: ['noite'], kinds: { PENALTY: 0.9, FOUL: 0.8, TRAIL: 0.5 }, skills: 'both', x1: 0.2, pass: true, since: 2, bio: 'Mengo' },
  // ── Série B: clubes grandes vazios (1 por time) ──
  { nick: 'elementT', gender: 'M', team: 'botafogo', profile: 'regular', windows: ['tarde', 'noite'], kinds: { PENALTY: 0.95, FOUL: 0.9, TRAIL: 0.6 }, skills: 'AIM', x1: 0.6, pass: true, since: 4 },
  { nick: 'Bielzin', gender: 'M', team: 'gremio', profile: 'casual', windows: ['noite', 'madrugada'], kinds: { PENALTY: 0.9, FOUL: 0.8, TRAIL: 0.3 }, skills: 'SHOT', x1: 0.4, pass: true, since: 3, bio: 'Imortal Tricolor' },
  { nick: 'pixote', gender: 'M', team: 'internacional', profile: 'regular', windows: ['manha', 'noite'], kinds: { PENALTY: 0.9, FOUL: 0.85, TRAIL: 0.5 }, skills: 'both', x1: 0.5, pass: true, since: 2 },
  { nick: 'xKratos', gender: 'M', team: 'fortaleza', profile: 'casual', windows: ['almoco', 'tarde'], kinds: { PENALTY: 0.85, FOUL: 0.6, TRAIL: 0.2 }, skills: 'AIM', x1: 0.3, pass: false, since: 5 },
  { nick: 'Zangado', gender: 'M', team: 'athletico-pr', profile: 'regular', windows: ['noite'], kinds: { PENALTY: 1, FOUL: 0.9, TRAIL: 0.7 }, skills: 'SHOT', x1: 0.7, pass: true, since: 3, bio: 'Furacão' },
  // ── Série C (1 por time) ──
  { nick: 'mandrake7', gender: 'M', team: 'remo', profile: 'casual', windows: ['tarde', 'noite'], kinds: { PENALTY: 0.9, FOUL: 0.7, TRAIL: 0.4 }, skills: 'AIM', x1: 0.25, pass: true, since: 4, bio: 'Leão Azul' },
  { nick: 'Tchubiruba', gender: 'M', team: 'atletico-go', profile: 'casual', windows: ['manha', 'noite'], kinds: { PENALTY: 0.85, FOUL: 0.7, TRAIL: 0.3 }, skills: null, x1: 0.1, pass: true, since: 1 },
];
