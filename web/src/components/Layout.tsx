import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { useAuth } from '../store/auth';
import { Shield } from './Shield';
import { Avatar } from './Avatar';
import { money } from '../lib/format';
import { useEffect, useRef } from 'react';
import { toast } from './Toast';
import { api } from '../lib/api';
import { SeriesNoticeWatcher } from './SeriesNotice';
import { ChatFab } from './ChatFab';
import { WhatsInviteWatcher } from './WhatsInvite';
import { nickProps } from '../lib/nick';
import { VipBar } from './VipBar';
import { FutPregoInviteWatcher } from './FutPregoInvite';

const tabs = [
  { to: '/', label: 'Jogar', icon: '/ui/pi-home.png', end: true },
  { to: '/liga', label: 'Liga', icon: '/ui/ico-trophy_s.png' },
  { to: '/rankings', label: 'Rankings', icon: '/ui/ico-ranking.png' },
  { to: '/loja', label: 'Loja', icon: '/ui/ico-goldpouch.png' },
  { to: '/time', label: 'Time', icon: '/ui/ico-clan.png' },
  { to: '/perfil', label: 'Perfil', icon: 'avatar' },
];

export function Layout() {
  const me = useAuth((s) => s.me);
  const active = useAuth((s) => s.active);
  const offers = useAuth((s) => s.offers);
  const lastOffers = useRef(0);
  const nav = useNavigate();
  const loc = useLocation();

  // Presença: heartbeat a cada 60 s enquanto a aba está aberta
  useEffect(() => {
    let alive = true;
    const beat = () => api.heartbeat().then((r) => {
      if (!alive) return;
      // proposta de contratação nova: avisa uma vez (o selo na aba Time fica até responder)
      if ((r.offers ?? 0) > lastOffers.current) toast(r.offers === 1 ? 'Você recebeu uma proposta de contratação!' : `Você tem ${r.offers} propostas de contratação!`, 'success');
      lastOffers.current = r.offers ?? 0;
      useAuth.setState({ online: r.online, active: r.active, offers: r.offers ?? 0, offset: r.serverTime - Date.now() });
    }).catch(() => {});
    beat();
    const iv = setInterval(beat, 60_000);
    const vis = () => { if (document.visibilityState === 'visible') { beat(); useAuth.getState().refresh(); } };
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; clearInterval(iv); document.removeEventListener('visibilitychange', vis); };
  }, []);

  if (!me) return null;
  const lvlPct = me.level.next ? ((me.levelPoints - me.level.goals) / (me.level.next.goals - me.level.goals)) * 100 : 100;
  return (
    <div className="app-frame flex min-h-full flex-col">
      <div className="stadium-bg" />
      {/* HUD: foto · nick/xp · nível  |  dinheiro · VIP · escudo */}
      <header className="sticky top-0 z-40" style={{ paddingTop: 'var(--sat)' }}>
        <div className="flex items-center gap-2 bg-navy-deep/85 px-3 py-2 backdrop-blur">
          {/* Em telas estreitas (< 480 px) o bloco nick/xp ocupa o espaço que sobra e a logo some — a barra de xp
              tinha largura fixa e, com o nick encolhendo (min-w-0), estourava por cima do nível e da logo. */}
          <button onClick={() => nav('/perfil')} className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left min-[480px]:flex-none" aria-label="Meu perfil">
            <Avatar url={me.avatarUrl} size={44} />
            <div className="min-w-[52px] flex-1 overflow-hidden min-[480px]:flex-none">
              <div className={`t-display truncate text-[15px] leading-tight ${nickProps(me, { plain: 'text-white', vipClass: 'text-sky-light', dark: true }).className}`} style={nickProps(me, { dark: true }).style}>{me.nick}{me.vip && <img src="/ui/ico-crown_silver.png" className="ico ml-1 h-4 w-4" alt="VIP" />}</div>
              <div className="bar mt-0.5 w-full max-w-[96px]" style={{ height: 14 }}>
                <i style={{ width: `calc(${Math.min(100, lvlPct)}% + 6px)` }} />
                <span style={{ fontSize: 9 }}>{me.levelPoints}/{me.level.next?.goals ?? me.levelPoints}</span>
              </div>
            </div>
          </button>
          <button onClick={() => nav('/niveis')} className="relative shrink-0" aria-label="Níveis">
            <img src="/ui/lvl-badge-blue.png" alt="" className="h-10 w-10" />
            <span className="t-display t-out absolute inset-0 flex items-center justify-center pb-1 text-base">{me.level.lvl}</span>
          </button>
          {/* logo só em tela larga: no celular ele espremia o nick e a barra de nível */}
          <button onClick={() => nav('/')} className="mx-auto hidden min-[480px]:block shrink-0" aria-label="Início"><img src="/brand/logo-h.webp" alt="JogaGol" className="h-9 drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]" /></button>
          <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
            <button onClick={() => nav('/loja')} className="resbar text-[14px]" aria-label="Dinheiro"><img src="/ui/ico-coin01_s.png" className="ico -ml-3 h-7 w-7" alt="" />{money(me.money)}</button>
            <VipBar onClick={() => nav('/vip')} className="text-[14px]" />
          </div>
          <button onClick={() => nav(`/time/${me.team.slug}`)} className="shrink-0" aria-label={me.team.name}><Shield team={me.team} size={34} /></button>
        </div>
      </header>

      <main className="relative flex-1 px-3 pb-28 pt-3">
        <ErrorBoundary resetKey={loc.pathname}><Outlet /></ErrorBoundary>
      </main>
      <SeriesNoticeWatcher />
      <ChatFab />
      <WhatsInviteWatcher />
      <FutPregoInviteWatcher />

      {/* Barra de abas */}
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] bg-navy-deep/90 px-1 pt-1 backdrop-blur" style={{ paddingBottom: 'calc(var(--sab) + 4px)' }}>
        <ul className="flex gap-1">
          {tabs.map((t) => (
            <li key={t.to} className="min-w-0 flex-1">
              <NavLink to={t.to} end={t.end} className={({ isActive }) => `menu-btn flex flex-col items-center justify-center gap-0.5 py-0.5 transition ${isActive ? '' : 'opacity-80'}`}>
                {({ isActive }) => (<>
                  <span className="relative">
                    {t.icon === 'avatar' ? <Avatar url={me.avatarUrl} size={28} className={isActive ? 'animate-bob' : ''} /> : <img src={t.icon} alt="" className={`h-7 w-7 object-contain ${isActive ? 'animate-bob' : ''}`} />}
                    {t.to === '/time' && offers > 0 && <span className="absolute -right-2 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-orange-deep px-1 font-display text-[10px] leading-none text-white" aria-label={`${offers} propostas`}>{offers}</span>}
                  </span>
                  <span className={`t-display text-[9px] uppercase tracking-wide ${isActive ? 'text-orange-deep' : 'text-navy-ink'}`}>{t.label}</span>
                </>)}
              </NavLink>
            </li>
          ))}
        </ul>
        <button onClick={() => nav('/ativos')} className="mt-0.5 w-full text-center text-[9px] font-extrabold uppercase tracking-widest text-white/60 underline-offset-2 hover:underline">
          {active} {active === 1 ? 'jogador ativo' : 'jogadores ativos'} nas últimas 24h
        </button>
      </nav>
    </div>
  );
}
