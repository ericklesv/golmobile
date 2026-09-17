import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { Panel } from '../components/ui';
import { toast } from '../components/Toast';
import { money as fmt, timeLeft as remaining, untilLabel } from '../lib/format';
import { VipBar, useVipLeft } from '../components/VipBar';
import { Shield } from '../components/Shield';
import { SkillPips } from '../components/Skills';
import type { Me, ShopItemDef, ShopView, SkillDef, UserItemView } from '../lib/types';

const NICK_RULE = /^[a-zA-Z0-9_.\-]{3,14}$/;
const CATEGORY: Record<ShopItemDef['category'], { title: string; ribbon: 'blue' | 'orange' | 'green' | 'yellow' }> = {
  chutes: { title: 'CHUTES', ribbon: 'green' },
  chuteiras: { title: 'CHUTEIRAS', ribbon: 'orange' },
  perfil: { title: 'PERFIL', ribbon: 'blue' },
};

interface RowProps {
  icon: string; title: string; desc: string; sub?: React.ReactNode; badge?: React.ReactNode; active?: boolean;
  price?: string; cta?: string; busyKey?: string; disabled?: boolean; onClick?: () => void;
  children?: React.ReactNode; extra?: React.ReactNode; busy: string | null;
  /** no lugar do ícone do kit (ex.: o escudo do time escolhido na Troca de time) */
  iconNode?: React.ReactNode;
}
/** Linha de item: ícone do kit, título, descrição, preço (trap) e botão (sprite). */
function Row({ icon, title, desc, sub, badge, active, price, cta, busyKey, disabled, onClick, children, extra, busy, iconNode }: RowProps) {
  return (
    <div className={`flex items-center gap-3 rounded-xl p-2 ${active ? 'bg-grass/15' : 'bg-sky/10'}`}>
      {iconNode ?? <img src={`/ui/${icon}.png`} className="h-10 w-10 shrink-0 object-contain" alt="" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5"><span className="t-display text-[14px] text-navy-ink">{title}</span>{badge}</div>
        <div className="text-[11px] font-bold leading-snug text-muted">{desc}</div>
        {sub && <div className="text-[11px] font-extrabold text-grass-deep">{sub}</div>}
        {children}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {price && <span className="trap trap-orange text-[11px]">{price}</span>}
        {cta && onClick && <button onClick={onClick} disabled={disabled || busy !== null} className="btn btn-green btn-sm min-w-[64px]">{busy && busy === busyKey ? '…' : cta}</button>}
        {extra}
      </div>
    </div>
  );
}

export function ShopScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const setMe = useAuth((s) => s.setMe);
  const now = useAuth((s) => s.now);
  const [busy, setBusy] = useState<string | null>(null);
  const [shop, setShop] = useState<ShopView | null>(null);
  const [nick, setNick] = useState('');
  const [teamSlug, setTeamSlug] = useState(''); // Troca de time: o clube escolhido
  const [, tick] = useState(0);
  const vipLeft = useVipLeft();
  const vipToMoney = meta?.money?.VIP_TO_MONEY ?? 100000; // Loja: 1 VIP guardado vira saldo (rules.js MONEY.VIP_TO_MONEY)
  const catalog = shop?.catalog ?? meta?.items ?? [];
  const skills = meta?.skills ?? []; // habilidades (rules.js SKILLS)
  const skillCost = meta?.skillCost ?? { point: 1, money: 25000, vip: 1 };

  const loadShop = useCallback(() => { api.shop().then(setShop).catch(() => {}); }, []);
  useEffect(() => { loadShop(); }, [loadShop]);
  // validade dos itens ("vence em …") atualiza a cada 30 s
  useEffect(() => { const iv = setInterval(() => tick((t) => t + 1), 30_000); return () => clearInterval(iv); }, []);

  const mine = useMemo(() => {
    const m = new Map<string, UserItemView>();
    for (const it of me.items ?? []) if (it.expiresAt > now()) m.set(it.key, it);
    return m;
  }, [me.items, now]);

  async function run(key: string, fn: () => Promise<Me | void>) {
    if (busy) return; setBusy(key);
    try { const r = await fn(); if (r) setMe(r); loadShop(); }
    catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(null); }
  }
  const buy = (def: ShopItemDef, currency: 'money' | 'vip' = 'money') => run(`${def.key}:${currency}`, async () => {
    const r = await api.shopBuy(def.key, currency);
    toast(`${def.name} ativo!`, 'success');
    return r.me;
  });

  // ─── Linhas por tipo de item ──────────────────────────────────────────────
  const energyRow = (def: ShopItemDef) => {
    const cur = mine.get('ENERGY');
    const lvl = cur?.level ?? 0;
    const next = def.levels?.find((l) => l.level === Math.min(5, lvl + 1)) ?? def.levels![0];
    return (
      <Row key={def.key} icon={def.icon} title={def.name} desc={def.desc} active={!!cur} busy={busy}
        sub={cur ? `Nível ${lvl} (-${lvl * 10}% de recarga) · vence em ${remaining(cur.expiresAt - now())}` : undefined}
        price={fmt(next.price)} cta={lvl >= 5 ? 'Renovar' : `Nível ${next.level}`} busyKey={`${def.key}:money`} disabled={me.money < next.price} onClick={() => buy(def)}>
        <div className="mt-1 flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => <img key={n} src={`/ui/ico-stargrade_l_${n <= lvl ? 'on' : 'off'}.png`} className="h-5 w-5" alt="" />)}
        </div>
      </Row>
    );
  };

  const boostRow = (def: ShopItemDef) => {
    const cur = mine.get(def.key);
    const canMoney = def.price != null && me.money >= def.price;
    const canVip = def.priceVip != null && me.vipDays >= def.priceVip;
    const blocked = def.single && !!cur;
    return (
      <Row key={def.key} icon={def.icon} title={def.name} desc={def.desc} active={!!cur} busy={busy}
        sub={cur ? `Ativo · vence em ${remaining(cur.expiresAt - now())}` : undefined}
        price={def.price != null ? fmt(def.price) : undefined} cta={blocked ? 'Ativo' : cur ? '+28 h' : 'Comprar'} busyKey={`${def.key}:money`} disabled={blocked || !canMoney} onClick={() => buy(def)}
        extra={def.priceVip != null && !blocked ? (
          <button onClick={() => buy(def, 'vip')} disabled={busy !== null || !canVip} className="btn btn-sky btn-sm min-w-[64px]">{busy === `${def.key}:vip` ? '…' : `${def.priceVip} VIP`}</button>
        ) : null} />
    );
  };

  const bootRow = (def: ShopItemDef) => {
    const cur = mine.get(def.key);
    return (
      <Row key={def.key} icon={def.icon} title={def.name} desc={def.desc} active={!!cur} busy={busy}
        sub={cur ? `${cur.equipped ? 'Equipada' : 'Guardada'} · vence em ${remaining(cur.expiresAt - now())}` : undefined}
        badge={cur?.equipped ? <span className="trap trap-green text-[11px]">EQUIPADA</span> : null}
        price={fmt(def.price ?? 0)} cta={cur ? '+30 d' : 'Comprar'} busyKey={`${def.key}:money`} disabled={me.money < (def.price ?? 0)} onClick={() => buy(def)}
        extra={cur && !cur.equipped ? (
          <button onClick={() => run(`equip:${def.key}`, () => api.shopEquip(def.key))} disabled={busy !== null} className="btn btn-blue btn-sm min-w-[64px]">{busy === `equip:${def.key}` ? '…' : 'Equipar'}</button>
        ) : null} />
    );
  };

  const nickRow = (def: ShopItemDef) => {
    const ok = NICK_RULE.test(nick) && nick !== me.nick;
    return (
      <Row key={def.key} icon={def.icon} title={def.name} desc={def.desc} busy={busy}
        price={fmt(def.price ?? 0)} cta="Trocar" busyKey="nick" disabled={!ok || me.money < (def.price ?? 0)}
        onClick={() => run('nick', async () => { const r = await api.shopNick(nick); toast(`Agora você é ${nick}!`, 'success'); setNick(''); return r; })}>
        <input className="field mt-1 text-[14px]" placeholder={`Novo nick (hoje: ${me.nick})`} value={nick} onChange={(e) => setNick(e.target.value.trim())} maxLength={14} autoCapitalize="none" />
      </Row>
    );
  };

  // Troca de time (R$ ou VIP): o escudo no lugar do ícone mostra para onde vai; confirma antes de cobrar
  const teamRow = (def: ShopItemDef) => {
    const others = (meta?.teams ?? []).filter((t) => t.slug !== me.team.slug);
    const picked = others.find((t) => t.slug === teamSlug) ?? null;
    const contract = me.contractUntil && me.contractUntil > now() ? me.contractUntil : null;
    const price = def.price ?? 0, priceVip = def.priceVip ?? 1;
    const change = (currency: 'money' | 'vip') => run(`team:${currency}`, async () => {
      if (!picked) return;
      const cost = currency === 'vip' ? `${priceVip} VIP` : fmt(price);
      if (!window.confirm(`Jogar pelo ${picked.name} por ${cost}?\nOs gols que você já marcou ficam com o ${me.team.name}.`)) return;
      const r = await api.shopTeam(picked.slug, currency);
      toast(`Agora você joga pelo ${picked.name}!`, 'success');
      setTeamSlug('');
      return r;
    });
    return (
      <Row key={def.key} icon={def.icon} iconNode={<Shield team={picked ?? me.team} size={40} className="shrink-0" />} title={def.name} desc={def.desc} busy={busy}
        badge={contract ? <span className="trap trap-blue text-[11px]">CONTRATO</span> : null}
        price={fmt(price)} cta="Trocar" busyKey="team:money" disabled={!picked || !!contract || me.money < price} onClick={() => change('money')}
        extra={<button onClick={() => change('vip')} disabled={busy !== null || !picked || !!contract || me.vipDays < priceVip} className="btn btn-sky btn-sm min-w-[64px]">{busy === 'team:vip' ? '…' : `${priceVip} VIP`}</button>}>
        {contract ? (
          <div className="mt-1 text-[11px] font-extrabold text-danger">Contrato com o {me.team.name} até {new Date(contract).toLocaleDateString('pt-BR')}: depois disso você pode trocar.</div>
        ) : (
          <select className="field mt-1 text-[14px]" value={teamSlug} onChange={(e) => setTeamSlug(e.target.value)} aria-label="Time novo">
            <option value="">Escolha o time</option>
            {(['A', 'B', 'C'] as const).map((s) => (
              <optgroup key={s} label={`Série ${s}`}>
                {others.filter((t) => t.serie === s).map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </optgroup>
            ))}
          </select>
        )}
      </Row>
    );
  };

  const colorRow = (def: ShopItemDef) => {
    const locked = me.level.lvl < (def.minLevel ?? 0);
    const current = me.nickColor;
    return (
      <Row key={def.key} icon={def.icon} title={def.name} desc={def.desc} active={!!current} busy={busy}
        badge={locked ? <span className="trap trap-blue text-[11px]"><img src="/ui/ico-lock01_s.png" className="mr-1 h-4 w-4" alt="" />NÍVEL {def.minLevel}</span> : null}
        sub={current ? <>Cor atual: <b className={`nick-${current}`}>{me.nick}</b></> : undefined}
        price={fmt(def.price ?? 0)} cta={current ? 'Padrão' : undefined} busyKey="color:none" disabled={!current}
        onClick={() => run('color:none', () => api.shopNickColor(null))}>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(def.colors ?? []).map((c) => (
            <button key={c.key} type="button" disabled={locked || busy !== null || current === c.key || me.money < (def.price ?? 0)} title={c.name} aria-label={c.name}
              onClick={() => run(`color:${c.key}`, async () => { const r = await api.shopNickColor(c.key); toast(`Nick ${c.name.toLowerCase()}!`, 'success'); return r; })}
              className={`no-drag h-8 w-8 rounded-full border-4 shadow disabled:opacity-40 ${current === c.key ? 'border-gold' : 'border-white'}`} style={{ background: c.hex }} />
          ))}
        </div>
      </Row>
    );
  };

  /**
   * Habilidade: um degrau da árvore. A ordem da lista é a ordem que o dono desenhou (Recarga → Pontaria →
   * Chute → Sorte) e o trilho da esquerda mostra isso — é caminho, não lista solta. Desde 17/09/2026 o único
   * jeito de subir é PONTO DE NÍVEL. Os valores de hoje vêm prontos do servidor (recarga de verdade em
   * me.cooldowns, acerto com chuteira em me.chance), então a tela nunca contradiz o jogo.
   */
  const skillRow = (def: SkillDef, i: number) => {
    const level = me.skills[def.key] ?? 0;
    const max = level >= def.max;
    const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;
    let agora = '', proximo = '', noPiso = false;
    if (def.unit === 'tempo') {
      const hoje = me.cooldowns.PENALTY.cooldownMs;
      agora = `${mmss(hoje)} de recarga`;
      proximo = `${mmss(Math.max(def.cap, hoje - def.perLevel))}`;
      // quem é VIP já chega ao piso de 4:30 com pouca (ou nenhuma) Recarga: não deixar gastar ponto à toa
      noPiso = hoje <= def.cap;
    } else if (def.unit === 'sorte') {
      const hoje = me.chance.BALL?.total ?? def.base + level * def.perLevel;
      agora = `${Math.round(hoje * 100)}% de chance`;
      proximo = `${Math.round(Math.min(def.cap, hoje + def.perLevel) * 100)}%`;
    } else {
      const hoje = me.chance[def.kind!];
      agora = `${Math.round(hoje * 100)}% de acerto`;
      proximo = `${Math.round(Math.min(def.cap, hoje + def.perLevel) * 100)}%`;
    }
    const temPonto = me.skills.points >= skillCost.point;
    return (
      <li key={def.key} className="relative flex gap-3 pb-3 last:pb-0">
        {i < skills.length - 1 && <i aria-hidden className="absolute bottom-0 left-[19px] top-11 w-[3px] rounded bg-navy-ink/10" />}
        <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-[3px] ${max ? 'bg-grass ring-grass-deep' : 'bg-white ring-navy-ink/15'}`}>
          <img src={`/ui/${def.icon}.png`} className="h-7 w-7 object-contain" alt="" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="t-display text-[15px] text-navy-ink">{def.name}</span>
            <span className="text-[11px] font-extrabold text-muted">nível {level} de {def.max}</span>
          </div>
          <SkillPips level={level} max={def.max} />
          <p className="text-[11px] font-bold leading-snug text-muted">{def.desc}</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="min-w-0 text-[12px] font-extrabold leading-tight text-navy-ink">
              {agora}
              {max ? ' — no máximo' : noPiso
                ? <span className="text-muted"> — já no piso{me.vip ? ' (o VIP te trouxe até aqui; a habilidade segura o tempo quando ele vencer)' : ''}</span>
                : <span className="text-muted"> · nível {level + 1}: <b className="text-grass-deep">{proximo}</b></span>}
            </span>
            {!max && !noPiso && (
              <button onClick={() => run(`skill:${def.key}`, async () => {
                const r = await api.shopSkill(def.key, 'point');
                toast(`${def.name} no nível ${level + 1}: ${proximo}.`, 'success');
                return r.me;
              })} disabled={busy !== null || !temPonto} className="btn btn-green btn-sm shrink-0">
                {busy === `skill:${def.key}` ? '…' : temPonto ? 'Subir nível' : 'Sem pontos'}
              </button>
            )}
          </div>
        </div>
      </li>
    );
  };

  const render = (def: ShopItemDef) => {
    if (def.key === 'ENERGY') return energyRow(def);
    if (def.key === 'NICK_CHANGE') return nickRow(def);
    if (def.key === 'TEAM_CHANGE') return teamRow(def);
    if (def.key === 'NICK_COLOR') return colorRow(def);
    if (def.kind === 'boot') return bootRow(def);
    return boostRow(def);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center"><div className="ribbon ribbon-yellow ribbon-lg"><img src="/ui/ico-goldpouch.png" className="mr-2 h-9 w-9" alt="" />LOJA</div></div>
      <div className="flex justify-center gap-2">
        <span className="resbar"><img src="/ui/ico-coin01_s.png" className="ico -ml-3 h-8 w-8" alt="" />{fmt(me.money)}</span>
        <VipBar iconClass="h-8 w-8" />
      </div>

      {skills.length > 0 && (
        <Panel title="HABILIDADES" ribbon="green">
          <p className="mb-1 text-[12px] font-bold leading-snug text-muted">
            Cada nível seu dá 1 ponto, e ponto é a única moeda daqui — não dá para comprar com dinheiro nem com VIP.
            Você tem <b className="t-display text-[15px] text-grass-deep">{me.skills.points}</b> {me.skills.points === 1 ? 'ponto' : 'pontos'}.
          </p>
          <p className="mb-3 text-[11px] font-bold leading-snug text-muted">
            Na ordem: primeiro a Recarga, para chutar mais vezes; depois Pontaria e Chute, para errar menos; a Sorte por último, quando o resto estiver no máximo.
          </p>
          <ol className="flex flex-col">{skills.map(skillRow)}</ol>
        </Panel>
      )}

      <Panel title="JOGADOR" ribbon="blue">
        <div className="flex flex-col gap-2">
          <Row icon="ico-crown_silver" title="Ativar VIP (1 dia)" desc={`Recargas pela metade e nick azul. Você tem ${me.vipDays} ${me.vipDays === 1 ? 'VIP guardado' : 'VIPs guardados'}.`} busy={busy} active={vipLeft > 0}
            sub={vipLeft > 0 && me.vipUntil ? (
              <motion.span key={me.vipUntil} initial={{ scale: 1.12 }} animate={{ scale: 1 }} className="inline-block origin-left">
                VIP ativo: faltam {remaining(vipLeft)} (até {untilLabel(new Date(me.vipUntil).getTime())})
              </motion.span>
            ) : undefined}
            price="1 VIP" cta="Ativar" busyKey="vip" disabled={me.vipDays < 1}
            onClick={() => run('vip', async () => {
              const r = await api.activateVip(1);
              toast(r.vipUntil ? `VIP ativado! Agora vai até ${untilLabel(new Date(r.vipUntil).getTime())}.` : 'VIP ativado por 1 dia!', 'success');
              return r;
            })} />
          <Row icon="ico-goldpouch" title="Saco de dinheiro" desc={`Troque 1 VIP guardado por ${fmt(vipToMoney)} de saldo, na hora. Quantas vezes quiser.`} busy={busy}
            price="1 VIP" cta="Trocar" busyKey="vipmoney" disabled={me.vipDays < 1}
            onClick={() => run('vipmoney', async () => {
              if (!window.confirm(`Trocar 1 VIP por ${fmt(vipToMoney)}?`)) throw new Error('cancelado');
              const r = await api.vipToMoney(1);
              toast(`+${fmt(r.money_added)} no seu saldo!`, 'success');
              return r;
            })} />
          <Link to="/vip" className="btn btn-yellow btn-md w-full"><img src="/ui/ico-crown_silver.png" className="h-6 w-6" alt="" /> Comprar dias de VIP</Link>
        </div>
      </Panel>

      {(Object.keys(CATEGORY) as ShopItemDef['category'][]).map((cat) => {
        const defs = catalog.filter((d) => d.category === cat);
        if (!defs.length) return null;
        return (
          <Panel key={cat} title={CATEGORY[cat].title} ribbon={CATEGORY[cat].ribbon}>
            <div className="flex flex-col gap-2">{defs.map(render)}</div>
          </Panel>
        );
      })}

      {shop && shop.history.length > 0 && (
        <Panel title="HISTÓRICO" ribbon="yellow">
          <ul className="flex flex-col gap-1">
            {shop.history.map((h, i) => (
              <li key={i} className={`flex items-center justify-between rounded-lg px-2 py-1 text-[12px] font-bold ${i % 2 ? '' : 'bg-sky/10'}`}>
                <span className="text-navy-ink">{h.name}</span>
                <span className="text-muted">{new Date(h.at).toLocaleDateString('pt-BR')} · {h.currency === 'vip' ? `${h.price} VIP` : fmt(h.price)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Link to="/partygol" className="btn btn-yellow btn-md w-full"><img src="/ui/ico-coin02.png" className="h-6 w-6" alt="" /> Party GoL (roleta)</Link>
      <p className="text-center text-[11px] font-bold text-white/80">Dinheiro vem dos gols e das premiações; VIP vem das premiações de rodada/temporada.</p>
    </div>
  );
}
