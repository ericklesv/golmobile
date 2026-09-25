import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { toast } from '../components/Toast';
import { Shield } from '../components/Shield';
import { Tabs } from '../components/ui';
import type { Serie } from '../lib/types';
import { InviteBanner, savedInvite, clearInvite } from '../components/Invite';
import { Turnstile } from '../components/Turnstile';
import { useSeo } from '../lib/seo';

export function RegisterScreen() {
  useSeo('Criar conta — escolha seu time', 'Crie sua conta grátis no JogaGol, escolha um clube brasileiro e comece a marcar gols na disputa de gols online.', '/cadastro');
  const register = useAuth((s) => s.register);
  const meta = useAuth((s) => s.meta);
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [serie, setSerie] = useState<Serie>('A');
  const [teamSlug, setTeam] = useState('');
  const [nick, setNick] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [busy, setBusy] = useState(false);
  // anti-robô (api/src/lib/security.js): tempo que o formulário ficou aberto (medido aqui, no relógio do
  // aparelho — o servidor não compara com o relógio dele) e token do Turnstile. O honeypot `website` foi
  // removido em 16/09/2026: o autofill do Android no WebView do Instagram preenchia e barrava jogador real.
  const [startedAt] = useState(() => Date.now());
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const onToken = useCallback((t: string | null) => setTurnstileToken(t), []);

  // veio da página pública de um time ("Jogar pelo Flamengo", screens/PublicTeams.tsx; 25/09/2026): o time já vem marcado
  const [params] = useSearchParams();
  useEffect(() => {
    const pre = params.get('time');
    const t = pre ? meta?.teams.find((x) => x.slug === pre) : undefined;
    if (t && !teamSlug) { setSerie(t.serie); setTeam(t.slug); }
  }, [meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const teams = useMemo(() => (meta?.teams ?? []).filter((t) => t.serie === serie), [meta, serie]);
  const chosen = meta?.teams.find((t) => t.slug === teamSlug);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!teamSlug) { toast('Escolha seu time.', 'error'); setStep(1); return; }
    setBusy(true);
    try { await register({ nick: nick.trim(), email: email.trim(), password, teamSlug, gender, ref: savedInvite() ?? undefined, elapsedMs: Math.max(0, Date.now() - startedAt), turnstileToken: turnstileToken ?? undefined }); clearInvite(); nav('/', { replace: true }); }
    catch (err: any) { toast(err?.message ?? 'Falha no cadastro.', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="app-frame flex min-h-full flex-col px-4 pb-8" style={{ paddingTop: 'calc(var(--sat) + 16px)' }}>
      <div className="stadium-bg" />
      <div className="relative flex items-center justify-between">
        <Link to="/" className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></Link>
        <img src="/brand/logo-h.webp" alt="JogaGol" className="h-12 drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)]" />
        <span className="trap trap-blue">{step}/2</span>
      </div>

      <div className="relative mt-4"><InviteBanner /></div>

      {step === 1 ? (
        <div className="relative mt-5">
          <div className="mb-3 flex justify-center"><div className="ribbon ribbon-orange">ESCOLHA SEU TIME</div></div>
          <div className="panel">
            <Tabs value={serie} onChange={setSerie} items={[{ id: 'A', label: 'Série A' }, { id: 'B', label: 'Série B' }, { id: 'C', label: 'Série C' }]} />
            <div className="mt-3 grid grid-cols-4 gap-2">
              {teams.map((t) => (
                <motion.button key={t.slug} whileTap={{ scale: 0.92 }} onClick={() => setTeam(t.slug)}
                  className={`flex flex-col items-center gap-1 rounded-xl p-1.5 transition ${teamSlug === t.slug ? 'bg-gold/40 ring-4 ring-gold' : 'bg-sky/10'}`}>
                  <Shield team={t} size={46} />
                  <span className="w-full truncate text-center text-[10px] font-extrabold text-navy-ink">{t.name}</span>
                </motion.button>
              ))}
            </div>
          </div>
          <button className="btn btn-green btn-lg mt-4 w-full" disabled={!teamSlug} onClick={() => setStep(2)}>
            {chosen ? `Jogar pelo ${chosen.name}` : 'Escolha um time'}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="relative mt-5 flex flex-col gap-3">
          <div className="mb-1 flex justify-center"><div className="ribbon ribbon-green">CRIE SEU JOGADOR</div></div>
          <div className="panel flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-xl bg-sky/10 p-2">
              <Shield team={chosen} size={48} />
              <div className="flex-1"><div className="label">Seu time</div><div className="t-display text-lg text-navy-ink">{chosen?.name}</div></div>
              <button type="button" className="btn btn-sky btn-sm" onClick={() => setStep(1)}>trocar</button>
            </div>
            <label className="flex flex-col gap-1"><span className="label">Nick (3–14 caracteres)</span><input className="field" value={nick} onChange={(e) => setNick(e.target.value)} autoCapitalize="none" maxLength={14} required /></label>
            <label className="flex flex-col gap-1"><span className="label">E-mail</span><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" required /></label>
            <label className="flex flex-col gap-1"><span className="label">Senha (mín. 6)</span><input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></label>
            <div className="flex gap-2">
              {(['M', 'F'] as const).map((g) => (
                <button type="button" key={g} onClick={() => setGender(g)} className={`btn btn-md flex-1 ${gender === g ? 'btn-blue' : 'btn-gray'}`}>{g === 'M' ? 'Jogador' : 'Jogadora'}</button>
              ))}
            </div>
            <Turnstile onToken={onToken} />
          </div>
          <button className="btn btn-orange btn-lg w-full" disabled={busy}>{busy ? 'Criando…' : 'Criar jogador'}</button>
          <p className="-mt-1 text-center text-[11px] font-bold text-white/85">Ao criar o jogador você concorda com os <Link to="/termos" className="t-gold t-display">Termos de uso</Link> e a <Link to="/privacidade" className="t-gold t-display">Política de privacidade</Link>. Para maiores de 13 anos.</p>
          <p className="text-center text-sm font-bold text-white/90">Já tem conta? <Link to="/entrar" className="t-gold t-display">Entrar</Link></p>
        </form>
      )}
    </div>
  );
}
