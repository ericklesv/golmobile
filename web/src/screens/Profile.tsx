import { useEffect, useRef, useState } from 'react';
import type { PublicPlayer } from '../lib/types';
import { NameBadges, TopHistory } from '../components/Badges';
import { X1Record } from '../components/X1Record';
import { InvitePanel } from '../components/Invite';
import { WhatsButton } from '../components/WhatsInvite';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { Shield } from '../components/Shield';
import { Avatar } from '../components/Avatar';
import { Panel, Bar } from '../components/ui';
import { toast } from '../components/Toast';
import { money as fmt, num } from '../lib/format';
import { sound } from '../lib/sound';
import { AnimatePresence } from 'framer-motion';
import { DeleteAccountModal } from '../components/Account';
import { NickFadePanel } from '../components/NickFade';
import { nickProps } from '../lib/nick';

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [som, setSom] = useState(sound.enabled());
  const [deleting, setDeleting] = useState(false); // janela "Excluir minha conta" (Play Store)
  const [pub, setPub] = useState<PublicPlayer | null>(null); // top 3 de agora + quadro de top 10
  useEffect(() => { api.player(me.nick).then(setPub).catch(() => {}); }, [me.nick]);
  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(f.type)) { toast('Envie PNG, JPG, WEBP ou GIF.', 'error'); return; }
    if (f.size > 5 * 1024 * 1024) { toast('A imagem precisa ter no máximo 5 MB.', 'error'); return; }
    setBusy(true);
    try { setMe(await api.uploadAvatar(f)); toast('Foto de perfil atualizada!', 'success'); }
    catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function removeAvatar() {
    if (busy) return; setBusy(true);
    try { setMe(await api.removeAvatar()); toast('Foto removida.', 'success'); } catch (err) { toast((err as Error).message, 'error'); } finally { setBusy(false); }
  }

  const dexMax = meta?.dexterityMax ?? 30;

  async function saveBio() {
    try { setMe(await api.setBio(bio)); toast('Texto pessoal salvo.', 'success'); } catch (e) { toast((e as Error).message, 'error'); }
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
          <button onClick={() => fileRef.current?.click()} className="no-drag relative shrink-0" aria-label="Trocar foto de perfil" disabled={busy}>
            <Avatar url={me.avatarUrl} size={80} />
            <Shield team={me.team} size={34} className="absolute -bottom-1 -right-1" />
            <span className="absolute -left-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-orange shadow"><img src="/ui/pi-edit.png" className="h-4 w-4" alt="" /></span>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={pickAvatar} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="t-display truncate text-3xl"><span className={nickProps(me, { plain: 't-out', vipClass: 'text-sky-light', dark: true }).className} style={nickProps(me, { dark: true }).style}>{me.nick}</span> {me.vip && <img src="/ui/ico-crown_silver.png" className="ico h-6 w-6" alt="VIP" />}<NameBadges role={me.role} tops={pub?.tops} size={20} /></div>
            <div className="text-[12px] font-extrabold text-white/90">{me.gender === 'F' ? 'Jogadora' : 'Jogador'} do <Link to={`/time/${me.team.slug}`} className="t-gold t-display">{me.team.name}</Link></div>
            <div className="trap trap-orange mt-1 text-[11px] uppercase">Lvl {me.level.lvl} · {me.level.name}</div>
            {(me.role || me.contractUntil) && (
              <Link to="/propostas" className="mt-1 flex flex-wrap gap-1">
                {me.role && <span className="trap trap-green text-[10px] uppercase">{me.role === 'PRESIDENTE' ? 'Presidente' : me.gender === 'F' ? 'Diretora' : 'Diretor'} do {me.team.abbr}</span>}
                {me.contractUntil && <span className="trap trap-blue text-[10px] uppercase">Contrato até {new Date(me.contractUntil).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}</span>}
              </Link>
            )}
          </div>
        </div>
        <div className="mt-3">
          <Bar value={me.levelPoints - me.level.goals} max={(me.level.next?.goals ?? me.levelPoints) - me.level.goals} label={`${num(me.levelPoints)} pontos${me.level.next ? ` · ${me.level.next.name} em ${num(me.level.next.goals)}` : ' · nível máximo'}`} yellow />
          {me.levelBonus > 0 && <div className="mt-1 text-center text-[11px] font-extrabold text-white/80">{num(me.goalsTotal)} gols + {num(me.levelBonus)} do Termo do dia</div>}
          {me.level.next?.skill && <div className="mt-1 text-center text-[11px] font-extrabold text-white/80">Próximo nível libera: {me.level.next.skill}</div>}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn btn-sky btn-sm flex-1">{me.avatarUrl ? 'Trocar foto' : 'Enviar foto'}</button>
          {me.avatarUrl && <button onClick={removeAvatar} disabled={busy} className="btn btn-gray btn-sm">Remover</button>}
        </div>
        <p className="mt-1 text-center text-[10px] font-bold text-white/70">PNG, JPG, WEBP ou GIF animado · até 5 MB</p>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Dinheiro" value={fmt(me.money)} icon="/ui/ico-coin01_s.png" />
        <Stat label="Destreza" value={`${me.dexterity}/${dexMax}`} icon="/ui/ico-energy.png" />
        <Stat label="VIP" value={me.vip ? 'ATIVO' : `${me.vipDays} un.`} icon="/ui/ico-crown_silver.png" sub={me.vip && me.vipUntil ? `até ${new Date(me.vipUntil).toLocaleDateString('pt-BR')}` : undefined} />
      </div>

      <InvitePanel />

      {pub?.history && <Panel title="MEU TOP 10" ribbon="yellow"><TopHistory history={pub.history} /></Panel>}

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

      <X1Record record={pub?.x1} history={pub?.history} isMe />

      <button onClick={() => { sound.setEnabled(!som); setSom(!som); }} className={`btn btn-md w-full ${som ? 'btn-sky' : 'btn-gray'}`}><img src={som ? '/ui/pi-sound_on.png' : '/ui/pi-sound_off.png'} className="h-6 w-6" alt="" /> Sons da interface: {som ? 'ligados' : 'desligados'}</button>
      <Link to="/loja" className="btn btn-yellow btn-md w-full"><img src="/ui/ico-goldpouch.png" className="h-6 w-6" alt="" /> Loja: destreza, VIP e itens</Link>
      <WhatsButton />
      {me.isAdmin && <Link to="/admin" className="btn btn-gray btn-md w-full"><img src="/ui/pi-setting.png" className="h-5 w-5" alt="" /> Painel de admin</Link>}
      <p className="-mt-2 text-center text-[11px] font-bold text-white/80">Rebotes: pênalti nv {me.rebound.PENALTY} · falta nv {me.rebound.FOUL} · trilha nv {me.rebound.TRAIL} · <Link to="/niveis" className="t-gold t-display">níveis</Link> · <Link to="/regras" className="t-gold t-display">regras</Link></p>

      <NickFadePanel />

      <Panel title="TEXTO PESSOAL" ribbon="green">
        <textarea className="field min-h-[80px] text-sm" maxLength={400} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Grite para a torcida (máx. 400 caracteres)" />
        <button onClick={saveBio} className="btn btn-green btn-sm mt-2 w-full">Salvar</button>
      </Panel>

      <Panel title="BUSCAR JOGADOR" ribbon="blue">
        <div className="flex items-center gap-2"><img src="/ui/pi-search.png" className="h-5 w-5" alt="" /><input className="field" placeholder="nick" value={q} onChange={(e) => search(e.target.value)} /></div>
        {found.length > 0 && <ul className="mt-2 flex flex-col gap-1">{found.map((f) => <li key={f.nick}><Link to={`/jogador/${encodeURIComponent(f.nick)}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-extrabold text-navy-ink hover:bg-sky/10"><Shield team={f.team} size={22} />{f.nick}</Link></li>)}</ul>}
      </Panel>

      <button onClick={() => { logout(); nav('/entrar'); }} className="btn btn-red btn-md w-full"><img src="/ui/pi-exit_l.png" className="h-5 w-5" alt="" /> Deslogar</button>
      <p className="t-display t-out text-center text-[11px]"><Link to="/privacidade">Privacidade</Link> · <Link to="/termos">Termos de uso</Link> · <button onClick={() => setDeleting(true)} className="no-drag t-display t-out">Excluir minha conta</button></p>
      <AnimatePresence>{deleting && <DeleteAccountModal key="del" onClose={() => setDeleting(false)} />}</AnimatePresence>
    </div>
  );
}
