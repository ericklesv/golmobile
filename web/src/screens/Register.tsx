import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { toast } from '../components/Toast';
import { Shield } from '../components/Shield';
import { Spinner, Tabs } from '../components/ui';
import type { Serie } from '../lib/types';

export function RegisterScreen() {
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

  const teams = useMemo(() => (meta?.teams ?? []).filter((t) => t.serie === serie), [meta, serie]);
  const chosen = meta?.teams.find((t) => t.slug === teamSlug);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!teamSlug) { toast('Escolha seu time.', 'error'); setStep(1); return; }
    setBusy(true);
    try {
      await register({ nick: nick.trim(), email: email.trim(), password, teamSlug, gender });
      nav('/', { replace: true });
    } catch (err: any) {
      toast(err?.message ?? 'Falha no cadastro.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-frame flex min-h-full flex-col px-5 pb-8" style={{ paddingTop: 'calc(var(--sat) + 24px)' }}>
      <div className="stadium-bg" />
      <div className="relative flex items-center justify-between">
        <Link to="/bem-vindo" className="text-sm text-haze">‹ voltar</Link>
        <div className="font-poster text-2xl tracking-wide text-turf">BRGOL</div>
        <span className="w-12 text-right text-xs text-hazedim">{step}/2</span>
      </div>

      {step === 1 ? (
        <div className="relative mt-6">
          <h1 className="font-poster text-3xl uppercase text-chalk">Escolha seu time</h1>
          <p className="mb-4 text-sm text-haze">Cada gol seu vai para o placar do clube. Escolha com o coração.</p>
          <Tabs value={serie} onChange={setSerie} items={[{ id: 'A', label: 'Série A' }, { id: 'B', label: 'Série B' }, { id: 'C', label: 'Série C' }]} />
          <div className="mt-4 grid grid-cols-4 gap-2">
            {teams.map((t) => (
              <motion.button key={t.slug} whileTap={{ scale: 0.92 }} onClick={() => setTeam(t.slug)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-2 transition ${teamSlug === t.slug ? 'border-turf bg-turf/15 shadow-glow' : 'border-line bg-night-2/60'}`}>
                <Shield team={t} size={44} />
                <span className="w-full truncate text-center text-[10px] font-semibold text-chalk">{t.name}</span>
              </motion.button>
            ))}
          </div>
          <button className="btn-turf mt-6 w-full py-4 text-lg" disabled={!teamSlug} onClick={() => setStep(2)}>
            {chosen ? `Jogar pelo ${chosen.name}` : 'Escolha um time'}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="relative mt-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-night-2/60 p-3">
            <Shield team={chosen} size={44} />
            <div className="flex-1">
              <div className="label">Seu time</div>
              <div className="font-bold text-chalk">{chosen?.name}</div>
            </div>
            <button type="button" className="text-xs font-bold text-turf" onClick={() => setStep(1)}>trocar</button>
          </div>
          <label className="flex flex-col gap-1">
            <span className="label">Nick (3–14, letras/números/_ . -)</span>
            <input className="field" value={nick} onChange={(e) => setNick(e.target.value)} autoCapitalize="none" maxLength={14} required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">E-mail</span>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">Senha (mín. 6)</span>
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
          </label>
          <div className="flex gap-2">
            {(['M', 'F'] as const).map((g) => (
              <button type="button" key={g} onClick={() => setGender(g)} className={`btn flex-1 py-3 ${gender === g ? 'bg-turf text-night-0' : 'bg-night-2 text-haze border border-line'}`}>
                {g === 'M' ? 'Jogador' : 'Jogadora'}
              </button>
            ))}
          </div>
          <button className="btn-turf mt-2 w-full py-4 text-lg" disabled={busy}>{busy ? <Spinner /> : 'Criar jogador'}</button>
          <p className="text-center text-sm text-haze">Já tem conta? <Link to="/entrar" className="font-bold text-turf">Entrar</Link></p>
        </form>
      )}
    </div>
  );
}
