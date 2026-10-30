"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/fetcher";
import { useUiStore } from "@/stores/ui-store";
import type { CartView } from "@/types/cart";

export const CART_KEY = ["cart"] as const;

export function useCart() {
  return useQuery({ queryKey: CART_KEY, queryFn: () => api<CartView>("/api/cart"), staleTime: 15_000 });
}

function useCartMutation<V>(fn: (vars: V) => Promise<CartView>, success?: string, openDrawer = false) {
  const qc = useQueryClient();
  const setCartOpen = useUiStore((s) => s.setCartOpen);
  return useMutation({
    mutationFn: fn,
    onSuccess: (cart) => {
      qc.setQueryData(CART_KEY, cart);
      if (success) toast.success(success);
      if (openDrawer) setCartOpen(true);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });
}

export function useAddToCart() {
  return useCartMutation((v: { variantId: string; quantity?: number }) => api<CartView>("/api/cart", { method: "POST", json: { quantity: 1, ...v } }), "Added to your bag", true);
}

export function useUpdateCartItem() {
  return useCartMutation((v: { itemId: string; quantity: number }) => api<CartView>("/api/cart", { method: "PATCH", json: v }));
}

export function useApplyCoupon() {
  return useCartMutation((code: string) => api<CartView>("/api/cart/coupon", { method: "POST", json: { code } }), "Code applied");
}

export function useRemoveCoupon() {
  return useCartMutation(() => api<CartView>("/api/cart/coupon", { method: "DELETE" }));
}
