"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "./button";

export function ErrorView({ error, reset, home = "/" }: { error: Error & { digest?: string }; reset: () => void; home?: string }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) void import("@sentry/nextjs").then((S) => S.captureException(error));
  }, [error]);
  return (
    <div className="container-luxe flex min-h-[50vh] flex-col items-center justify-center py-20 text-center">
      <p className="eyebrow text-taupe">Error</p>
      <h1 className="mt-4 text-4xl font-medium tracking-tight">Something went wrong</h1>
      <p className="mt-3 max-w-md text-sm text-graphite">We couldn&apos;t load this page. Please try again in a moment.{error.digest && ` Reference ${error.digest}.`}</p>
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href={home}>Go back</Link>
        </Button>
      </div>
    </div>
  );
}
