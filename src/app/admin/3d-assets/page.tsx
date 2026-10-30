import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { formatBytes, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/admin/shell";
import { ActionButton } from "@/components/admin/admin-ui";
import { Uploader } from "@/components/admin/uploader";
import { Badge, StatusPill } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { deleteModelAction, reprocessModelAction, unassignModelAction } from "@/features/admin/actions";
import { AssetPreview } from "./asset-preview";
import { AssignToProduct } from "./asset-assign";

export const metadata = { title: "3D assets" };

interface Compat {
  score: number;
  extensions: string[];
  issues: { level: "error" | "warning" | "info"; message: string }[];
}

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  await requireAdminPage("assets.manage");
  const sp = await searchParams;
  const [assets, products] = await Promise.all([
    db.productModel3D.findMany({ where: { deletedAt: null }, include: { product: { select: { id: true, name: true, garmentKind: true } } }, orderBy: { createdAt: "desc" } }),
    db.product.findMany({ where: { deletedAt: null, model3D: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const preview = assets.find((a) => a.id === sp.preview && a.status === "READY") ?? null;
  const totalBytes = assets.reduce((s, a) => s + a.fileSize, 0);

  return (
    <>
      <PageHeader
        title="3D assets"
        description={`${assets.length} models · ${formatBytes(totalBytes)} · only .glb / .gltf (glTF 2.0) are accepted, validated server-side and never executed`}
        actions={<Uploader kind="model" label="Upload GLB / glTF" multiple />}
      />
      {preview && (
        <section className="mb-8 grid gap-6 border bg-surface p-4 md:grid-cols-[minmax(0,420px)_1fr]">
          <div className="relative aspect-[3/4] bg-bone">
            <AssetPreview url={preview.url} hasDraco={preview.hasDraco} hasKtx2={preview.hasKtx2} hasMeshopt={preview.hasMeshopt} fileSize={preview.fileSize} name={preview.name} kind={preview.product?.garmentKind ?? "TOP"} />
          </div>
          <div className="text-sm">
            <h2 className="text-xl font-medium tracking-tight">{preview.name}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
              <dt className="text-taupe">File size</dt>
              <dd>{formatBytes(preview.fileSize)}</dd>
              <dt className="text-taupe">Triangles</dt>
              <dd>{preview.triangleCount?.toLocaleString()}</dd>
              <dt className="text-taupe">Meshes / materials</dt>
              <dd>
                {preview.meshCount} / {preview.materialCount}
              </dd>
              <dt className="text-taupe">Textures</dt>
              <dd>{preview.textureCount}</dd>
              <dt className="text-taupe">Compression</dt>
              <dd>{[preview.hasDraco && "Draco", preview.hasMeshopt && "Meshopt", preview.hasKtx2 && "KTX2"].filter(Boolean).join(", ") || "None"}</dd>
            </dl>
            {Array.isArray(preview.textureInfo) && (preview.textureInfo as { name: string; mimeType: string; bytes: number | null }[]).length > 0 && (
              <ul className="mt-4 text-xs text-taupe">
                {(preview.textureInfo as { name: string; mimeType: string; bytes: number | null }[]).map((t) => (
                  <li key={t.name}>
                    {t.name} · {t.mimeType} · {t.bytes ? formatBytes(t.bytes) : "—"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
      <Table>
        <THead>
          <tr>
            <TH>Model</TH>
            <TH>Status</TH>
            <TH>Size</TH>
            <TH>Geometry</TH>
            <TH>Optimisation</TH>
            <TH>Compatibility</TH>
            <TH>Product</TH>
            <TH className="text-right">Actions</TH>
          </tr>
        </THead>
        <tbody>
          {assets.map((a) => {
            const compat = a.compatibility as Compat | null;
            return (
              <TR key={a.id}>
                <TD>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-xs text-taupe">
                    {a.format.toUpperCase()} · {formatDate(a.createdAt)}
                  </p>
                </TD>
                <TD>
                  <StatusPill status={a.status} />
                  {a.errorMessage && <p className="mt-1 max-w-xs text-xs text-danger">{a.errorMessage}</p>}
                </TD>
                <TD className="tabular-nums">{formatBytes(a.fileSize)}</TD>
                <TD className="text-xs">
                  {a.triangleCount?.toLocaleString() ?? "—"} tris
                  <br />
                  {a.meshCount ?? 0} meshes · {a.textureCount ?? 0} tex
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {a.hasDraco && <Badge tone="success">Draco</Badge>}
                    {a.hasMeshopt && <Badge tone="success">Meshopt</Badge>}
                    {a.hasKtx2 && <Badge tone="success">KTX2</Badge>}
                    {!a.hasDraco && !a.hasMeshopt && !a.hasKtx2 && <Badge>Uncompressed</Badge>}
                  </div>
                </TD>
                <TD>
                  {compat ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer">
                        <span className={compat.score >= 80 ? "text-success" : compat.score >= 50 ? "text-warning" : "text-danger"}>{compat.score}/100</span> · {compat.issues.length} note{compat.issues.length === 1 ? "" : "s"}
                      </summary>
                      <ul className="mt-2 max-w-xs space-y-1">
                        {compat.issues.map((i, k) => (
                          <li key={k} className={i.level === "error" ? "text-danger" : i.level === "warning" ? "text-warning" : "text-taupe"}>
                            {i.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD className="text-sm">
                  {a.product ? (
                    <span>
                      {a.product.name}
                      <ActionButton size="sm" variant="link" className="ml-2 text-xs" action={unassignModelAction} input={{ id: a.id }}>
                        Unassign
                      </ActionButton>
                    </span>
                  ) : a.status === "READY" && products.length ? (
                    <AssignToProduct assetId={a.id} products={products} />
                  ) : (
                    <span className="text-taupe">—</span>
                  )}
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    {a.status === "READY" && (
                      <a href={`/admin/3d-assets?preview=${a.id}`} className="px-2 py-1 text-xs underline underline-offset-4">
                        Preview
                      </a>
                    )}
                    <ActionButton size="sm" variant="ghost" action={reprocessModelAction} input={{ id: a.id }}>
                      Re-check
                    </ActionButton>
                    <ActionButton size="sm" variant="ghost" className="text-danger" action={deleteModelAction} input={{ id: a.id }} confirm="Delete this model permanently?">
                      Delete
                    </ActionButton>
                  </div>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
