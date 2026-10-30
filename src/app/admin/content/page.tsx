import Link from "next/link";
import { requireAdminPage, hasPermissions } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { formatDate, formatMoney } from "@/lib/utils";
import { env } from "@/config/env";
import { PageHeader } from "@/components/admin/shell";
import { ActionButton, FormDialog, type FieldConfig } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Badge, Rating, StatusPill } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  deleteContentBlockAction,
  deleteNavLinkAction,
  moderateReviewAction,
  saveContentBlockAction,
  saveCouponAction,
  saveNavLinkAction,
} from "@/features/admin/actions";

export const metadata = { title: "Content & promotions" };

const TABS = [
  { id: "blocks", label: "Homepage & banners", perm: "content.manage" },
  { id: "navigation", label: "Navigation", perm: "content.manage" },
  { id: "coupons", label: "Coupons", perm: "promotions.manage" },
  { id: "reviews", label: "Reviews", perm: "reviews.moderate" },
] as const;

const BLOCK_FIELDS: FieldConfig[] = [
  { name: "type", label: "Type", type: "select", options: ["HERO", "BANNER", "PROMOTION", "EDITORIAL", "TESTIMONIAL"].map((v) => ({ value: v, label: v.toLowerCase() })) },
  { name: "placement", label: "Placement", type: "select", options: ["home.hero", "home.banner", "home.promo", "home.editorial", "home.testimonials"].map((v) => ({ value: v, label: v })) },
  { name: "title", label: "Title", span: 2 },
  { name: "subtitle", label: "Subtitle", span: 2 },
  { name: "body", label: "Body", type: "textarea" },
  { name: "imageUrl", label: "Image URL", span: 2 },
  { name: "ctaLabel", label: "Button label" },
  { name: "ctaHref", label: "Button link", hint: "/path or https://" },
  { name: "sortOrder", label: "Order", type: "number" },
  { name: "isActive", label: "Active", type: "checkbox" },
];

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireAdminPage();
  const tabs = TABS.filter((t) => hasPermissions(user, [t.perm]));
  if (tabs.length === 0) return <p className="text-sm text-taupe">You don&apos;t have access to content management.</p>;
  const sp = await searchParams;
  const tab = tabs.find((t) => t.id === sp.tab) ?? tabs[0]!;

  return (
    <>
      <PageHeader title="Content & promotions" description="Changes appear on the storefront immediately." />
      <nav className="mb-6 flex gap-1 border-b" aria-label="Content sections">
        {tabs.map((t) => (
          <Link key={t.id} href={`/admin/content?tab=${t.id}`} aria-current={t.id === tab.id ? "page" : undefined} className={cn("-mb-px border-b-2 px-4 py-2 text-sm", t.id === tab.id ? "border-ink" : "border-transparent text-taupe hover:text-ink")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab.id === "blocks" && <Blocks />}
      {tab.id === "navigation" && <Navigation />}
      {tab.id === "coupons" && <Coupons />}
      {tab.id === "reviews" && <Reviews />}
    </>
  );
}

async function Blocks() {
  const blocks = await db.contentBlock.findMany({ orderBy: [{ placement: "asc" }, { sortOrder: "asc" }] });
  return (
    <>
      <div className="mb-4 flex justify-end">
        <FormDialog title="New content block" trigger={<Button>Add block</Button>} action={saveContentBlockAction} defaults={{ type: "BANNER", placement: "home.banner", sortOrder: 0, isActive: true }} fields={BLOCK_FIELDS} />
      </div>
      <Table>
        <THead>
          <tr>
            <TH>Placement</TH>
            <TH>Type</TH>
            <TH>Title</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </tr>
        </THead>
        <tbody>
          {blocks.map((b) => (
            <TR key={b.id}>
              <TD className="font-mono text-xs">{b.placement}</TD>
              <TD>
                <Badge>{b.type}</Badge>
              </TD>
              <TD>
                {b.title}
                {b.subtitle && <span className="block text-xs text-taupe">{b.subtitle}</span>}
              </TD>
              <TD>{b.isActive ? <Badge tone="success">Live</Badge> : <Badge>Hidden</Badge>}</TD>
              <TD className="text-right">
                <div className="flex justify-end gap-1">
                  <FormDialog
                    title="Edit content block"
                    trigger={<Button size="sm" variant="ghost">Edit</Button>}
                    action={saveContentBlockAction}
                    extra={{ id: b.id }}
                    defaults={{ type: b.type, placement: b.placement, title: b.title, subtitle: b.subtitle ?? "", body: b.body ?? "", imageUrl: b.imageUrl ?? "", ctaLabel: b.ctaLabel ?? "", ctaHref: b.ctaHref ?? "", sortOrder: b.sortOrder, isActive: b.isActive }}
                    fields={BLOCK_FIELDS}
                  />
                  <ActionButton size="sm" variant="ghost" className="text-danger" action={deleteContentBlockAction} input={{ id: b.id }} confirm="Delete this block?">
                    Delete
                  </ActionButton>
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </>
  );
}

const NAV_FIELDS: FieldConfig[] = [
  { name: "label", label: "Label" },
  { name: "href", label: "Link", hint: "/path or https://" },
  { name: "location", label: "Location", type: "select", options: [{ value: "FOOTER", label: "Footer" }, { value: "HEADER", label: "Header" }] },
  { name: "group", label: "Group (footer column)" },
  { name: "sortOrder", label: "Order", type: "number" },
  { name: "isActive", label: "Active", type: "checkbox" },
];

async function Navigation() {
  const links = await db.navigationLink.findMany({ orderBy: [{ location: "asc" }, { group: "asc" }, { sortOrder: "asc" }] });
  return (
    <>
      <div className="mb-4 flex justify-end">
        <FormDialog title="New link" trigger={<Button>Add link</Button>} action={saveNavLinkAction} defaults={{ location: "FOOTER", sortOrder: 0, isActive: true }} fields={NAV_FIELDS} />
      </div>
      <Table>
        <THead>
          <tr>
            <TH>Label</TH>
            <TH>Link</TH>
            <TH>Location</TH>
            <TH>Group</TH>
            <TH className="text-right">Actions</TH>
          </tr>
        </THead>
        <tbody>
          {links.map((l) => (
            <TR key={l.id}>
              <TD>{l.label}</TD>
              <TD className="font-mono text-xs">{l.href}</TD>
              <TD>{l.location.toLowerCase()}</TD>
              <TD>{l.group ?? "—"}</TD>
              <TD className="text-right">
                <div className="flex justify-end gap-1">
                  <FormDialog title="Edit link" trigger={<Button size="sm" variant="ghost">Edit</Button>} action={saveNavLinkAction} extra={{ id: l.id }} defaults={{ label: l.label, href: l.href, location: l.location, group: l.group ?? "", sortOrder: l.sortOrder, isActive: l.isActive }} fields={NAV_FIELDS} />
                  <ActionButton size="sm" variant="ghost" className="text-danger" action={deleteNavLinkAction} input={{ id: l.id }} confirm="Delete this link?">
                    Delete
                  </ActionButton>
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </>
  );
}

const COUPON_FIELDS: FieldConfig[] = [
  { name: "code", label: "Code" },
  { name: "type", label: "Type", type: "select", options: [{ value: "PERCENTAGE", label: "Percentage off" }, { value: "FIXED", label: "Fixed amount off" }, { value: "FREE_SHIPPING", label: "Free shipping" }] },
  { name: "value", label: "Value (% or amount)", type: "number" },
  { name: "minSubtotal", label: "Minimum spend", type: "number" },
  { name: "maxRedemptions", label: "Max redemptions (blank = unlimited)", type: "number" },
  { name: "perUserLimit", label: "Per-customer limit", type: "number" },
  { name: "endsAt", label: "Ends", type: "date" },
  { name: "description", label: "Description" },
  { name: "isActive", label: "Active", type: "checkbox" },
];

async function Coupons() {
  const coupons = await db.coupon.findMany({ orderBy: { createdAt: "desc" } });
  const currency = env().STORE_CURRENCY;
  return (
    <>
      <div className="mb-4 flex justify-end">
        <FormDialog title="New coupon" trigger={<Button>Add coupon</Button>} action={saveCouponAction} defaults={{ type: "PERCENTAGE", value: 10, minSubtotal: 0, isActive: true, maxRedemptions: "", perUserLimit: "" }} fields={COUPON_FIELDS} />
      </div>
      <Table>
        <THead>
          <tr>
            <TH>Code</TH>
            <TH>Discount</TH>
            <TH>Minimum</TH>
            <TH>Redeemed</TH>
            <TH>Ends</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </tr>
        </THead>
        <tbody>
          {coupons.map((c) => (
            <TR key={c.id}>
              <TD className="font-mono">{c.code}</TD>
              <TD>{c.type === "PERCENTAGE" ? `${c.value}%` : c.type === "FIXED" ? formatMoney(c.value, currency) : "Free shipping"}</TD>
              <TD>{c.minSubtotalCents ? formatMoney(c.minSubtotalCents, currency) : "—"}</TD>
              <TD>
                {c.redemptionCount}
                {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
              </TD>
              <TD className="text-xs">{c.endsAt ? formatDate(c.endsAt) : "—"}</TD>
              <TD>{c.isActive ? <Badge tone="success">Active</Badge> : <Badge>Off</Badge>}</TD>
              <TD className="text-right">
                <FormDialog
                  title={`Edit ${c.code}`}
                  trigger={<Button size="sm" variant="ghost">Edit</Button>}
                  action={saveCouponAction}
                  defaults={{
                    code: c.code,
                    type: c.type,
                    value: c.type === "FIXED" ? c.value / 100 : c.value,
                    minSubtotal: c.minSubtotalCents / 100,
                    maxRedemptions: c.maxRedemptions ?? "",
                    perUserLimit: c.perUserLimit ?? "",
                    endsAt: c.endsAt ? c.endsAt.toISOString().slice(0, 10) : "",
                    description: c.description ?? "",
                    isActive: c.isActive,
                  }}
                  fields={COUPON_FIELDS}
                />
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </>
  );
}

async function Reviews() {
  const reviews = await db.review.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { product: { select: { name: true } }, user: { select: { email: true } } } });
  return (
    <Table>
      <THead>
        <tr>
          <TH>Product</TH>
          <TH>Review</TH>
          <TH>Author</TH>
          <TH>Status</TH>
          <TH className="text-right">Actions</TH>
        </tr>
      </THead>
      <tbody>
        {reviews.map((r) => (
          <TR key={r.id}>
            <TD>{r.product.name}</TD>
            <TD className="max-w-md">
              <Rating value={r.rating} />
              <p className="font-medium">{r.title}</p>
              <p className="text-xs text-graphite">{r.body}</p>
            </TD>
            <TD className="text-xs">
              {r.user.email}
              {r.verifiedPurchase && <span className="block text-success">Verified purchase</span>}
            </TD>
            <TD>
              <StatusPill status={r.status} />
            </TD>
            <TD className="text-right">
              <div className="flex justify-end gap-1">
                {r.status !== "APPROVED" && (
                  <ActionButton size="sm" variant="ghost" action={moderateReviewAction} input={{ id: r.id, status: "APPROVED" as const }}>
                    Approve
                  </ActionButton>
                )}
                {r.status !== "REJECTED" && (
                  <ActionButton size="sm" variant="ghost" className="text-danger" action={moderateReviewAction} input={{ id: r.id, status: "REJECTED" as const }}>
                    Reject
                  </ActionButton>
                )}
              </div>
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
