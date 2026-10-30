import { requireAdminPage } from "@/lib/auth/guards";
import { listAuditLog } from "@/server/services/admin.service";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { Pagination } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; actor?: string; page?: string }> }) {
  await requireAdminPage("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total, pageCount } = await listAuditLog({ q: sp.q?.slice(0, 80), actorId: sp.actor, page });
  return (
    <>
      <PageHeader title="Audit log" description={`${total} entries · append-only (the database rejects edits and deletions)`} />
      <form className="mb-4 flex gap-2" role="search">
        <Input name="q" defaultValue={sp.q} placeholder="Action, entity or id" className="h-10 max-w-xs" aria-label="Search audit log" />
        {sp.actor && <input type="hidden" name="actor" value={sp.actor} />}
        <Button type="submit" variant="outline" className="h-10">
          Search
        </Button>
      </form>
      <Table>
        <THead>
          <tr>
            <TH>When</TH>
            <TH>Actor</TH>
            <TH>Action</TH>
            <TH>Entity</TH>
            <TH>Details</TH>
            <TH>IP</TH>
          </tr>
        </THead>
        <tbody>
          {items.map((a) => (
            <TR key={a.id}>
              <TD className="whitespace-nowrap text-xs">{formatDate(a.createdAt, { dateStyle: "short", timeStyle: "medium" })}</TD>
              <TD className="text-xs">{a.actor?.email ?? "system"}</TD>
              <TD className="font-mono text-xs">{a.action}</TD>
              <TD className="text-xs">
                {a.entityType}
                <span className="block font-mono text-taupe">{a.entityId}</span>
              </TD>
              <TD className="max-w-sm truncate font-mono text-[11px] text-taupe">{a.metadata ? JSON.stringify(a.metadata) : ""}</TD>
              <TD className="text-xs text-taupe">{a.ip}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <Pagination page={page} pageCount={pageCount} hrefFor={(p) => `/admin/audit?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.actor ? { actor: sp.actor } : {}), page: String(p) })}`} />
    </>
  );
}
