// Aetheria — custom 404 page.
//
// Next.js falls back to a built-in 404 when this file is missing. That fallback
// page is indexable, has no canonical, and doesn't carry our metadata template
// — so Googlebot is free to surface "Aetheria · This page could not be found"
// in results, which is a thin-content / soft-404 SEO regression. Owning the
// page lets us emit `noindex, follow` (so link equity still flows out) plus a
// useful CTA back to the landing page.

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you are looking for does not exist or has moved.",
  // Crucial: keep the noindex so Google doesn't accidentally index the 404
  // shell. `follow` keeps internal links crawlable from the page body.
  robots: { index: false, follow: true },
  // No canonical — a 404 shouldn't claim to be the canonical of anything.
};

const NotFoundPage = (): JSX.Element => (
  <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 py-12 text-center">
    <p className="font-display text-7xl font-bold text-realm-aetheric">404</p>
    <h1 className="text-2xl font-semibold text-zinc-100">Page not found</h1>
    <p className="max-w-md text-sm text-zinc-400">
      The realm you were looking for is not on the map. It may have moved, or
      perhaps it never existed in the first place.
    </p>
    <Link
      href="/"
      className="rounded-lg bg-realm-aetheric px-6 py-3 font-semibold text-slate-900 hover:bg-realm-aetheric/90"
    >
      Return to the gate
    </Link>
  </main>
);

export default NotFoundPage;
