/**
 * Janelas de conta exigidas pela Play Store (conteúdo gerado por usuário + exclusão de conta):
 *   <ReportModal>        denunciar um jogador ou uma mensagem do chat (com opção de bloquear)
 *   <DeleteAccountModal> excluir a própria conta (pede a senha; não tem volta)
 * API em routes/account.js. Visual = kit BRGOL Casual (Sheet do Club.tsx).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { ReportReason } from '../lib/types';
import { useAuth } from '../store/auth';
import { toast } from './Toast';
import { Sheet } from './Club';

export const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'ofensa', label: 'Ofensa, xingamento ou ameaça' },
  { id: 'spam', label: 'Spam ou propaganda' },
  { id: 'golpe', label: 'Golpe, link ou pedido de dados' },
  { id: 'nick', label: 'Nick ou texto pessoal impróprio' },
  { id: 'foto', label: 'Foto de perfil imprópria' },
  { id: 'outro', label: 'Outro motivo' },
];

export function ReportModal({ nick, messageId, messageText, blocked, onClose, onBlocked }: { nick: string; messageId?: number; messageText?: string; blocked?: boolean; onClose: () => void; onBlocked?: (blocked: boolean) => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function send() {
    if (busy || !reason) return;
    setBusy(true);
    try {
      const r = await api.report({ nick, messageId, reason, details: details.trim() || undefined });
      setDone(true);
      toast(r.repeated ? 'Você já tinha denunciado isso. Estamos analisando.' : 'Denúncia enviada. Obrigado por ajudar a manter o jogo limpo!', 'success');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function toggleBlock() {
    if (busy) return;
    setBusy(true);
    try {
      const r = blocked ? await api.unblock(nick) : await api.block(nick);
      toast(r.blocked ? `${nick} bloqueado: as mensagens dele não aparecem mais para você.` : `${nick} desbloqueado.`, 'success');
      onBlocked?.(r.blocked);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <Sheet labelId="report-title" onClose={onClose}>
      <div id="report-title" className="t-display text-[22px] leading-tight">{messageId ? 'Denunciar mensagem' : `Denunciar ${nick}`}</div>
      {messageText && <p className="mt-2 rounded-xl bg-sky/10 p-2 text-left text-[12px] font-bold text-navy-ink"><span className="text-muted">{nick}:</span> {messageText}</p>}
      {done ? (
        <>
          <p className="mt-3 rounded-xl bg-grass/20 p-2 text-[13px] font-extrabold">Recebemos sua denúncia. A moderação analisa e pode apagar a mensagem ou suspender a conta.</p>
          <button onClick={toggleBlock} disabled={busy} className={`btn btn-md mt-3 w-full ${blocked ? 'btn-gray' : 'btn-orange'}`}>{blocked ? `Desbloquear ${nick}` : `Bloquear ${nick}`}</button>
          <button onClick={onClose} className="btn btn-blue btn-sm mt-2 w-full">Fechar</button>
        </>
      ) : (
        <>
          <p className="mt-1 text-[12px] font-bold text-muted">O que aconteceu?</p>
          <div className="no-drag mt-2 flex flex-col gap-1.5 text-left">
            {REASONS.map((r) => (
              <button key={r.id} type="button" onClick={() => setReason(r.id)} className={`rounded-xl border-2 px-3 py-2 text-[13px] font-extrabold ${reason === r.id ? 'border-gold bg-gold/25 text-navy-ink' : 'border-sky/30 bg-white text-navy-ink'}`}>{r.label}</button>
            ))}
          </div>
          <textarea className="field mt-2 min-h-[60px] text-sm" maxLength={300} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Detalhes (opcional, até 300 caracteres)" />
          <button onClick={send} disabled={busy || !reason} className="btn btn-red btn-md mt-3 w-full">{busy ? 'Enviando…' : 'Enviar denúncia'}</button>
          <button onClick={toggleBlock} disabled={busy} className={`btn btn-sm mt-2 w-full ${blocked ? 'btn-gray' : 'btn-orange'}`}>{blocked ? `Desbloquear ${nick}` : `Só bloquear ${nick}`}</button>
          <button onClick={onClose} className="btn btn-blue btn-sm mt-2 w-full">Cancelar</button>
        </>
      )}
    </Sheet>
  );
}

export function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const me = useAuth((s) => s.me)!;
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (busy || !sure || !password) return;
    setBusy(true);
    try {
      await api.deleteAccount(password);
      logout();
      toast('Conta excluída. Obrigado por ter jogado com a gente.', 'success');
      nav('/bem-vindo', { replace: true });
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <Sheet labelId="delete-title" onClose={onClose}>
      <div id="delete-title" className="t-display text-[22px] leading-tight text-danger">Excluir minha conta</div>
      <p className="mt-2 text-[13px] font-bold text-navy-ink">Isso apaga <b>{me.nick}</b> para sempre: nick, e-mail, foto, texto pessoal, mensagens, dinheiro, destreza, itens e VIP guardado. Não dá para desfazer.</p>
      <p className="mt-2 text-[12px] font-bold text-muted">Os gols que você marcou continuam no placar do seu time e nas rodadas já fechadas, sem o seu nome.</p>
      <label className="no-drag mt-3 flex items-start gap-2 text-left text-[12px] font-extrabold text-navy-ink">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 h-5 w-5" />
        <span>Entendi que a exclusão é definitiva.</span>
      </label>
      <input className="field mt-3" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" autoComplete="current-password" />
      <button onClick={confirm} disabled={busy || !sure || !password} className="btn btn-red btn-md mt-3 w-full">{busy ? 'Excluindo…' : 'Excluir definitivamente'}</button>
      <button onClick={onClose} className="btn btn-blue btn-sm mt-2 w-full">Quero continuar jogando</button>
    </Sheet>
  );
}
