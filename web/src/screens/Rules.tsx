import { useAuth } from '../store/auth';
import { Section } from '../components/ui';
import { money as fmt } from '../lib/format';

export function RulesScreen() {
  const meta = useAuth((s) => s.meta);
  const me = useAuth((s) => s.me)!;
  const min = (ms: number) => `${Math.round(ms / 60000)} min`;
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-poster text-3xl uppercase text-chalk">Como jogar</h1>
      <Section title="Os chutes">
        <ul className="flex flex-col gap-2 text-sm text-chalk/90">
          <li><b className="text-turf">Chute direto</b> — com o app aberto, sai sozinho quando recarrega. Sempre gol: +{fmt(meta?.money.AUTO ?? 10)}.</li>
          <li><b className="text-flood">Pênalti</b> — escolha esquerda, meio ou direita. O goleiro pula pra um canto. +{fmt(meta?.money.PENALTY ?? 20)}.</li>
          <li><b className="text-sky-300">Falta</b> — por fora da barreira ou por cima. Libera no nível 1. +{fmt(meta?.money.FOUL ?? 30)}.</li>
          <li><b className="text-orange-400">Trilha</b> — drible a defesa, o meio e o ataque tocando em um jogador por linha. Um deles rouba a bola. Libera no nível 3. +{fmt(meta?.money.TRAIL ?? 40)}.</li>
          <li><b className="text-flood">Party GoL</b> — a roleta: aposta {fmt(meta?.money.PARTY_BET ?? 50)}, acertou leva {fmt(meta?.money.PARTY_PRIZE ?? 150)}.</li>
        </ul>
      </Section>
      <Section title="Recargas">
        <table className="w-full text-sm"><thead className="text-[10px] uppercase text-haze"><tr><th className="text-left">Modo</th><th>Normal</th><th>VIP</th></tr></thead>
          <tbody className="text-chalk">
            {meta && (['AUTO', 'PENALTY', 'FOUL', 'TRAIL'] as const).map((k) => <tr key={k} className="border-t border-line/50"><td className="py-1">{{ AUTO: 'Chute direto', PENALTY: 'Pênalti', FOUL: 'Falta', TRAIL: 'Trilha' }[k]}</td><td className="text-center">{min(meta.cooldowns[k].normal)}{k === 'TRAIL' && ' → 5'}</td><td className="text-center text-sky-300">{min(meta.cooldowns[k].vip)}{k === 'TRAIL' && ' → 2:30'}</td></tr>)}
          </tbody></table>
        <p className="mt-2 text-xs text-haze">Os níveis descontam segundos da Trilha. A artilharia da hora fecha em toda hora cheia; a rodada, às 19:00.</p>
      </Section>
      <Section title="Dinheiro, destreza e nerf">
        <p className="text-sm text-chalk/90">Cada ponto de <b>destreza</b> ({fmt(meta?.money.DEXTERITY_PRICE ?? 1000)}) soma +1% de acerto em pênaltis e faltas, até {meta?.dexterityMax ?? 30}. A partir do nível {meta?.nerfMinLevel ?? 14} você pode <b>nerfar</b> a destreza de outro jogador por {fmt(meta?.money.NERF_PRICE ?? 1000)} — e também pode ser nerfado.</p>
      </Section>
      <Section title="Premiações">
        <ul className="text-sm text-chalk/90">
          <li>1º da rodada: R$ 30 mil + 5 VIP · 2º–5º: R$ 15 mil · 6º–10º: R$ 7 mil</li>
          <li>1º da temporada: R$ 300 mil + 40 VIP · 2º–5º: R$ 150 mil · 6º–10º: R$ 70 mil</li>
          <li>Recorde da rodada na temporada: 20 VIP</li>
          <li>Campeão da Série A: 25 VIP para a torcida · vice 20 · B 20/15 · C 15/10</li>
        </ul>
      </Section>
      <Section title="Níveis">
        <table className="w-full text-xs"><thead className="text-[10px] uppercase text-haze"><tr><th className="text-left">Lvl</th><th className="text-left">Nome</th><th>Gols</th><th className="text-left">Habilidade</th></tr></thead>
          <tbody>{meta?.levels.map((l) => <tr key={l.lvl} className={`border-t border-line/40 ${l.lvl === me.level.lvl ? 'bg-turf/10 text-turf' : 'text-chalk/90'}`}><td className="py-1">{l.lvl}</td><td>{l.name}</td><td className="text-center">{l.goals.toLocaleString('pt-BR')}</td><td className="text-haze">{l.skill ?? '—'}</td></tr>)}</tbody></table>
      </Section>
    </div>
  );
}
