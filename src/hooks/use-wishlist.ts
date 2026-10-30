"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/fetcher";

const KEY = ["wishlist-ids"] as const;

export function useWishlistIds() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<{ ids: string[]; authenticated: boolean }>("/api/wishlist"),
    staleTime: 60_000,
  });
}

export function useToggleWishlist() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (productId: string) => api<{ saved: boolean }>("/api/wishlist", { method: "POST", json: { productId } }),
    onMutate: async (productId) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<{ ids: string[]; authenticated: boolean }>(KEY);
      if (prev?.authenticated) {
        qc.setQueryData(KEY, { ...prev, ids: prev.ids.includes(productId) ? prev.ids.filter((i) => i !== productId) : [...prev.ids, productId] });
      }
      return { prev };
    },
    onSuccess: (res) => toast.success(res.saved ? "Saved to your wishlist" : "Removed from your wishlist"),
    onError: (err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      if (err instanceof ApiError && err.status === 401) {
        toast("Sign in to save pieces to your wishlist");
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "Couldn't update wishlist");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
