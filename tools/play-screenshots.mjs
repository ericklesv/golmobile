// Capturas de tela do JogaGol em PRODUÇÃO para a ficha da Play Store.
// Uso (raiz do repo, precisa de puppeteer-core e do Edge):  PRESET=phone|tab7|tab10 node tools/play-screenshots.mjs [01-home ...]
//   phone = 1080×1920 (9:16), tab7 = 1200×1920, tab10 = 1600×2560 — a loja só aceita proporção até 2:1
//   (1080×2400 = 9:20 é RECUSADO). Entra com a conta de teste, bloqueia o POST /api/play/auto (senão o
//   chute direto sai sozinho e vira gol de verdade), fecha a janela da Presença da Semana e joga duas
//   linhas do Termo. Resultado em ./shots/; as versões da loja estão em assets/play-store/screenshots/.
import puppeteer from 'puppeteer-core';

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'https://jogagol.com.br';
const LOGIN = { login: 'craque_g88qn', password: 'teste123' };
const only = process.argv.slice(2);

const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(LOGIN) });
const { token } = await res.json();
if (!token) throw new Error('login falhou');

const browser = await puppeteer.launch({
  executablePath: edge, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=420,900', '--lang=pt-BR'],
});
const page = await browser.newPage();
// PRESET: phone = 1080x1920 (9:16), tab7 = 1200x1920, tab10 = 1600x2560 — a loja exige proporção até 2:1
const PRESETS = { phone: { w: 405, h: 720, dpr: 1080 / 405 }, tab7: { w: 600, h: 960, dpr: 2 }, tab10: { w: 800, h: 1280, dpr: 2 } };
const PRESET = process.env.PRESET || 'phone';
const V = PRESETS[PRESET];
await page.setViewport({ width: V.w, height: V.h, deviceScaleFactor: V.dpr, isMobile: true, hasTouch: true });
await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36');
// o chute direto NÃO pode sair sozinho durante a captura (seria gol de verdade da conta de teste)
await page.setRequestInterception(true);
page.on('request', (r) => (r.method() === 'POST' && r.url().includes('/api/play/auto')) ? r.abort() : r.continue());
await page.evaluateOnNewDocument((t) => {
  localStorage.setItem('brgol.token', t);
  localStorage.setItem('brgol.som', '0');
  localStorage.setItem('brgol.termo.ajuda', '1');
}, token);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = async (txt) => page.evaluate((t) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t); if (b) { b.click(); return true; } return false; }, txt);

const shots = [
  { file: '01-home', url: '/', wait: 4000, fn: async () => { await clickText('Depois'); await sleep(800); } },
  { file: '02-penalti', url: '/penalti', wait: 9000 },
  { file: '03-falta', url: '/falta', wait: 9000 },
  { file: '07-time', url: '/time', wait: 4000 },
  { file: '04-liga', url: '/liga', wait: 4000 },
  { file: '05-rankings', url: '/rankings', wait: 4000 },
  { file: '06-termo', url: '/termo', wait: 3500, fn: async () => {
    for (const w of ['TRAVE', 'GOLPE']) { await page.keyboard.type(w, { delay: 60 }); await page.keyboard.press('Enter'); await sleep(2500); }
  } },
].filter((s) => !only.length || only.includes(s.file));
for (const s of shots) {
  await page.goto(BASE + s.url, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(s.wait);
  if (await clickText('Depois')) await sleep(1200); // janela da Presença da Semana (aparece em todo carregamento)
  if (s.fn) await s.fn();
  await page.screenshot({ path: `shots/${PRESET}-${s.file}.png` });
  console.log('ok', s.file);
}
await browser.close();
