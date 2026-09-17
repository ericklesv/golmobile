/**
 * "Isso aqui é código, não é conversa" — filtro para o texto que o jogador escreve (chat e texto pessoal).
 *
 * Pedido do dono em 17/09/2026, depois de um jogador encher o chat com `<script>alert(1)</script>` e uma
 * série de injeções de SQL (`' OR '1'='1`, `' UNION SELECT NULL--`, `@@version`…). Nada daquilo fazia efeito
 * — o jogo não mostra HTML cru e o Prisma parametriza as consultas —, mas aparecia para todo mundo no chat.
 *
 * A regra é conservadora de propósito: só barra o que NÃO aparece numa conversa de futebol. Aspas soltas,
 * ponto e vírgula, "1 x 0", "5 > 3" e a palavra "união" continuam passando; o que barra é tag de HTML,
 * evento de JavaScript, comando de SQL e coisas do tipo. Devolve o MOTIVO (para o aviso do Telegram) ou null.
 */

const REGRAS = [
  // HTML/JS: <script>, <img onerror=…>, <iframe>, etc.
  { tipo: 'tag HTML', re: /<\s*\/?\s*(script|img|iframe|svg|style|link|meta|object|embed|form|input|body|html|a)\b/i },
  { tipo: 'evento de JavaScript', re: /\bon(error|load|click|mouseover|focus|submit)\s*=/i },
  { tipo: 'javascript:', re: /\bjavascript\s*:/i },
  { tipo: 'data: com HTML', re: /\bdata:\s*text\/html/i },
  // SQL
  { tipo: 'UNION SELECT', re: /\bunion\s+(all\s+)?select\b/i },
  { tipo: 'SELECT … FROM', re: /\bselect\b[\s\S]{0,40}\bfrom\b/i },
  { tipo: 'comando de SQL', re: /\b(drop|truncate)\s+(table|database)\b|\bdelete\s+from\b|\binsert\s+into\b|\bupdate\s+\w+\s+set\b|\balter\s+table\b/i },
  // `' OR '1'='1`, `" and "a"="a`, `' or 1=1` — aspas, OR/AND em inglês e uma igualdade (com ou sem aspas)
  { tipo: 'tautologia de SQL', re: /['"]\s*(or|and)\s+['"]?\w+['"]?\s*=\s*['"]?\w+/i },
  { tipo: 'função de banco', re: /@@version|\bcurrent_user\b|\bcurrent_database\s*\(|\bpg_sleep\s*\(|\binformation_schema\b|\bxp_cmdshell\b|\bsleep\s*\(\s*\d/i },
  { tipo: 'comentário de SQL depois de aspas', re: /['"][^'"]*--\s*$/ },
  // Molde de template (Angular/Vue/JS) e caminho de arquivo
  { tipo: 'molde de template', re: /\{\{[\s\S]*\}\}|\$\{[\s\S]*\}/ },
  { tipo: 'caminho de arquivo', re: /\.\.[\\/]\.\.[\\/]/ },
];

/** Devolve o motivo ('tag HTML', 'UNION SELECT'…) quando o texto parece código; null quando é conversa. */
export function pareceCodigo(texto) {
  const t = String(texto ?? '');
  if (!t.trim()) return null;
  for (const r of REGRAS) if (r.re.test(t)) return r.tipo;
  return null;
}

/** A mesma frase para o jogador nos dois lugares (chat e texto pessoal). */
export const RECADO_CODIGO = 'Essa mensagem parece código de programação e não pode ser enviada. Escreva normalmente — aqui é papo de futebol.';
