import { requireUserPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { initials } from "@/lib/utils";
import { ProfileForm } from "../account-forms";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUserPage("/account/profile");
  const profile = await db.customerProfile.findUnique({ where: { userId: user.id } });
  return (
    <div className="space-y-10">
      <div className="flex items-center gap-5">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="size-16 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-full bg-ink text-lg text-ivory">{initials(user.name, user.email)}</span>
        )}
        <div>
          <p className="font-medium">{user.name}</p>
          <p className="text-sm text-taupe">
            {user.email} {user.emailVerified ? "· verified" : "· not verified"}
          </p>
        </div>
      </div>
      <ProfileForm defaults={{ name: user.name ?? "", phone: profile?.phone ?? "", image: user.image ?? "" }} />
      <p className="text-xs text-taupe">To change your email address, please contact support so we can verify the new address.</p>
    </div>
  );
}
