import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { toast } from '../components/Toast';

/** /esqueci-senha — pede o e-mail e dispara o link de redefinição (a API sempre responde 200). */
export function EsqueciSenhaScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await api.forgotPassword(email.trim()); setSent(true); }
    catch (err: any) { toast(err?.message ?? 'Falha ao enviar.', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="app-frame flex min-h-full flex-col px-5" style={{ paddingTop: 'calc(var(--sat) + 40px)' }}>
      <div className="stadium-bg" />
      <div className="relative text-center">
        <img src="/brand/logo-v.webp" alt="JogaGol" className="mx-auto w-52 drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]" />
      </div>
      {sent ? (
        <div className="panel relative mt-8 flex flex-col items-center gap-3 pt-8 text-center">
          <div className="absolute -top-7 left-1/2 -translate-x-1/2"><div className="ribbon ribbon-green text-[18px]">E-MAIL ENVIADO</div></div>
          <img src="/ui/check-green.png" className="h-14 w-14" alt="" />
          <p className="text-sm font-bold text-navy-ink">Se <b>{email.trim()}</b> estiver cadastrado, você vai receber um link para redefinir a senha. Ele vale por 1 hora.</p>
          <p className="text-xs font-bold text-muted">Não chegou? Confira o spam ou tente de novo em alguns minutos.</p>
          <Link to="/entrar" className="btn btn-blue btn-md mt-1 w-full">Voltar para entrar</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="panel relative mt-8 flex flex-col gap-3 pt-8">
          <div className="absolute -top-7 left-1/2 -translate-x-1/2"><div className="ribbon ribbon-orange text-[18px]">ESQUECI A SENHA</div></div>
          <p className="text-center text-sm font-bold text-muted">Digite o e-mail da sua conta e a gente manda um link para criar uma senha nova.</p>
          <label className="flex flex-col gap-1">
            <span className="label">E-mail</span>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" required />
          </label>
          <button className="btn btn-green btn-lg mt-2 w-full" disabled={busy}>{busy ? 'Enviando…' : 'Enviar link'}</button>
          <p className="text-center text-sm font-bold text-muted">Lembrou? <Link to="/entrar" className="text-orange-deep">Entrar</Link></p>
        </form>
      )}
    </div>
  );
}
