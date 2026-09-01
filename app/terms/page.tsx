export default function TermsPage() {
  return (
    <main className="prose prose-invert max-w-none text-sm text-white/80">
      <h1 className="text-lg font-bold text-white">Terms</h1>

      <p>
        klym.xyz (&ldquo;klym&rdquo;, &ldquo;we&rdquo;) operates a promotional listing service: a public board
        ranking entries by a score combining the amount paid and the traffic each entry&rsquo;s own link has sent.
        Payment buys placement and a chance to be ranked &mdash; it does not buy a guaranteed position, a
        guaranteed audience, or any outcome beyond appearing on the board once approved.
      </p>

      <h2>Submission and approval</h2>
      <p>
        Every submission is reviewed manually before it appears on the board or resolves as a link. We may
        reject any submission, for any reason, at our sole discretion. A rejected submission is refunded in
        full, automatically, to the original payment method. A submission left unreviewed for 24 hours is
        automatically rejected and refunded in full.
      </p>

      <h2>Refunds</h2>
      <p>
        Once a submission is approved and live on the board, payment is final. No refunds are issued for a
        live entry, including if its rank subsequently falls. The only refunds are the ones above: rejection
        (manual or automatic after 24 hours).
      </p>

      <h2>Scoring</h2>
      <p>
        Score is the amount paid (in cents) plus a value derived from unique visitors sent through the
        entry&rsquo;s own link, at a fixed rate, capped so that traffic can never account for more than 70% of an
        entry&rsquo;s score. The exact mechanism may be adjusted over time; the 70% cap on traffic&rsquo;s contribution
        will not be removed.
      </p>

      <h2>Prohibited content</h2>
      <p>
        Destinations linked to phishing, malware, illegal content, or content flagged by our review process
        will be rejected. We use automated checks (safe-browsing lists, domain age, content moderation) ahead
        of manual review; passing those checks is not a guarantee of approval.
      </p>

      <h2>Liability</h2>
      <p>
        The service is provided as-is. We are not responsible for the content of any linked destination, for
        traffic-counting inaccuracies caused by third parties (proxies, ad blockers, network conditions), or
        for any business outcome tied to an entry&rsquo;s rank.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href="mailto:info@cuantomedeben.es">info@cuantomedeben.es</a>
      </p>
    </main>
  );
}
