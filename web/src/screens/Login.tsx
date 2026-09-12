import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { toast } from '../components/Toast';
import { Spinner } from '../components/ui';

export function LoginScreen() {
  const login = useAuth((s) => s.login);
  const nav = useNavigate();
  const [l, setL] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await login(l.trim(), p);
      nav('/', { replace: true });
    } catch (err: any) {
      toast(err?.message ?? 'Falha ao entrar.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-frame flex min-h-full flex-col px-6" style={{ paddingTop: 'calc(var(--sat) + 64px)' }}>
      <div className="stadium-bg" />
      <div className="relative text-center">
        <h1 className="font-poster text-5xl tracking-wide text-turf">BRGOL</h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-haze">entre no estádio</p>
      </div>
      <form onSubmit={submit} className="relative mt-10 flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="label">Nick ou e-mail</span>
          <input className="field" value={l} onChange={(e) => setL(e.target.value)} autoComplete="username" autoCapitalize="none" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Senha</span>
          <input className="field" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="btn-turf mt-2 w-full py-4 text-lg" disabled={busy}>{busy ? <Spinner /> : 'Entrar'}</button>
      </form>
      <p className="relative mt-6 text-center text-sm text-haze">
        Novo por aqui? <Link to="/cadastro" className="font-bold text-turf">Crie seu jogador</Link>
      </p>
    </div>
  );
}
