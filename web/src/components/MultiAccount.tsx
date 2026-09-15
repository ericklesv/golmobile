import { useState } from 'react';
import { useAuth } from '../store/auth';

/**
 * Aviso de "contas demais nesta internet" (lib/security.js na API; dono, 15/09/2026): no máximo 3 contas jogando ao
 * mesmo tempo na mesma internet. Quando qualquer pedido volta 403 `multiconta`, lib/api.ts dispara o evento
 * MULTI_EVENT e o App troca a tela inteira por esta — tentar de novo (se uma das outras 3 ficou parada, entra)
 * ou sair desta conta.
 */
export function MultiAccountScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const logout = useAuth((s) => s.logout);
  const logged = useAuth((s) => !!s.me); // barrado já no login/cadastro: não tem conta aberta para sair
  const [busy, setBusy] = useState(false);
  return (
    <div className="app-frame relative flex min-h-full items-center justify-center px-4 py-8">
      <div className="stadium-bg" />
      <div className="panel relative w-full max-w-sm text-center text-navy-ink" role="alert">
        <img src="/ui/ico-lock01_m.png" alt="" className="mx-auto -mt-1 h-14 w-14 object-contain" />
        <div className="t-display mt-1 text-[22px] leading-tight">Contas demais nesta internet</div>
        <p className="mt-2 text-[14px] font-bold leading-snug">{message}</p>
        <p className="mt-2 text-[12px] font-bold leading-snug text-muted">Até 3 contas ao mesmo tempo no mesmo aparelho e, no computador, na mesma internet. Celulares diferentes jogam à vontade.</p>
        <button className="btn btn-green btn-md mt-4 w-full" disabled={busy} onClick={async () => { setBusy(true); try { await onRetry(); } finally { setBusy(false); } }}>
          {busy ? 'Tentando…' : 'Tentar de novo'}
        </button>
        <button className="btn btn-blue btn-sm mt-2 w-full" disabled={busy} onClick={() => { logout(); onRetry(); }}>{logged ? 'Sair desta conta' : 'Voltar'}</button>
      </div>
    </div>
  );
}
