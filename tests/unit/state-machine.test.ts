import { describe, expect, it } from "vitest";
import { canTransition, ORDER_TRANSITIONS } from "@/features/orders/state-machine";

describe("order state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("PENDING_PAYMENT", "PAID")).toBe(true);
    expect(canTransition("PAID", "PROCESSING")).toBe(true);
    expect(canTransition("PROCESSING", "SHIPPED")).toBe(true);
    expect(canTransition("SHIPPED", "DELIVERED")).toBe(true);
  });
  it("blocks skipping payment and reviving terminal orders", () => {
    expect(canTransition("PENDING_PAYMENT", "SHIPPED")).toBe(false);
    expect(canTransition("CANCELLED", "PAID")).toBe(false);
    expect(canTransition("REFUNDED", "PROCESSING")).toBe(false);
    expect(canTransition("DELIVERED", "PROCESSING")).toBe(false);
  });
  it("has terminal states", () => {
    expect(ORDER_TRANSITIONS.CANCELLED).toEqual([]);
    expect(ORDER_TRANSITIONS.REFUNDED).toEqual([]);
  });
});
