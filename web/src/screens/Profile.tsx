import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { Shield } from '../components/Shield';
import { Panel, Bar } from '../components/ui';
import { toast } from '../components/Toast';
import { money as fmt, num } from '../lib/format';

function Stat({ label, value, sub, icon }: { label: string; value: React.ReactNode; sub?: string; icon?: string }) {
  return (
    <div className="item-blue flex flex-col items-center text-center">
      {icon && <img src={icon} className="h-8 w-8" alt="" />}
      <div className="t-display t-out text-xl">{value}</div>
      <div className="t-display text-[10px] uppercase tracking-wider text-white/80">{label}</div>
      {sub && <div className="text-[10px] font-bold text-white/70">{sub}</div>}
    </div>
  );
}

const rate = (g: number, t: number) => (t ? `${Math.round((g / t) * 100)}%` : '—');

export function ProfileScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const setMe = useAuth((s) => s.setMe);
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();
  const [bio, setBio] = useState(me.bio ?? '');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ nick: string; team: any }[]>([]);
  const [busy, setBusy] = useState(false);

  const dexPrice = meta?.money.DEXTERITY_PRICE ?? 1000;
  const dexMax = meta?.dexterityMax ?? 30;

  async function buyDex() {
    if (busy) return; setBusy(true);
    try { setMe(await api.buyDexterity(1)); toast('+1 destreza! Mais chance nos pênaltis e faltas.', 'success'); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function saveBio() {
    try { setMe(await api.setBio(bio)); toast('Texto pessoal salvo.', 'success'); } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function activateVip() {
    if (busy) return; setBusy(true);
    try { setMe(await api.activateVip(1)); toast('VIP ativado por 1 dia. Recargas pela metade!', 'success'); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function search(v: string) {
    setQ(v);
    if (v.trim().length < 2) { setFound([]); return; }
    try { setFound(await api.search(v)); } catch {}
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="panel-navy">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src="/ui/ico-userthumbnail.png" alt="" className="h-20 w-20" />
            <Shield team={me.team} size={34} className="absolute -bottom-1 -right-1" />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`t-display truncate text-3xl ${me.vip ? 'text-sky-light' : 't-out'}`}>{me.nick} {me.vip && <img src="/ui/ico-crown_silver.png" className="ico h-6 w-6" alt="VIP" />}</div>
            <div className="text-[12px] font-extrabold text-white/90">{me.gender === 'F' ? 'Jogadora' : 'Jogador'} do <Link to={`/time/${me.team.slug}`} className="t-gold t-display">{me.team.name}</Link></div>
            <div className="trap trap-orange mt-1 text-[11px] uppercase">Lvl {me.level.lvl} · {me.level.name}</div>
          </div>
        </div>
        <div className="mt-3">
          <Bar value={me.levelPoints - me.level.goals} max={(me.level.next?.goals ?? me.levelPoints) - me.level.goals} label={`${num(me.levelPoints)} pontos${me.level.next ? ` · ${me.level.next.name} em ${num(me.level.next.goals)}` : ' · nível máximo'}`} yellow />
          {me.levelBonus > 0 && <div className="mt-1 text-center text-[11px] font-extrabold text-white/80">{num(me.goalsTotal)} gols + {num(me.levelBonus)} do Termo do dia</div>}
          {me.level.next?.skill && <div className="mt-1 text-center text-[11px] font-extrabold text-white/80">Próximo nível libera: {me.level.next.skill}</div>}
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Dinheiro" value={fmt(me.money)} icon="/ui/ico-coin01_s.png" />
        <Stat label="Destreza" value={`${me.dexterity}/${dexMax}`} icon="/ui/ico-energy.png" />
        <Stat label="VIP" value={me.vip ? 'ATIVO' : `${me.vipDays} un.`} icon="/ui/ico-crown_silver.png" sub={me.vip && me.vipUntil ? `até ${new Date(me.vipUntil).toLocaleDateString('pt-BR')}` : undefined} />
      </div>

      <Panel title="MEUS NÚMEROS" ribbon="blue">
        <div className="grid grid-cols-2 gap-2 text-center">
          {[
            ['Chute direto', num(me.stats.auto.goals), 'gols'],
            ['Pênaltis', `${me.stats.penalty.goals}/${me.stats.penalty.tries}`, rate(me.stats.penalty.goals, me.stats.penalty.tries)],
            ['Faltas', `${me.stats.foul.goals}/${me.stats.foul.tries}`, rate(me.stats.foul.goals, me.stats.foul.tries)],
            ['Trilha', `${me.stats.trail.goals}/${me.stats.trail.tries}`, rate(me.stats.trail.goals, me.stats.trail.tries)],
            ['Nesta hora', me.goalsHour, 'gols'],
            ['Nesta rodada', me.goalsRound, `temporada: ${me.goalsSeason}`],
          ].map(([l, v, s]) => (
            <div key={l as string} className="rounded-xl bg-sky/10 py-2"><div className="font-display text-xl text-navy-ink">{v}</div><div className="label">{l}</div><div className="text-[10px] font-bold text-muted">{s}</div></div>
          ))}
        </div>
      </Panel>

      <Panel title="LOJA DO JOGADOR" ribbon="yellow">
        <div className="flex items-center gap-3 rounded-xl bg-sky/10 p-2">
          <img src="/ui/ico-energy.png" className="h-10 w-10 shrink-0" alt="" />
          <div className="flex-1 text-[12px] font-bold text-muted"><b className="text-navy-ink">Destreza</b> · +1% de acerto em pênaltis e faltas por ponto (máx. {dexMax}). {fmt(dexPrice)} a unidade.</div>
          <button onClick={buyDex} disabled={busy || me.dexterity >= dexMax || me.money < dexPrice} className="btn btn-orange btn-sm">+1</button>
        </div>
        <div className="mt-2 flex items-center gap-3 rounded-xl bg-sky/10 p-2">
          <img src="/ui/ico-crown_silver.png" className="h-10 w-10 shrink-0" alt="" />
          <div className="flex-1 text-[12px] font-bold text-muted"><b className="text-navy-ink">VIP</b> · recargas pela metade, nome azul. Você tem <b className="text-navy-ink">{me.vipDays}</b> unidade(s) ganhas em prêmios.</div>
          <button onClick={activateVip} disabled={busy || me.vipDays < 1} className="btn btn-blue btn-sm">1 dia</button>
        </div>
        <p className="mt-2 text-center text-[11px] font-bold text-muted">Rebotes: pênalti nv {me.rebound.PENALTY} · falta nv {me.rebound.FOUL} · trilha nv {me.rebound.TRAIL}. <Link to="/regras" className="text-orange-deep">Níveis e regras</Link></p>
      </Panel>

      <Panel title="TEXTO PESSOAL" ribbon="green">
        <textarea className="field min-h-[80px] text-sm" maxLength={400} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Grite para a torcida (máx. 400 caracteres)" />
        <button onClick={saveBio} className="btn btn-green btn-sm mt-2 w-full">Salvar</button>
      </Panel>

      <Panel title="BUSCAR JOGADOR" ribbon="blue">
        <div className="flex items-center gap-2"><img src="/ui/pi-search.png" className="h-5 w-5" alt="" /><input className="field" placeholder="nick" value={q} onChange={(e) => search(e.target.value)} /></div>
        {found.length > 0 && <ul className="mt-2 flex flex-col gap-1">{found.map((f) => <li key={f.nick}><Link to={`/jogador/${encodeURIComponent(f.nick)}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-extrabold text-navy-ink hover:bg-sky/10"><Shield team={f.team} size={22} />{f.nick}</Link></li>)}</ul>}
      </Panel>

      <button onClick={() => { logout(); nav('/entrar'); }} className="btn btn-red btn-md w-full"><img src="/ui/pi-exit_l.png" className="h-5 w-5" alt="" /> Deslogar</button>
    </div>
  );
}
