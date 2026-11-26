/**
 * Sends e-mail through SMTP when it is configured (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
 * MAIL_FROM). Without SMTP the message is printed to the server console instead, so password
 * reset still works on a developer machine.
 */
export const isMailConfigured = () => Boolean(process.env.SMTP_HOST);

export const sendMail = async ({ to, subject, text, html }) => {
  if (!isMailConfigured()) {
    console.log(`\n[mail not configured - printing instead]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return { delivered: false };
  }
  const { default: nodemailer } = await import('nodemailer');
  const port = Number(process.env.SMTP_PORT) || 587;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
  await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
  return { delivered: true };
};
