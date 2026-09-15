import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { AdminFutPregoRow, AdminGeo, AdminLogRow, AdminMultiRow, AdminPatch, AdminUserDetail, AdminUserRow, AdminReportRow } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { Shield } from '../components/Shield';
import { Panel, Spinner, Tabs, Empty } from '../components/ui';
import { toast } from '../components/Toast';
import { nickProps } from '../lib/nick';
import { money as fmt, num, timeAgo } from '../lib/format';
import { MsgText, MSG_ICONS } from '../components/MsgText';

/**
 * Painel de admin (/admin) — só aparece para quem tem isAdmin (o servidor nega
 * os demais de qualquer jeito). Lista/busca de jogadores, detalhe com edição,
 * gols/exp, conexão (IP + geolocalização) e log de auditoria.
 */

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');
// "14/09 às 16:22" (horário de Brasília) — cabe numa linha no celular
const shortDt = (iso: string) => { const d = new Date(iso), o = { timeZone: 'America/Sao_Paulo' } as const; return `${d.toLocaleDateString('pt-BR', { ...o, day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { ...o, hour: '2-digit', minute: '2-digit' })}`; };

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

/** Avisos do tipo de conexão: operadora de celular (CGNAT — um IP para muita gente, NÃO prova multiconta), VPN, datacenter. */
function GeoFlags({ geo }: { geo: AdminGeo | null }) {
  if (!geo) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {geo.mobile && <span className="trap trap-blue text-[9px] uppercase" title="Operadora de celular: o mesmo IP atende muita gente diferente">celular / IP compartilhado</span>}
      {geo.proxy && <span className="trap trap-orange text-[9px] uppercase">VPN / proxy</span>}
      {geo.hosting && <span className="trap trap-orange text-[9px] uppercase">datacenter</span>}
    </span>
  );
}

/** Localização aproximada (centro da cidade que a geolocalização do IP devolve) num mapa do OpenStreetMap. */
function GeoMap({ geo }: { geo: AdminGeo | null }) {
  if (!geo || geo.lat === null || geo.lon === null) return null;
  const { lat, lon } = geo;
  const dx = 0.12, dy = 0.07; // ~13 km de largura: escala de cidade
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - dx},${lat - dy},${lon + dx},${lat + dy}&layer=mapnik&marker=${lat},${lon}`;
  return (
    <div className="mt-2">
      <iframe src={src} title="Mapa da conexão" loading="lazy" className="no-drag h-44 w-full rounded-xl border-0 bg-sky/20" />
      <div className="mt-1 flex items-center justify-between text-[10px] font-bold text-muted">
        <span>Aproximado (cidade do provedor, não o endereço).</span>
        <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}`} target="_blank" rel="noreferrer" className="no-drag text-sky-deep underline">Mapa maior</a>
      </div>
    </div>
  );
}

// ─── Lista de jogadores ─────────────────────────────────────────────────────
function UserList({ onPick, order = 'recentes' }: { onPick: (id: number) => void; order?: 'recentes' | 'criadas' }) {
  const criadas = order === 'criadas';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ page: number; pages: number; total: number; users: AdminUserRow[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.adminUsers(q.trim(), page, order);
        if (alive) setData(r);
      } catch (e) { if (alive) toast((e as Error).message, 'error'); }
      finally { if (alive) setLoading(false); }
    }, q ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, page, order]);

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
                    <span className={`block truncate text-[14px] font-extrabold leading-tight ${nickProps(u).className}`} style={nickProps(u).style}>{u.nick}</span>
                    <span className="block truncate text-[10px] font-bold text-muted">{criadas ? u.email : `${u.email} · lvl ${u.level.lvl} · visto ${timeAgo(u.lastSeenAt)}`}</span>
                    {criadas && <span className="block text-[10px] font-extrabold leading-snug text-navy-ink">criada {shortDt(u.createdAt)}{u.invitedBy && <span className="text-grass-deep"> · convite de {u.invitedBy}</span>}</span>}
                    {criadas && <span className="mt-0.5 block"><Badges u={u} /></span>}
                  </span>
                  {!criadas && <Badges u={u} />}
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
function UserDetail({ id, onBack, onPick }: { id: number; onBack: () => void; onPick: (id: number) => void }) {
  const meta = useAuth((s) => s.meta);
  const [u, setU] = useState<AdminUserDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ nick: string; email: string; bio: string; money: string; vipDays: string; dexterity: string; teamSlug: string; nickColor: string }>({ nick: '', email: '', bio: '', money: '', vipDays: '', dexterity: '', teamSlug: '', nickColor: '' });
  const [gols, setGols] = useState('10');
  const [vipQtd, setVipQtd] = useState('5');
  const [msgTitle, setMsgTitle] = useState('');
  const [msgText, setMsgText] = useState('');
  const [msgIcon, setMsgIcon] = useState('');
  const [inbox, setInbox] = useState<{ unread: number; messages: { id: number; kind: string; icon: string | null; title: string; text: string; read: boolean; at: string; from: string | null }[] } | null>(null);
  const [openMsg, setOpenMsg] = useState<number | null>(null);
  const loadInbox = () => api.adminInbox(id).then(setInbox).catch(() => setInbox({ unread: 0, messages: [] }));
  useEffect(() => { loadInbox(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  const [saldoQtd, setSaldoQtd] = useState('1000');
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
  // VIP (banco de dias) e saldo: dar ou retirar (pedido do dono, 15/09/2026); o servidor nunca deixa abaixo de 0
  async function ajustarVip(qtd: number) {
    if (!Number.isFinite(qtd) || qtd === 0) { toast('VIP: informe uma quantidade.', 'error'); return; }
    if (qtd < 0 && !confirm(`Retirar ${-qtd} VIP de ${u!.nick}?`)) return;
    await run(async () => { const r = await api.adminVip(id, qtd); toast(`${r.qtd >= 0 ? '+' : ''}${r.qtd} VIP para ${r.user.nick}.`, 'success'); await reload(); });
  }
  async function ajustarSaldo(qtd: number) {
    if (!Number.isFinite(qtd) || qtd === 0) { toast('Saldo: informe uma quantidade.', 'error'); return; }
    if (qtd < 0 && !confirm(`Retirar R$ ${-qtd} de ${u!.nick}?`)) return;
    await run(async () => { const r = await api.adminSaldo(id, qtd); toast(`${r.qtd >= 0 ? '+' : ''}R$ ${r.qtd} para ${r.user.nick}.`, 'success'); await reload(); });
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
          <>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] font-bold text-navy-ink">
              <span className="label">IP</span><span className="font-display">{u.conn.ip}{u.createdIp && u.createdIp !== u.conn.ip && <span className="ml-2 font-sans text-[10px] text-muted">cadastro: {u.createdIp}</span>}</span>
              <span className="label">Quando</span><span>{dt(u.conn.at)}</span>
              <span className="label">Local</span><span>{geo ? [geo.city, geo.region, geo.country].filter(Boolean).join(', ') || 'sem dados' : 'sem dados'}</span>
              <span className="label">Provedor</span><span>{geo?.isp ?? 'sem dados'} <GeoFlags geo={geo} /></span>
            </div>
            <GeoMap geo={geo} />
          </>
        ) : <Empty text="Nenhuma conexão registrada ainda (o IP entra no próximo login ou heartbeat)." />}
        {u.sameIp.length > 0 && (
          <div className="mt-3 border-t border-navy-ink/10 pt-2">
            <div className="mb-1 text-[11px] font-extrabold uppercase text-red-600">Outras contas nesta internet ({u.sameIp.length})</div>
            <ul className="flex flex-col gap-1">
              {u.sameIp.map((o) => (
                <li key={o.id}>
                  <button onClick={() => onPick(o.id)} className="no-drag flex w-full items-center gap-2 rounded-xl px-1 py-1 text-left hover:bg-sky/20">
                    <Avatar url={o.avatarUrl} size={26} />
                    {o.team ? <Shield team={o.team} size={18} /> : null}
                    <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-navy-ink">{o.nick} <span className="text-[10px] font-bold text-muted">· {num(o.goalsTotal)} gols · visto {timeAgo(o.lastSeenAt)}</span></span>
                    <span className="font-display text-[10px] text-muted">{o.ip}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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

      <Panel title="MENSAGEM" ribbon="blue">
        <div className="flex flex-col gap-2">
          <input className="field" placeholder="Título" maxLength={80} value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} />
          <textarea className="field min-h-[80px]" placeholder="Texto (chega na caixa de mensagens do jogador). Ícones: [vip] [coin] [gol] [trofeu] [caveira] [presente] [whatsapp] · link: [clique aqui](https://…) · @nick vira link do perfil" maxLength={4000} value={msgText} onChange={(e) => setMsgText(e.target.value)} />
          <IconPicker value={msgIcon} onChange={setMsgIcon} />
          <button className="btn btn-blue btn-sm" disabled={busy || !msgTitle.trim() || !msgText.trim()} onClick={() => run(async () => { await api.adminMessage({ userId: id, title: msgTitle.trim(), text: msgText.trim(), icon: msgIcon || null }); toast(`Mensagem enviada para ${u!.nick}.`, 'success'); setMsgTitle(''); setMsgText(''); await loadInbox(); })}>Enviar para {u.nick}</button>
        </div>
        {/* a caixa do jogador, como ele vê (pedido do dono, 15/09/2026: conferir que os avisos chegaram) */}
        <div className="mt-3 border-t border-navy-ink/10 pt-2">
          <div className="mb-1 flex items-center justify-between text-[11px] font-extrabold uppercase text-muted">
            <span>Caixa de {u.nick}</span>
            {inbox && <span>{inbox.messages.length} {inbox.messages.length === 1 ? 'mensagem' : 'mensagens'} · {inbox.unread} não {inbox.unread === 1 ? 'lida' : 'lidas'}</span>}
          </div>
          {!inbox ? <div className="flex justify-center py-3"><Spinner /></div> : inbox.messages.length === 0 ? <p className="py-2 text-center text-[11px] font-bold text-muted">Nenhuma mensagem ainda.</p> : (
            <ul className="flex max-h-[300px] flex-col gap-1 overflow-y-auto">
              {inbox.messages.map((m) => (
                <li key={m.id} className={`rounded-xl ${m.read ? 'bg-sky/10' : 'bg-gold/25'}`}>
                  <button onClick={() => setOpenMsg(openMsg === m.id ? null : m.id)} className="no-drag w-full px-2 py-1.5 text-left">
                    <div className="flex items-center gap-2">
                      {m.icon && <img src={m.icon} alt="" className="h-5 w-5 shrink-0 object-contain" />}
                      <span className={`trap text-[9px] uppercase ${m.kind === 'ADMIN' || m.kind === 'AVISO' ? 'trap-blue' : m.kind === 'COMPRA' ? 'trap-orange' : 'trap-green'}`}>{m.kind}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] font-extrabold text-navy-ink">{m.title}</span>
                      <span className="shrink-0 text-[10px] font-bold text-muted">{m.read ? 'lida' : 'NÃO LIDA'} · {shortDt(m.at)}</span>
                    </div>
                  </button>
                  {openMsg === m.id && <p className="px-2 pb-2 text-[11px] font-bold leading-snug text-navy-ink"><MsgText text={m.text} iconSize={14} />{m.from ? ` — ${m.from}` : ''}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel title="VIP E SALDO" ribbon="yellow">
        <div className="flex items-center gap-2">
          <input className="field w-24" type="number" min={1} value={vipQtd} onChange={(e) => setVipQtd(e.target.value)} />
          <button className="btn btn-green btn-sm flex-1" disabled={busy} onClick={() => ajustarVip(Math.floor(Number(vipQtd)))}>Dar VIP</button>
          <button className="btn btn-red btn-sm flex-1" disabled={busy} onClick={() => ajustarVip(-Math.floor(Number(vipQtd)))}>Retirar VIP</button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input className="field w-24" type="number" min={1} step={100} value={saldoQtd} onChange={(e) => setSaldoQtd(e.target.value)} />
          <button className="btn btn-green btn-sm flex-1" disabled={busy} onClick={() => ajustarSaldo(Math.floor(Number(saldoQtd)))}>Dar saldo</button>
          <button className="btn btn-red btn-sm flex-1" disabled={busy} onClick={() => ajustarSaldo(-Math.floor(Number(saldoQtd)))}>Retirar saldo</button>
        </div>
        <p className="mt-2 text-center text-[10px] font-bold text-muted">VIP vai para o banco de dias do jogador (ele ativa quando quiser). Retirar nunca deixa abaixo de 0. Tudo fica no log.</p>
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

/** Ícone da mensagem na lista da caixa (os mesmos que valem como [token] no texto). */
function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="label mr-1">Ícone:</span>
      <button type="button" onClick={() => onChange('')} className={`no-drag rounded-lg px-2 py-1 text-[10px] font-extrabold ${value === '' ? 'bg-gold/40 ring-2 ring-gold' : 'bg-sky/10'}`}>nenhum</button>
      {Object.entries(MSG_ICONS).filter(([k]) => !['saldo'].includes(k)).map(([k, src]) => (
        <button key={k} type="button" onClick={() => onChange(k)} title={`[${k}]`} className={`no-drag rounded-lg p-1 ${value === k ? 'bg-gold/40 ring-2 ring-gold' : 'bg-sky/10'}`}><img src={src} alt={k} className="h-6 w-6 object-contain" /></button>
      ))}
    </div>
  );
}

// ─── Aviso para todos (caixa de mensagens de cada jogador) ──────────────────
function BroadcastPanel() {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [icon, setIcon] = useState('aviso');
  const [busy, setBusy] = useState(false);
  async function send() {
    if (busy || !title.trim() || !text.trim()) return;
    if (!window.confirm('Enviar este aviso para TODOS os jogadores? Cada um recebe uma mensagem na caixa.')) return;
    setBusy(true);
    try { const r = await api.adminMessage({ all: true, title: title.trim(), text: text.trim(), icon: icon || null }); toast(`Aviso enviado para ${r.sent} jogadores.`, 'success'); setTitle(''); setText(''); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  return (
    <Panel title="AVISO PARA TODOS" ribbon="orange">
      <p className="mb-2 text-[11px] font-bold leading-snug text-muted">Atualizações, compensações, novidades: uma mensagem na caixa de cada jogador (o envelope no topo mostra o selo). Para falar com um jogador só, abra o perfil dele na aba Jogadores.</p>
      <div className="flex flex-col gap-2">
        <input className="field" placeholder="Título (até 80 caracteres)" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="field min-h-[120px]" placeholder="Texto (até 4000 caracteres). Ícones: [vip] [coin] [gol] [trofeu] [caveira] [presente] [energia] [alvo] [whatsapp] · link: [clique aqui](https://…) · @nick vira link do perfil" maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
        <IconPicker value={icon} onChange={setIcon} />
        {text.trim() && <div className="rounded-xl bg-sky/10 p-2 text-[12px] font-bold text-navy-ink"><span className="label block">Prévia</span><MsgText text={text} /></div>}
        <button className="btn btn-orange btn-md" disabled={busy || !title.trim() || !text.trim()} onClick={send}>{busy ? 'Enviando…' : 'Enviar para todos'}</button>
      </div>
    </Panel>
  );
}

// ─── Log de auditoria ───────────────────────────────────────────────────────
const ACTION_LABEL: Record<string, string> = { editar: 'editou', gols: 'deu gols para', exp: 'deu exp para', vip: 'deu VIP para', 'vip-retirar': 'retirou VIP de', saldo: 'deu saldo para', 'saldo-retirar': 'retirou saldo de', mensagem: 'mandou mensagem para', aviso: 'enviou aviso para todos', banir: 'baniu', desbanir: 'desbaniu', denuncia: 'resolveu denúncia de' };

function payloadLabel(r: AdminLogRow): string {
  const p = r.payload ?? {};
  if (['gols', 'exp', 'vip', 'vip-retirar', 'saldo', 'saldo-retirar'].includes(r.action)) return `qtd: ${p.qtd ?? '?'}`;
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

// ─── Multiconta: IPs com mais de uma conta ──────────────────────────────────
function MultiList({ onPick }: { onPick: (id: number) => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ page: number; pages: number; total: number; ips: number; accounts: number; rows: AdminMultiRow[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const r = await api.adminMulti(q.trim(), page); if (alive) setData(r); }
      catch (e) { if (alive) toast((e as Error).message, 'error'); }
      finally { if (alive) setLoading(false); }
    }, q ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, page]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <img src="/ui/pi-search.png" className="h-5 w-5" alt="" />
        <input className="field flex-1" placeholder="Buscar por IP, nick ou e-mail" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {data && <p className="t-out text-center text-[11px] font-extrabold text-white">{num(data.ips)} IPs com 2+ contas · IP de celular é compartilhado (CGNAT): confira horário e time antes de julgar.</p>}
      {loading && !data ? <div className="flex justify-center py-8"><Spinner /></div> : !data || data.rows.length === 0 ? <div className="panel p-2"><Empty text="Nenhum IP com mais de uma conta." /></div> : (
        <ul className="flex flex-col gap-3">
          {data.rows.map((g) => (
            <li key={g.ip} className="panel p-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-display text-[15px] text-navy-ink">{g.ip}</span>
                <span className="trap trap-orange text-[10px] uppercase">{g.count} contas</span>
                {g.inviteInside && <span className="rounded-md bg-[#C0392B] px-1.5 py-0.5 font-display text-[9px] uppercase text-white" title="Uma conta do grupo entrou pelo convite de outra do grupo">convite entre elas</span>}
                <span className="ml-auto text-[10px] font-bold text-muted">visto {timeAgo(g.lastSeenAt)}</span>
              </div>
              <div className="mt-0.5 text-[11px] font-bold text-muted">
                {g.geo ? ([g.geo.city, g.geo.region, g.geo.country].filter(Boolean).join(', ') || 'local sem dados') + (g.geo.isp ? ` · ${g.geo.isp}` : '') : 'geolocalização sem dados'} <GeoFlags geo={g.geo} />
              </div>
              <ul className="mt-1.5 flex flex-col gap-1">
                {g.users.map((u) => (
                  <li key={u.id}>
                    <button onClick={() => onPick(u.id)} className="no-drag flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left odd:bg-sky/10 hover:bg-sky/20">
                      <Avatar url={u.avatarUrl} size={34} />
                      {u.team ? <Shield team={u.team} size={22} /> : null}
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[14px] font-extrabold leading-tight ${nickProps(u).className}`} style={nickProps(u).style}>{u.nick} <span className="font-sans text-[10px] font-bold text-muted">· {u.team?.name ?? 'sem time'} · lvl {u.level.lvl}</span></span>
                        <span className="block truncate text-[10px] font-bold text-muted">{u.email}</span>
                        <span className="block text-[10px] font-extrabold leading-snug text-navy-ink">
                          criada {shortDt(u.createdAt)} · visto {timeAgo(u.lastSeenAt)} · IP {u.via.map((v) => (v === 'cadastro' ? 'do cadastro' : 'atual')).join(' e ')}
                          {u.otherIp && <span className="text-muted"> · outro IP {u.otherIp}</span>}
                          {u.invitedBy && <span className="text-grass-deep"> · convite de {u.invitedBy}</span>}
                        </span>
                        <span className="mt-0.5 block"><Badges u={u} /></span>
                      </span>
                      <span className="text-right">
                        <span className="block font-display text-base leading-tight text-grass-deep">{num(u.goalsTotal)} gols</span>
                        <span className="block text-[10px] font-bold text-muted">{fmt(u.money)}{u.vipDays > 0 ? ` · ${u.vipDays} VIP` : ''}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <button className="btn btn-gray btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span className="t-display t-out text-sm">pág. {data.page}/{data.pages} · {num(data.total)} IPs</span>
          <button className="btn btn-gray btn-sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Próxima</button>
        </div>
      )}
    </div>
  );
}

// ─── X1 (FutPrego e Futebol de Botão): histórico dos confrontos (a partida mais recente primeiro) ───
const FP_REASON: Record<string, string> = { gol: 'gol', 'gol-contra': 'gol contra', wo: 'W.O.', desistiu: 'desistência', empate: 'empate (aposta devolvida)', 'wo-cedo': 'W.O. cedo (aposta devolvida)', reinicio: 'API reiniciou (aposta devolvida)', penaltis: 'pênaltis', tempo: 'mais gols no fim' };
const X1_GAME: Record<string, string> = { FUTPREGO: 'FutPrego', BOTAO: 'Botão' };

function FutPregoList({ onPick }: { onPick: (id: number) => void }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ page: number; pages: number; total: number; rows: AdminFutPregoRow[] } | null>(null);

  useEffect(() => {
    let alive = true;
    api.adminFutprego(page).then((r) => { if (alive) setData(r); }).catch((e) => toast((e as Error).message, 'error'));
    return () => { alive = false; };
  }, [page]);

  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;
  const who = (p: AdminFutPregoRow['a'], won: boolean) => (
    <button onClick={() => onPick(p.id)} className={`no-drag inline-flex min-w-0 items-center gap-1 ${won ? '' : 'opacity-80'}`}>
      {p.team ? <Shield team={p.team} size={18} /> : null}
      <span className={`truncate text-[13px] font-extrabold ${p.deleted ? 'line-through text-muted' : nickProps(p).className}`} style={nickProps(p).style}>{p.nick}</span>
      <span className="truncate text-[10px] font-bold text-muted">({p.team?.name ?? '—'})</span>
    </button>
  );
  const result = (m: AdminFutPregoRow) => {
    if (m.status === 'PLAYING') return <span className="trap trap-green text-[9px] uppercase">ao vivo</span>;
    if (m.status === 'CANCELED') return <span className="text-[11px] font-bold text-muted">cancelada · {FP_REASON[m.reason ?? ''] ?? m.reason}</span>;
    const w = m.winnerId === m.a.id ? m.a : m.winnerId === m.b.id ? m.b : null;
    return (
      <span className="text-[11px] font-bold text-navy-ink">
        {w ? <>venceu <b className="text-grass-deep">{w.nick}</b> por {FP_REASON[m.reason ?? ''] ?? m.reason}</> : FP_REASON[m.reason ?? ''] ?? m.reason}
        {m.turns > 0 ? ` · ${m.turns} jogada${m.turns === 1 ? '' : 's'}` : ''}
        {w && (m.goalAwarded ? <span className="text-grass-deep"> · gol contou{m.lostTeam ? ` (${m.lostTeam.name} perdeu 1 gol)` : ''}</span> : <span className="text-muted"> · sem gol (limite do dia ou revanche repetida)</span>)}
      </span>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="panel p-2">
        {data.rows.length === 0 ? <Empty text="Nenhuma partida de X1 ainda." /> : (
          <ul className="flex flex-col gap-1">
            {data.rows.map((m) => (
              <li key={m.id} className="rounded-xl px-2 py-1.5 odd:bg-sky/10">
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted">
                  <span className="rounded-md bg-navy/15 px-1.5 py-0.5 font-display text-[9px] uppercase text-navy-ink">{X1_GAME[m.game] ?? m.game}</span>
                  <span>#{m.id} · {shortDt(m.at)}{m.finishedAt && m.status === 'FINISHED' ? ` → ${new Date(m.finishedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</span>
                  <span className="ml-auto">aposta {fmt(m.bet)}</span>
                  {m.sameIp && <span className="rounded-md bg-[#C0392B] px-1.5 py-0.5 font-display text-[9px] uppercase text-white">mesma internet</span>}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {who(m.a, m.winnerId === m.a.id)}
                  <span className="font-display text-[12px] text-orange-deep">x</span>
                  {who(m.b, m.winnerId === m.b.id)}
                </div>
                <div>{result(m)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {data.pages > 1 && (
        <div className="flex items-center justify-between">
          <button className="btn btn-gray btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span className="t-display t-out text-sm">pág. {data.page}/{data.pages} · {num(data.total)} partidas</span>
          <button className="btn btn-gray btn-sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Próxima</button>
        </div>
      )}
    </div>
  );
}

// ─── Denúncias (política de conteúdo gerado por usuário da Play Store) ──────
const REASON_LABEL: Record<string, string> = { ofensa: 'Ofensa/ameaça', spam: 'Spam', golpe: 'Golpe/link', nick: 'Nick/texto impróprio', foto: 'Foto imprópria', outro: 'Outro' };

function ReportList({ onPick }: { onPick: (id: number) => void }) {
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ page: number; pages: number; total: number; open: number; rows: AdminReportRow[] } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const load = () => api.adminReports(status, page).then(setData).catch((e) => toast((e as Error).message, 'error'));
  useEffect(() => { setData(null); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, page]);

  async function resolve(r: AdminReportRow, acao: 'ignorar' | 'apagar' | 'banir') {
    const ask = { ignorar: `Ignorar a denúncia contra ${r.target.nick}?`, apagar: `Apagar a mensagem de ${r.target.nick}?`, banir: `Banir ${r.target.nick} por 24 h (e apagar a mensagem)?` }[acao];
    if (busy || !window.confirm(ask)) return;
    setBusy(r.id);
    try { await api.adminResolveReport(r.id, acao, 24); toast('Denúncia resolvida.', 'success'); await load(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  }

  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;
  return (
    <div className="flex flex-col gap-3">
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ id: 'OPEN', label: `Abertas (${data.open})` }, { id: 'RESOLVED', label: 'Resolvidas' }]} />
      <div className="panel p-2">
        {data.rows.length === 0 ? <Empty text={status === 'OPEN' ? 'Nenhuma denúncia aberta.' : 'Nada resolvido ainda.'} /> : (
          <ul className="flex flex-col gap-2">
            {data.rows.map((r) => (
              <li key={r.id} className="rounded-xl bg-sky/10 p-2">
                <div className="flex items-center gap-2 text-[13px] font-extrabold text-navy-ink">
                  <button onClick={() => onPick(r.target.id)} className="no-drag flex items-center gap-1.5"><Avatar url={r.target.avatarUrl} size={26} />{r.target.nick}</button>
                  {r.target.banned && <span className="trap trap-orange text-[9px] uppercase">banido</span>}
                  {r.target.deleted && <span className="trap trap-blue text-[9px] uppercase">conta excluída</span>}
                  <span className="ml-auto text-[10px] font-bold text-muted">{dt(r.at)}</span>
                </div>
                <div className="mt-1 text-[12px] font-bold text-navy-ink"><span className="text-orange-deep">{REASON_LABEL[r.reason] ?? r.reason}</span> · por {r.reporter.nick}{r.details ? ` · "${r.details}"` : ''}</div>
                {r.messageText && <p className="mt-1 rounded-lg bg-white/80 px-2 py-1 text-[12px] font-bold text-navy-ink">"{r.messageText}"</p>}
                {r.status === 'OPEN' ? (
                  <div className="mt-2 flex gap-1.5">
                    <button onClick={() => resolve(r, 'ignorar')} disabled={busy === r.id} className="btn btn-gray btn-sm flex-1">Ignorar</button>
                    {r.messageId && <button onClick={() => resolve(r, 'apagar')} disabled={busy === r.id} className="btn btn-orange btn-sm flex-1">Apagar msg</button>}
                    <button onClick={() => resolve(r, 'banir')} disabled={busy === r.id} className="btn btn-red btn-sm flex-1">Banir 24 h</button>
                  </div>
                ) : <div className="mt-1 text-[10px] font-bold text-muted">Resolvida: {r.resolution}{r.resolvedAt ? ` · ${dt(r.resolvedAt)}` : ''}</div>}
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
  const [tab, setTab] = useState<'jogadores' | 'criadas' | 'multi' | 'denuncias' | 'futprego' | 'avisos' | 'log'>('jogadores');
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
        <Tabs value={tab} onChange={(t) => { setTab(t); setPicked(null); }} items={[{ id: 'jogadores', label: 'Jogadores' }, { id: 'criadas', label: 'Contas' }, { id: 'multi', label: 'Multiconta' }, { id: 'denuncias', label: 'Denúncias' }, { id: 'futprego', label: 'X1' }, { id: 'avisos', label: 'Avisos' }, { id: 'log', label: 'Log' }]} />
      </div>
      <div className="relative flex-1 px-3 pb-4">
        {tab === 'log' ? <LogList /> : tab === 'avisos' ? <BroadcastPanel /> : picked !== null ? <UserDetail key={picked} id={picked} onBack={() => setPicked(null)} onPick={setPicked} /> : tab === 'denuncias' ? <ReportList onPick={setPicked} /> : tab === 'futprego' ? <FutPregoList onPick={setPicked} /> : tab === 'multi' ? <MultiList onPick={setPicked} /> : <UserList key={tab} onPick={setPicked} order={tab === 'criadas' ? 'criadas' : 'recentes'} />}
      </div>
    </div>
  );
}
