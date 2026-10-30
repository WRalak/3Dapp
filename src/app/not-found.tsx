import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="container-luxe flex min-h-[70vh] flex-col items-center justify-center text-center">
      <p className="eyebrow text-taupe">404</p>
      <h1 className="mt-4 text-display font-medium">Not on the rail</h1>
      <p className="mt-6 max-w-md text-graphite">The page you&apos;re looking for has moved or no longer exists.</p>
      <div className="mt-10 flex gap-3">
        <Button asChild>
          <Link href="/shop">Shop the collection</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  );
}
