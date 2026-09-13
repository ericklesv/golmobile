import { useState } from 'react';

/** Foto de perfil redonda com fallback para o avatar do pack. */
export function Avatar({ url, size = 40, className = '' }: { url?: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const src = url && !broken ? url : '/ui/ico-userthumbnail.png';
  return (
    <img src={src} alt="" width={size} height={size} onError={() => setBroken(true)}
      className={`shrink-0 rounded-full object-cover ${url && !broken ? 'ring-[3px] ring-white/90 shadow-[0_2px_6px_rgba(0,0,0,0.35)]' : ''} ${className}`}
      style={{ width: size, height: size }} />
  );
}
