import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { CaptchaPayload } from '../lib/types';

/**
 * Captcha anti-robô dos chutes manuais. Quando `me.captchaRequired` está ligado, o
 * servidor exige {captchaId, answer} no próximo pênalti/falta/trilha. O hook pede a
 * conta em GET /api/play/captcha e devolve o payload pronto (ou null se não respondeu).
 */
export function useCaptcha(required: boolean | undefined) {
  const [q, setQ] = useState<{ id: string; question: string } | null>(null);
  const [answer, setAnswer] = useState('');
  const load = useCallback(() => { setAnswer(''); api.captcha().then(setQ).catch(() => setQ(null)); }, []);
  useEffect(() => { if (required) load(); else { setQ(null); setAnswer(''); } }, [required, load]);
  const payload: CaptchaPayload | null = required && q && answer.trim() !== '' ? { captchaId: q.id, answer: answer.trim() } : null;
  const box = required ? (
    <div className="panel relative flex items-center gap-2 py-2">
      <img src="/ui/ico-info.png" className="h-8 w-8 shrink-0" alt="" />
      <div className="min-w-0 flex-1">
        <div className="t-display text-[12px] uppercase text-navy-ink">Anti-robô: quanto é?</div>
        <div className="font-display text-xl text-orange-deep">{q ? `${q.question} =` : '…'}</div>
      </div>
      <input className="field no-drag w-24 text-center" inputMode="numeric" pattern="[0-9]*" value={answer} onChange={(e) => setAnswer(e.target.value.replace(/[^\d-]/g, ''))} placeholder="?" aria-label="Resposta" />
      <button type="button" onClick={load} className="btn-sq btn-sq-white no-drag h-10 w-10" aria-label="Outra conta"><img src="/ui/pi-auto.png" className="h-5 w-5" alt="" /></button>
    </div>
  ) : null;
  return { box, payload, refresh: load };
}
