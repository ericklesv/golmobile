import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { toast } from '../components/Toast';

/** /redefinir-senha?token=… — cria a senha nova a partir do link do e-mail. */
export function RedefinirSenhaScreen() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const nav = useNavigate();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (p1 !== p2) { toast('As senhas não conferem.', 'error'); return; }
    setBusy(true);
    try {
      const r = await api.resetPassword(token, p1);
      toast(r.message || 'Senha redefinida!', 'success');
      nav('/entrar', { replace: true });
    } catch (err: any) { toast(err?.message ?? 'Falha ao redefinir.', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="app-frame flex min-h-full flex-col px-5" style={{ paddingTop: 'calc(var(--sat) + 40px)' }}>
      <div className="stadium-bg" />
      <div className="relative text-center">
        <img src="/brand/logo-v.webp" alt="JogaGol" className="mx-auto w-52 drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]" />
      </div>
      {!token ? (
        <div className="panel relative mt-8 flex flex-col items-center gap-3 pt-8 text-center">
          <div className="absolute -top-7 left-1/2 -translate-x-1/2"><div className="ribbon ribbon-orange text-[18px]">LINK INVÁLIDO</div></div>
          <p className="text-sm font-bold text-navy-ink">Esse link está incompleto. Peça um novo na tela "Esqueci a senha".</p>
          <Link to="/esqueci-senha" className="btn btn-blue btn-md w-full">Pedir novo link</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="panel relative mt-8 flex flex-col gap-3 pt-8">
          <div className="absolute -top-7 left-1/2 -translate-x-1/2"><div className="ribbon ribbon-blue text-[18px]">NOVA SENHA</div></div>
          <label className="flex flex-col gap-1">
            <span className="label">Senha nova (mín. 6)</span>
            <input className="field" type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" minLength={6} required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">Repita a senha</span>
            <input className="field" type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" minLength={6} required />
          </label>
          <button className="btn btn-green btn-lg mt-2 w-full" disabled={busy}>{busy ? 'Salvando…' : 'Salvar senha nova'}</button>
          <p className="text-center text-sm font-bold text-muted">O link venceu? <Link to="/esqueci-senha" className="text-orange-deep">Pedir outro</Link></p>
        </form>
      )}
    </div>
  );
}
