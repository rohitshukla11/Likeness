import { afterEach, describe, expect, it, vi } from "vitest";
import { integrations } from "./integrations";

describe("status: gas top-up", () => {
  afterEach(() => vi.unstubAllEnvs());
  const drip = () => integrations().find((i) => i.key === "gas-drip")!;

  it("is listed, and configured when the drip key is set", () => {
    vi.stubEnv("DRIP_KEY_FILE", "/nonexistent");
    vi.stubEnv("DRIP_PRIVATE_KEY", "0x" + "11".repeat(32));
    expect(drip()).toMatchObject({ configured: true });
  });

  it("is not configured without a key", () => {
    vi.stubEnv("DRIP_PRIVATE_KEY", "");
    vi.stubEnv("DRIP_KEY_FILE", "/nonexistent");
    expect(drip().configured).toBe(false);
  });
});
