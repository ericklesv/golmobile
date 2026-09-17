-- Árvore de habilidades refeita no mesmo dia (dono, 17/09/2026): cada habilidade passou de 9/11/7 degraus
-- para 18 degraus pequenos, então o que valia um degrau antes não vale o mesmo agora. Todo mundo volta ao
-- zero e recebe TODOS os pontos de volta (os pontos disponíveis são nível − skillPoints), para reescolher
-- onde investir com as regras novas. Ninguém perde nada: o que foi pago em dinheiro/VIP é devolvido em
-- dobro pelo scripts/devolver-habilidades.js.
UPDATE "User"
   SET "skillAim" = 0, "skillShot" = 0, "skillCd" = 0, "skillLuck" = 0, "skillPoints" = 0
 WHERE "skillAim" > 0 OR "skillShot" > 0 OR "skillCd" > 0 OR "skillLuck" > 0 OR "skillPoints" > 0;
