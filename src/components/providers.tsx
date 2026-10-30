"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {/* Respect the user's OS-level reduced-motion preference for every animation. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
      <Toaster
        position="bottom-center"
        toastOptions={{
          classNames: {
            toast: "!rounded-none !border !border-border !bg-ivory !text-ink !font-sans !shadow-lg",
            description: "!text-taupe",
          },
        }}
      />
    </QueryClientProvider>
  );
}
