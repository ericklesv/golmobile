import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './store/auth';
import { ToastHost } from './components/Toast';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginScreen } from './screens/Login';
import { RegisterScreen } from './screens/Register';
import { HomeScreen } from './screens/Home';
import { TrailScreen } from './screens/Trail';
import { TermoScreen } from './screens/Termo';
import { QuizScreen } from './screens/Quiz';
// Cenas 3D (three.js ~260 KB gz) só carregam quando o jogador abre o pênalti/falta
const PenaltyScreen = lazy(() => import('./screens/Penalty').then((m) => ({ default: m.PenaltyScreen })));
const FoulScreen = lazy(() => import('./screens/Foul').then((m) => ({ default: m.FoulScreen })));
const Debug3DScreen = lazy(() => import('./screens/Debug3D').then((m) => ({ default: m.Debug3DScreen })));
import { PartyScreen } from './screens/Party';
import { RankingsScreen } from './screens/Rankings';
import { LeagueScreen } from './screens/League';
import { TeamScreen } from './screens/Team';
import { ProfileScreen } from './screens/Profile';
import { PlayerScreen } from './screens/Player';
import { RulesScreen } from './screens/Rules';
import { LandingScreen } from './screens/Landing';
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
  useEffect(() => { boot(); const a = installDragScroll(); const b = installClickSounds(); return () => { a(); b(); }; }, []);
  if (loading) return <Splash />;
  return (
    <>
      <ToastHost />
      <ErrorBoundary resetKey={loc.pathname}>
      <Routes>
        <Route path="/bem-vindo" element={me ? <Navigate to="/" replace /> : <LandingScreen />} />
        <Route path="/entrar" element={me ? <Navigate to="/" replace /> : <LoginScreen />} />
        <Route path="/cadastro" element={me ? <Navigate to="/" replace /> : <RegisterScreen />} />
        <Route element={<Private><Layout /></Private>}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/liga" element={<LeagueScreen />} />
          <Route path="/rankings" element={<RankingsScreen />} />
          <Route path="/time" element={<TeamScreen />} />
          <Route path="/time/:slug" element={<TeamScreen />} />
          <Route path="/perfil" element={<ProfileScreen />} />
          <Route path="/loja" element={<ShopScreen />} />
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
        <Route path="/quiz" element={<Private><QuizScreen /></Private>} />
        <Route path="/debug3d" element={<Suspense fallback={<Splash />}><Debug3DScreen /></Suspense>} />
        <Route path="/partygol" element={<Private><PartyScreen /></Private>} />
        <Route path="/chat" element={<Private><ChatScreen /></Private>} />
        <Route path="/esqueci-senha" element={me ? <Navigate to="/" replace /> : <EsqueciSenhaScreen />} /><Route path="/redefinir-senha" element={<RedefinirSenhaScreen />} />
        <Route path="*" element={<Navigate to={me ? '/' : '/bem-vindo'} replace />} />
      </Routes>
      </ErrorBoundary>
    </>
  );
}
