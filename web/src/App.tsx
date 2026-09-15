import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './store/auth';
import { ToastHost } from './components/Toast';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MultiAccountScreen } from './components/MultiAccount';
import { MULTI_EVENT } from './lib/api';
import { LevelUpWatcher } from './components/LevelUp';
import { PassWatcher } from './components/Pass';
import { InviteRoute } from './components/Invite';
import { LoginScreen } from './screens/Login';
import { RegisterScreen } from './screens/Register';
import { HomeScreen } from './screens/Home';
import { TrailScreen } from './screens/Trail';
import { TermoScreen } from './screens/Termo';
import { QuizScreen } from './screens/Quiz';
// Cenas 3D (three.js ~260 KB gz) só carregam quando o jogador abre o pênalti/falta
const PenaltyScreen = lazy(() => import('./screens/Penalty').then((m) => ({ default: m.PenaltyScreen })));
const FoulScreen = lazy(() => import('./screens/Foul').then((m) => ({ default: m.FoulScreen })));
const FaltaProScreen = lazy(() => import('./screens/FaltaPro').then((m) => ({ default: m.FaltaProScreen })));
const FrangacoScreen = lazy(() => import('./screens/Frangaco').then((m) => ({ default: m.FrangacoScreen })));
const Debug3DScreen = lazy(() => import('./screens/Debug3D').then((m) => ({ default: m.Debug3DScreen })));
const DebugFaltaProScreen = lazy(() => import('./screens/DebugFaltaPro').then((m) => ({ default: m.DebugFaltaProScreen })));
const DebugX1KitsScreen = lazy(() => import('./screens/DebugX1Kits').then((m) => ({ default: m.DebugX1KitsScreen })));
// Painel de admin: só carrega para quem abre /admin (e o servidor exige isAdmin)
const AdminScreen = lazy(() => import('./screens/Admin').then((m) => ({ default: m.AdminScreen })));
import { PartyScreen } from './screens/Party';
import { RankingsScreen } from './screens/Rankings';
import { LeagueScreen } from './screens/League';
import { TeamScreen } from './screens/Team';
import { ProfileScreen } from './screens/Profile';
import { InboxScreen } from './screens/Inbox';
import { PlayerScreen } from './screens/Player';
import { RulesScreen } from './screens/Rules';
import { LandingScreen } from './screens/Landing';
import { PrivacyScreen, TermsScreen, DeleteAccountInfoScreen } from './screens/Legal';
import { ShopScreen } from './screens/Shop';
import { ActiveScreen } from './screens/Active';
import { installDragScroll } from './lib/dragScroll';
import { installClickSounds } from './lib/sound';
import { LevelsScreen } from './screens/Levels';
import { ChatScreen } from './screens/Chat';
import { MemoriaScreen } from './screens/Memoria';
import { QualtimeScreen } from './screens/Qualtime';
import { AlvoScreen } from './screens/Alvo';
import { CabecaoScreen } from './screens/Cabecao';
import { EsqueciSenhaScreen } from './screens/EsqueciSenha'; import { RedefinirSenhaScreen } from './screens/RedefinirSenha';
import { StatsScreen } from './screens/Stats';
import { CamisasScreen } from './screens/Camisas';
import { GanhaPerdeScreen } from './screens/GanhaPerde';
import { X1Screen } from './screens/X1';
import { HattrickScreen } from './screens/Hattrick';
import { VipScreen } from './screens/Vip';
import { OffersScreen } from './screens/Offers';
import { MatchScreen } from './screens/Match';

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
  if (!me) return <Navigate to="/entrar" replace state={{ from: loc.pathname }} />;
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
    boot(); const a = installDragScroll(); const b = installClickSounds();
    return () => { window.removeEventListener(MULTI_EVENT, onMulti); a(); b(); };
  }, []);
  if (multi) return <MultiAccountScreen message={multi} onRetry={async () => { setMulti(null); await boot(); }} />;
  if (loading) return <Splash />;
  return (
    <>
      <ToastHost />
      {me && <LevelUpWatcher />}
      {me && <PassWatcher />}
      <ErrorBoundary resetKey={loc.pathname}>
      <Routes>
        <Route path="/bem-vindo" element={me ? <Navigate to="/" replace /> : <LandingScreen />} />
        <Route path="/entrar" element={me ? <Navigate to="/" replace /> : <LoginScreen />} />
        <Route path="/cadastro" element={me ? <Navigate to="/" replace /> : <RegisterScreen />} />
        <Route path="/convite/:code" element={<InviteRoute logged={!!me} />} />
        {/* páginas públicas exigidas pela Play Store (sem login) */}
        <Route path="/privacidade" element={<PrivacyScreen />} />
        <Route path="/termos" element={<TermsScreen />} />
        <Route path="/excluir-conta" element={<DeleteAccountInfoScreen />} />
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
        <Route path="/x1" element={<Private><X1Screen /></Private>} />
        <Route path="/futprego" element={<Private><X1Screen /></Private>} />{/* nome antigo (links e convites de antes do X1) */}
        <Route path="/hat-trick" element={<Private><HattrickScreen /></Private>} />
        <Route path="/falta-pro" element={<Private><Suspense fallback={<Splash />}><FaltaProScreen /></Suspense></Private>} />
        <Route path="/frangaco" element={<Private><Suspense fallback={<Splash />}><FrangacoScreen /></Suspense></Private>} />
        <Route path="/quiz" element={<Private><QuizScreen /></Private>} />
        <Route path="/debug3d" element={<Suspense fallback={<Splash />}><Debug3DScreen /></Suspense>} />
        <Route path="/debug-faltapro" element={<Suspense fallback={<Splash />}><DebugFaltaProScreen /></Suspense>} />
        <Route path="/debug-x1-kits" element={<Suspense fallback={<Splash />}><DebugX1KitsScreen /></Suspense>} />
        <Route path="/admin" element={<Private><Suspense fallback={<Splash />}><AdminScreen /></Suspense></Private>} />
        <Route path="/mensagens" element={<Private><InboxScreen /></Private>} />
        <Route path="/partygol" element={<Private><PartyScreen /></Private>} />
        <Route path="/chat" element={<Private><ChatScreen /></Private>} />
        <Route path="/esqueci-senha" element={me ? <Navigate to="/" replace /> : <EsqueciSenhaScreen />} /><Route path="/redefinir-senha" element={<RedefinirSenhaScreen />} />
        <Route path="*" element={<Navigate to={me ? '/' : '/bem-vindo'} replace />} />
      </Routes>
      </ErrorBoundary>
    </>
  );
}
