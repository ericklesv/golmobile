import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Crown, Home, Trophy, Medal, Shield as ShieldIcon, User } from 'lucide-react';
import { useAuth } from '../store/auth';
import { Shield } from './Shield';
import { money } from '../lib/format';
import { useEffect } from 'react';
import { api } from '../lib/api';

const tabs = [
  { to: '/', label: 'Jogar', icon: Home, end: true },
  { to: '/liga', label: 'Liga', icon: Trophy },
  { to: '/rankings', label: 'Rankings', icon: Medal },
  { to: '/time', label: 'Time', icon: ShieldIcon },
  { to: '/perfil', label: 'Perfil', icon: User },
];

export function Layout() {
  const me = useAuth((s) => s.me);
  const online = useAuth((s) => s.online);
  const nav = useNavigate();

  // Presença: heartbeat a cada 60 s enquanto a aba está aberta
  useEffect(() => {
    let alive = true;
    const beat = () => api.heartbeat().then((r) => alive && useAuth.setState({ online: r.online, offset: r.serverTime - Date.now() })).catch(() => {});
    beat();
    const iv = setInterval(beat, 60_000);
    const vis = () => { if (document.visibilityState === 'visible') { beat(); useAuth.getState().refresh(); } };
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; clearInterval(iv); document.removeEventListener('visibilitychange', vis); };
  }, []);

  if (!me) return null;
  return (
    <div className="app-frame flex min-h-full flex-col">
      <div className="stadium-bg" />
      {/* HUD */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-night-0/85 backdrop-blur" style={{ paddingTop: 'var(--sat)' }}>
        <div className="flex items-center gap-2 px-3 py-2">
          <button onClick={() => nav('/perfil')} className="flex min-w-0 items-center gap-2">
            <Shield team={me.team} size={34} />
            <div className="min-w-0 text-left">
              <div className={`truncate text-sm font-bold leading-tight ${me.vip ? 'text-sky-300' : 'text-chalk'}`}>{me.nick}{me.vip && <Crown className="ml-1 inline h-3 w-3 text-flood" />}</div>
              <div className="truncate text-[10px] uppercase tracking-wider text-haze">Lvl {me.level.lvl} · {me.level.name}</div>
            </div>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <div className="rounded-full border border-flood/40 bg-flood/10 px-2.5 py-1 font-score text-sm font-bold text-flood">{money(me.money)}</div>
            <div className="hidden items-center gap-1 rounded-full border border-line px-2 py-1 text-[10px] text-haze sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-turf" /> {online} online
            </div>
          </div>
        </div>
      </header>

      <main className="relative flex-1 px-3 pb-24 pt-3">
        <Outlet />
      </main>

      {/* Barra de abas */}
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-line/70 bg-night-0/92 backdrop-blur" style={{ paddingBottom: 'var(--sab)' }}>
        <ul className="flex">
          {tabs.map((t) => (
            <li key={t.to} className="flex-1">
              <NavLink to={t.to} end={t.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold uppercase tracking-wider transition ${isActive ? 'text-turf' : 'text-hazedim'}`}>
                {({ isActive }) => (<><t.icon className={`h-5 w-5 ${isActive ? 'drop-shadow-[0_0_8px_rgba(34,229,138,0.8)]' : ''}`} />{t.label}</>)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
