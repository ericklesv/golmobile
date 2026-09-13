import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { AdminLogRow, AdminPatch, AdminUserDetail, AdminUserRow } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { Shield } from '../components/Shield';
import { Panel, Spinner, Tabs, Empty } from '../components/ui';
import { toast } from '../components/Toast';
import { money as fmt, num, timeAgo } from '../lib/format';

/**
 * Painel de admin (/admin) — só aparece para quem tem isAdmin (o servidor nega
 * os demais de qualquer jeito). Lista/busca de jogadores, detalhe com edição,
 * gols/exp, conexão (IP + geolocalização) e log de auditoria.
 */

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

function Badges({ u }: { u: AdminUserRow }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {u.isAdmin && <span className="trap trap-orange text-[9px] uppercase">Admin</span>}
      {u.vip && <span className="trap trap-blue text-[9px] uppercase">VIP</span>}
      {u.banned && <span className="rounded-md bg-[#C0392B] px-1.5 py-0.5 font-display text-[9px] uppercase text-white">Banido</span>}
      {u.online && <span className="trap trap-green text-[9px] uppercase">Online</span>}
    </span>
  );
}

// ─── Lista de jogadores ─────────────────────────────────────────────────────
function UserList({ onPick }: { onPick: (id: number) => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ page: number; pages: number; total: number; users: AdminUserRow[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.adminUsers(q.trim(), page);
        if (alive) setData(r);
      } catch (e) { if (alive) toast((e as Error).message, 'error'); }
      finally { if (alive) setLoading(false); }
    }, q ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, page]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <img src="/ui/pi-search.png" className="h-5 w-5" alt="" />
        <input className="field flex-1" placeholder="Buscar por nick ou e-mail" value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      <div className="panel p-2">
        {loading && !data ? <div className="flex justify-center py-8"><Spinner /></div> : !data || data.users.length === 0 ? <Empty text="Nenhum jogador encontrado." /> : (
          <ul className="flex flex-col gap-1">
            {data.users.map((u) => (
              <li key={u.id}>
                <button onClick={() => onPick(u.id)} className="no-drag flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left odd:bg-sky/10 hover:bg-sky/20">
                  <Avatar url={u.avatarUrl} size={34} />
                  {u.team ? <Shield team={u.team} size={22} /> : null}
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[14px] font-extrabold leading-tight ${u.nickColor ? `nick-${u.nickColor}` : u.vip ? 'text-sky-deep' : 'text-navy-ink'}`}>{u.nick}</span>
                    <span className="block truncate text-[10px] font-bold text-muted">{u.email} · lvl {u.level.lvl} · visto {timeAgo(u.lastSeenAt)}</span>
                  </span>
                  <Badges u={u} />
                  <span className="text-right">
                    <span className="block font-display text-base leading-tight text-grass-deep">{num(u.goalsTotal)} gols</span>
                    <span className="block text-[10px] font-bold text-muted">{fmt(u.money)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <button className="btn btn-gray btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span className="t-display t-out text-sm">pág. {data.page}/{data.pages} · {num(data.total)} contas</span>
          <button className="btn btn-gray btn-sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Próxima</button>
        </div>
      )}
    </div>
  );
}

// ─── Detalhe + edição ───────────────────────────────────────────────────────
function UserDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const meta = useAuth((s) => s.meta);
  const [u, setU] = useState<AdminUserDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ nick: string; email: string; bio: string; money: string; vipDays: string; dexterity: string; teamSlug: string; nickColor: string }>({ nick: '', email: '', bio: '', money: '', vipDays: '', dexterity: '', teamSlug: '', nickColor: '' });
  const [gols, setGols] = useState('10');
  const [exp, setExp] = useState('100');
  const [banHours, setBanHours] = useState('24');

  const fill = (d: AdminUserDetail) => {
    setU(d);
    setForm({
      nick: d.nick, email: d.email, bio: d.bio ?? '', money: String(d.money), vipDays: String(d.vipDays),
      dexterity: String(d.dexterity), teamSlug: d.team?.slug ?? '', nickColor: d.nickColor ?? '',
    });
  };

  useEffect(() => {
    let alive = true;
    api.adminUser(id).then((d) => { if (alive) fill(d); }).catch((e) => { toast((e as Error).message, 'error'); onBack(); });
    return () => { alive = false; };
  }, [id]);

  if (!u) return <div className="flex justify-center py-10"><Spinner /></div>;

  const nickColors = meta?.items.find((i) => i.key === 'NICK_COLOR')?.colors ?? [];

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const reload = async () => fill(await api.adminUser(id));

  function diff(): AdminPatch {
    if (!u) return {};
    const b: AdminPatch = {};
    if (form.nick.trim() && form.nick.trim() !== u.nick) b.nick = form.nick.trim();
    if (form.email.trim() && form.email.trim().toLowerCase() !== u.email) b.email = form.email.trim();
    if (form.bio !== (u.bio ?? '')) b.bio = form.bio;
    if (form.money !== '' && Number(form.money) !== u.money) b.money = Math.floor(Number(form.money));
    if (form.vipDays !== '' && Number(form.vipDays) !== u.vipDays) b.vipDays = Math.floor(Number(form.vipDays));
    if (form.dexterity !== '' && Number(form.dexterity) !== u.dexterity) b.dexterity = Math.floor(Number(form.dexterity));
    if (form.teamSlug && form.teamSlug !== (u.team?.slug ?? '')) b.teamSlug = form.teamSlug;
    if ((form.nickColor || null) !== (u.nickColor ?? null)) b.nickColor = form.nickColor || null;
    return b;
  }

  async function save() {
    const b = diff();
    if (Object.keys(b).length === 0) { toast('Nada para alterar.', 'error'); return; }
    if (b.teamSlug && !confirm(`Trocar o time de ${u!.nick}? Os contadores da rodada zeram.`)) return;
    await run(async () => { fill(await api.adminPatch(id, b)); toast('Perfil atualizado.', 'success'); });
  }

  async function darGols(qtd: number) {
    if (!Number.isFinite(qtd) || qtd < 1 || qtd > 100) { toast('Gols: 1 a 100 por vez.', 'error'); return; }
    await run(async () => { const r = await api.adminGols(id, qtd); toast(`${r.qtd} gol(s) para ${r.user.nick}.`, 'success'); await reload(); });
  }
  async function darExp(qtd: number) {
    if (!Number.isFinite(qtd) || qtd < 1) { toast('Exp: informe uma quantidade válida.', 'error'); return; }
    await run(async () => { const r = await api.adminExp(id, qtd); toast(`+${r.qtd} de exp para ${r.user.nick}.`, 'success'); await reload(); });
  }
  async function banir() {
    const h = Math.floor(Number(banHours));
    if (!Number.isFinite(h) || h < 1) { toast('Informe as horas de banimento.', 'error'); return; }
    if (!confirm(`Banir ${u!.nick} por ${h} hora(s)? Ele não conseguirá entrar até lá.`)) return;
    await run(async () => { fill(await api.adminPatch(id, { banHours: h })); toast('Jogador banido.', 'success'); });
  }
  async function desbanir() {
    if (!confirm(`Desbanir ${u!.nick} agora?`)) return;
    await run(async () => { fill(await api.adminPatch(id, { banHours: 0 })); toast('Jogador desbanido.', 'success'); });
  }

  const geo = u.conn.geo;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <button onClick={onBack} className="btn btn-gray btn-sm self-start"><img src="/ui/pi-back.png" className="h-4 w-4" alt="" /> Voltar à lista</button>

      <section className="panel-navy">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <Avatar url={u.avatarUrl} size={64} />
            {u.team && <Shield team={u.team} size={28} className="absolute -bottom-1 -right-1" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="t-display t-out truncate text-2xl">{u.nick}</div>
            <div className="text-[11px] font-extrabold text-white/85">#{u.id} · lvl {u.level.lvl} · {u.level.name} · {num(u.levelPoints)} pontos</div>
            <div className="mt-1"><Badges u={u} /></div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-bold text-white/85">
          <span>Gols: <b className="t-gold">{num(u.goalsTotal)}</b></span>
          <span>Dinheiro: <b className="t-gold">{fmt(u.money)}</b></span>
          <span>Exp extra: <b className="t-gold">{num(u.levelBonus)}</b></span>
          <span>Destreza: <b className="t-gold">{u.dexterity}</b></span>
          <span>VIP no banco: <b className="t-gold">{u.vipDays} un.</b></span>
          <span>VIP até: <b className="t-gold">{dt(u.vipUntil)}</b></span>
          <span>Criado: <b className="t-gold">{dt(u.createdAt)}</b></span>
          <span>Visto: <b className="t-gold">{timeAgo(u.lastSeenAt)}</b></span>
          {u.banned && <span className="col-span-2">Banido até: <b className="t-red">{dt(u.bannedUntil)}</b></span>}
        </div>
      </section>

      <Panel title="CONEXÃO" ribbon="blue">
        {u.conn.ip ? (
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] font-bold text-navy-ink">
            <span className="label">IP</span><span className="font-display">{u.conn.ip}</span>
            <span className="label">Quando</span><span>{dt(u.conn.at)}</span>
            <span className="label">Local</span><span>{geo ? [geo.city, geo.region, geo.country].filter(Boolean).join(', ') || 'sem dados' : 'sem dados'}</span>
            <span className="label">Provedor</span><span>{geo?.isp ?? 'sem dados'}</span>
          </div>
        ) : <Empty text="Nenhuma conexão registrada ainda (o IP entra no próximo login ou heartbeat)." />}
      </Panel>

      <Panel title="AÇÕES RÁPIDAS" ribbon="green">
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-green btn-sm" disabled={busy} onClick={() => darGols(10)}>+10 gols</button>
          <button className="btn btn-sky btn-sm" disabled={busy} onClick={() => darExp(100)}>+100 exp</button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input className="field w-24" type="number" min={1} max={100} value={gols} onChange={(e) => setGols(e.target.value)} />
          <button className="btn btn-green btn-sm flex-1" disabled={busy} onClick={() => darGols(Math.floor(Number(gols)))}>Dar gols (1–100)</button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input className="field w-24" type="number" min={1} value={exp} onChange={(e) => setExp(e.target.value)} />
          <button className="btn btn-sky btn-sm flex-1" disabled={busy} onClick={() => darExp(Math.floor(Number(exp)))}>Dar exp (pontos de nível)</button>
        </div>
        <p className="mt-2 text-center text-[10px] font-bold text-muted">Gols valem de verdade: placar da partida, rodada e artilharias. Exp soma no bônus de nível.</p>
      </Panel>

      <Panel title="EDITAR PERFIL" ribbon="orange">
        <div className="flex flex-col gap-2">
          <label className="label">Nick</label>
          <input className="field" maxLength={14} value={form.nick} onChange={(e) => setForm({ ...form, nick: e.target.value })} />
          <label className="label">E-mail</label>
          <input className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <label className="label">Texto pessoal</label>
          <textarea className="field min-h-[64px] text-sm" maxLength={400} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <div><label className="label">Dinheiro</label><input className="field" type="number" min={0} value={form.money} onChange={(e) => setForm({ ...form, money: e.target.value })} /></div>
            <div><label className="label">VIP (un.)</label><input className="field" type="number" min={0} value={form.vipDays} onChange={(e) => setForm({ ...form, vipDays: e.target.value })} /></div>
            <div><label className="label">Destreza</label><input className="field" type="number" min={0} max={meta?.dexterityMax ?? 30} value={form.dexterity} onChange={(e) => setForm({ ...form, dexterity: e.target.value })} /></div>
          </div>
          <label className="label">Time</label>
          <select className="field" value={form.teamSlug} onChange={(e) => setForm({ ...form, teamSlug: e.target.value })}>
            {(meta?.teams ?? []).map((t) => <option key={t.slug} value={t.slug}>{t.name} ({t.serie})</option>)}
          </select>
          <label className="label">Cor do nick</label>
          <select className="field" value={form.nickColor} onChange={(e) => setForm({ ...form, nickColor: e.target.value })}>
            <option value="">Sem cor</option>
            {nickColors.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
          <button className="btn btn-orange btn-md mt-1" disabled={busy} onClick={save}>{busy ? '…' : 'Salvar alterações'}</button>
        </div>
      </Panel>

      <Panel title="BANIMENTO" ribbon="yellow">
        {u.banned && <p className="mb-2 text-center text-[12px] font-extrabold text-red-600">Banido até {dt(u.bannedUntil)}.</p>}
        <div className="flex items-center gap-2">
          <input className="field w-24" type="number" min={1} value={banHours} onChange={(e) => setBanHours(e.target.value)} />
          <span className="label">horas</span>
          <button className="btn btn-red btn-sm flex-1" disabled={busy} onClick={banir}>Banir</button>
          {u.banned && <button className="btn btn-gray btn-sm" disabled={busy} onClick={desbanir}>Desbanir</button>}
        </div>
      </Panel>
    </div>
  );
}

// ─── Log de auditoria ───────────────────────────────────────────────────────
const ACTION_LABEL: Record<string, string> = { editar: 'editou', gols: 'deu gols para', exp: 'deu exp para', banir: 'baniu', desbanir: 'desbaniu' };

function payloadLabel(r: AdminLogRow): string {
  const p = r.payload ?? {};
  if (r.action === 'gols' || r.action === 'exp') return `qtd: ${p.qtd ?? '?'}`;
  if (r.action === 'banir') return p.banir?.horas ? `${p.banir.horas} h` : '';
  try { const s = JSON.stringify(p); return s === '{}' ? '' : s.slice(0, 120); } catch { return ''; }
}

function LogList() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ page: number; pages: number; total: number; rows: AdminLogRow[] } | null>(null);

  useEffect(() => {
    let alive = true;
    api.adminLog(page).then((r) => { if (alive) setData(r); }).catch((e) => toast((e as Error).message, 'error'));
    return () => { alive = false; };
  }, [page]);

  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;
  return (
    <div className="flex flex-col gap-3">
      <div className="panel p-2">
        {data.rows.length === 0 ? <Empty text="Nenhuma ação registrada ainda." /> : (
          <ul className="flex flex-col gap-1">
            {data.rows.map((r) => (
              <li key={r.id} className="rounded-xl px-2 py-1.5 odd:bg-sky/10">
                <div className="text-[13px] font-extrabold text-navy-ink">
                  {r.admin} <span className="text-muted">{ACTION_LABEL[r.action] ?? r.action}</span> {r.target ?? '—'}
                </div>
                <div className="text-[10px] font-bold text-muted">{dt(r.at)}{payloadLabel(r) ? ` · ${payloadLabel(r)}` : ''}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {data.pages > 1 && (
        <div className="flex items-center justify-between">
          <button className="btn btn-gray btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span className="t-display t-out text-sm">pág. {data.page}/{data.pages}</span>
          <button className="btn btn-gray btn-sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Próxima</button>
        </div>
      )}
    </div>
  );
}

// ─── Tela ───────────────────────────────────────────────────────────────────
export function AdminScreen() {
  const me = useAuth((s) => s.me)!;
  const nav = useNavigate();
  const [tab, setTab] = useState<'jogadores' | 'log'>('jogadores');
  const [picked, setPicked] = useState<number | null>(null);

  if (!me.isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="app-frame relative flex min-h-full flex-col" style={{ minHeight: '100dvh' }}>
      <div className="stadium-bg" />
      <div className="relative flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav(-1)} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
        <div className="ribbon ribbon-orange"><img src="/ui/pi-setting.png" className="mr-2 h-6 w-6" alt="" />PAINEL</div>
        <span className="trap trap-blue text-[11px] uppercase">{me.nick}</span>
      </div>
      <div className="relative px-3 pb-2">
        <Tabs value={tab} onChange={(t) => { setTab(t); setPicked(null); }} items={[{ id: 'jogadores', label: 'Jogadores' }, { id: 'log', label: 'Log' }]} />
      </div>
      <div className="relative flex-1 px-3 pb-4">
        {tab === 'log' ? <LogList /> : picked !== null ? <UserDetail id={picked} onBack={() => setPicked(null)} /> : <UserList onPick={setPicked} />}
      </div>
    </div>
  );
}
