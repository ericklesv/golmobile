import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { toast } from '../components/Toast';

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
    try { await login(l.trim(), p); nav('/', { replace: true }); }
    catch (err: any) { toast(err?.message ?? 'Falha ao entrar.', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="app-frame flex min-h-full flex-col px-5" style={{ paddingTop: 'calc(var(--sat) + 40px)' }}>
      <div className="stadium-bg" />
      <div className="relative text-center">
        <img src="/brand/logo-v.webp" alt="JogaGol" className="mx-auto w-52 drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]" />
      </div>
      <form onSubmit={submit} className="panel relative mt-8 flex flex-col gap-3 pt-8">
        <div className="absolute -top-7 left-1/2 -translate-x-1/2"><div className="ribbon ribbon-blue text-[18px]">ENTRAR</div></div>
        <label className="flex flex-col gap-1">
          <span className="label">Nick ou e-mail</span>
          <input className="field" value={l} onChange={(e) => setL(e.target.value)} autoComplete="username" autoCapitalize="none" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Senha</span>
          <input className="field" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="btn btn-green btn-lg mt-2 w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <p className="text-center text-sm font-bold text-muted">Novo por aqui? <Link to="/cadastro" className="text-orange-deep">Crie seu jogador</Link></p>
      </form>
    </div>
  );
}
