import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserPage } from "@/lib/auth/guards";
import { getInquiryThread } from "@/server/services/community.service";
import { InquiryThread } from "@/components/marketplace/thread";

export const metadata = { title: "Conversation" };

export default async function MessageThread({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage("/account/messages");
  const { id } = await params;
  const thread = await getInquiryThread(user, id);
  if (!thread || thread.customerId !== user.id) notFound();
  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-medium">{thread.subject}</h2>
      <p className="mb-6 mt-1 text-sm text-taupe">
        with{" "}
        <Link href={`/designers/${thread.seller.slug}`} className="underline underline-offset-4">
          {thread.seller.businessName}
        </Link>
        {thread.product && (
          <>
            {" "}
            · about{" "}
            <Link href={`/products/${thread.product.slug}`} className="underline underline-offset-4">
              {thread.product.name}
            </Link>
          </>
        )}
      </p>
      <InquiryThread inquiryId={thread.id} meId={user.id} messages={thread.messages} closed={thread.status === "CLOSED"} />
    </div>
  );
}
