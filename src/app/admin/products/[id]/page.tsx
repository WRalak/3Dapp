import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireAdminPage, hasPermissions } from "@/lib/auth/guards";
import { getAdminProduct } from "@/server/services/product-admin.service";
import { db } from "@/lib/db/prisma";
import { formatBytes } from "@/lib/utils";
import { isSvgSource } from "@/lib/media";
import { PageHeader } from "@/components/admin/shell";
import { ProductForm } from "@/components/admin/product-form";
import { ActionButton } from "@/components/admin/admin-ui";
import { Uploader } from "@/components/admin/uploader";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/misc";
import { assignModelAction, deleteProductImageAction, unassignModelAction } from "@/features/admin/actions";
import { productFormOptions, toFormDefaults } from "../form-data";
import { ModelAssignSelect } from "./model-assign";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage("products.view");
  const { id } = await params;
  const [product, options, readyModels] = await Promise.all([
    getAdminProduct(id),
    productFormOptions(),
    db.productModel3D.findMany({ where: { status: "READY", deletedAt: null, productId: null }, select: { id: true, name: true, fileSize: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  if (!product) notFound();
  const canAssets = hasPermissions(user, ["assets.manage"]);

  return (
    <>
      <PageHeader
        title={product.name}
        description={`/${product.slug}`}
        actions={
          product.status === "PUBLISHED" && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/products/${product.slug}`} target="_blank">
                View in store <ExternalLink />
              </Link>
            </Button>
          )
        }
      />
      <div className="grid gap-10 2xl:grid-cols-[1fr_380px]">
        <div className="order-2 2xl:order-1">
          {hasPermissions(user, ["products.write"]) ? (
            <ProductForm productId={product.id} defaults={toFormDefaults(product)} {...options} canPublish={hasPermissions(user, ["products.publish"])} />
          ) : (
            <p className="text-sm text-taupe">You have read-only access to this product.</p>
          )}
        </div>
        <aside className="order-1 space-y-8 2xl:order-2">
          <section className="border bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="eyebrow">Images</h2>
              {canAssets && <Uploader kind="image" label="Upload" multiple productId={product.id} productName={product.name} />}
            </div>
            {product.images.length === 0 ? (
              <p className="text-sm text-taupe">No photography yet — the store shows generated artwork. Name files “…-back”, “…-side” or “…-fabric” to tag views automatically.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-2">
                {product.images.map((img) => (
                  <li key={img.id} className="group relative aspect-[3/4] bg-bone">
                    <Image src={img.url} alt={img.alt} fill sizes="120px" unoptimized={isSvgSource(img.url)} className="object-cover" />
                    <span className="absolute left-1 top-1 bg-ivory/90 px-1 text-[9px] uppercase">{img.kind.replace("_", " ").toLowerCase()}</span>
                    {canAssets && (
                      <div className="absolute inset-x-1 bottom-1 hidden group-hover:block">
                        <ActionButton size="sm" variant="danger" className="h-7 w-full" action={deleteProductImageAction} input={{ id: img.id, productId: product.id }} confirm="Remove this image?">
                          Remove
                        </ActionButton>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="border bg-surface p-6">
            <h2 className="eyebrow mb-4">3D model</h2>
            {product.model3D ? (
              <div className="space-y-3 text-sm">
                <p className="font-medium">{product.model3D.name}</p>
                <p className="flex items-center gap-2 text-xs text-taupe">
                  <StatusPill status={product.model3D.status} /> {formatBytes(product.model3D.fileSize)} · {product.model3D.triangleCount?.toLocaleString()} triangles
                </p>
                {canAssets && (
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/3d-assets?preview=${product.model3D.id}`}>Preview</Link>
                    </Button>
                    <ActionButton size="sm" variant="ghost" action={unassignModelAction} input={{ id: product.model3D.id }} confirm="Remove the model from this product? The asset stays in the library.">
                      Remove
                    </ActionButton>
                  </div>
                )}
              </div>
            ) : (
              <p className="mb-4 text-sm text-taupe">No model — the showroom uses a procedural {product.garmentKind.toLowerCase()} silhouette.</p>
            )}
            {canAssets && (
              <div className="mt-4 space-y-3 border-t pt-4">
                <Uploader kind="model" label={product.model3D ? "Replace with new GLB" : "Upload GLB / glTF"} productId={product.id} />
                {readyModels.length > 0 && <ModelAssignSelect productId={product.id} models={readyModels.map((m) => ({ id: m.id, label: `${m.name} (${formatBytes(m.fileSize)})` }))} action={assignModelAction} />}
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
