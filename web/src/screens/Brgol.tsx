import { Link } from 'react-router-dom';
import { useSeo } from '../lib/seo';

/**
 * "O que foi o BRGOL" — página pública para quem procura o BRGOL no Google (Guilherme, 25/09/2026, auditoria de SEO:
 * o site só tinha UMA página com conteúdo, e a busca "brgol" é a de quem tem saudade do jogo). Os fatos vêm do
 * dossiê `docs/BRGOL_ORIGINAL.md` (fonte da verdade) e as regras do JogaGol, de `api/src/lib/rules.js` — conferir lá
 * antes de mudar um número. Não citar concorrente nem dizer que o JogaGol É o site original: é um jogo novo que refaz
 * as regras de base.
 */

const ORIGINAL = [
  { t: 'Chute direto', d: 'automático a cada 10 minutos enquanto você estava logado, e sempre valia gol. O VIP chutava na metade do tempo.' },
  { t: 'Pênalti', d: 'você escolhia esquerda, meio ou direita, e o goleiro escolhia um canto.' },
  { t: 'Falta', d: 'com barreira de quatro jogadores: por cima ou por fora dela.' },
  { t: 'Trilha', d: 'o campo visto de cima, e você driblava a defesa adversária linha a linha até o gol. Errou a linha, perdeu a bola.' },
];

const IGUAL = [
  'Você escolhe um clube brasileiro e cada gol seu soma no placar dele na rodada de 24 horas, que fecha às 19h.',
  'Chute direto a cada 10 minutos, pênalti, falta e trilha.',
  'Artilharia da hora, da rodada e da temporada, com prêmios em dinheiro do jogo e dias de VIP.',
  'Séries A, B e C com acesso e rebaixamento, presidente e diretores no time.',
];
const NOVO = [
  'Feito para o celular: abre no navegador e pode ser instalado como aplicativo.',
  'Pênalti e falta em 3D, com o goleiro vestindo o uniforme do adversário da rodada.',
  'Minigames de futebol todo dia, cada um renovando numa hora e valendo gol para o seu time.',
  'X1 ao vivo contra outros jogadores: FutPrego, Futebol de Botão e Futgolf, um jogo por dia.',
  'Cada nível dá um ponto para evoluir o jogador: recarga, pontaria, chute e sorte.',
];
const FAQ = [
  { q: 'O BRGOL ainda existe?', a: 'O site original saiu do ar por volta de 2013. O JogaGol recria o jogo com as mesmas regras de base — escolher um time, fazer gols e disputar a artilharia — no celular e no PC, de graça.' },
  { q: 'O JogaGol é o mesmo BRGOL?', a: 'Não é o site original: é um jogo novo, feito do zero, que refaz as regras do BRGOL e acrescenta coisas novas, como os minigames diários e o X1 ao vivo.' },
  { q: 'Precisa pagar para jogar?', a: 'Não. Criar conta, escolher o clube, chutar e disputar a artilharia é grátis. O VIP é opcional e dá recargas mais rápidas.' },
];

export function BrgolScreen() {
  useSeo('BRGOL: o jogo de fazer gols que marcou época (2008–2013)', 'A história do BRGOL, o jogo de navegador em que cada gol somava no placar do seu time: pênalti, falta, trilha, rodadas de 24 horas e artilharia da hora. E onde jogar do mesmo jeito hoje.', '/brgol');
  return (
    <div className="app-frame flex min-h-full flex-col px-5 pb-10" style={{ paddingTop: 'calc(var(--sat) + 20px)' }}>
      <div className="stadium-bg" />
      <header className="relative flex items-center justify-between gap-3">
        <Link to="/" aria-label="JogaGol — página inicial"><img src="/brand/logo-h.webp" alt="JogaGol" className="h-11 drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)]" /></Link>
        <Link to="/cadastro" className="btn btn-orange btn-sm">Jogar grátis</Link>
      </header>

      <article className="relative mt-5 flex flex-col gap-3">
        <div className="text-center">
          <div className="trap trap-orange mx-auto text-[11px] uppercase tracking-[0.2em]">2008 – 2013</div>
          <h1 className="t-display t-out mt-2 text-[24px] leading-tight">BRGOL: o jogo de fazer gols que marcou época</h1>
        </div>

        <section className="panel">
          <h2 className="t-display text-lg text-navy-ink">O QUE ERA O BRGOL</h2>
          <p className="mt-1 text-[14px] font-bold leading-snug text-navy-ink/85">O BRGOL (ou BR GOL) foi um jogo de futebol de navegador brasileiro que fez sucesso entre 2008 e 2013, com dezenas de milhares de jogadores. Você escolhia um clube brasileiro de verdade e fazia gols por ele: cada gol somava no placar do time na partida da rodada, que durava 24 horas e fechava às 19h. No fim, o time que mais marcou vencia — e a torcida inteira comemorava junto.</p>
        </section>

        <section className="panel">
          <h2 className="t-display text-lg text-navy-ink">COMO SE FAZIA GOL</h2>
          <ul className="mt-1 flex flex-col gap-2">
            {ORIGINAL.map((m) => <li key={m.t} className="text-[14px] font-bold leading-snug text-navy-ink/85"><b className="text-navy-ink">{m.t}:</b> {m.d}</li>)}
          </ul>
          <p className="mt-2 text-[13px] font-bold leading-snug text-navy-ink/75">Antes de cada chute manual vinha um código de verificação — os robôs de "auto-pênalti" eram o grande inimigo do jogo.</p>
        </section>

        <section className="panel">
          <h2 className="t-display text-lg text-navy-ink">RODADAS, SÉRIES E ARTILHARIA</h2>
          <p className="mt-1 text-[14px] font-bold leading-snug text-navy-ink/85">Os times disputavam as Séries A, B, C e a Divisão de Acesso, com acesso e rebaixamento. A artilharia tinha ranking da hora, da rodada, da temporada e geral, além dos rankings de pênalti, falta e trilha. Os melhores ganhavam dinheiro do jogo e dias de VIP, e cada time tinha presidente e diretores, que comandavam a torcida.</p>
        </section>

        <section className="panel">
          <h2 className="t-display text-lg text-navy-ink">DE PINTINHO A LENDÁRIO</h2>
          <p className="mt-1 text-[14px] font-bold leading-snug text-navy-ink/85">Os níveis subiam com os gols: Iniciante, Pintinho, Frango, Sub-12, Juvenil, Titular, Medalha de Ouro, Veterano, Campeão, Gold Star, Chuteira Dourada e, lá no alto, Lendário. Cada nível liberava algo novo — a falta no nível 1, a trilha no nível 3, as mensagens coloridas no nível 8.</p>
        </section>

        <section className="panel">
          <h2 className="t-display text-lg text-navy-ink">O BRGOL 2.0 E A VOLTA À SIMPLICIDADE</h2>
          <p className="mt-1 text-[14px] font-bold leading-snug text-navy-ink/85">Em 2010 veio o BRGOL 2.0, com personagem, habilidades, treino, cartão amarelo e contusões. Meses depois, em outubro de 2010, o jogo voltou ao formato simples — "a simplicidade que todos queriam, a rivalidade". O site original saiu do ar por volta de 2013.</p>
        </section>

        <section className="panel">
          <h2 className="t-display text-lg text-navy-ink">ONDE JOGAR HOJE: O JOGAGOL</h2>
          <p className="mt-1 text-[14px] font-bold leading-snug text-navy-ink/85">O JogaGol é o sucessor do BRGOL feito para os dias de hoje. O que continua igual:</p>
          <ul className="mt-1 list-disc pl-5 text-[14px] font-bold leading-snug text-navy-ink/85">{IGUAL.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="mt-2 text-[14px] font-bold leading-snug text-navy-ink/85">E o que é novo:</p>
          <ul className="mt-1 list-disc pl-5 text-[14px] font-bold leading-snug text-navy-ink/85">{NOVO.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>

        <div className="flex flex-col gap-2">
          <Link to="/cadastro" className="btn btn-orange btn-lg w-full">Escolher meu time</Link>
          <Link to="/" className="btn btn-blue btn-md w-full">Como funciona o JogaGol</Link>
        </div>

        <section className="panel">
          <h2 className="t-display text-lg text-navy-ink">PERGUNTAS FREQUENTES</h2>
          {FAQ.map((f) => (
            <div key={f.q} className="mt-2">
              <h3 className="text-[14px] font-extrabold text-navy-ink">{f.q}</h3>
              <p className="text-[14px] font-bold leading-snug text-navy-ink/85">{f.a}</p>
            </div>
          ))}
        </section>

        <p className="t-display t-out text-center text-[11px]"><Link to="/times">Os 48 times</Link> · <Link to="/privacidade">Privacidade</Link> · <Link to="/termos">Termos de uso</Link> · JogaGol é um produto da Managol Softwares</p>
      </article>
    </div>
  );
}
