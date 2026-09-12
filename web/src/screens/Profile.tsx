import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Crown, LogOut, Search, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { Shield } from '../components/Shield';
import { Section } from '../components/ui';
import { toast } from '../components/Toast';
import { money as fmt, num } from '../lib/format';

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl bg-night-1 p-2 text-center">
      <div className="font-score text-xl font-bold text-chalk">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-haze">{label}</div>
      {sub && <div className="text-[10px] text-hazedim">{sub}</div>}
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
  const progress = me.level.next ? (me.goalsTotal - me.level.goals) / (me.level.next.goals - me.level.goals) : 1;

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
    <div className="flex flex-col gap-3">
      <section className="card p-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2" style={{ borderColor: me.team.colorPrimary, background: `linear-gradient(135deg, ${me.team.colorPrimary}, ${me.team.colorSecondary})` }}>
              <span className="font-poster text-3xl text-white drop-shadow">{me.nick.slice(0, 2).toUpperCase()}</span>
            </div>
            <Shield team={me.team} size={30} className="absolute -bottom-1 -right-1" />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`truncate font-poster text-2xl ${me.vip ? 'text-sky-300' : 'text-chalk'}`}>{me.nick} {me.vip && <Crown className="inline h-4 w-4 text-flood" />}</div>
            <div className="text-xs text-haze">{me.gender === 'F' ? 'Jogadora' : 'Jogador'} do <Link to={`/time/${me.team.slug}`} className="font-bold text-chalk">{me.team.name}</Link></div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-flood">Lvl {me.level.lvl} · {me.level.name}</div>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[10px] uppercase tracking-wider text-haze"><span>{num(me.goalsTotal)} gols</span><span>{me.level.next ? `${me.level.next.name} em ${num(me.level.next.goals)}` : 'nível máximo'}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-night-1"><div className="h-full rounded-full bg-gradient-to-r from-turf to-flood" style={{ width: `${Math.min(100, progress * 100)}%` }} /></div>
          {me.level.next?.skill && <div className="mt-1 text-[10px] text-hazedim">Próximo nível libera: {me.level.next.skill}</div>}
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Dinheiro" value={<span className="text-flood">{fmt(me.money)}</span>} />
        <Stat label="Destreza" value={`${me.dexterity}/${dexMax}`} />
        <Stat label="VIP" value={me.vip ? 'ATIVO' : `${me.vipDays} un.`} sub={me.vip && me.vipUntil ? `até ${new Date(me.vipUntil).toLocaleDateString('pt-BR')}` : undefined} />
      </div>

      <Section title="Meus números">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Chute direto" value={num(me.stats.auto.goals)} sub="gols" />
          <Stat label="Pênaltis" value={`${me.stats.penalty.goals}/${me.stats.penalty.tries}`} sub={rate(me.stats.penalty.goals, me.stats.penalty.tries)} />
          <Stat label="Faltas" value={`${me.stats.foul.goals}/${me.stats.foul.tries}`} sub={rate(me.stats.foul.goals, me.stats.foul.tries)} />
          <Stat label="Trilha" value={`${me.stats.trail.goals}/${me.stats.trail.tries}`} sub={rate(me.stats.trail.goals, me.stats.trail.tries)} />
          <Stat label="Nesta hora" value={me.goalsHour} sub="gols" />
          <Stat label="Nesta rodada" value={me.goalsRound} sub={`temporada: ${me.goalsSeason}`} />
        </div>
      </Section>

      <Section title="Loja do jogador">
        <div className="flex items-center gap-3 rounded-xl bg-night-1 p-3">
          <Zap className="h-6 w-6 shrink-0 text-flood" />
          <div className="flex-1 text-xs text-haze"><b className="text-chalk">Destreza</b> · +1% de acerto em pênaltis e faltas por ponto (máx. {dexMax}). {fmt(dexPrice)} a unidade.</div>
          <button onClick={buyDex} disabled={busy || me.dexterity >= dexMax || me.money < dexPrice} className="btn-flood px-3 py-2 text-xs">+1</button>
        </div>
        <div className="mt-2 flex items-center gap-3 rounded-xl bg-night-1 p-3">
          <Crown className="h-6 w-6 shrink-0 text-sky-300" />
          <div className="flex-1 text-xs text-haze"><b className="text-chalk">VIP</b> · recargas pela metade, nome azul. Você tem <b className="text-chalk">{me.vipDays}</b> unidade(s) ganhas em prêmios.</div>
          <button onClick={activateVip} disabled={busy || me.vipDays < 1} className="btn-ghost px-3 py-2 text-xs">Ativar 1 dia</button>
        </div>
        <p className="mt-2 text-[10px] text-hazedim">Rebotes: pênalti nv {me.rebound.PENALTY} · falta nv {me.rebound.FOUL} · trilha nv {me.rebound.TRAIL}. <Link to="/regras" className="text-turf">Ver níveis e regras</Link></p>
      </Section>

      <Section title="Texto pessoal">
        <textarea className="field min-h-[72px] text-sm" maxLength={400} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Grite para a torcida (máx. 400 caracteres)" />
        <button onClick={saveBio} className="btn-ghost mt-2 w-full py-2 text-xs">Salvar</button>
      </Section>

      <Section title="Buscar jogador">
        <div className="flex items-center gap-2 rounded-xl bg-night-1 px-3"><Search className="h-4 w-4 text-haze" /><input className="w-full bg-transparent py-2 text-sm text-chalk outline-none" placeholder="nick" value={q} onChange={(e) => search(e.target.value)} /></div>
        {found.length > 0 && <ul className="mt-2 flex flex-col gap-1">{found.map((f) => <li key={f.nick}><Link to={`/jogador/${encodeURIComponent(f.nick)}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-chalk hover:bg-night-1"><Shield team={f.team} size={20} />{f.nick}</Link></li>)}</ul>}
      </Section>

      <button onClick={() => { logout(); nav('/entrar'); }} className="btn-ghost w-full py-3 text-sm text-card"><LogOut className="h-4 w-4" /> Deslogar</button>
    </div>
  );
}
