export default function LegalNoticePage() {
  return (
    <main className="prose prose-invert max-w-none text-sm text-white/80">
      <h1 className="text-lg font-bold text-white">Legal notice</h1>

      <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200">
        Placeholder — the operator must replace the fields below with their real registered details before
        the site accepts payments. EU law (e.g. Spain&rsquo;s LSSI-CE, or the equivalent in the operator&rsquo;s own
        jurisdiction) requires a paid online service to identify its operator. We can&rsquo;t generate this section
        for you: it has to be the real legal identity of whoever is running the service.
      </p>

      <dl>
        <dt>Service operator</dt>
        <dd>[Legal name of the individual or company operating klym.xyz]</dd>

        <dt>Registered address</dt>
        <dd>[Registered business or trading address]</dd>

        <dt>Tax / company registration number</dt>
        <dd>[NIF/CIF, VAT number, or equivalent company registration number]</dd>

        <dt>Contact</dt>
        <dd><a href="mailto:info@cuantomedeben.es">info@cuantomedeben.es</a></dd>

        <dt>Domain</dt>
        <dd>klym.xyz</dd>
      </dl>
    </main>
  );
}
