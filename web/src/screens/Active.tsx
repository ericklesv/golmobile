import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { ActivePlayer } from '../lib/types';
import { Shield } from '../components/Shield';
import { Avatar } from '../components/Avatar';
import { Panel, Spinner, Empty } from '../components/ui';
import { timeAgo } from '../lib/format';

export function ActiveScreen() {
  const [rows, setRows] = useState<ActivePlayer[] | null>(null);
  useEffect(() => { api.activePlayers().then(setRows).catch(() => setRows([])); }, []);
  const online = rows?.filter((r) => r.online).length ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center"><div className="ribbon ribbon-green ribbon-lg">JOGADORES ATIVOS</div></div>
      <p className="t-display t-out -mt-1 text-center text-[13px]">{rows ? `${rows.length} nas últimas 24 h · ${online} online agora` : ''}</p>
      <Panel title="QUEM ESTÁ JOGANDO" ribbon="blue">
        {rows === null ? <div className="flex justify-center py-8"><Spinner /></div> : rows.length === 0 ? <Empty text="Ninguém entrou nas últimas 24 h." /> : (
          <ul className="flex flex-col gap-1">
            {rows.map((r) => (
              <li key={r.nick}>
                <Link to={`/jogador/${encodeURIComponent(r.nick)}`} className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-sky/10">
                  <div className="relative"><Avatar url={r.avatarUrl} size={36} />{r.online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-grass" />}</div>
                  <Shield team={r.team} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[15px] font-extrabold ${r.vip ? 'text-sky-deep' : 'text-navy-ink'}`}>{r.nick}{r.vip && <img src="/ui/ico-crown_silver.png" className="ico ml-1 h-4 w-4" alt="VIP" />}</div>
                    <div className="text-[11px] font-bold text-muted">{r.team?.name} · {r.goalsTotal} gols · {r.online ? 'online agora' : `visto há ${timeAgo(r.lastSeenAt)}`}</div>
                  </div>
                  <span className="font-display text-base text-grass-deep">{r.goalsRound}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="text-center text-[11px] font-bold text-white/80">Número à direita = gols na rodada atual</p>
    </div>
  );
}
