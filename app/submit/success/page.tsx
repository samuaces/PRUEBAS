import Link from 'next/link';

export default function SubmitSuccessPage() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-lg font-bold">Payment received</h1>
      <p className="mt-2 max-w-sm text-sm text-white/60">
        Check your email for a receipt and a link to your entry page. A human reviews every
        submission — you&rsquo;ll hear back within a day, sooner if it&rsquo;s straightforward.
      </p>
      <Link href="/" className="mt-6 text-sm underline">
        Back to the board
      </Link>
    </main>
  );
}
