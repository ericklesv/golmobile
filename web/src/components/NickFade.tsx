/**
 * Painel "NICK EM DEGRADÊ" do Perfil (benefício do VIP; pedido do dono, 15/09/2026, estilo speedrun.com):
 * duas cores da paleta (meta.nickFades), prévia ao vivo e Salvar → POST /api/me/nick-fade.
 * Sem VIP ativo: mostra a prévia bloqueada e o caminho para ativar. A escolha fica guardada mesmo
 * se o VIP vencer (o servidor só para de mostrar) — renovou, volta sozinha.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { fadeStyle } from '../lib/nick';
import { Panel } from './ui';
import { toast } from './Toast';

export function NickFadePanel() {
  const me = useAuth((s) => s.me)!;
  const setMe = useAuth((s) => s.setMe);
  const palette = useAuth((s) => s.meta?.nickFades) ?? [];
  const saved = me.nickFadeKeys?.split('>') ?? [];
  const [from, setFrom] = useState(saved[0] ?? 'azul');
  const [to, setTo] = useState(saved[1] ?? 'rosa');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const k = me.nickFadeKeys?.split('>'); if (k?.length === 2) { setFrom(k[0]); setTo(k[1]); } }, [me.nickFadeKeys]);
  if (!palette.length) return null;

  const hex = (k: string) => palette.find((c) => c.key === k)?.hex ?? '#2EA8FF';
  const preview = fadeStyle({ a: hex(from), b: hex(to) });
  const changed = me.nickFadeKeys !== `${from}>${to}`;

  async function save(clear = false) {
    if (busy) return;
    setBusy(true);
    try {
      setMe(clear ? await api.setNickFade(null, null) : await api.setNickFade(from, to));
      toast(clear ? 'Degradê removido.' : 'Nick em degradê salvo!', 'success');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const Swatches = ({ value, onChange, label }: { value: string; onChange: (k: string) => void; label: string }) => (
    <div>
      <div className="label mb-1">{label}</div>
      <div className="no-drag flex flex-wrap gap-1.5">
        {palette.map((c) => (
          <button key={c.key} type="button" onClick={() => onChange(c.key)} aria-label={c.name} title={c.name}
            className={`h-8 w-8 rounded-full border-[3px] transition ${value === c.key ? 'scale-110 border-navy-ink' : 'border-white/80'}`} style={{ background: c.hex }} />
        ))}
      </div>
    </div>
  );

  return (
    <Panel title="NICK EM DEGRADÊ" ribbon="yellow">
      <div className="mb-3 rounded-xl bg-sky/10 py-3 text-center">
        <div className="label">Prévia</div>
        <div className="t-display text-[28px] leading-tight" style={preview}>{me.nick}</div>
        {!me.vip && <div className="mt-1 text-[11px] font-bold text-muted">Benefício do VIP — <Link to="/vip" className="text-sky-deep">ative seus dias de VIP</Link> para usar.</div>}
      </div>
      <div className="flex flex-col gap-3">
        <Swatches label="Começa em" value={from} onChange={setFrom} />
        <Swatches label="Termina em" value={to} onChange={setTo} />
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => save()} disabled={busy || !me.vip || !changed} className="btn btn-green btn-sm flex-1">{busy ? 'Salvando…' : 'Salvar'}</button>
        {me.nickFadeKeys && <button onClick={() => save(true)} disabled={busy} className="btn btn-gray btn-sm">Tirar</button>}
      </div>
      <p className="mt-2 text-[11px] font-bold text-muted">Aparece no chat, nos rankings, na partida e na sua página. Se o VIP vencer, o degradê some e volta quando você ativar de novo. Tem prioridade sobre a cor do nick da loja.</p>
    </Panel>
  );
}
