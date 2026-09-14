import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { timeLeft, timeLeftShort } from '../lib/format';

/**
 * Contador do VIP ativo (pedido do dono, 14/09/2026: ao ativar, gastava 1 VIP guardado e nada mostrava
 * que o VIP tinha aumentado). useVipLeft = quanto falta do VIP ativo, em ms (0 = sem VIP), atualizado a
 * cada 30 s; quando acaba com a tela aberta, recarrega o jogador (nick azul, recargas etc.).
 */
export function useVipLeft(): number {
  const until = useAuth((s) => s.me?.vipUntil);
  const now = useAuth((s) => s.now);
  const refresh = useAuth((s) => s.refresh);
  const end = until ? new Date(until).getTime() : 0;
  const [left, setLeft] = useState(() => Math.max(0, end - now()));
  const wasActive = useRef(left > 0);
  useEffect(() => {
    const tick = () => {
      const l = Math.max(0, end - now());
      setLeft(l);
      if (wasActive.current && l === 0) refresh(); // acabou agora: o servidor tira o VIP
      wasActive.current = l > 0;
    };
    tick();
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  }, [end]);
  return left;
}

/**
 * Barra do VIP (topo da tela e Loja): a coroa com os VIPs guardados e, se o VIP estiver ativo, uma
 * etiqueta com o tempo que falta. A etiqueta "pula" quando o tempo muda (ativou mais um dia).
 */
export function VipBar({ onClick, className = '', iconClass = 'h-7 w-7' }: { onClick?: () => void; className?: string; iconClass?: string }) {
  const me = useAuth((s) => s.me);
  const left = useVipLeft();
  if (!me) return null;
  const bank = me.vipDays;
  const label = left > 0
    ? `VIP ativo, faltam ${timeLeft(left)}. ${bank} ${bank === 1 ? 'VIP guardado' : 'VIPs guardados'}.`
    : `${bank} ${bank === 1 ? 'VIP guardado' : 'VIPs guardados'}`;
  const content = (
    <>
      <img src="/ui/ico-crown_silver.png" className={`ico -ml-3 ${iconClass}`} alt="" />
      {left > 0 ? (
        <>
          <span className="tabular-nums">{bank}</span>
          <motion.span key={me.vipUntil ?? ''} initial={{ scale: 1.35 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 14 }}
            className="ml-1.5 inline-block rounded-md bg-sky-deep px-1.5 py-[3px] text-[11px] leading-none tabular-nums text-white">
            {timeLeftShort(left)}
          </motion.span>
        </>
      ) : (
        <span className="tabular-nums">{bank} VIP</span>
      )}
    </>
  );
  return onClick
    ? <button onClick={onClick} className={`resbar ${className}`} aria-label={label} title={label}>{content}</button>
    : <span className={`resbar ${className}`} aria-label={label} title={label}>{content}</span>;
}
