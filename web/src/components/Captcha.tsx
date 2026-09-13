import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { CaptchaPayload } from '../lib/types';

/**
 * Captcha anti-robô dos chutes manuais. Quando `me.captchaRequired` está ligado, o
 * servidor exige {captchaId, answer} no próximo pênalti/falta/trilha. O hook pede a
 * conta em GET /api/play/captcha (o servidor devolve sempre a MESMA conta aberta; só o
 * botão "Outra" troca) e devolve o payload pronto (ou null se não respondeu).
 */
export function useCaptcha(required: boolean | undefined) {
  const [q, setQ] = useState<{ id: string; question: string } | null>(null);
  const [answer, setAnswer] = useState('');
  const load = useCallback((fresh = false) => {
    api.captcha(fresh).then((c) => setQ((old) => (old?.id === c.id ? old : c))).catch(() => setQ(null));
  }, []);
  useEffect(() => { if (required) load(); else setQ(null); }, [required, load]);
  useEffect(() => { setAnswer(''); }, [q?.id]); // a resposta digitada só some quando a conta muda
  const payload: CaptchaPayload | null = required && q && answer.trim() !== '' ? { captchaId: q.id, answer: answer.trim() } : null;
  const box = required ? (
    <div className="panel relative flex items-center gap-3 py-2">
      <img src="/ui/ico-info.png" className="h-8 w-8 shrink-0" alt="" />
      <div className="min-w-0 flex-1">
        <div className="t-display text-[12px] uppercase text-navy-ink">Anti-robô: quanto é?</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap font-display text-2xl tabular-nums text-orange-deep">{q ? `${q.question} =` : '…'}</span>
          <input className="field no-drag min-w-0 max-w-[6.5rem] flex-1 text-center text-xl" inputMode="numeric" pattern="[0-9]*" maxLength={3} value={answer} onChange={(e) => setAnswer(e.target.value.replace(/\D/g, ''))} placeholder="?" aria-label="Resposta da conta" />
          <button type="button" onClick={() => load(true)} className="btn btn-blue btn-sm no-drag shrink-0" aria-label="Trocar a conta">Outra</button>
        </div>
      </div>
    </div>
  ) : null;
  // depois de um erro do servidor (resposta errada/expirada) a conta aberta já é outra: busca ela
  return { box, payload, refresh: () => load() };
}
