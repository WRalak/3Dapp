import { requireSellerPage } from "@/lib/auth/seller-guard";
import { PageHeader } from "@/components/admin/shell";
import { ProductForm } from "@/components/admin/product-form";
import { FormDialog } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { sellerBrandAction } from "@/features/marketplace/actions";
import { productFormOptions } from "@/app/admin/products/form-data";

export const metadata = { title: "Add product" };

export default async function NewSellerProduct() {
  const { seller } = await requireSellerPage("/seller/products/new");
  const { brands, categories, collections } = await productFormOptions(seller.id);
  return (
    <>
      <PageHeader
        title="Add product"
        description="Add photos after saving. Real photos of the actual fabric help your listing get approved and sell."
        actions={<FormDialog title="Add a label" trigger={<Button variant="outline">New label</Button>} fields={[{ name: "name", label: "Label name", hint: "e.g. your brand or a line within it" }]} defaults={{ name: seller.businessName }} action={sellerBrandAction} />}
      />
      <ProductForm
        mode="seller"
        canPublish
        brands={brands}
        categories={categories}
        collections={collections}
        defaults={{
          name: "",
          slug: "",
          description: "",
          brandId: brands[0]?.id ?? "",
          categoryId: "",
          garmentKind: "DRESS",
          price: 0,
          salePrice: "" as unknown as number,
          saleEndsAt: "",
          tags: "",
          isFeatured: false,
          status: "PUBLISHED",
          collectionIds: [],
          variants: [{ sku: "", size: "M", color: "", colorHex: "#1c1b19", stock: 1, lowStockThreshold: 2, isActive: true, price: "" as unknown as number, salePrice: "" as unknown as number }],
        }}
      />
    </>
  );
}
