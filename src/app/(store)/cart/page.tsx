import type { Metadata } from "next";
import { CartPageClient } from "./cart-client";

export const metadata: Metadata = { title: "Your bag", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="container-luxe pt-8 md:pt-14">
      <h1 className="mb-10 text-headline font-medium">Your bag</h1>
      <CartPageClient />
    </div>
  );
}
