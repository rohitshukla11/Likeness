/**
 * What the server holds for a sealed envelope, in a form safe to show: the ciphertext's size and a
 * short sha256 of it. Both are computed from the ciphertext only, so they reveal nothing about the
 * plaintext or the key, and anyone can recompute them from the stored object.
 */
import { b64u } from "./encoding";
import { sha256Hex, type Sealed } from "./envelope";

export type CiphertextProof = { bytes: number; sha256: string };

/** Size of the AES-GCM ciphertext (including its 16-byte tag) and the first 16 hex digits of its sha256. */
export async function ciphertextProof(sealed: Sealed): Promise<CiphertextProof> {
  const ct = b64u.decode(sealed.ct);
  return { bytes: ct.length, sha256: (await sha256Hex(ct)).slice(0, 16) };
}
