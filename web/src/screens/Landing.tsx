import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Target, Trophy } from 'lucide-react';

const slides = [
  { icon: Zap, title: 'CHUTE A GOL', text: 'Chute direto a cada 10 minutos, pênaltis, faltas e a trilha. Cada gol é seu — e do seu time.' },
  { icon: Target, title: 'JOGUE PELO SEU TIME', text: 'Rodadas de 24 horas. Seu gol soma no placar do clube na Série A, B ou C.' },
  { icon: Trophy, title: 'SUBA NA ARTILHARIA', text: 'Rankings da hora, da rodada e da temporada. Prêmios em dinheiro e VIP.' },
];

export function LandingScreen() {
  return (
    <div className="app-frame flex min-h-full flex-col px-6 pb-8 pt-16" style={{ paddingTop: 'calc(var(--sat) + 56px)' }}>
      <div className="stadium-bg" />
      <div className="relative text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-full border-4 border-turf shadow-glow">
          <span className="text-5xl">⚽</span>
        </motion.div>
        <h1 className="font-poster text-6xl tracking-wide text-turf drop-shadow-[0_0_24px_rgba(34,229,138,0.45)]">BRGOL</h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.35em] text-haze">chute · marque · suba</p>
      </div>
      <div className="relative mt-10 flex flex-1 flex-col gap-3">
        {slides.map((s, i) => (
          <motion.div key={s.title} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 * i }} className="card flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-turf/15 text-turf"><s.icon className="h-6 w-6" /></div>
            <div>
              <div className="font-poster text-lg tracking-wide text-chalk">{s.title}</div>
              <div className="text-xs text-haze">{s.text}</div>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="relative mt-8 flex flex-col gap-3">
        <Link to="/cadastro" className="btn-turf w-full py-4 text-lg">Escolher meu time</Link>
        <Link to="/entrar" className="btn-ghost w-full py-3">Já tenho conta</Link>
      </div>
    </div>
  );
}
