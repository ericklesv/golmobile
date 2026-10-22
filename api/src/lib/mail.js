/**
 * Envio de e-mail por SMTP (Brevo — guia em docs/EMAIL_BREVO.md). Envs: SMTP_HOST/PORT/USER/PASS e MAIL_FROM.
 * Sem SMTP_HOST, `sendMail` devolve false e quem chamou decide (o esqueci-a-senha loga o link no console).
 * Usado pela recuperação de senha (routes/password.js) e pelos e-mails de campanha (services/emailVolta.js).
 */
import nodemailer from 'nodemailer';

let transporter = null;
function mailer() {
  if (transporter !== null) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) { transporter = false; return transporter; }
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  });
  return transporter;
}

export const mailReady = () => !!mailer();
export const mailFrom = () => process.env.MAIL_FROM || 'JogaGol <nao-responda@jogagol.com.br>';

/** Manda um e-mail. Devolve false sem SMTP configurado; erro do servidor de e-mail sobe para quem chamou. */
export async function sendMail({ to, subject, text, html, headers }) {
  const t = mailer();
  if (!t) return false;
  await t.sendMail({ from: mailFrom(), to, subject, text, html, headers });
  return true;
}
