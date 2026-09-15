/** Projeções de dados para o cliente (nunca expõe hash, e-mail alheio, layout da trilha). */
import { cooldownFor, LAST_FIELD, levelOf, levelPoints, isVip, UNLOCK_LEVEL, reboundLevel } from '../lib/rules.js';
import { itemsView, nickFadeOf } from '../lib/items.js';
export { nickFadeOf };
import { hourKey } from '../lib/time.js';
import { liveRound } from './league.js';

/** Gols da hora/rodada/temporada: ficam gravados no jogador e só zeram no próximo gol dele, então
 *  na tela valem só enquanto forem do período atual (senão, depois das 19:00, aparecia a rodada velha). */
export function periodGoals(user, now = Date.now()) {
  const live = liveRound();
  return {
    goalsHour: user.hourKey === hourKey(new Date(now)) ? user.goalsHour : 0,
    goalsRound: !live || user.roundId === live.roundId ? user.goalsRound : 0,
    goalsSeason: !live || user.seasonId === live.seasonId ? user.goalsSeason : 0,
  };
}

export function teamView(t) {
  if (!t) return null;
  return {
    id: t.id, slug: t.slug, name: t.name, abbr: t.abbr, state: t.state,
    colorPrimary: t.colorPrimary, colorSecondary: t.colorSecondary, colorTertiary: t.colorTertiary ?? null, kitDesign: t.kitDesign ?? 'classico', stadium: t.stadium, serie: t.serie,
  };
}

export function cooldownsView(user, now = Date.now()) {
  const out = {};
  for (const kind of Object.keys(LAST_FIELD)) {
    const cd = cooldownFor(user, kind, now);
    const last = user[LAST_FIELD[kind]] ? new Date(user[LAST_FIELD[kind]]).getTime() : 0;
    const remaining = Math.max(0, last + cd - now);
    out[kind] = { cooldownMs: cd, remainingMs: remaining, readyAt: last + cd, unlocked: levelOf(user).lvl >= UNLOCK_LEVEL[kind] };
  }
  return out;
}

export function meView(user, now = Date.now()) {
  const level = levelOf(user);
  return {
    id: user.id, nick: user.nick, email: user.email, gender: user.gender, bio: user.bio, avatarUrl: user.avatarUrl ?? null,
    isAdmin: user.isAdmin, createdAt: user.createdAt,
    team: teamView(user.team),
    money: user.money, vipDays: user.vipDays, vipUntil: user.vipUntil, vip: isVip(user, now),
    dexterity: user.dexterity,
    goalsTotal: user.goalsTotal, ...periodGoals(user, now),
    hourKey: user.hourKey, roundId: user.roundId, seasonId: user.seasonId,
    levelBonus: user.levelBonus ?? 0, levelPoints: levelPoints(user),
    stats: {
      auto: { goals: user.autoGoals },
      penalty: { goals: user.penaltyGoals, tries: user.penaltyTries },
      foul: { goals: user.foulGoals, tries: user.foulTries },
      trail: { goals: user.trailGoals, tries: user.trailTries },
      party: { wins: user.partyWins, tries: user.partyTries },
    },
    level: { lvl: level.lvl, name: level.name, goals: level.goals, next: level.next ? { lvl: level.next.lvl, name: level.next.name, goals: level.next.goals, skill: level.next.skill } : null },
    rebound: { PENALTY: reboundLevel(level.lvl, 'PENALTY'), FOUL: reboundLevel(level.lvl, 'FOUL'), TRAIL: reboundLevel(level.lvl, 'TRAIL') },
    cooldowns: cooldownsView(user, now),
    trail: user.trailState?.active ? { active: true, phase: user.trailState.phase, revealed: user.trailState.revealed || [] } : { active: false, phase: 0, revealed: [] },
    items: itemsView(user, now), nickColor: user.nickColor ?? null, // itens da loja ativos (carregar o usuário com meInclude() de items.js)
    nickFade: nickFadeOf(user, now), nickFadeKeys: user.nickFade ?? null, // degradê (VIP): cores para a tela + chaves para o seletor do perfil
    // diretoria (services/club.js): cargo no time atual e contrato de contratação (não troca de time até lá)
    role: user.teamRole && user.teamRole.teamId === user.teamId ? user.teamRole.role : null,
    contractUntil: user.contractUntil && new Date(user.contractUntil).getTime() > now ? new Date(user.contractUntil).getTime() : null,
    serverTime: now,
  };
}

export function publicView(user, now = Date.now()) {
  const level = levelOf(user);
  return {
    id: user.id, nick: user.nick, gender: user.gender, bio: user.bio, avatarUrl: user.avatarUrl ?? null, createdAt: user.createdAt,
    team: teamView(user.team), vip: isVip(user, now), dexterity: user.dexterity, nickColor: user.nickColor ?? null, nickFade: nickFadeOf(user, now),
    goalsTotal: user.goalsTotal, ...periodGoals(user, now),
    hourKey: user.hourKey, roundId: user.roundId, seasonId: user.seasonId,
    stats: {
      auto: { goals: user.autoGoals },
      penalty: { goals: user.penaltyGoals, tries: user.penaltyTries },
      foul: { goals: user.foulGoals, tries: user.foulTries },
      trail: { goals: user.trailGoals, tries: user.trailTries },
      party: { wins: user.partyWins, tries: user.partyTries },
    },
    level: { lvl: level.lvl, name: level.name },
    online: new Date(user.lastSeenAt).getTime() > now - 2 * 60_000,
  };
}
