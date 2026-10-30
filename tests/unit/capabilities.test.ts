import { describe, expect, it } from "vitest";
import { classify, type DeviceSignals } from "@/features/showroom/capabilities";

const signals = (over: Partial<DeviceSignals> = {}): DeviceSignals => ({
  webgl: true,
  webgl2: true,
  renderer: "ANGLE (Apple, Apple M2, OpenGL 4.1)",
  cores: 8,
  memoryGb: 8,
  isTouch: false,
  screenWidth: 1440,
  devicePixelRatio: 2,
  reducedMotion: false,
  saveData: false,
  ...over,
});

describe("device capability classification", () => {
  it("falls back to 2D without WebGL", () => {
    const c = classify(signals({ webgl: false }));
    expect(c.webgl).toBe(false);
    expect(c.loadRadius).toBe(0);
  });
  it("gives strong desktops the high tier", () => {
    const c = classify(signals());
    expect(c.tier).toBe("high");
    expect(c.dpr[1]).toBe(2);
  });
  it("treats mid-range Android phones conservatively", () => {
    const c = classify(signals({ renderer: "Mali-G57", cores: 8, memoryGb: 4, isTouch: true, screenWidth: 400, devicePixelRatio: 3 }));
    expect(c.tier).toBe("mid");
    expect(c.dpr[1]).toBeLessThanOrEqual(1.5);
    expect(c.loadRadius).toBeLessThan(3);
  });
  it("detects weak / software renderers", () => {
    const c = classify(signals({ renderer: "Google SwiftShader", cores: 4, memoryGb: 2 }));
    expect(c.tier).toBe("low");
    expect(c.shadows).toBe(false);
  });
  it("respects data saver and reduced motion", () => {
    expect(classify(signals({ saveData: true, cores: 4, memoryGb: 4, renderer: "" })).tier).not.toBe("high");
    expect(classify(signals({ reducedMotion: true })).reducedMotion).toBe(true);
  });
});
