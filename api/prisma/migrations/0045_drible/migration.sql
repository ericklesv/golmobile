-- Drible (dono, 22/10/2026): o rebote da Trilha sai dos níveis 25 a 32 e vira a 5ª habilidade da Loja, com 6 degraus
-- até os mesmos 32% (degrau de 32%/6 ≈ 5,3 p.p.). "Quem já tem perde e ganha pontos, podendo upar na loja e ficar com
-- a mesma coisa": cada um recebe os pontos que levam o Drible a PELO MENOS o rebote que o nível dava.
ALTER TABLE "User" ADD COLUMN "skillDribble" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "skillPointsBonus" INTEGER NOT NULL DEFAULT 0;

-- Rebote da Trilha que o nível dava (REBOUND_CHANCE[reboundLevel(lvl, 'TRAIL')] do rules.js de antes), pelos pontos de
-- nível (goalsTotal + levelBonus) nos limites da tabela LEVELS: 25 = 4.993 … 29 = 10.000, 30 = 20.000, 31 = 35.000,
-- 32 = 55.000. Pontos = menor número de degraus do Drible que chega a esse rebote: CEIL(antes × 6 / 32).
CREATE TEMP TABLE drible_devolucao AS
SELECT id, nick, "isBot", antes, CEIL(antes * 6 / 32.0)::int AS pontos
  FROM (
    SELECT id, nick, "isBot",
           CASE WHEN p >= 55000 THEN 32 WHEN p >= 35000 THEN 27 WHEN p >= 20000 THEN 22 WHEN p >= 10000 THEN 17
                WHEN p >= 7394 THEN 14 WHEN p >= 6379 THEN 11 WHEN p >= 5618 THEN 8 WHEN p >= 4993 THEN 5 ELSE 0 END AS antes
      FROM (SELECT id, nick, "isBot", "goalsTotal" + "levelBonus" AS p FROM "User" WHERE "deletedAt" IS NULL) pts
  ) reb
 WHERE antes > 0;

UPDATE "User" u SET "skillPointsBonus" = u."skillPointsBonus" + d.pontos FROM drible_devolucao d WHERE u.id = d.id;

-- Aviso na caixa (bots não recebem mensagem).
INSERT INTO "Message" ("userId", kind, icon, title, text)
SELECT id, 'PRESENTE', '/ui/ico-badge.png',
       'Rebote da Trilha virou habilidade: +' || pontos || CASE WHEN pontos = 1 THEN ' ponto' ELSE ' pontos' END,
       'Oi, ' || nick || E'! O rebote da Trilha (quando um ladrão rouba a bola e ela sobra pra você) não vem mais com o nível: agora é a habilidade Drible, na Loja, com 6 degraus e até 32% de rebote.\n\n'
       || 'Pelo seu nível você tinha ' || antes || '% de rebote na Trilha. Para não sair perdendo, você ganhou ' || pontos
       || CASE WHEN pontos = 1 THEN ' ponto' ELSE ' pontos' END || ' de habilidade: subindo o Drible '
       || pontos || CASE WHEN pontos = 1 THEN ' degrau' ELSE ' degraus' END || ' você fica com '
       || replace(trim_scale(round(pontos * 32 / 6.0, 1))::text, '.', ',') || E'% de rebote — ou use os pontos onde preferir.\n\n'
       || 'Também chegaram 6 níveis novos (73 a 78), para dar para completar todas as habilidades.'
  FROM drible_devolucao
 WHERE NOT "isBot";

DROP TABLE drible_devolucao;
