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
  const pts = meta?.termo.levelPoints ?? [30, 25, 20, 15, 10, 5];
  const termoPoints = `+${pts[0]} na 1ª tentativa, caindo até +${pts[pts.length - 1]} na ${pts.length}ª`;
  const tp = meta?.prizes?.team ?? { A: { champion: 25, runnerUp: 20 }, B: { champion: 20, runnerUp: 15 }, C: { champion: 15, runnerUp: 10 } };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center"><div className="ribbon ribbon-blue ribbon-lg">COMO JOGAR</div></div>
      <Panel title="OS CHUTES" ribbon="orange">
        <ul className="flex flex-col gap-2 text-[13px] font-bold text-navy-ink">
          <li><b className="text-grass-deep">Chute direto</b> — com o app aberto, sai sozinho quando recarrega. Sempre gol: +{fmt(meta?.money.AUTO ?? 10)}.</li>
          <li><b className="text-gold-deep">Pênalti</b> — escolha esquerda, meio ou direita. O goleiro pula pra um canto. +{fmt(meta?.money.PENALTY ?? 20)}.</li>
          <li><b className="text-sky-deep">Falta</b> — por fora da barreira ou por cima. +{fmt(meta?.money.FOUL ?? 30)}.</li>
          <li><b className="text-orange-deep">Trilha</b> — drible a defesa, o meio e o ataque tocando em um jogador por linha. {thieves ? `Roubam a bola: ${thieves}.` : 'Em cada linha, alguém rouba a bola.'} +{fmt(meta?.money.TRAIL ?? 40)}.</li>
          <li><b className="text-gold-deep">Party GoL</b> — a roleta: aposta {fmt(meta?.money.PARTY_BET ?? 50)}, acertou leva {fmt(meta?.money.PARTY_PRIZE ?? 150)}.</li>
          <li><b className="text-grass-deep">Termo do dia</b> — uma palavra de futebol por dia (renova à meia-noite), {meta?.termo.tries ?? 6} tentativas. Acertou, é gol do seu time e ganha pontos de nível: {termoPoints}.</li>
          <li><b className="text-orange-deep">Estatísticas</b> — quem tem mais? Jogadores do {meta?.stats.season ?? 'Brasileirão 2024'} e duelos da história do Brasileirão. Acertou, segue; errou, acaba. Uma partida por dia (renova às 13h, libera no nível 3): +{meta?.stats.pointsPerHit ?? 3} de nível por acerto (até +{meta?.stats.maxPoints ?? 30}); {meta?.stats.goalAt ?? 5} seguidos é gol.</li>
          <li><b className="text-grass-deep">Camisas</b> — a próxima camisa tem número maior ou menor? São {meta?.camisas?.shirts ?? 4} camisas de {meta?.camisas?.min ?? 1} a {meta?.camisas?.max ?? 11}, sem repetir. Acertou todas, é gol e vem outra sequência: vale até errar, então dá para marcar vários gols no dia. Uma partida por dia (renova às {meta?.resetHour?.CAMISAS ?? 16}h, libera no nível 5): +{meta?.camisas?.pointsPerHit ?? 3} de nível por acerto (até +{meta?.camisas?.maxPoints ?? 30}).</li>
          <li><b className="text-orange-deep">Hat Trick</b> — chute de longe: toque na bola e puxe pra trás (direção e força), depois toque em cima da bola que passa (centro: reta; lado: curva pro outro lado; embaixo: sobe). O vento empurra e o goleiro pula. 3 vidas; cada gol é gol do seu time, +{meta?.hattrick?.pointsPerGoal ?? 5} de nível (até +{meta?.hattrick?.maxPoints ?? 30}). Três gols é hat trick! Renova às {meta?.resetHour?.HATTRICK ?? 18}h, libera no nível 7.</li>
          <li><b className="text-gold-deep">Falta PRO</b> — cobrança de falta em 3D: arraste a partir da bola (pro lado dá direção, pra cima dá altura), arraste rápido pra dar força e desenhe um arco pra dar efeito e curvar por fora da barreira — que às vezes pula (rasteira passa por baixo!). São {meta?.faltapro?.kicks ?? 5} cobranças por dia (renova às {meta?.resetHour?.FALTAPRO ?? 19}h, libera no nível 8): {meta?.faltapro?.goalAt ?? 3} gols valem 1 gol do seu time, +{meta?.faltapro?.pointsPerGoal ?? 4} de nível por conversão (até +{meta?.faltapro?.maxPoints ?? 20}); acertar o aro dourado do ângulo dá +{fmt(meta?.faltapro?.targetMoney ?? 50)}.</li>
          <li><b className="text-orange-deep">X1</b> — um jogo 1x1 ao vivo por dia, que troca às {meta?.x1?.today?.switchHour ?? 20}h: <b>FutPrego</b> (futebol de prego, uma vez de cada: arraste para trás e solte, e a bola quica nos pregos; sem gol em {meta?.futprego?.maxTurns ?? 10} jogadas de cada, o dinheiro volta) e <b>Futebol de Botão</b> (na sua vez, {meta?.x1?.botao.snapsPerTurn ?? 2} petelecos num botão seu; o primeiro gol acaba a partida; sem gol em {meta?.x1?.botao.maxTurns ?? 9} vezes, pênaltis). Quem desafia espera alguém aceitar (quem está nas telas do jogo recebe o convite). Cada um põe {fmt(meta?.futprego?.bet ?? 200)}; quem vencer leva {fmt((meta?.futprego?.bet ?? 200) * 2)} e 1 gol para o time, e o time do outro perde 1 gol na rodada. Cada jogador ganha no máximo {meta?.futprego?.maxGoalsPerHour ?? 10} gols por hora no X1, e o time perde no máximo {meta?.futprego?.maxGoalsPerHour ?? 10} por hora por causa dele; ganhar da mesma pessoa duas vezes seguidas, a segunda não vale gol. Toda partida de verdade conta no Ranking X1 (rodada, temporada e geral, com prêmios): vitória +{meta?.futprego?.points?.win ?? 3}, empate +{meta?.futprego?.points?.draw ?? 1}, derrota {meta?.futprego?.points?.loss ?? -2}. Quem não é VIP espera {Math.round((meta?.futprego?.challengeCooldownSec ?? 120) / 60)} minutos depois de cada partida para desafiar de novo (aceitar desafio pode na hora); VIP joga o X1 sem esperar. Times e internets diferentes. Libera para todos.</li>
          <li><b className="text-grass-deep">Ganha ou Perde</b> — a roleta do GANHA e do PERDE. A primeira girada tem {meta?.ganhaperde?.start ?? 50}% de GANHA; se quiser, pague para aumentar de {meta?.ganhaperde?.step ?? 5} em {meta?.ganhaperde?.step ?? 5} até {meta?.ganhaperde?.max ?? 75}% (quanto mais chance, mais caro). Caiu no GANHA: gol do seu time, +{meta?.ganhaperde?.pointsPerHit ?? 5} de nível e gira de novo, mas a chance de graça cai {meta?.ganhaperde?.drop ?? 5}% e aumentar fica mais caro. Caiu no PERDE: acabou por hoje. O dinheiro não compra gol, só aumenta a chance. Renova às {meta?.resetHour?.GANHAPERDE ?? 21}h, libera no nível 9.</li>
          <li><b className="text-sky-deep">Quiz do dia</b> — {meta?.quiz.questions ?? 5} perguntas de futebol com 4 alternativas, {meta?.quiz.seconds ?? 20} segundos cada (renova ao meio-dia). Cada acerto: +{meta?.quiz.pointsPerHit ?? 6} de nível; com {meta?.quiz.goalAt ?? 3} acertos, é gol do seu time.</li>
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
          <li>Time campeão e vice: VIP para cada jogador que marcou pelo time na temporada — Série A {tp.A.champion}/{tp.A.runnerUp} · B {tp.B.champion}/{tp.B.runnerUp} · C {tp.C.champion}/{tp.C.runnerUp}</li>
        </ul>
      </Panel>
      <Panel title="NÍVEIS" ribbon="orange">
        <p className="mb-2 text-[12px] font-bold text-muted">Cada gol vale 1 ponto de nível. O Termo do dia dá pontos extras.</p>
        <table className="w-full text-[12px] font-bold"><thead className="label"><tr><th className="text-left">Lvl</th><th className="text-left">Nome</th><th>Pontos</th><th className="text-left">Habilidade</th></tr></thead>
          <tbody>{meta?.levels.map((l) => <tr key={l.lvl} className={`border-t border-sky/20 ${l.lvl === me.level.lvl ? 'bg-gold/30 text-orange-deep' : 'text-navy-ink'}`}><td className="py-1">{l.lvl}</td><td>{l.name}</td><td className="text-center">{l.goals.toLocaleString('pt-BR')}</td><td className="text-muted">{l.skill ?? '—'}</td></tr>)}</tbody></table>
      </Panel>
    </div>
  );
}
