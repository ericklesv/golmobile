import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { Shield } from './Shield';
import { money } from '../lib/format';
import { useEffect } from 'react';
import { api } from '../lib/api';

const tabs = [
  { to: '/', label: 'Jogar', icon: '/ui/pi-home.png', end: true },
  { to: '/liga', label: 'Liga', icon: '/ui/ico-trophy_s.png' },
  { to: '/rankings', label: 'Rankings', icon: '/ui/ico-ranking.png' },
  { to: '/time', label: 'Time', icon: '/ui/ico-clan.png' },
  { to: '/perfil', label: 'Perfil', icon: '/ui/ico-userthumbnail.png' },
];

export function Layout() {
  const me = useAuth((s) => s.me);
  const active = useAuth((s) => s.active);
  const nav = useNavigate();

  // Presença: heartbeat a cada 60 s enquanto a aba está aberta
  useEffect(() => {
    let alive = true;
    const beat = () => api.heartbeat().then((r) => alive && useAuth.setState({ online: r.online, active: r.active, offset: r.serverTime - Date.now() })).catch(() => {});
    beat();
    const iv = setInterval(beat, 60_000);
    const vis = () => { if (document.visibilityState === 'visible') { beat(); useAuth.getState().refresh(); } };
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; clearInterval(iv); document.removeEventListener('visibilitychange', vis); };
  }, []);

  if (!me) return null;
  const lvlPct = me.level.next ? ((me.goalsTotal - me.level.goals) / (me.level.next.goals - me.level.goals)) * 100 : 100;
  return (
    <div className="app-frame flex min-h-full flex-col">
      <div className="stadium-bg" />
      {/* HUD */}
      <header className="sticky top-0 z-40" style={{ paddingTop: 'var(--sat)' }}>
        <div className="flex items-center gap-2 bg-navy-deep/85 px-3 py-2 backdrop-blur">
          <button onClick={() => nav('/perfil')} className="flex min-w-0 items-center gap-2">
            <div className="relative">
              <img src="/ui/lvl-badge-blue.png" alt="" className="h-11 w-11" />
              <span className="t-display t-out absolute inset-0 flex items-center justify-center pb-1 text-lg">{me.level.lvl}</span>
            </div>
            <div className="min-w-0">
              <div className={`t-display truncate text-[15px] leading-tight ${me.vip ? 'text-sky-light' : 'text-white'}`}>{me.nick}{me.vip && <img src="/ui/ico-crown_silver.png" className="ico ml-1 h-4 w-4" alt="VIP" />}</div>
              <div className="bar mt-0.5 w-28" style={{ height: 14 }}>
                <i style={{ width: `calc(${Math.min(100, lvlPct)}% + 6px)` }} />
                <span style={{ fontSize: 9 }}>{me.goalsTotal}/{me.level.next?.goals ?? me.goalsTotal}</span>
              </div>
            </div>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <div className="resbar"><img src="/ui/ico-coin01_s.png" className="ico -ml-3 h-8 w-8" alt="" />{money(me.money)}</div>
            <Shield team={me.team} size={36} />
          </div>
        </div>
      </header>

      <main className="relative flex-1 px-3 pb-28 pt-3">
        <Outlet />
      </main>

      {/* Barra de abas */}
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] bg-navy-deep/90 px-1 pt-1 backdrop-blur" style={{ paddingBottom: 'calc(var(--sab) + 4px)' }}>
        <ul className="flex gap-1">
          {tabs.map((t) => (
            <li key={t.to} className="flex-1">
              <NavLink to={t.to} end={t.end} className={({ isActive }) => `menu-btn flex flex-col items-center justify-center gap-0.5 py-0.5 transition ${isActive ? '' : 'opacity-80'}`}>
                {({ isActive }) => (<>
                  <img src={t.icon} alt="" className={`h-8 w-8 object-contain ${isActive ? 'animate-bob' : ''}`} />
                  <span className={`t-display text-[10px] uppercase tracking-wide ${isActive ? 'text-orange-deep' : 'text-navy-ink'}`}>{t.label}</span>
                </>)}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-0.5 text-center text-[9px] font-extrabold uppercase tracking-widest text-white/50">{active} {active === 1 ? 'jogador ativo' : 'jogadores ativos'} nas últimas 24h</div>
      </nav>
    </div>
  );
}
