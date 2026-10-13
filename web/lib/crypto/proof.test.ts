import { describe, expect, it } from "vitest";
import { b64u } from "./encoding";
import { open, seal, sha256Hex } from "./envelope";
import { ciphertextProof } from "./proof";

const enc = new TextEncoder();
const aad = enc.encode("likeness:reference:note");
const key = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

describe("ciphertext proof", () => {
  it("reports the ciphertext's size (plaintext + 16-byte tag) and a 16-hex prefix of its sha256", async () => {
    const note = enc.encode("hello from device A");
    const sealed = await seal(await key(), note, aad);
    const p = await ciphertextProof(sealed);
    expect(p.bytes).toBe(note.length + 16);
    expect(p.sha256).toMatch(/^[0-9a-f]{16}$/);
    expect((await sha256Hex(b64u.decode(sealed.ct))).startsWith(p.sha256)).toBe(true);
  });

  it("never contains the plaintext, and differs for the same note sealed twice", async () => {
    const k = await key();
    const note = enc.encode("same note");
    const [a, b] = [await seal(k, note, aad), await seal(k, note, aad)];
    expect(new TextDecoder().decode(await open(k, a, aad))).toBe("same note");
    const [pa, pb] = [await ciphertextProof(a), await ciphertextProof(b)];
    expect(pa.sha256).not.toBe(pb.sha256);
    expect(JSON.stringify(pa)).not.toContain("same note");
  });
});
