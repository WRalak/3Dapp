"use client";

import { useEffect } from "react";

/** Last-resort boundary for errors in the root layout. Renders its own <html>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) void import("@sentry/nextjs").then((S) => S.captureException(error));
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "Helvetica, Arial, sans-serif", background: "#f7f5f1", color: "#161513", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontWeight: 500, letterSpacing: "-0.02em" }}>Something went wrong</h1>
          <p style={{ color: "#8a8277" }}>Please try again. {error.digest && `Reference: ${error.digest}`}</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "12px 24px", background: "#161513", color: "#f7f5f1", border: 0, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
