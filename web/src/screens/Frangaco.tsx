import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { token } from '../lib/api';

/**
 * Frangaço — o JOGO é o cliente Unity WebGL do Managol (hospedado em /tv/, modo
 * ?mode=penalty), que fala direto com a API compatível em /api/frangaco/*.
 * Esta tela é só o WRAPPER: header do kit + iframe fullscreen + ponte do token.
 *
 * Ponte (mesma do Flutter frangaco_tv_modal.dart + ManagolTV/tv-index.html):
 * o token NUNCA vai na URL — vai por postMessage {tipo:'managol-frangaco-auth'}
 * a cada 400 ms até a página avisar {tipo:'managol-tv-pronto'} (máx ~40 envios).
 * Sem o /tv hospedado (dev/preview) o aviso nunca chega: mostramos o recado.
 */
export function FrangacoScreen() {
  const nav = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const [pronto, setPronto] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false);

  const origin = window.location.origin;
  const src = `${origin}/tv/?mode=penalty&apiBase=${origin}`;

  useEffect(() => {
    const t = token.get();
    let ready = false;
    let tentativas = 0;

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
  }, [origin]);

  return (
    <div className="app-frame relative flex min-h-full flex-col" style={{ height: '100dvh' }}>
      <div className="stadium-bg" />
      <div className="relative flex items-center justify-between px-3 pb-2" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <button onClick={() => nav(-1)} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
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
          ref={frame}
          src={src}
          title="Frangaço 3D"
          className="h-full w-full border-0"
          allow="autoplay; fullscreen"
        />
      </div>
    </div>
  );
}
