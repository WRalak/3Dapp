import Link from "next/link";
import { site } from "@/config/site";
import { garmentArtwork } from "@/lib/media";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-bone lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={garmentArtwork("COAT", "#b88a5a")} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 p-12">
          <p className="max-w-sm text-3xl font-medium leading-tight tracking-tight">A digital boutique for considered clothing.</p>
        </div>
      </div>
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="text-lg font-medium uppercase tracking-[0.42em]">
          {site.name}
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</div>
      </div>
    </main>
  );
}
