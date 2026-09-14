import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const slides = [
  { icon: '/ui/ico-energy.png', title: 'CHUTE A GOL', text: 'Chute direto a cada 10 minutos, pênaltis, faltas e a trilha. Cada gol é seu — e do seu time.' },
  { icon: '/ui/ico-clan.png', title: 'JOGUE PELO SEU TIME', text: 'Rodadas de 24 horas. Seu gol soma no placar do clube na Série A, B ou C.' },
  { icon: '/ui/ico-trophy_m.png', title: 'SUBA NA ARTILHARIA', text: 'Rankings da hora, da rodada e da temporada. Prêmios em dinheiro e VIP.' },
];

export function LandingScreen() {
  return (
    <div className="app-frame flex min-h-full flex-col px-5 pb-8" style={{ paddingTop: 'calc(var(--sat) + 40px)' }}>
      <div className="stadium-bg" />
      <div className="relative text-center">
        <motion.img src="/brand/logo-v.webp" alt="JogaGol" initial={{ scale: 0.7, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} className="mx-auto w-56 drop-shadow-[0_10px_18px_rgba(0,0,0,0.4)]" />
        <div className="trap trap-orange mx-auto -mt-1 text-[12px] uppercase tracking-[0.25em]">chute · marque · suba</div>
      </div>
      <div className="relative mt-7 flex flex-1 flex-col gap-3">
        {slides.map((s, i) => (
          <motion.div key={s.title} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 * i }} className="panel flex items-center gap-3">
            <img src={s.icon} alt="" className="h-14 w-14 shrink-0 object-contain" />
            <div>
              <div className="t-display text-lg text-navy-ink">{s.title}</div>
              <div className="text-[13px] font-bold leading-snug text-muted">{s.text}</div>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="relative mt-6 flex flex-col gap-3">
        <Link to="/cadastro" className="btn btn-orange btn-lg w-full">Escolher meu time</Link>
        <Link to="/entrar" className="btn btn-blue btn-md w-full">Já tenho conta</Link>
        <p className="t-display t-out text-center text-[11px]"><Link to="/privacidade">Privacidade</Link> · <Link to="/termos">Termos de uso</Link></p>
      </div>
    </div>
  );
}
