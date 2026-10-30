"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setRolePermissionsAction } from "@/features/admin/actions";
import { Button } from "@/components/ui/button";

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  users: number;
  permissions: string[];
}

export function RoleMatrix({ roles, groups }: { roles: Role[]; groups: Record<string, { key: string; description: string }[]> }) {
  const editable = roles.filter((r) => r.key !== "CUSTOMER");
  const [state, setState] = useState(() => Object.fromEntries(editable.map((r) => [r.id, new Set(r.permissions)])));
  const [pending, start] = useTransition();
  const router = useRouter();

  const toggle = (roleId: string, perm: string) =>
    setState((s) => {
      const next = new Set(s[roleId]);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return { ...s, [roleId]: next };
    });

  const save = (role: Role) =>
    start(async () => {
      const res = await setRolePermissionsAction({ roleId: role.id, permissions: [...(state[role.id] ?? [])] });
      if (res.ok) {
        toast.success(`${role.name} updated`);
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <div className="overflow-x-auto border bg-surface">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="sticky top-0 bg-ivory">
          <tr className="border-b">
            <th className="p-3 text-left font-medium">Permission</th>
            {editable.map((r) => (
              <th key={r.id} className="p-3 text-center align-bottom font-medium">
                <span className="block">{r.name}</span>
                <span className="block text-[11px] font-normal text-taupe">{r.users} member{r.users === 1 ? "" : "s"}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(groups).map(([group, perms]) => (
            <Fragment key={group}>
              <tr className="bg-bone/50">
                <td colSpan={editable.length + 1} className="eyebrow px-3 py-2 text-graphite">
                  {group}
                </td>
              </tr>
              {perms.map((p) => (
                <tr key={p.key} className="border-b last:border-0">
                  <td className="p-3">
                    <code className="text-xs">{p.key}</code>
                    <span className="block text-xs text-taupe">{p.description}</span>
                  </td>
                  {editable.map((r) => (
                    <td key={r.id} className="p-3 text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-ink"
                        aria-label={`${r.name}: ${p.key}`}
                        checked={r.key === "SUPER_ADMIN" || !!state[r.id]?.has(p.key)}
                        disabled={r.key === "SUPER_ADMIN"}
                        onChange={() => toggle(r.id, p.key)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
          <tr className="border-t">
            <td className="p-3 text-xs text-taupe">Super admin always holds every permission.</td>
            {editable.map((r) => (
              <td key={r.id} className="p-3 text-center">
                {r.key !== "SUPER_ADMIN" && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => save(r)}>
                    Save
                  </Button>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
