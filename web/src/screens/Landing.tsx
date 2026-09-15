import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSeo } from '../lib/seo';

const slides = [
  { icon: '/ui/ico-energy.png', title: 'CHUTE A GOL', text: 'Chute direto a cada 10 minutos, pênaltis, faltas e a trilha. Cada gol é seu — e do seu time.' },
  { icon: '/ui/ico-clan.png', title: 'JOGUE PELO SEU TIME', text: 'Rodadas de 24 horas. Seu gol soma no placar do clube na Série A, B ou C.' },
  { icon: '/ui/ico-trophy_m.png', title: 'SUBA NA ARTILHARIA', text: 'Rankings da hora, da rodada e da temporada. Prêmios em dinheiro e VIP.' },
];

/**
 * Texto de apresentação (SEO orgânico, pedido do dono, 15/09/2026): o Google roda o app e lê isto; os mesmos
 * assuntos estão no HTML estático do `web/index.html` (o que os robôs sem JavaScript leem). Mantém as
 * palavras que o público procura — BRGOL / BR GOL, jogo de fazer gols, disputa de gols online, Brasfoot,
 * Gamegol — sem inventar nada sobre o jogo: conferir com as regras antes de mudar.
 */
const about = [
  { title: 'COMO FUNCIONA A DISPUTA DE GOLS', text: 'Você escolhe um clube brasileiro e cada gol seu soma no placar do time na rodada de 24 horas, que fecha todo dia às 19:00. Chute direto a cada 10 minutos, pênalti, falta e trilha — tudo decidido no servidor. Os clubes disputam as Séries A, B e C com acesso e rebaixamento; os melhores artilheiros da rodada e da temporada ganham dinheiro do jogo e dias de VIP.' },
  { title: 'PARA QUEM JOGAVA BRGOL', text: 'O JogaGol é o port fiel do BRGOL (BR GOL), o jogo de fazer gols de navegador que marcou época entre 2008 e 2013: as mesmas recargas, os mesmos rankings, a mesma artilharia por hora — agora feito para o celular, com pênalti e falta em 3D, diretoria e contratações entre times. Se você curte Brasfoot, Gamegol ou qualquer jogo de futebol online leve de jogar todo dia, é aqui.' },
  { title: 'MINIGAMES TODO DIA', text: 'Termo do futebol, quiz, Party GoL, memória dos escudos, estatísticas do Brasileirão, "de que time é?", camisas, alvo no gol, Hat Trick e Falta PRO: cada minigame renova numa hora do dia e vale gol para o seu time. No FutPrego, o futebol de prego 1x1 em tempo real, você desafia outros jogadores valendo aposta, gol e o Ranking X1.' },
];
const faq = [
  { q: 'O JogaGol é grátis?', a: 'Sim. Criar conta, escolher o clube, chutar e disputar a artilharia é grátis. O VIP é opcional e dá recargas mais rápidas e vantagens na diretoria do time.' },
  { q: 'Precisa baixar alguma coisa?', a: 'Não. Abre direto no navegador do celular ou do PC e pode ser instalado como aplicativo. A versão para Android na Google Play está a caminho.' },
  { q: 'Posso trocar de time?', a: 'Pode, comprando a Troca de time na Loja do jogo — salvo quando você aceita um contrato de contratação de outro clube, que prende por alguns dias.' },
];

export function LandingScreen() {
  useSeo('Jogo de fazer gols online grátis — o novo BRGOL', 'Escolha seu clube, marque gols de pênalti, falta e trilha e dispute a artilharia com outros jogadores. Sucessor do clássico BRGOL, no celular e no PC.', '/bem-vindo');
  return (
    <div className="app-frame flex min-h-full flex-col px-5 pb-8" style={{ paddingTop: 'calc(var(--sat) + 40px)' }}>
      <div className="stadium-bg" />
      <div className="relative text-center">
        <motion.img src="/brand/logo-v.webp" alt="JogaGol" width={600} height={648} initial={{ scale: 0.7, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} className="mx-auto h-auto w-56 drop-shadow-[0_10px_18px_rgba(0,0,0,0.4)]" />
        <div className="trap trap-orange mx-auto -mt-1 text-[12px] uppercase tracking-[0.25em]">chute · marque · suba</div>
        <h1 className="t-display t-out mt-3 text-[17px] leading-tight">O jogo de fazer gols online — grátis, no celular e no PC</h1>
      </div>
      <div className="relative mt-5 flex flex-1 flex-col gap-3">
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
      </div>

      {/* apresentação + perguntas frequentes (abaixo dos botões: quem quer jogar não precisa rolar) */}
      <div className="relative mt-8 flex flex-col gap-3">
        {about.map((s) => (
          <section key={s.title} className="panel">
            <h2 className="t-display text-lg text-navy-ink">{s.title}</h2>
            <p className="mt-1 text-[13px] font-bold leading-snug text-navy-ink/85">{s.text}</p>
          </section>
        ))}
        <section className="panel">
          <h2 className="t-display text-lg text-navy-ink">PERGUNTAS FREQUENTES</h2>
          {faq.map((f) => (
            <div key={f.q} className="mt-2">
              <h3 className="text-[13px] font-extrabold text-navy-ink">{f.q}</h3>
              <p className="text-[13px] font-bold leading-snug text-navy-ink/85">{f.a}</p>
            </div>
          ))}
        </section>
        <Link to="/cadastro" className="btn btn-orange btn-md w-full">Criar minha conta grátis</Link>
        <p className="t-display t-out text-center text-[11px]"><Link to="/privacidade">Privacidade</Link> · <Link to="/termos">Termos de uso</Link> · JogaGol é um produto da Managol Softwares</p>
      </div>
    </div>
  );
}
