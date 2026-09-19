/**
 * Menu flutuante de RELATÓRIO do admin (pedido do dono, 18/09/2026): fica "fora da tela" do jogo, no fundo da
 * esquerda onde no PC só há a lateral, para acompanhar as métricas enquanto se anda pelas outras abas. Montado no
 * App para quem tem isAdmin; só aparece em tela larga (≥ 1200 px — o app tem 480 px e o menu precisa de espaço
 * ao lado); no celular o mesmo relatório está na aba Relatório do /admin. Recolhido/aberto fica no aparelho.
 */
import { useState } from 'react';
import { useAuth } from '../store/auth';
import { AdminReport } from './AdminReport';

const KEY = 'brgol.dock';

export function AdminDock() {
  const me = useAuth((s) => s.me);
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } });
  if (!me?.isAdmin) return null;
  const toggle = () => { setOpen((o) => { try { localStorage.setItem(KEY, o ? '0' : '1'); } catch {} return !o; }); };
  return (
    <div className="fixed left-3 top-3 z-[60] hidden min-[1200px]:block" style={{ width: 352 }}>
      {open ? (
        <div className="flex flex-col overflow-hidden rounded-2xl bg-navy-deep/95 text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur" style={{ maxHeight: 'calc(100vh - 24px)' }}>
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="flex items-center gap-2"><img src="/ui/ico-ranking.png" alt="" className="h-5 w-5" /><span className="t-display text-[14px] uppercase tracking-wide">Relatório</span></span>
            <button onClick={toggle} className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-extrabold text-white/80 hover:bg-white/20" aria-label="Recolher">recolher</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto"><AdminReport compact /></div>
        </div>
      ) : (
        <button onClick={toggle} className="flex items-center gap-2 rounded-2xl bg-navy-deep/95 px-3 py-2 text-white shadow-lg ring-1 ring-white/10 backdrop-blur hover:bg-navy-deep" aria-label="Abrir relatório">
          <img src="/ui/ico-ranking.png" alt="" className="h-5 w-5" /><span className="t-display text-[13px] uppercase tracking-wide">Relatório</span>
        </button>
      )}
    </div>
  );
}
