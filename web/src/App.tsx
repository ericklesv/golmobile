import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './store/auth';
import { ToastHost } from './components/Toast';
import { Layout } from './components/Layout';
import { LoginScreen } from './screens/Login';
import { RegisterScreen } from './screens/Register';
import { HomeScreen } from './screens/Home';
import { TrailScreen } from './screens/Trail';
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

function Splash() {
  return (
    <div className="app-frame flex min-h-full items-center justify-center">
      <div className="stadium-bg" />
      <div className="relative text-center">
        <img src="/ui/ico-coin01_s.png" alt="" className="mx-auto h-12 w-12 animate-spin" />
        <div className="t-display t-out mt-2 text-6xl tracking-wide">BRGOL</div>
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
  useEffect(() => { boot(); }, []);
  if (loading) return <Splash />;
  return (
    <>
      <ToastHost />
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
          <Route path="/jogador/:nick" element={<PlayerScreen />} />
          <Route path="/regras" element={<RulesScreen />} />
        </Route>
        <Route path="/penalti" element={<Private><Suspense fallback={<Splash />}><PenaltyScreen /></Suspense></Private>} />
        <Route path="/falta" element={<Private><Suspense fallback={<Splash />}><FoulScreen /></Suspense></Private>} />
        <Route path="/trilha" element={<Private><TrailScreen /></Private>} />
        <Route path="/debug3d" element={<Suspense fallback={<Splash />}><Debug3DScreen /></Suspense>} />
        <Route path="/partygol" element={<Private><PartyScreen /></Private>} />
        <Route path="*" element={<Navigate to={me ? '/' : '/bem-vindo'} replace />} />
      </Routes>
    </>
  );
}
