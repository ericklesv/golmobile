import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import type { VipPack, VipPurchase, VipState } from '../lib/types';
import { Panel, Countdown, Spinner } from '../components/ui';
import { CartoonBall } from '../components/TrailBall';
import { toast } from '../components/Toast';
import { sound } from '../lib/sound';
import { isTwa } from '../lib/twa';
import { timeLeft, untilLabel } from '../lib/format';
import { useVipLeft } from '../components/VipBar';

/**
 * VIP — situação do VIP do jogador (ativo até quando + VIPs guardados + ativar), o que o VIP dá, os pacotes
 * de dias e a janela do PIX (Efí). O servidor confere o pagamento; a tela só pergunta a cada 4 s.
 */

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (ms: number) => new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const PERKS: { icon: React.ReactNode; title: string; text: string; offline?: boolean }[] = [
  { offline: true, icon: <svg viewBox="-11 -11 22 22" className="h-9 w-9"><CartoonBall r={10} /></svg>, title: 'Gol com o app fechado', text: 'O chute direto sai sozinho a cada 5 minutos, mesmo com o JogaGol fechado.' },
  { icon: <img src="/ui/ico-x1.svg" alt="" className="h-9 w-9" />, title: 'X1 ilimitado', text: 'Desafie no X1 quantas vezes quiser. Sem VIP, é preciso esperar 2 minutos depois de cada partida para desafiar de novo.' },
  { icon: <img src="/ui/ico-energy.png" alt="" className="h-9 w-9" />, title: 'Recargas pela metade', text: 'Chute direto, pênalti, falta e trilha voltam na metade do tempo.' },
  { icon: <img src="/ui/ico-chat.png" alt="" className="h-9 w-9" />, title: 'Nome azul e selo VIP', text: 'No chat, nos rankings e no seu perfil.' },
  { icon: <span className="t-display text-[22px] leading-none" style={{ backgroundImage: 'linear-gradient(90deg, #2EA8FF, #E0479E)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent' }}>Aa</span>, title: 'Nick em degradê', text: 'Escolha duas cores no seu perfil e seu nome aparece com o fade no chat, nos rankings e na página do jogador.' },
  { icon: <img src="/ui/ico-goldpouch.png" alt="" className="h-9 w-9" />, title: 'Moeda da loja', text: 'Itens da loja também saem por VIP.' },
];

export function VipScreen() {
  const setMe = useAuth((s) => s.setMe);
  const refresh = useAuth((s) => s.refresh);
  const [st, setSt] = useState<VipState | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const twa = isTwa(); // app da Play Store: sem PIX (ver lib/twa.ts)
  const [checkout, setCheckout] = useState<VipPurchase | null>(null);
  const [days, setDays] = useState(1);
  const [activating, setActivating] = useState(false);
  const vipLeft = useVipLeft();

  const load = () => api.vip().then((s) => { setSt(s); setDays((d) => Math.max(1, Math.min(d, s.vip.bank || 1))); }).catch((e) => toast((e as Error).message, 'error'));
  useEffect(() => { load(); }, []);

  async function buy(p: VipPack) {
    if (buying) return;
    setBuying(p.key);
    try { setCheckout((await api.vipBuy(p.key)).purchase); } catch (e) { toast((e as Error).message, 'error'); } finally { setBuying(null); }
  }
  async function activate(n: number) {
    if (activating || n < 1) return;
    setActivating(true);
    try {
      const u = await api.activateVip(n);
      setMe(u);
      toast(u.vipUntil ? `VIP ativado! Agora vai até ${untilLabel(new Date(u.vipUntil).getTime())}.` : `VIP ativado por ${n} ${n === 1 ? 'dia' : 'dias'}!`, 'success');
      sound.play('coin');
      await load();
    }
    catch (e) { toast((e as Error).message, 'error'); } finally { setActivating(false); }
  }
  function paid(bank: number) { refresh(); load(); setDays(bank); }

  if (!st) return <div className="flex justify-center py-10"><Spinner /></div>;
  const bank = st.vip.bank;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center"><div className="ribbon ribbon-yellow ribbon-lg"><img src="/ui/ico-crown_silver.png" className="mr-2 h-9 w-9" alt="" />VIP</div></div>

      <section className="panel-navy">
        <div className="flex items-center gap-3">
          <img src="/ui/ico-crown_silver.png" alt="" className={`h-14 w-14 shrink-0 ${st.vip.active ? '' : 'opacity-60 grayscale'}`} />
          <div className="min-w-0 flex-1">
            <div className="t-display t-out text-[20px] leading-tight">{vipLeft > 0 && st.vip.until ? `VIP ativo por mais ${timeLeft(vipLeft)}` : 'Você ainda não é VIP'}</div>
            {vipLeft > 0 && st.vip.until && <div className="text-[13px] font-extrabold text-sky-light">Até {untilLabel(st.vip.until)}</div>}
            <div className="text-[13px] font-extrabold text-white/85">{bank} {bank === 1 ? 'VIP guardado' : 'VIPs guardados'}. Cada VIP vale 1 dia.</div>
          </div>
        </div>
        {bank > 0 ? (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center overflow-hidden rounded-xl bg-white/15">
              <button onClick={() => setDays((d) => Math.max(1, d - 1))} className="t-display h-11 w-10 text-[22px] text-white" aria-label="Menos um dia">−</button>
              <span className="t-display w-12 text-center text-[20px] tabular-nums text-white">{days}</span>
              <button onClick={() => setDays((d) => Math.min(bank, d + 1))} className="t-display h-11 w-10 text-[22px] text-white" aria-label="Mais um dia">+</button>
            </div>
            <button onClick={() => activate(days)} disabled={activating} className="btn btn-green btn-md flex-1">Ativar {days} {days === 1 ? 'dia' : 'dias'}</button>
          </div>
        ) : (
          <p className="mt-2 text-[12px] font-bold text-white/80">Compre um pacote abaixo: os dias ficam guardados e você ativa quando quiser.</p>
        )}
      </section>

      {st.pending && !checkout && (
        <button onClick={() => setCheckout(st.pending)} className="card-orange flex items-center justify-between gap-3 text-left" style={{ borderRadius: 18 }}>
          <span className="text-[13px] font-extrabold leading-snug text-white">Você tem um PIX de {brl(st.pending.amount)} ({st.pending.days} dias) esperando pagamento.</span>
          <span className="btn btn-yellow btn-sm shrink-0">Ver PIX</span>
        </button>
      )}

      <Panel title="O QUE O VIP DÁ" ribbon="blue">
        <ul className="flex flex-col gap-2">
          {PERKS.filter((p) => !p.offline || st.offlineAuto).map((p) => (
            <li key={p.title} className="flex items-center gap-3 rounded-xl bg-sky/10 p-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center">{p.icon}</span>
              <div className="min-w-0">
                <div className="t-display text-[15px] text-navy-ink">{p.title}</div>
                <div className="text-[12px] font-bold leading-snug text-muted">{p.text}</div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {twa ? (
        // App da Play Store: a compra aqui dentro será pelo Google Play Billing (docs/PLAY_STORE.md);
        // a política do Google não permite mostrar o PIX nem apontar para o site.
        <Panel title="PACOTES" ribbon="green">
          <p className="rounded-xl bg-gold/25 p-2 text-center text-[12px] font-extrabold text-navy-ink">A compra de dias de VIP dentro do app chega em breve. Os VIPs que você já tem continuam valendo aqui.</p>
        </Panel>
      ) : (
      <Panel title="PACOTES" ribbon="green">
        {!st.enabled && <p className="mb-2 rounded-xl bg-gold/25 p-2 text-center text-[12px] font-extrabold text-navy-ink">A compra por PIX abre em breve.</p>}
        <div className="grid grid-cols-2 gap-2">
          {st.packs.map((p) => (
            <div key={p.key} className={`relative flex flex-col items-center rounded-2xl border-2 bg-white px-2 pb-2 pt-4 text-center ${p.tag ? 'border-gold' : 'border-sky/30'}`}>
              {p.tag && <span className="trap trap-orange absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px]">{p.tag}</span>}
              <div className="t-display leading-none text-navy-ink"><span className="text-[40px] tabular-nums">{p.days}</span></div>
              <div className="t-display text-[14px] text-muted">dias de VIP</div>
              <div className="t-display mt-1 text-[22px] text-orange-deep">{brl(p.price)}</div>
              <div className="text-[11px] font-extrabold text-muted">{brl(p.perDay)} por dia</div>
              <button onClick={() => buy(p)} disabled={!st.enabled || !!buying} className="btn btn-green btn-sm mt-2 w-full">{buying === p.key ? 'Gerando…' : 'Comprar com PIX'}</button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] font-bold text-muted">Pagamento por PIX. Os VIPs entram na sua conta assim que o PIX é confirmado.</p>
      </Panel>
      )}

      {st.history.length > 0 && (
        <Panel title="SUAS COMPRAS" ribbon="orange">
          <ul className="flex flex-col gap-1 text-[13px] font-extrabold text-navy-ink">
            {st.history.map((h) => <li key={h.id} className="flex justify-between rounded-lg bg-sky/10 px-2 py-1"><span>{h.days} dias de VIP</span><span className="text-muted">{brl(h.amount)} · {h.paidAt ? when(h.paidAt) : ''}</span></li>)}
          </ul>
        </Panel>
      )}

      <AnimatePresence>
        {checkout && <PixModal key={checkout.id} purchase={checkout} test={st.test} onClose={() => { setCheckout(null); load(); }} onPaid={paid} onActivate={(n) => { setCheckout(null); activate(n); }} />}
      </AnimatePresence>
    </div>
  );
}

/** Janela do PIX: QR, copia e cola, validade e "aguardando" — pergunta ao servidor a cada 4 s. */
function PixModal({ purchase, test, onClose, onPaid, onActivate }: { purchase: VipPurchase; test: boolean; onClose: () => void; onPaid: (bank: number) => void; onActivate: (days: number) => void }) {
  const [p, setP] = useState(purchase);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (p.status !== 'PENDING') return;
    const iv = setInterval(async () => {
      try {
        const r = await api.vipPurchase(p.id);
        if (r.purchase.status !== 'PENDING') { setP(r.purchase); if (r.purchase.status === 'PAID') { sound.play('goal'); onPaid(r.bank); } }
      } catch {}
    }, 4000);
    return () => clearInterval(iv);
  }, [p.id, p.status]);

  async function copy() {
    try { await navigator.clipboard.writeText(p.pixCode ?? ''); setCopied(true); toast('Código PIX copiado! Cole no app do seu banco.', 'success'); }
    catch { toast('Não deu para copiar. Toque e segure no código para copiar.', 'error'); }
  }
  async function testPay() {
    try { const r = await api.vipTestPay(p.id); setP(r.purchase); if (r.purchase.status === 'PAID') { sound.play('goal'); onPaid(r.bank); } } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-labelledby="pix-title"
      className="fixed inset-y-0 left-1/2 z-[92] flex w-full max-w-[480px] -translate-x-1/2 flex-col overflow-y-auto bg-navy-deep/85 backdrop-blur-[2px]">
      <div className="relative m-auto w-full max-w-sm px-4 py-6">
        <div className="panel text-center text-navy-ink">
          {p.status === 'PAID' ? (
            <>
              <motion.div initial={{ scale: 0.4 }} animate={{ scale: [0.4, 1.12, 1] }} id="pix-title" className="ribbon ribbon-green mx-auto -mt-1 w-[90%]">PIX CONFIRMADO!</motion.div>
              <img src="/ui/ico-crown_silver.png" alt="" className="mx-auto mt-3 h-20 w-20" />
              <div className="t-display text-[30px] text-grass-deep">+{p.days} VIP</div>
              <p className="text-[13px] font-extrabold">Os dias já estão guardados na sua conta.</p>
              <button onClick={() => onActivate(p.days)} className="btn btn-green btn-lg mt-4 w-full">Ativar {p.days} dias agora</button>
              <button onClick={onClose} className="btn btn-blue btn-md mt-2 w-full">Guardar para depois</button>
            </>
          ) : p.status === 'PENDING' ? (
            <>
              <div id="pix-title" className="t-display text-[20px]">{p.days} dias de VIP</div>
              <div className="t-display text-[26px] text-orange-deep">{brl(p.amount)}</div>
              <div className="mx-auto mt-2 flex h-56 w-56 items-center justify-center rounded-2xl border-2 border-sky/30 bg-white p-2">
                {p.qrImage
                  ? <img src={`data:image/png;base64,${p.qrImage}`} alt="QR code do PIX" className="h-full w-full" />
                  : <span className="text-[13px] font-extrabold text-muted">QR de teste<br />(Efí simulada)</span>}
              </div>
              <p className="mt-2 text-[12px] font-bold text-muted">Abra o app do seu banco e pague com o QR ou com o código abaixo.</p>
              <div className="mt-2 break-all rounded-xl bg-sky/10 p-2 text-left font-mono text-[11px] leading-snug text-navy-ink select-all">{p.pixCode}</div>
              <button onClick={copy} className="btn btn-green btn-md mt-2 w-full">{copied ? 'Copiado!' : 'Copiar código PIX'}</button>
              <div className="mt-3 flex items-center justify-center gap-2 text-[13px] font-extrabold">
                <Spinner className="h-4 w-4" /> Aguardando o pagamento…
              </div>
              <p className="text-[12px] font-bold text-muted">O código vale mais <Countdown readyAt={p.expiresAt} className="text-orange-deep" />. Pode fechar: quando o PIX cair, os VIPs entram sozinhos.</p>
              {test && <button onClick={testPay} className="btn btn-yellow btn-sm mt-3 w-full">Simular pagamento (teste)</button>}
              <button onClick={onClose} className="btn btn-blue btn-md mt-2 w-full">Fechar</button>
            </>
          ) : (
            <>
              <div id="pix-title" className="t-display text-[20px]">Este PIX venceu</div>
              <p className="mt-1 text-[13px] font-bold text-muted">Ninguém pagou dentro do prazo. Gere outro no pacote que quiser.</p>
              <button onClick={onClose} className="btn btn-orange btn-md mt-4 w-full">Voltar aos pacotes</button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
