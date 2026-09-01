export default function PrivacyPage() {
  return (
    <main className="prose prose-invert max-w-none text-sm text-white/80">
      <h1 className="text-lg font-bold text-white">Privacy</h1>

      <p>
        This page explains what klym.xyz collects when you visit a board entry&rsquo;s link, and when you submit an
        entry of your own.
      </p>

      <h2>Visit counting</h2>
      <p>
        When someone follows a klym.xyz/r/&lt;slug&gt; link, we count the visit toward that entry&rsquo;s score.
        We do not store the visitor&rsquo;s IP address. What we store instead is a one-way cryptographic hash
        (HMAC-SHA256) of the IP address, browser user agent, and the current date, combined with a secret key
        we control. This hash cannot be reversed to recover the IP address, and because the date is baked
        into it, the same visitor produces a different, unlinkable hash the following day. The hash is used
        only to prevent the same visitor being counted twice for the same entry on the same day.
      </p>
      <p>We also keep a record of visits we chose not to count and why (e.g. automated traffic, a rate limit), for our own abuse review. These records don&rsquo;t contain an IP address either.</p>

      <h2>Submitting an entry</h2>
      <p>
        If you submit an entry, we store the name and link you provide, the amount paid, and the email
        address you give us. That email is used to send your payment receipt, your private entry-management
        link, and notifications about your entry&rsquo;s status (approved, rejected, overtaken). Payment itself is
        processed by Stripe; we do not store your card details.
      </p>

      <h2>Who else sees this data</h2>
      <p>
        Stripe (payment processing), Supabase (database hosting), and our transactional email provider
        process data on our behalf to run the service. Cloudflare sits in front of the domain for security
        and performance and sees standard request metadata as any CDN would.
      </p>

      <h2>Retention</h2>
      <p>
        Entry and visit records are kept for as long as the entry could reasonably remain relevant to the
        board or to a dispute about it. You can ask us to delete your entry and associated data at any time.
      </p>

      <h2>Your rights</h2>
      <p>
        Under GDPR you can request access to, correction of, or deletion of your personal data. Contact{' '}
        <a href="mailto:info@cuantomedeben.es">info@cuantomedeben.es</a> for any of this.
      </p>
    </main>
  );
}
