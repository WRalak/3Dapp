import { Header } from "@/components/store/header";
import { Footer } from "@/components/store/footer";
import { LiteBanner } from "@/components/store/preferences";
import { SessionTracker } from "@/components/products/product-tracking";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LiteBanner />
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <SessionTracker />
    </>
  );
}
