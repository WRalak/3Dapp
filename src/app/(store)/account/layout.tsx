import { requireUserPage } from "@/lib/auth/guards";
import { unreadCount } from "@/server/services/notification.service";
import { AccountNav } from "./account-nav";
import { logoutAction } from "@/features/auth/actions";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage("/account");
  const unread = await unreadCount(user.id);
  return (
    <div className="container-luxe pt-8 md:pt-14">
      <p className="eyebrow mb-3 text-taupe">My account</p>
      <h1 className="mb-10 text-headline font-medium">Hello{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <aside>
          <AccountNav unread={unread} />
          <form action={logoutAction} className="mt-8 hidden lg:block">
            <button className="text-sm text-taupe underline underline-offset-4 hover:text-ink">Sign out</button>
          </form>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
