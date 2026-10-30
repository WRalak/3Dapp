import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireSellerPage } from "@/lib/auth/seller-guard";
import { getAdminProduct } from "@/server/services/product-admin.service";
import { PageHeader } from "@/components/admin/shell";
import { ProductForm } from "@/components/admin/product-form";
import { ActionButton } from "@/components/admin/admin-ui";
import { SellerImageUploader } from "@/components/seller/image-uploader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { sellerDeleteImageAction, sellerDeleteProductAction } from "@/features/marketplace/actions";
import { productFormOptions, toFormDefaults } from "@/app/admin/products/form-data";
import { isSvgSource } from "@/lib/media";

export const metadata = { title: "Edit product" };

export default async function SellerProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { seller } = await requireSellerPage("/seller/products");
  const { id } = await params;
  // Scoped lookup: another seller's product id simply 404s.
  const [product, options] = await Promise.all([getAdminProduct(id, { sellerId: seller.id }), productFormOptions(seller.id)]);
  if (!product) notFound();
  const live = product.status === "PUBLISHED" && product.approvalStatus === "APPROVED";

  return (
    <>
      <PageHeader
        title={product.name}
        description={live ? "Live on the storefront" : product.approvalStatus === "PENDING_REVIEW" ? "Waiting for review — usually within 1 business day" : product.approvalStatus === "REJECTED" ? "Needs changes before it can go live" : "Not published"}
        actions={
          <>
            {live && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/products/${product.slug}`} target="_blank">
                  View in store <ExternalLink />
                </Link>
              </Button>
            )}
            <ActionButton size="sm" variant="danger" action={sellerDeleteProductAction} input={{ id: product.id }} confirm="Delete this product? Order history is kept.">
              Delete
            </ActionButton>
          </>
        }
      />
      {product.approvalStatus === "REJECTED" && product.rejectionReason && (
        <p className="mb-6 border-l-2 border-danger/60 bg-danger/5 px-4 py-3 text-sm">
          <strong className="font-medium">Reviewer note:</strong> {product.rejectionReason} — save your changes to resubmit.
        </p>
      )}
      <div className="grid gap-10 2xl:grid-cols-[1fr_380px]">
        <div className="order-2 2xl:order-1">
          <ProductForm mode="seller" canPublish productId={product.id} defaults={toFormDefaults(product)} brands={options.brands} categories={options.categories} collections={options.collections} />
        </div>
        <aside className="order-1 space-y-8 2xl:order-2">
          <section className="border bg-surface p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="eyebrow">Photos</h2>
              <SellerImageUploader productId={product.id} productName={product.name} />
            </div>
            {product.images.length === 0 ? (
              <p className="text-sm text-taupe">No photos yet. Customers see a plain illustration and a note that colours may differ — real photos sell far better.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-2">
                {product.images.map((img) => (
                  <li key={img.id} className="group relative aspect-[3/4] bg-bone">
                    <Image src={img.url} alt={img.alt} fill sizes="120px" unoptimized={isSvgSource(img.url)} className="object-cover" />
                    <span className="absolute left-1 top-1 bg-ivory/90 px-1 text-[9px] uppercase">{img.kind.replace("_", " ").toLowerCase()}</span>
                    <div className="absolute inset-x-1 bottom-1 hidden group-hover:block group-focus-within:block">
                      <ActionButton size="sm" variant="danger" className="h-7 w-full" action={sellerDeleteImageAction} input={{ id: img.id }} confirm="Remove this photo?">
                        Remove
                      </ActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="border bg-surface p-6 text-sm">
            <h2 className="eyebrow mb-3">3D model</h2>
            {product.model3D ? (
              <p>
                <Badge tone={product.model3D.representation === "ACCURATE" ? "success" : "neutral"}>{product.model3D.representation.toLowerCase()}</Badge>{" "}
                {product.model3D.representation === "ACCURATE" ? "Built from your garment." : "Generic silhouette — customers are told fabric may differ."}
              </p>
            ) : (
              <p className="text-taupe">Your piece appears on the 3D rail using a generic silhouette in its main colour. Want an accurate 3D model? Contact seller support to book a scan.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
