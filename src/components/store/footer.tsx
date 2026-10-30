import Link from "next/link";
import { db } from "@/lib/db/prisma";
import { site } from "@/config/site";
import { NewsletterForm } from "./newsletter-form";

export async function Footer() {
  const links = await db.navigationLink.findMany({ where: { location: "FOOTER", isActive: true }, orderBy: [{ group: "asc" }, { sortOrder: "asc" }] });
  const groups = links.reduce<Record<string, typeof links>>((acc, l) => {
    (acc[l.group ?? "More"] ??= []).push(l);
    return acc;
  }, {});
  const shop = [
    { label: "Women", href: "/shop?category=women" },
    { label: "Men", href: "/shop?category=men" },
    { label: "Shoes & bags", href: "/shop?category=shoes" },
    { label: "Luxury", href: "/shop?category=luxury" },
    { label: "New arrivals", href: "/new-arrivals" },
  ];
  return (
    <footer className="mt-24 bg-ink text-ivory md:mt-40">
      <div className="container-luxe grid gap-14 py-16 md:grid-cols-12 md:py-24">
        <div className="md:col-span-5">
          <p className="text-2xl font-medium uppercase tracking-[0.42em]">{site.name}</p>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-stone">{site.description}</p>
          <div className="mt-10 max-w-md">
            <p className="eyebrow mb-4 text-stone">Newsletter</p>
            <NewsletterForm />
          </div>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3 md:col-span-7">
          <div>
            <p className="eyebrow mb-5 text-stone">Shop</p>
            <ul className="space-y-3 text-sm">
              {shop.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="link-underline text-ivory/80 hover:text-ivory">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <p className="eyebrow mb-5 text-stone">{group}</p>
              <ul className="space-y-3 text-sm">
                {items.map((l) => (
                  <li key={l.id}>
                    <Link href={l.href} className="link-underline text-ivory/80 hover:text-ivory">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-ivory/10">
        <div className="container-luxe flex flex-col justify-between gap-4 py-6 text-xs text-stone sm:flex-row">
          <p>
            © {new Date().getFullYear()} {site.name}. All rights reserved.
          </p>
          <p>Payments: M-Pesa · Card · PayPal</p>
        </div>
      </div>
    </footer>
  );
}
