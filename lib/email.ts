import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'klym <info@cuantomedeben.es>';

function eur(cents: number): string {
  return (cents / 100).toLocaleString('en-IE', { style: 'currency', currency: 'EUR' });
}

function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f6f7;padding:24px;margin:0;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
    <h1 style="font-size:18px;margin:0 0 16px;">${title}</h1>
    ${bodyHtml}
    <p style="margin-top:32px;font-size:12px;color:#888;">klym.xyz &middot; info@cuantomedeben.es</p>
  </div>
  </body></html>`;
}

export async function sendReceiptEmail(opts: {
  to: string;
  name: string;
  amountCents: number;
  ownerUrl: string;
}) {
  const { to, name, amountCents, ownerUrl } = opts;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your klym.xyz submission for "${name}" is in`,
    html: wrap('You\'re in the queue', `
      <p>Thanks for the ${eur(amountCents)} entry for <strong>${name}</strong>.</p>
      <p>A human reviews every submission before it goes live &mdash; usually within a day,
      and automatically refunded if it's still waiting after 24 hours.</p>
      <p>Bookmark this link: it's your entry page, showing your board link and stats once you're approved.</p>
      <p><a href="${ownerUrl}" style="color:#3b82f6;">${ownerUrl}</a></p>
    `),
  });
}

export async function sendApprovedEmail(opts: {
  to: string;
  name: string;
  redirectUrl: string;
  ownerUrl: string;
}) {
  const { to, name, redirectUrl, ownerUrl } = opts;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `"${name}" is live on klym.xyz`,
    html: wrap('You\'re live', `
      <p><strong>${name}</strong> is now on the board.</p>
      <p>Send people through your own link and every visit adds to your score:</p>
      <p><a href="${redirectUrl}" style="color:#3b82f6;">${redirectUrl}</a></p>
      <p>Track your rank and score any time:</p>
      <p><a href="${ownerUrl}" style="color:#3b82f6;">${ownerUrl}</a></p>
    `),
  });
}

export async function sendRejectedEmail(opts: {
  to: string;
  name: string;
  amountCents: number;
  reason?: string;
}) {
  const { to, name, amountCents, reason } = opts;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your klym.xyz submission for "${name}" was not approved`,
    html: wrap('Not approved', `
      <p>Your submission for <strong>${name}</strong> was not approved${reason ? ` (${reason})` : ''}.</p>
      <p>Your ${eur(amountCents)} has been refunded in full to the original payment method.</p>
    `),
  });
}

export async function sendOvertakenEmail(opts: {
  to: string;
  name: string;
  ownerUrl: string;
  newRank: number;
}) {
  const { to, name, ownerUrl, newRank } = opts;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `${name} was overtaken on klym.xyz`,
    html: wrap('You\'ve been overtaken', `
      <p><strong>${name}</strong> just dropped to rank #${newRank}.</p>
      <p>Send more people through your link, or top up, to climb back:</p>
      <p><a href="${ownerUrl}" style="color:#3b82f6;">${ownerUrl}</a></p>
    `),
  });
}
