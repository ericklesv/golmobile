import { useAuth } from '../store/auth';
import { Panel } from '../components/ui';
import { money as fmt } from '../lib/format';

export function RulesScreen() {
  const meta = useAuth((s) => s.meta);
  const me = useAuth((s) => s.me)!;
  const min = (ms: number) => `${Math.round(ms / 60000)} min`;
  // "1 de 4 na defesa, 1 de 3 no meio e 2 de 3 no ataque" — vem das regras da API
  const where = ['na defesa', 'no meio', 'no ataque'];
  const parts = meta?.trailLines.map((l, i) => `${l.mines} de ${l.total} ${where[i] ?? ''}`.trim()) ?? [];
  const thieves = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center"><div className="ribbon ribbon-blue ribbon-lg">COMO JOGAR</div></div>
      <Panel title="OS CHUTES" ribbon="orange">
        <ul className="flex flex-col gap-2 text-[13px] font-bold text-navy-ink">
          <li><b className="text-grass-deep">Chute direto</b> — com o app aberto, sai sozinho quando recarrega. Sempre gol: +{fmt(meta?.money.AUTO ?? 10)}.</li>
          <li><b className="text-gold-deep">Pênalti</b> — escolha esquerda, meio ou direita. O goleiro pula pra um canto. +{fmt(meta?.money.PENALTY ?? 20)}.</li>
          <li><b className="text-sky-deep">Falta</b> — por fora da barreira ou por cima. Libera no nível 1. +{fmt(meta?.money.FOUL ?? 30)}.</li>
          <li><b className="text-orange-deep">Trilha</b> — drible a defesa, o meio e o ataque tocando em um jogador por linha. {thieves ? `Roubam a bola: ${thieves}.` : 'Em cada linha, alguém rouba a bola.'} Libera no nível 3. +{fmt(meta?.money.TRAIL ?? 40)}.</li>
          <li><b className="text-gold-deep">Party GoL</b> — a roleta: aposta {fmt(meta?.money.PARTY_BET ?? 50)}, acertou leva {fmt(meta?.money.PARTY_PRIZE ?? 150)}.</li>
        </ul>
      </Panel>
      <Panel title="RECARGAS" ribbon="blue">
        <table className="w-full text-[13px] font-extrabold"><thead className="label"><tr><th className="text-left">Modo</th><th>Normal</th><th>VIP</th></tr></thead>
          <tbody className="text-navy-ink">
            {meta && (['AUTO', 'PENALTY', 'FOUL', 'TRAIL'] as const).map((k) => <tr key={k} className="border-t border-sky/20"><td className="py-1">{{ AUTO: 'Chute direto', PENALTY: 'Pênalti', FOUL: 'Falta', TRAIL: 'Trilha' }[k]}</td><td className="text-center">{min(meta.cooldowns[k].normal)}{k === 'TRAIL' && ' → 5'}</td><td className="text-center text-sky-deep">{min(meta.cooldowns[k].vip)}{k === 'TRAIL' && ' → 2:30'}</td></tr>)}
          </tbody></table>
        <p className="mt-2 text-[12px] font-bold text-muted">Os níveis descontam segundos da Trilha. A artilharia da hora fecha em toda hora cheia; a rodada, às 19:00.</p>
      </Panel>
      <Panel title="DINHEIRO, DESTREZA E NERF" ribbon="green">
        <p className="text-[13px] font-bold text-navy-ink">Cada ponto de <b>destreza</b> ({fmt(meta?.money.DEXTERITY_PRICE ?? 1000)}) soma +1% de acerto em pênaltis e faltas, até {meta?.dexterityMax ?? 30}. A partir do nível {meta?.nerfMinLevel ?? 14} você pode <b>nerfar</b> a destreza de outro jogador por {fmt(meta?.money.NERF_PRICE ?? 1000)} — e também pode ser nerfado.</p>
      </Panel>
      <Panel title="PREMIAÇÕES" ribbon="yellow">
        <ul className="text-[13px] font-bold text-navy-ink">
          <li>1º da rodada: R$ 30 mil + 5 VIP · 2º–5º: R$ 15 mil · 6º–10º: R$ 7 mil</li>
          <li>1º da temporada: R$ 300 mil + 40 VIP · 2º–5º: R$ 150 mil · 6º–10º: R$ 70 mil</li>
          <li>Recorde da rodada na temporada: 20 VIP</li>
          <li>Campeão da Série A: 25 VIP · vice 20 · B 20/15 · C 15/10</li>
        </ul>
      </Panel>
      <Panel title="NÍVEIS" ribbon="orange">
        <table className="w-full text-[12px] font-bold"><thead className="label"><tr><th className="text-left">Lvl</th><th className="text-left">Nome</th><th>Gols</th><th className="text-left">Habilidade</th></tr></thead>
          <tbody>{meta?.levels.map((l) => <tr key={l.lvl} className={`border-t border-sky/20 ${l.lvl === me.level.lvl ? 'bg-gold/30 text-orange-deep' : 'text-navy-ink'}`}><td className="py-1">{l.lvl}</td><td>{l.name}</td><td className="text-center">{l.goals.toLocaleString('pt-BR')}</td><td className="text-muted">{l.skill ?? '—'}</td></tr>)}</tbody></table>
      </Panel>
    </div>
  );
}
