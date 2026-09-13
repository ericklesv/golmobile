import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { Panel } from '../components/ui';
import { toast } from '../components/Toast';
import { money as fmt } from '../lib/format';

interface Item { icon: string; title: string; desc: string; price: string; action?: () => Promise<void>; disabled?: boolean; cta?: string; soon?: boolean }

export function ShopScreen() {
  const me = useAuth((s) => s.me)!;
  const meta = useAuth((s) => s.meta);
  const setMe = useAuth((s) => s.setMe);
  const [busy, setBusy] = useState<string | null>(null);
  const dexPrice = meta?.money.DEXTERITY_PRICE ?? 1000;
  const dexMax = meta?.dexterityMax ?? 30;

  async function run(key: string, fn: () => Promise<void>) {
    if (busy) return; setBusy(key);
    try { await fn(); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  }

  const player: Item[] = [
    { icon: '/ui/ico-energy.png', title: 'Destreza', desc: `+1% de acerto em pênaltis e faltas por ponto (você tem ${me.dexterity}/${dexMax}).`, price: fmt(dexPrice), cta: '+1',
      disabled: me.dexterity >= dexMax || me.money < dexPrice, action: async () => { setMe(await api.buyDexterity(1)); toast('+1 destreza!', 'success'); } },
    { icon: '/ui/ico-crown_silver.png', title: 'Ativar VIP (1 dia)', desc: `Recargas pela metade e nick azul. Você tem ${me.vipDays} unidade(s) de VIP${me.vip ? ' · VIP ativo' : ''}.`, price: '1 VIP', cta: 'Ativar',
      disabled: me.vipDays < 1, action: async () => { setMe(await api.activateVip(1)); toast('VIP ativado por 1 dia!', 'success'); } },
  ];
  const soon: Item[] = [
    { icon: '/ui/ico-energy.png', title: 'Energia do chute', desc: 'Níveis 1 a 5: reduz a recarga dos chutes por 28 h.', price: 'em breve', soon: true },
    { icon: '/ui/ico-clearstamp_l.png', title: 'Boost Auto', desc: 'Tira 60 s do chute direto por 28 h.', price: 'em breve', soon: true },
    { icon: '/ui/ico-badge.png', title: 'Caneleira', desc: 'Libera mais casas seguras na última linha da trilha.', price: 'em breve', soon: true },
    { icon: '/ui/ico-star01_s.png', title: 'Chuteiras', desc: 'Bronze → Dourada: +2% a +10% de acerto por 30 dias.', price: 'em breve', soon: true },
    { icon: '/ui/ico-gift_blue.png', title: 'Comprar VIP', desc: 'Pacotes de dias de VIP (Pix).', price: 'em breve', soon: true },
  ];

  const Row = ({ it }: { it: Item }) => (
    <div className={`flex items-center gap-3 rounded-xl bg-sky/10 p-2 ${it.soon ? 'opacity-70' : ''}`}>
      <img src={it.icon} className="h-10 w-10 shrink-0 object-contain" alt="" />
      <div className="min-w-0 flex-1">
        <div className="t-display text-[14px] text-navy-ink">{it.title}</div>
        <div className="text-[11px] font-bold leading-snug text-muted">{it.desc}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="trap trap-orange text-[11px]">{it.price}</span>
        {it.action && <button onClick={() => run(it.title, it.action!)} disabled={it.disabled || busy !== null} className="btn btn-green btn-sm min-w-[64px]">{busy === it.title ? '…' : it.cta}</button>}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center"><div className="ribbon ribbon-yellow ribbon-lg"><img src="/ui/ico-goldpouch.png" className="mr-2 h-9 w-9" alt="" />LOJA</div></div>
      <div className="flex justify-center gap-2">
        <span className="resbar"><img src="/ui/ico-coin01_s.png" className="ico -ml-3 h-8 w-8" alt="" />{fmt(me.money)}</span>
        <span className="resbar"><img src="/ui/ico-crown_silver.png" className="ico -ml-3 h-8 w-8" alt="" />{me.vipDays} VIP</span>
      </div>
      <Panel title="JOGADOR" ribbon="blue"><div className="flex flex-col gap-2">{player.map((it) => <Row key={it.title} it={it} />)}</div></Panel>
      <Panel title="EM BREVE" ribbon="orange"><div className="flex flex-col gap-2">{soon.map((it) => <Row key={it.title} it={it} />)}</div></Panel>
      <Link to="/partygol" className="btn btn-yellow btn-md w-full"><img src="/ui/ico-coin02.png" className="h-6 w-6" alt="" /> Party GoL (roleta)</Link>
      <p className="text-center text-[11px] font-bold text-white/80">Dinheiro vem dos gols e das premiações; VIP vem das premiações de rodada/temporada.</p>
    </div>
  );
}
