import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, token } from '../lib/api';
import { Countdown } from '../components/ui';
import { toast } from '../components/Toast';

/**
 * Frangaço — o JOGO é o cliente Unity WebGL do Managol (hospedado em /tv/, modo
 * ?mode=penalty), que fala direto com a API compatível em /api/frangaco/*.
 * Esta tela é só o WRAPPER: header do kit + iframe fullscreen + ponte do token +
 * o painel de FIM DE TORNEIO.
 *
 * Ponte (mesma do Flutter frangaco_tv_modal.dart + ManagolTV/tv-index.html):
 * o token NUNCA vai na URL — vai por postMessage {tipo:'managol-frangaco-auth'}
 * a cada 400 ms até a página avisar {tipo:'managol-tv-pronto'} (máx ~40 envios).
 * Sem o /tv hospedado (dev/preview) o aviso nunca chega: mostramos o recado.
 *
 * Fim de torneio: o Unity não tem botão "sair" — depois de CAMPEÃO/ELIMINADO ele
 * volta ao lobby com JOGAR (e no JogaGol é um torneio por dia). Consultamos
 * GET /api/frangaco/resultado a cada 1,5 s e, quando o Unity chega ao lobby
 * (`lobby`), cobrimos o jogo com "Voltar ao jogo" (+ "Jogar de novo" no modo teste).
 */
type Fim = { status: 'campeao' | 'eliminado'; champion: boolean; fase: string | null; golsUser: number | null; golsIa: number | null; nextAt: number; freePlay: boolean };

export function FrangacoScreen() {
  const nav = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const [pronto, setPronto] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false);
  const [fim, setFim] = useState<Fim | null>(null);
  const [rodada, setRodada] = useState(0); // troca a key do iframe = Unity boota de novo
  const [busy, setBusy] = useState(false);

  const origin = window.location.origin;
  const src = `${origin}/tv/?mode=penalty&apiBase=${origin}`;

  useEffect(() => {
    const t = token.get();
    let ready = false;
    let tentativas = 0;
    setPronto(false); setIndisponivel(false);

    const enviar = () => {
      try { frame.current?.contentWindow?.postMessage({ tipo: 'managol-frangaco-auth', token: t }, origin); } catch {}
    };
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== origin) return;
      if (ev.data?.tipo === 'managol-tv-pronto') {
        ready = true;
        setPronto(true);
        enviar(); // um último envio garantido depois do boot
        clearInterval(repique);
      }
    };
    window.addEventListener('message', onMsg);
    // reenvia até o WebGL bootar (o iframe pode nem ter carregado ainda)
    const repique = setInterval(() => {
      enviar();
      if (ready || ++tentativas >= 40) clearInterval(repique);
    }, 400);
    // ~20 s sem o "pronto" = o /tv não está hospedado (dev/preview) ou caiu
    const alarme = setTimeout(() => { if (!ready) setIndisponivel(true); }, 20_000);
    return () => {
      window.removeEventListener('message', onMsg);
      clearInterval(repique);
      clearTimeout(alarme);
    };
  }, [origin, rodada]);

  // fim do torneio: só cobre o jogo quando o Unity já voltou ao lobby (não corta a cerimônia)
  useEffect(() => {
    if (fim) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await api.frangacoResultado();
        if (alive && r.status && r.lobby) setFim({ status: r.status, champion: r.champion, fase: r.fase, golsUser: r.golsUser, golsIa: r.golsIa, nextAt: r.nextAt, freePlay: r.freePlay });
      } catch { /* sem rede: tenta de novo no próximo tick */ }
    };
    tick();
    const iv = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(iv); };
  }, [fim, rodada]);

  async function jogarDeNovo() {
    if (busy) return;
    setBusy(true);
    try {
      await api.frangacoReset();
      setFim(null);
      setRodada((n) => n + 1);
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="app-frame relative flex min-h-full flex-col" style={{ height: '100dvh' }}>
      <div className="stadium-bg" />
      <div className="relative flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav('/')} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
        <div className="ribbon ribbon-blue"><img src="/ui/ico-crown_silver.png" className="mr-2 h-7 w-7" alt="" />FRANGAÇO</div>
        <span className="h-12 w-12" />
      </div>
      <div className="relative mx-3 mb-3 min-h-0 flex-1 overflow-hidden rounded-2xl bg-black" style={{ marginBottom: 'calc(var(--sab) + 12px)' }}>
        {indisponivel && !pronto && (
          <div className="absolute inset-x-0 top-0 z-10 bg-red-700/90 px-3 py-2 text-center text-[13px] font-extrabold text-white">
            TV 3D indisponível — o jogo do Frangaço não respondeu. Tente de novo mais tarde.
          </div>
        )}
        <iframe
          key={rodada}
          ref={frame}
          src={src}
          title="Frangaço 3D"
          className="h-full w-full border-0"
          allow="autoplay; fullscreen"
        />
        {fim && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-navy-deep/80 p-4">
            <div className="panel w-full max-w-[380px] text-center text-navy-ink">
              <div className={`ribbon ${fim.status === 'campeao' ? 'ribbon-yellow' : 'ribbon-orange'} mx-auto -mt-8 mb-2`}>
                {fim.status === 'campeao' ? 'CAMPEÃO!' : 'ELIMINADO'}
              </div>
              <img src={'/ui/ico-crown_silver.png'} className="mx-auto h-14 w-14" alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              <p className="mt-2 text-[15px] font-extrabold">
                {fim.status === 'campeao'
                  ? 'Você venceu o Frangaço de hoje: 1 gol pro time, R$ 500 e +20 de nível!'
                  : `${fim.fase ? `Caiu na ${fim.fase}` : 'Torneio encerrado'}${fim.golsUser !== null ? ` (${fim.golsUser} x ${fim.golsIa})` : ''}. Só o campeão pontua.`}
              </p>
              {fim.freePlay ? (
                <>
                  <p className="mt-2 text-[12px] font-bold text-muted">Modo de teste: pode jogar de novo quantas vezes quiser.</p>
                  <button onClick={jogarDeNovo} disabled={busy} className="btn btn-green btn-lg mt-3 w-full">{busy ? '…' : 'Jogar de novo'}</button>
                  <button onClick={() => nav('/')} className="btn btn-orange btn-md mt-2 w-full">Voltar ao jogo</button>
                </>
              ) : (
                <>
                  <p className="mt-2 text-[13px] font-bold text-muted">Novo torneio em <Countdown readyAt={fim.nextAt} className="text-orange-deep" />.</p>
                  <button onClick={() => nav('/')} className="btn btn-orange btn-lg mt-3 w-full">Voltar ao jogo</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
