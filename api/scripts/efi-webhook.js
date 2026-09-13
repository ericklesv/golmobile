/**
 * Registra na Efí a URL do aviso de PIX do VIP: <PUBLIC_WEB_URL>/api/pay/efi/<EFI_WEBHOOK_SECRET>
 * (a Efí acrescenta "/pix" e manda um POST a cada PIX recebido na chave).
 *
 * Uso (na pasta api/ da VPS, depois de preencher os EFI_* no api/.env):  node scripts/efi-webhook.js
 * Rodar de novo só se trocar a chave PIX, o domínio ou o segredo. O aviso só apressa a confirmação:
 * sem ele, a tela (a cada 4 s) e a conferência do agendador (a cada 2 min) confirmam do mesmo jeito.
 */
import 'dotenv/config';
import { configureWebhook } from '../src/lib/efi.js';

const base = (process.env.PUBLIC_WEB_URL || '').replace(/\/+$/, '');
const secret = process.env.EFI_WEBHOOK_SECRET || '';
if (!base.startsWith('https://')) throw new Error('PUBLIC_WEB_URL precisa ser https:// (a Efí só avisa em HTTPS).');
if (secret.length < 24) throw new Error('EFI_WEBHOOK_SECRET vazio ou curto (use 32+ caracteres aleatórios).');

const url = `${base}/api/pay/efi/${secret}`;
await configureWebhook(url);
console.log(`Aviso de PIX registrado na Efí: ${base}/api/pay/efi/${secret.slice(0, 4)}…`);
