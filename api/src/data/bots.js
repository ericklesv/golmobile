/**
 * Lista dos bots "quase reais" (dono, 18/09/2026) — o dono pediu para validar os nicks ANTES de criar as contas
 * (nada de `criar` na VPS sem o OK dele; bot novo depois disso = mesma regra).
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
 *  - pass: resgata a Presença da Semana quando entra (quase todo mundo resgata)
 *  - bio: texto pessoal (opcional; a maioria dos jogadores de verdade não escreve)
 *  - since: há quantos dias a conta "foi criada" (a data de cadastro fica espalhada, não todas no mesmo minuto)
 */
export const BOT_LIST = [
  // ── Série A: times que estavam sem gol (2 por time) ──
  { nick: 'Rafael_Souza', gender: 'M', team: 'brasiliense', profile: 'regular', windows: ['noite', 'almoco'], kinds: { PENALTY: 0.95, FOUL: 0.9, TRAIL: 0.6 }, skills: 'AIM', pass: true, since: 4, bio: 'Jacaré do DF. Fazendo meus gols aos poucos.' },
  { nick: 'thiagolima10', gender: 'M', team: 'brasiliense', profile: 'casual', windows: ['tarde', 'noite'], kinds: { PENALTY: 0.9, FOUL: 0.7, TRAIL: 0.2 }, skills: 'SHOT', pass: true, since: 2 },
  { nick: 'Diego.Ribeiro', gender: 'M', team: 'xv-de-piracicaba', profile: 'assiduo', windows: ['madrugada', 'noite'], kinds: { PENALTY: 1, FOUL: 1, TRAIL: 0.8 }, skills: 'both', pass: true, since: 5, bio: 'Trabalho de noite, jogo de madrugada. Nhô Quim!' },
  { nick: 'lucasmoura_', gender: 'M', team: 'xv-de-piracicaba', profile: 'casual', windows: ['almoco', 'tarde'], kinds: { PENALTY: 0.8, FOUL: 0.6, TRAIL: 0 }, skills: 'AIM', pass: false, since: 3 },
  { nick: 'Bruno_Alves', gender: 'M', team: 'bahia', profile: 'regular', windows: ['manha', 'noite'], kinds: { PENALTY: 0.95, FOUL: 0.85, TRAIL: 0.5 }, skills: 'both', pass: true, since: 4, bio: 'BBMP' },
  { nick: 'carol.ferreira', gender: 'F', team: 'bahia', profile: 'casual', windows: ['noite'], kinds: { PENALTY: 0.9, FOUL: 0.8, TRAIL: 0.4 }, skills: 'AIM', pass: true, since: 1 },
  { nick: 'Felipe_Mendes', gender: 'M', team: 'atletico-mg', profile: 'regular', windows: ['tarde', 'noite'], kinds: { PENALTY: 1, FOUL: 0.9, TRAIL: 0.7 }, skills: 'SHOT', pass: true, since: 5, bio: 'Galo doido desde criança' },
  { nick: 'andrecosta88', gender: 'M', team: 'atletico-mg', profile: 'casual', windows: ['manha', 'almoco'], kinds: { PENALTY: 0.8, FOUL: 0.5, TRAIL: 0.3 }, skills: null, pass: true, since: 2 },
  { nick: 'Mateus_Lima', gender: 'M', team: 'cruzeiro', profile: 'assiduo', windows: ['tarde', 'noite', 'madrugada'], kinds: { PENALTY: 1, FOUL: 1, TRAIL: 0.9 }, skills: 'both', pass: true, since: 5, bio: 'Maior de Minas. Vem pro Cruzeiro!' },
  { nick: 'juliana_rs', gender: 'F', team: 'cruzeiro', profile: 'casual', windows: ['almoco', 'noite'], kinds: { PENALTY: 0.9, FOUL: 0.7, TRAIL: 0.3 }, skills: 'AIM', pass: true, since: 3 },
  { nick: 'gustavo_h', gender: 'M', team: 'fluminense', profile: 'regular', windows: ['noite', 'madrugada'], kinds: { PENALTY: 0.95, FOUL: 0.9, TRAIL: 0.6 }, skills: 'AIM', pass: true, since: 4 },
  { nick: 'Leandro_Rocha', gender: 'M', team: 'fluminense', profile: 'casual', windows: ['manha', 'tarde'], kinds: { PENALTY: 0.85, FOUL: 0.6, TRAIL: 0.2 }, skills: 'SHOT', pass: true, since: 1, bio: 'Só chego no fim de semana' },
  { nick: 'Vini_Cardoso', gender: 'M', team: 'palmeiras', profile: 'regular', windows: ['tarde', 'noite'], kinds: { PENALTY: 1, FOUL: 0.9, TRAIL: 0.5 }, skills: 'both', pass: true, since: 3, bio: 'Porco desde 99' },
  { nick: 'marcelo_sp', gender: 'M', team: 'palmeiras', profile: 'casual', windows: ['almoco', 'noite'], kinds: { PENALTY: 0.9, FOUL: 0.8, TRAIL: 0 }, skills: 'AIM', pass: false, since: 4 },
  { nick: 'Pedro_Nunes', gender: 'M', team: 'santos', profile: 'regular', windows: ['manha', 'noite'], kinds: { PENALTY: 0.95, FOUL: 0.85, TRAIL: 0.7 }, skills: 'SHOT', pass: true, since: 5 },
  { nick: 'larissa.m', gender: 'F', team: 'santos', profile: 'casual', windows: ['tarde'], kinds: { PENALTY: 0.9, FOUL: 0.7, TRAIL: 0.4 }, skills: 'AIM', pass: true, since: 2, bio: 'Vila Belmiro' },
  { nick: 'Rodrigo_Pires', gender: 'M', team: 'corinthians', profile: 'assiduo', windows: ['noite', 'madrugada'], kinds: { PENALTY: 1, FOUL: 1, TRAIL: 0.8 }, skills: 'both', pass: true, since: 4, bio: 'Vai Corinthians!' },
  { nick: 'fabiomartins', gender: 'M', team: 'corinthians', profile: 'casual', windows: ['manha', 'almoco'], kinds: { PENALTY: 0.8, FOUL: 0.7, TRAIL: 0.3 }, skills: null, pass: true, since: 3 },
  { nick: 'edu_carvalho', gender: 'M', team: 'flamengo', profile: 'regular', windows: ['almoco', 'noite'], kinds: { PENALTY: 0.95, FOUL: 0.9, TRAIL: 0.5 }, skills: 'AIM', pass: true, since: 5 },
  { nick: 'Ana_Beatriz', gender: 'F', team: 'flamengo', profile: 'casual', windows: ['noite'], kinds: { PENALTY: 0.9, FOUL: 0.8, TRAIL: 0.5 }, skills: 'both', pass: true, since: 2, bio: 'Mengo' },
  // ── Série B: clubes grandes vazios (1 por time) ──
  { nick: 'Renan_Alves', gender: 'M', team: 'botafogo', profile: 'regular', windows: ['tarde', 'noite'], kinds: { PENALTY: 0.95, FOUL: 0.9, TRAIL: 0.6 }, skills: 'AIM', pass: true, since: 4 },
  { nick: 'Danilo_Prado', gender: 'M', team: 'gremio', profile: 'casual', windows: ['noite', 'madrugada'], kinds: { PENALTY: 0.9, FOUL: 0.8, TRAIL: 0.3 }, skills: 'SHOT', pass: true, since: 3, bio: 'Imortal Tricolor' },
  { nick: 'kaique_santos', gender: 'M', team: 'internacional', profile: 'regular', windows: ['manha', 'noite'], kinds: { PENALTY: 0.9, FOUL: 0.85, TRAIL: 0.5 }, skills: 'both', pass: true, since: 2 },
  { nick: 'Igor_Vieira', gender: 'M', team: 'fortaleza', profile: 'casual', windows: ['almoco', 'tarde'], kinds: { PENALTY: 0.85, FOUL: 0.6, TRAIL: 0.2 }, skills: 'AIM', pass: false, since: 5 },
  { nick: 'wesley_ms', gender: 'M', team: 'athletico-pr', profile: 'regular', windows: ['noite'], kinds: { PENALTY: 1, FOUL: 0.9, TRAIL: 0.7 }, skills: 'SHOT', pass: true, since: 3, bio: 'Furacão' },
  // ── Série C (1 por time) ──
  { nick: 'Caio_Menezes', gender: 'M', team: 'remo', profile: 'casual', windows: ['tarde', 'noite'], kinds: { PENALTY: 0.9, FOUL: 0.7, TRAIL: 0.4 }, skills: 'AIM', pass: true, since: 4, bio: 'Leão Azul' },
  { nick: 'Fernanda_Sa', gender: 'F', team: 'atletico-go', profile: 'casual', windows: ['manha', 'noite'], kinds: { PENALTY: 0.85, FOUL: 0.7, TRAIL: 0.3 }, skills: null, pass: true, since: 1 },
];
