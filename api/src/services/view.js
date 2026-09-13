/** Projeções de dados para o cliente (nunca expõe hash, e-mail alheio, layout da trilha). */
import { cooldownFor, LAST_FIELD, levelOf, levelPoints, isVip, UNLOCK_LEVEL, reboundLevel } from '../lib/rules.js';
import { itemsView } from '../lib/items.js';

export function teamView(t) {
  if (!t) return null;
  return {
    id: t.id, slug: t.slug, name: t.name, abbr: t.abbr, state: t.state,
    colorPrimary: t.colorPrimary, colorSecondary: t.colorSecondary, stadium: t.stadium, serie: t.serie,
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
    goalsTotal: user.goalsTotal, goalsSeason: user.goalsSeason, goalsRound: user.goalsRound, goalsHour: user.goalsHour,
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
    serverTime: now,
  };
}

export function publicView(user, now = Date.now()) {
  const level = levelOf(user);
  return {
    id: user.id, nick: user.nick, gender: user.gender, bio: user.bio, avatarUrl: user.avatarUrl ?? null, createdAt: user.createdAt,
    team: teamView(user.team), vip: isVip(user, now), dexterity: user.dexterity,
    goalsTotal: user.goalsTotal, goalsSeason: user.goalsSeason, goalsRound: user.goalsRound, goalsHour: user.goalsHour,
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
