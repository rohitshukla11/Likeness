"use client";

/**
 * The cross-device demo beat for the Mera bounty. Device A creates the passkey, derives the
 * `likeness:reference` key and stores an encrypted note. Device B, with the same synced passkey,
 * derives the same key (same fingerprint) and decrypts the note live. Nothing secret is stored: the
 * panel shows the fingerprint (its own HKDF label, never the key) and the size and hash of the
 * ciphertext, which is all the server holds.
 */
import { pillClass } from "@/components/ds";
import { isMeraError } from "@category-labs/mera";
import { useState } from "react";
import { open, seal, type Sealed } from "@/lib/crypto/envelope";
import { createPasskey, namespaceKey, type NamespaceKey } from "@/lib/crypto/passkey";
import { ciphertextProof, type CiphertextProof } from "@/lib/crypto/proof";
import { vaultGet, vaultId, vaultPut } from "@/lib/crypto/vault";

const NOTE = "cross-device-note";
const NAMESPACE = "likeness:reference";
const aad = new TextEncoder().encode("likeness:reference:note");

function explain(e: unknown): string {
  if (isMeraError(e)) {
    if (e.code === "PRF_UNAVAILABLE")
      return "This passkey provider has no PRF support. Use iCloud Keychain, Google Password Manager, 1Password or a YubiKey (not Chrome's local profile, Bitwarden or Dashlane).";
    if (e.code === "PASSKEY_OPERATION_FAILED") return "The passkey prompt was cancelled or failed.";
    return `${e.code}: ${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}

export function KeysPanel() {
  const [key, setKey] = useState<NamespaceKey | null>(null);
  const [note, setNote] = useState("");
  const [stored, setStored] = useState<CiphertextProof | null>(null);
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(label: string, f: () => Promise<void>) {
    setBusy(true);
    setStatus(label);
    try {
      await f();
    } catch (e) {
      setStatus(explain(e));
    } finally {
      setBusy(false);
    }
  }

  const create = () =>
    run("Creating your passkey…", async () => {
      setKey(await createPasskey({ name: "likeness-creator", displayName: "Likeness creator" }, { kind: "reference" }));
      setStatus(null);
    });

  const store = () =>
    run("Encrypting…", async () => {
      if (!key) return;
      const id = vaultId(key.credentialId, NOTE);
      const existing = await vaultGet<Sealed>(id);
      if (existing) {
        // The vault is write-once: one note per passkey.
        setStored(await ciphertextProof(existing));
        setStatus("This passkey already has a note stored (stored notes can't be overwritten). Use “Decrypt with passkey”.");
        return;
      }
      const sealed = await seal(key.kek, new TextEncoder().encode(note), aad);
      await vaultPut(id, sealed);
      setStored(await ciphertextProof(sealed));
      setStatus("Stored. Only the ciphertext left this browser.");
    });

  // Works in a fresh browser profile: one passkey prompt derives the key, then the note is fetched and opened here.
  const decrypt = () =>
    run(key ? "Decrypting…" : "Waiting for your passkey…", async () => {
      const k = key ?? (await namespaceKey({ kind: "reference" }));
      setKey(k);
      const sealed = await vaultGet<Sealed>(vaultId(k.credentialId, NOTE));
      if (!sealed) {
        setStored(null);
        setStatus("No note is stored for this passkey yet. Encrypt one first, then decrypt it here or on another device.");
        return;
      }
      setStored(await ciphertextProof(sealed));
      setDecrypted(new TextDecoder().decode(await open(k.kek, sealed, aad)));
      setStatus(null);
    });

  return (
    <section className="rounded-[16px] border border-divider p-4">
      <h3 className="m-0 text-[18px] font-semibold">Cross-device key test</h3>
      <p className="mt-2 max-w-2xl text-[14px] text-grey">
        Your face data is encrypted in this browser with a key derived from your passkey. We never see the key, and we
        store nothing that could rebuild it. Any browser or device with the same synced passkey derives the same key.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={create} className={pillClass("ink")}>
          Create passkey
        </button>
        <button type="button" disabled={busy} onClick={decrypt} className={pillClass("outline")}>
          Decrypt with passkey
        </button>
      </div>
      <p className="mt-2 text-[13px] text-grey">On a second browser or device, skip “Create passkey”: “Decrypt with passkey” asks for your existing one.</p>

      {key && (
        <div className="mt-6 space-y-5">
          <dl className="grid grid-cols-1 gap-y-3 text-[14px] sm:grid-cols-[10rem_1fr] sm:gap-x-4">
            <dt className="text-dim">Namespace</dt>
            <dd className="m-0">
              <span className="font-mono">{NAMESPACE}</span>
              <span className="block text-[13px] text-grey">The salt sent to your passkey. Each purpose has its own salt, so each gets an unrelated key.</span>
            </dd>
            <dt className="text-dim">Key fingerprint</dt>
            <dd className="m-0">
              <span className="tnum font-mono text-ok">{key.fingerprint}</span>
              <span className="block text-[13px] text-grey">
                This fingerprint comes from your passkey. Open this page in another browser with the same passkey and it will match. It is
                derived separately from the key, so it can&apos;t be used to rebuild it.
              </span>
            </dd>
            {stored && (
              <>
                <dt className="text-dim">Stored on our server</dt>
                <dd className="m-0">
                  <span className="tnum font-mono">
                    ciphertext · {stored.bytes} bytes · sha256 {stored.sha256}…
                  </span>
                  <span className="block text-[13px] text-grey">That&apos;s all the server keeps: AES-256-GCM ciphertext it can&apos;t read without your passkey.</span>
                </dd>
              </>
            )}
          </dl>
          <div className="flex flex-wrap gap-3">
            <label htmlFor="keys-note" className="sr-only">
              A note to encrypt
            </label>
            <input
              id="keys-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A note to encrypt"
              className="min-h-11 w-full max-w-80 rounded-[14px] border border-field bg-white px-4 py-2 text-[15px]"
            />
            <button type="button" disabled={busy || !note} onClick={store} className={pillClass("outline")}>
              Encrypt and store
            </button>
          </div>
          {decrypted !== null && (
            <p className="text-[14px]">
              Decrypted in this browser: <span className="font-mono text-ok">{decrypted}</span>
            </p>
          )}
        </div>
      )}
      {status && <p role="status" className="mt-4 text-[14px] text-wait">{status}</p>}
    </section>
  );
}
