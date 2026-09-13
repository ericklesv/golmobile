import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { CaptchaPayload } from '../lib/types';
import { toast } from './Toast';

/**
 * Captcha anti-robô dos chutes manuais. Quando `me.captchaRequired` está ligado, o jogador responde
 * a conta e toca em ENVIAR (POST /api/play/captcha): acertou, o servidor libera o chute e a caixa
 * some; errou, já vem outra conta. Pedido do dono (13/09/2026): antes a resposta só ia junto do
 * chute e o único botão era "Outra" — jogador achava que era "confirmar" e ficava trocando de conta.
 * (A resposta digitada ainda vai junto do chute, para quem chutar sem tocar em Enviar.)
 */
export function useCaptcha(required: boolean | undefined) {
  const refreshMe = useAuth((s) => s.refresh);
  const [q, setQ] = useState<{ id: string; question: string } | null>(null);
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(() => {
    api.captcha().then((c) => setQ((old) => (old?.id === c.id ? old : c))).catch(() => setQ(null));
  }, []);
  useEffect(() => { if (required) load(); else setQ(null); }, [required, load]);
  useEffect(() => { setAnswer(''); }, [q?.id]); // a resposta digitada só some quando a conta muda

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (sending) return;
    if (!q) { load(); return; }
    if (!answer.trim()) { toast('Digite a resposta da conta.'); input.current?.focus(); return; }
    setSending(true);
    try {
      const r = await api.captchaSolve(q.id, answer.trim());
      if (r.ok) { toast('Certo! Pode jogar.'); await refreshMe(); }
      else { toast(r.message ?? 'Resposta errada. Tente esta outra conta.', 'error'); if (r.captcha) setQ(r.captcha); input.current?.focus(); }
    } catch (err) { toast((err as Error).message, 'error'); load(); }
    finally { setSending(false); }
  }

  const payload: CaptchaPayload | null = required && q && answer.trim() !== '' ? { captchaId: q.id, answer: answer.trim() } : null;
  const box = required ? (
    <form onSubmit={send} className="panel relative flex items-center gap-3 py-2">
      <img src="/ui/ico-info.png" className="h-8 w-8 shrink-0" alt="" />
      <div className="min-w-0 flex-1">
        <div className="t-display text-[12px] uppercase text-navy-ink">Anti-robô: quanto é?</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap font-display text-2xl tabular-nums text-orange-deep">{q ? `${q.question} =` : '…'}</span>
          <input ref={input} className="field no-drag min-w-0 max-w-[6.5rem] flex-1 text-center text-xl" inputMode="numeric" pattern="[0-9]*" enterKeyHint="send" maxLength={3}
            value={answer} onChange={(e) => setAnswer(e.target.value.replace(/\D/g, ''))} placeholder="?" aria-label="Resposta da conta" />
          <button type="submit" disabled={sending} className="btn btn-green btn-sm no-drag shrink-0">Enviar</button>
        </div>
        <p className="mt-1 text-[11px] font-bold leading-tight text-muted">Responda e toque em Enviar para liberar o chute.</p>
      </div>
    </form>
  ) : null;
  // depois de um erro do servidor no chute (resposta errada/expirada) a conta aberta já é outra: busca ela
  return { box, payload, refresh: () => load() };
}
