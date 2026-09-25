import { lazy, Suspense, useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './store/auth';
import { ToastHost } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MultiAccountScreen } from './components/MultiAccount';
import { MULTI_EVENT } from './lib/api';
import { InviteRoute } from './components/Invite';
import { LoginScreen } from './screens/Login';
import { RegisterScreen } from './screens/Register';
import { LandingScreen } from './screens/Landing';
import { PrivacyScreen, TermsScreen, DeleteAccountInfoScreen } from './screens/Legal';
import { EsqueciSenhaScreen } from './screens/EsqueciSenha'; import { RedefinirSenhaScreen } from './screens/RedefinirSenha';
import { installDragScroll } from './lib/dragScroll';
import { installTracking, trackScreen } from './lib/track';
import { installAds } from './lib/ads';
import { installClickSounds } from './lib/sound';

/**
 * Telas baixadas só quando alguém abre (25/09/2026, SEO e velocidade): a página de entrada baixava o jogo inteiro
 * (739 KB de JavaScript, 492 KB sem uso ali) e demorava 8,8 s para pintar no celular em 4G. Ficam no pacote inicial só
 * as telas de quem ainda não entrou (apresentação, entrar, cadastro, legais). Depois da 1ª visita o PWA guarda todos os
 * pedaços no aparelho, então trocar de tela continua instantâneo. Tela nova do jogo = `tela(...)` aqui.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tela<M extends Record<string, any>>(load: () => Promise<M>, name: keyof M) {
  return lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
}
const Layout = tela(() => import('./components/Layout'), 'Layout');
const LevelUpWatcher = tela(() => import('./components/LevelUp'), 'LevelUpWatcher');
const TutorialWatcher = tela(() => import('./components/Tutorial'), 'TutorialWatcher');
const PassWatcher = tela(() => import('./components/Pass'), 'PassWatcher');
const AdminDock = tela(() => import('./components/AdminDock'), 'AdminDock');
const HomeScreen = tela(() => import('./screens/Home'), 'HomeScreen');
const TrailScreen = tela(() => import('./screens/Trail'), 'TrailScreen');
const TermoScreen = tela(() => import('./screens/Termo'), 'TermoScreen');
const QuizScreen = tela(() => import('./screens/Quiz'), 'QuizScreen');
const PartyScreen = tela(() => import('./screens/Party'), 'PartyScreen');
const RankingsScreen = tela(() => import('./screens/Rankings'), 'RankingsScreen');
const LeagueScreen = tela(() => import('./screens/League'), 'LeagueScreen');
const TeamScreen = tela(() => import('./screens/Team'), 'TeamScreen');
const ProfileScreen = tela(() => import('./screens/Profile'), 'ProfileScreen');
const InboxScreen = tela(() => import('./screens/Inbox'), 'InboxScreen');
const PlayerScreen = tela(() => import('./screens/Player'), 'PlayerScreen');
const RulesScreen = tela(() => import('./screens/Rules'), 'RulesScreen');
const ShopScreen = tela(() => import('./screens/Shop'), 'ShopScreen');
const ActiveScreen = tela(() => import('./screens/Active'), 'ActiveScreen');
const LevelsScreen = tela(() => import('./screens/Levels'), 'LevelsScreen');
const ChatScreen = tela(() => import('./screens/Chat'), 'ChatScreen');
const MemoriaScreen = tela(() => import('./screens/Memoria'), 'MemoriaScreen');
const QualtimeScreen = tela(() => import('./screens/Qualtime'), 'QualtimeScreen');
const AlvoScreen = tela(() => import('./screens/Alvo'), 'AlvoScreen');
const CabecaoScreen = tela(() => import('./screens/Cabecao'), 'CabecaoScreen');
const StatsScreen = tela(() => import('./screens/Stats'), 'StatsScreen');
const CamisasScreen = tela(() => import('./screens/Camisas'), 'CamisasScreen');
const GanhaPerdeScreen = tela(() => import('./screens/GanhaPerde'), 'GanhaPerdeScreen');
const GoleadaScreen = tela(() => import('./screens/Goleada'), 'GoleadaScreen');
const X1Screen = tela(() => import('./screens/X1'), 'X1Screen');
const HattrickScreen = tela(() => import('./screens/Hattrick'), 'HattrickScreen');
const VipScreen = tela(() => import('./screens/Vip'), 'VipScreen');
const OffersScreen = tela(() => import('./screens/Offers'), 'OffersScreen');
const MatchScreen = tela(() => import('./screens/Match'), 'MatchScreen');
// páginas públicas para o Google (25/09/2026): a história do BRGOL e os times
const BrgolScreen = tela(() => import('./screens/Brgol'), 'BrgolScreen');
const TeamsIndexScreen = tela(() => import('./screens/PublicTeams'), 'TeamsIndexScreen');
const PublicTeamScreen = lazy(() => import('./screens/PublicTeams').then((m) => ({ default: m.PublicTeamScreen })));
// Cenas 3D (three.js ~260 KB gz) só carregam quando o jogador abre o pênalti/falta
const PenaltyScreen = lazy(() => import('./screens/Penalty').then((m) => ({ default: m.PenaltyScreen })));
const FoulScreen = lazy(() => import('./screens/Foul').then((m) => ({ default: m.FoulScreen })));
const FaltaProScreen = lazy(() => import('./screens/FaltaPro').then((m) => ({ default: m.FaltaProScreen })));
const FrangacoScreen = lazy(() => import('./screens/Frangaco').then((m) => ({ default: m.FrangacoScreen })));
const Debug3DScreen = lazy(() => import('./screens/Debug3D').then((m) => ({ default: m.Debug3DScreen })));
const DebugFaltaProScreen = lazy(() => import('./screens/DebugFaltaPro').then((m) => ({ default: m.DebugFaltaProScreen })));
const DebugX1KitsScreen = lazy(() => import('./screens/DebugX1Kits').then((m) => ({ default: m.DebugX1KitsScreen })));
const DebugFutgolfScreen = lazy(() => import('./screens/DebugFutgolf').then((m) => ({ default: m.DebugFutgolfScreen })));
// Painel de admin: só carrega para quem abre /admin (e o servidor exige isAdmin)
const AdminScreen = lazy(() => import('./screens/Admin').then((m) => ({ default: m.AdminScreen })));

function Splash() {
  return (
    <div className="app-frame flex min-h-full items-center justify-center">
      <div className="stadium-bg" />
      <div className="relative text-center">
        <img src="/brand/logo-v.webp" alt="JogaGol" className="mx-auto w-48 drop-shadow-[0_10px_18px_rgba(0,0,0,0.4)]" />
        <img src="/ui/ico-coin01_s.png" alt="" className="mx-auto mt-4 h-10 w-10 animate-spin" />
        <div className="t-display t-out mt-1 text-[12px] uppercase tracking-[0.3em]">carregando o estádio…</div>
      </div>
    </div>
  );
}

function Private({ children }: { children: React.ReactNode }) {
  const me = useAuth((s) => s.me);
  const loc = useLocation();
  if (!me) {
    // Quem não entrou vê a APRESENTAÇÃO no endereço principal (25/09/2026): antes ia para /entrar, e o Google via a página
    // inicial como uma tela de login (sem título, 102 palavras, nenhum "BRGOL"). O placar ao vivo da vitrine continua no
    // topo da apresentação. E a página de cada time é pública (as outras telas do jogo seguem pedindo login).
    if (loc.pathname === '/') return <LandingScreen />;
    const time = loc.pathname.match(/^\/time\/([a-z0-9-]+)\/?$/);
    if (time) return <PublicTeamScreen slug={time[1]} />;
    return <Navigate to="/entrar" replace state={{ from: loc.pathname }} />;
  }
  return <>{children}</>;
}

export default function App() {
  const boot = useAuth((s) => s.boot);
  const loading = useAuth((s) => s.loading);
  const me = useAuth((s) => s.me);
  const loc = useLocation();
  // 403 `multiconta` em qualquer pedido (3 contas jogando nesta internet): a tela inteira vira o aviso
  const [multi, setMulti] = useState<string | null>(null);
  useEffect(() => {
    const onMulti = (e: Event) => setMulti((e as CustomEvent<string>).detail || 'Contas demais nesta internet.');
    window.addEventListener(MULTI_EVENT, onMulti); // antes do boot: o /api/me dele já pode voltar barrado
    boot(); const a = installDragScroll(); const b = installClickSounds(); installTracking(); installAds(); // eventos de uso (lib/track.ts) · tag do Google Ads, só no site e sem login (lib/ads.ts)
    return () => { window.removeEventListener(MULTI_EVENT, onMulti); a(); b(); };
  }, []);
  // funil: cada tela aberta (lib/track.ts); sem login, o endereço principal é a apresentação ("landing"), não a home
  useEffect(() => { trackScreen(!me && loc.pathname === '/' ? '/bem-vindo' : loc.pathname); }, [loc.pathname, me]);
  if (multi) return <MultiAccountScreen message={multi} onRetry={async () => { setMulti(null); await boot(); }} />;
  if (loading) return <Splash />;
  return (
    <>
      <ToastHost />
      <Suspense fallback={null}>
        {me?.isAdmin && <AdminDock />}
        {me && <TutorialWatcher />}
        {me && <LevelUpWatcher />}
        {me && <PassWatcher />}
      </Suspense>
      <ErrorBoundary resetKey={loc.pathname}>
      <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/bem-vindo" element={me ? <Navigate to="/" replace /> : <LandingScreen />} />
        <Route path="/entrar" element={me ? <Navigate to="/" replace /> : <LoginScreen />} />
        <Route path="/cadastro" element={me ? <Navigate to="/" replace /> : <RegisterScreen />} />
        <Route path="/convite/:code" element={<InviteRoute logged={!!me} />} />
        {/* páginas públicas exigidas pela Play Store (sem login) */}
        <Route path="/privacidade" element={<PrivacyScreen />} />
        <Route path="/termos" element={<TermsScreen />} />
        <Route path="/excluir-conta" element={<DeleteAccountInfoScreen />} />
        <Route path="/brgol" element={<BrgolScreen />} />
        <Route path="/times" element={<TeamsIndexScreen />} />
        <Route element={<Private><Layout /></Private>}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/liga" element={<LeagueScreen />} />
          <Route path="/rankings" element={<RankingsScreen />} />
          <Route path="/time" element={<TeamScreen />} />
          <Route path="/time/:slug" element={<TeamScreen />} />
          <Route path="/perfil" element={<ProfileScreen />} />
          <Route path="/loja" element={<ShopScreen />} />
          <Route path="/vip" element={<VipScreen />} />
          <Route path="/propostas" element={<OffersScreen />} />
          <Route path="/partida/:id" element={<MatchScreen />} />
          <Route path="/niveis" element={<LevelsScreen />} />
          <Route path="/ativos" element={<ActiveScreen />} />
          <Route path="/jogador/:nick" element={<PlayerScreen />} />
          <Route path="/regras" element={<RulesScreen />} />
        </Route>
        <Route path="/penalti" element={<Private><Suspense fallback={<Splash />}><PenaltyScreen /></Suspense></Private>} />
        <Route path="/falta" element={<Private><Suspense fallback={<Splash />}><FoulScreen /></Suspense></Private>} />
        <Route path="/trilha" element={<Private><TrailScreen /></Private>} />
        <Route path="/termo" element={<Private><TermoScreen /></Private>} />
        <Route path="/memoria" element={<Private><MemoriaScreen /></Private>} />
        <Route path="/qualtime" element={<Private><QualtimeScreen /></Private>} />
        <Route path="/alvo" element={<Private><AlvoScreen /></Private>} />
        <Route path="/cabecao" element={<Private><CabecaoScreen /></Private>} />
        <Route path="/estatisticas" element={<Private><StatsScreen /></Private>} />
        <Route path="/camisas" element={<Private><CamisasScreen /></Private>} />
        <Route path="/ganha-ou-perde" element={<Private><GanhaPerdeScreen /></Private>} />
        {/* PenalCup (dono, 18/09/2026: era "Goleada"). O endereço antigo segue valendo: quem tinha o
            link salvo ou o app aberto não cai em tela em branco. */}
        <Route path="/penalcup" element={<Private><GoleadaScreen /></Private>} />
        <Route path="/goleada" element={<Private><GoleadaScreen /></Private>} />
        <Route path="/x1" element={<Private><X1Screen /></Private>} />
        <Route path="/futprego" element={<Private><X1Screen /></Private>} />{/* nome antigo (links e convites de antes do X1) */}
        <Route path="/hat-trick" element={<Private><HattrickScreen /></Private>} />
        <Route path="/falta-pro" element={<Private><Suspense fallback={<Splash />}><FaltaProScreen /></Suspense></Private>} />
        <Route path="/frangaco" element={<Private><Suspense fallback={<Splash />}><FrangacoScreen /></Suspense></Private>} />
        <Route path="/quiz" element={<Private><QuizScreen /></Private>} />
        <Route path="/debug3d" element={<Suspense fallback={<Splash />}><Debug3DScreen /></Suspense>} />
        <Route path="/debug-faltapro" element={<Suspense fallback={<Splash />}><DebugFaltaProScreen /></Suspense>} />
        <Route path="/debug-x1-kits" element={<Suspense fallback={<Splash />}><DebugX1KitsScreen /></Suspense>} />
        <Route path="/debug-futgolf" element={<Suspense fallback={<Splash />}><DebugFutgolfScreen /></Suspense>} />
        <Route path="/admin" element={<Private><Suspense fallback={<Splash />}><AdminScreen /></Suspense></Private>} />
        <Route path="/mensagens" element={<Private><InboxScreen /></Private>} />
        <Route path="/partygol" element={<Private><PartyScreen /></Private>} />
        <Route path="/chat" element={<Private><ChatScreen /></Private>} />
        <Route path="/esqueci-senha" element={me ? <Navigate to="/" replace /> : <EsqueciSenhaScreen />} /><Route path="/redefinir-senha" element={<RedefinirSenhaScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </>
  );
}
