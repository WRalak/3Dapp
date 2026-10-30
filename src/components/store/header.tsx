import Link from "next/link";
import { Heart, User } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { getT } from "@/i18n/server";
import { mainNav, site } from "@/config/site";
import { CartButton, MobileNavButton, SearchButton } from "./header-client";
import { CartDrawer } from "./cart-drawer";
import { MobileNav } from "./mobile-nav";
import { SearchDialog } from "./search-dialog";

export async function Header() {
  const [user, t] = await Promise.all([getCurrentUser(), getT()]);
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-transparent bg-ivory/90 backdrop-blur-md supports-[backdrop-filter]:bg-ivory/75">
        <div className="container-luxe grid h-16 grid-cols-[1fr_auto_1fr] items-center md:h-20">
          <div className="flex items-center gap-1">
            <MobileNavButton />
            <nav aria-label="Main" className="hidden lg:block">
              <ul className="flex items-center gap-7">
                {mainNav.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="link-underline text-[13px] tracking-wide text-graphite hover:text-ink">
                      {t(item.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <Link href="/" className="text-lg font-medium uppercase tracking-[0.42em] md:text-xl" aria-label={`${site.name} home`}>
            {site.name}
          </Link>

          <div className="flex items-center justify-end gap-0.5 md:gap-2">
            <SearchButton />
            <Link href="/wishlist" className="hidden p-2.5 text-graphite hover:text-ink sm:block" aria-label="Wishlist">
              <Heart className="size-[18px]" strokeWidth={1.5} />
            </Link>
            <Link
              href={user ? (user.isStaff ? "/admin" : "/account") : "/login"}
              className="p-2.5 text-graphite hover:text-ink"
              aria-label={user ? "Your account" : "Sign in"}
            >
              <User className="size-[18px]" strokeWidth={1.5} />
            </Link>
            <CartButton />
          </div>
        </div>
      </header>
      <MobileNav signedIn={!!user} />
      <SearchDialog />
      <CartDrawer />
    </>
  );
}
