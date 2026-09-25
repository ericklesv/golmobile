/**
 * De onde veio quem se cadastrou, em texto para o aviso do Telegram (Guilherme, 25/09/2026: "nas mensagens de cadastro,
 * saber de onde eles vieram — Instagram, Google…"). Junta três pistas, nesta ordem:
 *  1. `origem` que o site guardou da visita de ENTRADA (web/src/lib/track.ts, até 30 dias): `utm_*`/`gclid` do link e
 *     `ref` = o site ou app que mandou a pessoa (document.referrer; no Android, app = "android-app://com.whatsapp");
 *  2. o navegador do cadastro: Instagram, Facebook e TikTok abrem links num navegador próprio que se identifica no
 *     User-Agent (e nesses o referrer costuma vir vazio);
 *  3. o app da Play Store (cabeçalho X-App: twa).
 * Sem nada disso = "direto" (digitou o endereço, favorito, ou link de app que não conta de onde veio).
 * Não é gravado na conta: o evento `cadastro.ok` (tabela Event) já guarda a `origem` para relatório.
 */

const SITES = [
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'Facebook'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X/Twitter'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(whatsapp\.com|wa\.me)$|^com\.whatsapp/, 'WhatsApp'],
  [/(^|\.)(t\.me|telegram\.org)$|^org\.telegram\./, 'Telegram'],
  [/(^|\.)discord(app)?\.com$|^com\.discord$/, 'Discord'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)kwai\.com$|kwai/, 'Kwai'],
  [/^com\.google\.android\.gm$/, 'Gmail'],
  [/(^|\.)bing\.com$/, 'Bing (busca)'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo (busca)'],
  [/(^|\.)yahoo\.com$/, 'Yahoo (busca)'],
  [/(^|\.)google\.[a-z.]+$|^com\.google\.android\.googlequicksearchbox$/, 'Google (busca, sem anúncio)'],
  [/(^|\.)brgol\.online$/, 'site do BRGOL 2.0 (brgol.online)'],
];
const IN_APP = [
  [/Instagram/i, 'Instagram'], [/FBAN|FBAV|FB_IAB|FBIOS/, 'Facebook'], [/musical_ly|BytedanceWebview|TikTok/i, 'TikTok'],
  [/Kwai/i, 'Kwai'], [/Snapchat/i, 'Snapchat'], [/LinkedInApp/i, 'LinkedIn'], [/\bLine\//, 'Line'],
];

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);

/** A `origem` que veio do site, limpa (nunca confiar no formato: é o navegador que manda). */
export function limparOrigem(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const r = { src: str(o.src, 40), med: str(o.med, 40), camp: str(o.camp, 40), term: str(o.term, 40), ref: str(o.ref, 80), gclid: o.gclid === true || undefined };
  return Object.values(r).some(Boolean) ? r : null;
}

/** Texto curto de onde a pessoa veio (sem HTML; quem chama escapa). */
export function fonteDoCadastro({ origem, ua, twa, convite }) {
  const o = limparOrigem(origem) ?? {};
  let fonte;
  if (o.gclid || (o.src === 'google' && o.med === 'cpc')) fonte = `Google Ads${o.term ? ` (buscou "${o.term}")` : ''}`;
  else if (o.src) fonte = `${o.src}${o.med ? ` / ${o.med}` : ''}${o.camp ? ` (${o.camp})` : ''}`;
  else {
    const app = IN_APP.find(([re]) => re.test(ua || ''))?.[1];
    const ref = (o.ref || '').toLowerCase();
    if (app) fonte = `${app} (abriu o link dentro do app)`;
    else if (ref) fonte = SITES.find(([re]) => re.test(ref))?.[1] ?? ref;
    else if (twa) fonte = 'app da Play Store';
  }
  if (convite) return `convite de ${convite}${fonte ? ` · link aberto pelo ${fonte}` : ''}`;
  return fonte ?? 'direto (digitou o endereço, favorito ou link sem origem)';
}
