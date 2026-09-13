/**
 * Efí (ex-Gerencianet) PIX — cliente mínimo com mTLS (certificado .p12), portado do Rifa Express
 * (src/lib/efibank.ts, que já roda em produção). Credenciais SÓ no api/.env do servidor, nunca no git:
 *   EFI_CLIENT_ID, EFI_CLIENT_SECRET, EFI_PIX_KEY, EFI_CERT_BASE64 (o .p12 em base64) ou
 *   EFI_CERT_PATH (caminho do .p12), EFI_SANDBOX=1 para homologação, EFI_WEBHOOK_SECRET (vai na URL).
 * Fora de produção, EFI_FAKE=1 simula a Efí (QR de teste; o site ganha um botão "simular pagamento").
 */
import https from 'node:https';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';

const PROD = 'https://pix.api.efipay.com.br';
const SANDBOX = 'https://pix-h.api.efipay.com.br';

export const efiFake = () => process.env.NODE_ENV !== 'production' && process.env.EFI_FAKE === '1';
export const efiReady = () => efiFake() || !!(process.env.EFI_CLIENT_ID && process.env.EFI_CLIENT_SECRET
  && process.env.EFI_PIX_KEY && (process.env.EFI_CERT_BASE64 || process.env.EFI_CERT_PATH));

function creds() {
  const { EFI_CLIENT_ID: clientId, EFI_CLIENT_SECRET: clientSecret, EFI_PIX_KEY: pixKey } = process.env;
  const cert = process.env.EFI_CERT_BASE64 || (process.env.EFI_CERT_PATH ? fs.readFileSync(process.env.EFI_CERT_PATH).toString('base64') : '');
  if (!clientId || !clientSecret || !pixKey || !cert) throw new Error('Efí não configurada (EFI_CLIENT_ID, EFI_CLIENT_SECRET, EFI_PIX_KEY, EFI_CERT_BASE64/EFI_CERT_PATH).');
  return { clientId, clientSecret, pixKey, pfx: Buffer.from(cert, 'base64'), base: process.env.EFI_SANDBOX === '1' ? SANDBOX : PROD };
}

/** HTTPS com mTLS (o fetch nativo do Node não aceita o certificado do cliente). */
function request(url, { method, headers, body, pfx }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method, headers, pfx, passphrase: '', rejectUnauthorized: true, timeout: 15000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(Buffer.from(c)));
      res.on('end', () => resolve({ status: res.statusCode || 0, data: Buffer.concat(chunks).toString('utf-8') }));
    });
    req.on('timeout', () => req.destroy(new Error('Efí: tempo esgotado')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

let token = null; // { value, expiresAt }
async function accessToken(c) {
  if (token && Date.now() < token.expiresAt) return token.value;
  const body = JSON.stringify({ grant_type: 'client_credentials' });
  const r = await request(`${c.base}/oauth/token`, {
    method: 'POST', pfx: c.pfx, body,
    headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)) },
  });
  if (r.status < 200 || r.status >= 300) throw new Error(`Efí: autenticação falhou (${r.status})`);
  const d = JSON.parse(r.data);
  token = { value: d.access_token, expiresAt: Date.now() + (d.expires_in - 60) * 1000 };
  return token.value;
}

async function efi(c, method, path, body, extra = {}) {
  const t = await accessToken(c);
  const payload = body && method !== 'GET' ? JSON.stringify(body) : undefined;
  const headers = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...extra, ...(payload ? { 'Content-Length': String(Buffer.byteLength(payload)) } : {}) };
  const r = await request(`${c.base}${path}`, { method, headers, body: payload, pfx: c.pfx });
  if (r.status < 200 || r.status >= 300) {
    const err = new Error(`Efí ${method} ${path}: ${r.status} ${r.data.slice(0, 300)}`);
    err.status = r.status;
    throw err;
  }
  return r.data ? JSON.parse(r.data) : {};
}

/** txid nosso: 26 a 35 caracteres [A-Za-z0-9] (regra do BACEN) — gravado ANTES de criar a cobrança. */
export const newTxid = () => `JG${randomBytes(16).toString('hex')}`; // 34 caracteres

const fakeCharges = new Map(); // txid -> cobrança simulada (só EFI_FAKE; some ao reiniciar)

/** Cria a cobrança imediata (PUT /v2/cob/:txid) e devolve o copia-e-cola e a imagem do QR. */
export async function createCharge({ txid, amount, description, expiresSec, info = [] }) {
  if (efiFake()) {
    fakeCharges.set(txid, { status: 'ATIVA', txid, valor: { original: amount.toFixed(2) }, pix: [] });
    return { pixCode: `PIX-DE-TESTE-${txid}-${amount.toFixed(2)}`, qrImage: null };
  }
  const c = creds();
  let cob;
  try {
    cob = await efi(c, 'PUT', `/v2/cob/${txid}`, {
      calendario: { expiracao: expiresSec }, valor: { original: amount.toFixed(2) }, chave: c.pixKey,
      solicitacaoPagador: description.slice(0, 140), ...(info.length ? { infoAdicionais: info.slice(0, 4) } : {}),
    });
  } catch (e) {
    cob = await efi(c, 'GET', `/v2/cob/${txid}`).catch(() => { throw e; }); // retentativa: a cobrança já existia
  }
  if (!cob.loc?.id) throw new Error('Efí não devolveu o local do QR.');
  const qr = await efi(c, 'GET', `/v2/loc/${cob.loc.id}/qrcode`);
  return { pixCode: qr.qrcode, qrImage: String(qr.imagemQrcode || '').replace(/^data:image\/[a-z]+;base64,/, '') || null };
}

/** Situação da cobrança na Efí: status ATIVA | CONCLUIDA | REMOVIDA_* e, quando paga, pix[] com endToEndId. */
export async function getCharge(txid) {
  if (efiFake()) return fakeCharges.get(txid) ?? { status: 'ATIVA', txid, pix: [] };
  return efi(creds(), 'GET', `/v2/cob/${encodeURIComponent(txid)}`);
}

/** Só no modo de teste: marca a cobrança como paga, como se o PIX tivesse caído. */
export function fakePay(txid) {
  const cob = fakeCharges.get(txid);
  if (!cob) return false;
  cob.status = 'CONCLUIDA';
  cob.pix = [{ endToEndId: `E${randomBytes(16).toString('hex')}`, txid, valor: cob.valor.original, horario: new Date().toISOString() }];
  return true;
}

/** Registra na Efí a URL do aviso de PIX (sem mTLS no nosso lado: a URL leva um segredo e tudo é conferido na API). */
export async function configureWebhook(webhookUrl) {
  const c = creds();
  return efi(c, 'PUT', `/v2/webhook/${encodeURIComponent(c.pixKey)}`, { webhookUrl }, { 'x-skip-mtls-checking': 'true' });
}
