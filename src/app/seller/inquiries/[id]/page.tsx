import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSellerPage } from "@/lib/auth/seller-guard";
import { getInquiryThread } from "@/server/services/community.service";
import { PageHeader } from "@/components/admin/shell";
import { ActionButton } from "@/components/admin/admin-ui";
import { InquiryThread } from "@/components/marketplace/thread";
import { closeInquiryAction } from "@/features/marketplace/actions";

export const metadata = { title: "Conversation" };

export default async function SellerInquiry({ params }: { params: Promise<{ id: string }> }) {
  const { user, seller } = await requireSellerPage("/seller/inquiries");
  const { id } = await params;
  const thread = await getInquiryThread(user, id);
  if (!thread || thread.sellerId !== seller.id) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader
        title={thread.subject}
        description={`${thread.customer.name ?? "Customer"}${thread.product ? ` · about ${thread.product.name}` : ""}`}
        actions={
          thread.status !== "CLOSED" && (
            <ActionButton size="sm" variant="outline" action={closeInquiryAction} input={{ id: thread.id }}>
              Close conversation
            </ActionButton>
          )
        }
      />
      {thread.product && (
        <Link href={`/products/${thread.product.slug}`} className="mb-6 inline-block text-xs underline underline-offset-4">
          View product
        </Link>
      )}
      <InquiryThread inquiryId={thread.id} meId={user.id} messages={thread.messages} closed={thread.status === "CLOSED"} />
    </div>
  );
}
