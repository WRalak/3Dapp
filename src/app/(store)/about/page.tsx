import type { Metadata } from "next";
import Link from "next/link";
import { site, SHIPPING_METHODS } from "@/config/site";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "About", description: "The 3Dapp story, shipping, returns and sizing." };

export const revalidate = 3600;

export default function AboutPage() {
  return (
    <div className="container-luxe pt-8 md:pt-14">
      <p className="eyebrow mb-3 text-taupe">Our story</p>
      <h1 className="max-w-4xl text-display font-medium">Clothing made slowly, shown honestly.</h1>
      <div className="mt-16 grid gap-16 md:grid-cols-2">
        <div className="space-y-6 text-lg leading-relaxed text-graphite">
          <p>
            {site.name} began as a small studio with a single clothing rail. Customers would come in, slide garments along the rail, lift one off and turn it in the light.
            The digital showroom is our attempt to bring that ritual online.
          </p>
          <p>
            Every piece is cut in small runs by partner workshops we know personally. We publish fibre composition, origin and care for every garment, and we show you each
            piece in 3D so what arrives is exactly what you chose.
          </p>
          <Button asChild variant="outline">
            <Link href="/showroom">Visit the showroom</Link>
          </Button>
        </div>
        <div className="space-y-14">
          <section id="shipping">
            <h2 className="eyebrow mb-4 text-ink">Shipping & returns</h2>
            <ul className="divide-y border-y text-sm">
              {SHIPPING_METHODS.map((m) => (
                <li key={m.id} className="flex justify-between gap-4 py-3">
                  <span>
                    {m.label} <span className="text-taupe">— {m.description}</span>
                  </span>
                  <span>
                    {m.priceCents ? formatMoney(m.priceCents) : "Free"}
                    {m.freeOverCents ? <span className="text-taupe"> (free over {formatMoney(m.freeOverCents)})</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-graphite">Returns are free within 30 days of delivery for unworn pieces with tags attached.</p>
          </section>
          <section id="sizing">
            <h2 className="eyebrow mb-4 text-ink">Sizing</h2>
            <p className="text-sm text-graphite">Every product page lists garment measurements in centimetres for each size. If you are between sizes, our studio team is happy to advise.</p>
          </section>
          <section id="contact">
            <h2 className="eyebrow mb-4 text-ink">Contact</h2>
            <p className="text-sm text-graphite">
              Write to us at{" "}
              <a className="underline underline-offset-4" href={`mailto:${site.supportEmail}`}>
                {site.supportEmail}
              </a>
              . We reply within one business day.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
