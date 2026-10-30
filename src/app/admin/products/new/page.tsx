import { requireAdminPage, hasPermissions } from "@/lib/auth/guards";
import { PageHeader } from "@/components/admin/shell";
import { ProductForm } from "@/components/admin/product-form";
import { productFormOptions } from "../form-data";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  const user = await requireAdminPage("products.write");
  const options = await productFormOptions();
  return (
    <>
      <PageHeader title="New product" description="Create the product and its variants. Images and a 3D model can be added after saving." />
      <ProductForm
        {...options}
        canPublish={hasPermissions(user, ["products.publish"])}
        defaults={{
          name: "",
          slug: "",
          description: "",
          brandId: "",
          categoryId: "",
          garmentKind: "TOP",
          price: 0,
          salePrice: "" as unknown as number,
          saleEndsAt: "",
          tags: "",
          isFeatured: false,
          status: "DRAFT",
          collectionIds: [],
          sellerId: "house-seller",
          variants: [{ sku: "", size: "M", color: "Ink", colorHex: "#1c1b19", stock: 0, lowStockThreshold: 5, isActive: true, price: "" as unknown as number, salePrice: "" as unknown as number }],
        }}
      />
    </>
  );
}
