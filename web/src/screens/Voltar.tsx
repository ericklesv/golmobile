import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import { track } from '../lib/track';
import type { EmailVoltar } from '../lib/types';
import { CartoonBall } from '../components/TrailBall';

/**
 * Telas dos links do e-mail de volta (api/src/services/emailVolta.js), abertas COM ou SEM login:
 * /voltar?t=…          — o botão "PEGAR MEU VIP": ativa os 7 dias na hora (uma vez) e leva para o jogo.
 * /sair-dos-emails?t=… — o "Sair da lista" do rodapé. Só sai tocando no botão: robô de antivírus abre os links
 *                        dos e-mails para conferir, e não pode tirar ninguém da lista sozinho.
 */

const quando = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

function Moldura({ ribbon, cor = 'orange', children }: { ribbon: string; cor?: 'orange' | 'green' | 'blue'; children: React.ReactNode }) {
  return (
    <div className="app-frame flex min-h-full flex-col px-5 pb-10" style={{ paddingTop: 'calc(var(--sat) + 32px)' }}>
      <div className="stadium-bg" />
      <div className="relative text-center">
        <img src="/brand/logo-h.webp" alt="JogaGol" className="mx-auto h-16 drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]" />
      </div>
      <div className="panel relative mx-auto mt-10 flex w-full max-w-md flex-col items-center gap-3 pt-9 text-center">
        <div className="absolute -top-7 left-1/2 -translate-x-1/2"><div className={`ribbon ribbon-${cor} whitespace-nowrap text-[18px]`}>{ribbon}</div></div>
        {children}
      </div>
    </div>
  );
}

const icone = (src: string) => <img src={src} alt="" className="h-8 w-8 shrink-0" />;
const PERKS = [
  { icon: icone('/ui/ico-energy.png'), text: 'Recargas pela metade: chute direto a cada 5 minutos' },
  { icon: <svg viewBox="-11 -11 22 22" className="h-8 w-8 shrink-0"><CartoonBall r={10} /></svg>, text: 'O chute direto sai sozinho, mesmo com o jogo fechado' },
  { icon: icone('/ui/ico-x1.svg'), text: 'X1 sem espera entre as partidas e todas as provocações' },
];

export function VoltarScreen() {
  const [params] = useSearchParams();
  const t = params.get('t') ?? '';
  const me = useAuth((s) => s.me);
  const refresh = useAuth((s) => s.refresh);
  const [res, setRes] = useState<EmailVoltar | null>(null);
  const [erro, setErro] = useState<{ code: string; message: string } | null>(null);
  const pediu = useRef(false);

  async function pegar() {
    setErro(null);
    try {
      const r = await api.emailVoltar(t);
      setRes(r);
      track('email.voltar', { status: r.status });
      if (r.status === 'ok' && me) refresh().catch(() => {}); // o VIP novo aparece no topo do jogo
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setErro({ code: err?.code ?? 'error', message: err?.message ?? 'Não deu para abrir o presente.' });
    }
  }
  useEffect(() => { if (!pediu.current && t) { pediu.current = true; pegar(); } }, [t]);

  const outraConta = me && res && me.nick.toLowerCase() !== res.nick.toLowerCase();
  const jogar = me
    ? <Link to="/" className="btn btn-green btn-lg mt-1 w-full">JOGAR AGORA</Link>
    : <Link to="/entrar" className="btn btn-green btn-lg mt-1 w-full">ENTRAR E JOGAR</Link>;
  const senha = !me && <p className="text-sm font-bold text-muted">Esqueceu a senha? <Link to="/esqueci-senha" className="text-orange-deep">Peça uma nova</Link></p>;

  if (!t || erro?.code === 'link-invalido') {
    return (
      <Moldura ribbon="LINK INVÁLIDO">
        <p className="text-sm font-bold text-navy-ink">{erro?.message ?? 'Esse link está incompleto.'} Abra de novo o botão do e-mail ou entre direto no jogo.</p>
        {jogar}
      </Moldura>
    );
  }
  if (erro) {
    return (
      <Moldura ribbon="OPS">
        <p className="text-sm font-bold text-navy-ink">{erro.message}</p>
        <button type="button" className="btn btn-blue btn-md w-full" onClick={pegar}>Tentar de novo</button>
      </Moldura>
    );
  }
  if (!res) {
    return (
      <Moldura ribbon="SEU PRESENTE" cor="blue">
        <img src="/ui/ico-crown_silver.png" alt="" className="h-16 w-16 animate-bob" />
        <p className="t-display text-[18px] text-navy-ink">Abrindo seu VIP…</p>
      </Moldura>
    );
  }
  if (res.status === 'vencido' || res.status === 'suspenso') {
    return (
      <Moldura ribbon={res.status === 'vencido' ? 'PRAZO ENCERRADO' : 'CONTA SUSPENSA'}>
        <p className="text-sm font-bold text-navy-ink">
          {res.status === 'vencido'
            ? `O presente do e-mail já venceu, ${res.nick}. Mas o jogo continua: seu time está esperando seus gols.`
            : `A conta ${res.nick} está suspensa no momento, e o presente não pode ser ativado agora.`}
        </p>
        {jogar}{senha}
      </Moldura>
    );
  }
  const novo = res.status === 'ok';
  return (
    <Moldura ribbon={novo ? 'VIP ATIVADO' : 'VIP JÁ ATIVADO'} cor="green">
      <img src="/ui/ico-crown_silver.png" alt="" className="h-20 w-20 animate-pop" />
      <div className="t-display t-gold text-[30px] leading-none">{res.days} DIAS DE VIP</div>
      <p className="text-[15px] font-bold text-navy-ink">
        {novo ? `Que bom te ver de novo, ${res.nick}!` : `Você já pegou esse presente, ${res.nick}.`}
        {res.vipUntil && new Date(res.vipUntil).getTime() > Date.now() ? <> Seu VIP vale até <b>{quando(res.vipUntil)}</b>.</> : null}
      </p>
      {res.teste && <p className="text-xs font-bold text-muted">E-mail de teste: nenhum VIP foi creditado.</p>}
      <ul className="flex w-full flex-col gap-2 text-left">
        {PERKS.map((p) => (
          <li key={p.text} className="flex items-center gap-3 text-[13px] font-bold text-navy-ink">
            {p.icon}<span className="min-w-0">{p.text}</span>
          </li>
        ))}
      </ul>
      {outraConta && <p className="text-xs font-bold text-orange-deep">Você está na conta {me!.nick} neste aparelho. O VIP foi para {res.nick}: entre com ela para usar.</p>}
      {jogar}{senha}
    </Moldura>
  );
}

export function SairEmailsScreen() {
  const [params] = useSearchParams();
  const t = params.get('t') ?? '';
  const [fase, setFase] = useState<'pergunta' | 'enviando' | 'feito' | 'erro'>('pergunta');
  const [msg, setMsg] = useState('');

  async function sair() {
    setFase('enviando');
    try {
      const r = await api.emailSair(t);
      setMsg(`Pronto, ${r.nick}. Você não vai mais receber e-mails de novidades do JogaGol. Os da sua conta, como "esqueci a senha", continuam.`);
      setFase('feito');
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Não deu certo agora. Tente de novo.');
      setFase('erro');
    }
  }

  if (fase === 'feito') {
    return (
      <Moldura ribbon="FEITO" cor="green">
        <p className="text-sm font-bold text-navy-ink">{msg}</p>
        <Link to="/" className="btn btn-blue btn-md w-full">Ir para o JogaGol</Link>
      </Moldura>
    );
  }
  return (
    <Moldura ribbon="E-MAILS" cor="blue">
      <p className="text-sm font-bold text-navy-ink">Quer parar de receber e-mails de novidades e presentes do JogaGol?</p>
      {fase === 'erro' && <p className="text-xs font-bold text-orange-deep">{msg}</p>}
      <button type="button" className="btn btn-orange btn-md w-full" disabled={!t || fase === 'enviando'} onClick={sair}>
        {fase === 'enviando' ? 'Saindo…' : 'Parar de receber'}
      </button>
      <Link to="/" className="text-sm font-bold text-muted">Não, voltar ao jogo</Link>
    </Moldura>
  );
}
