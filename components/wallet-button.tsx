"use client";

import { useCallback, useEffect, useState } from "react";
import bs58 from "bs58";
import { useClient } from "@solana/react";
import { useConnect, useConnectedWallet, useDisconnect, useSignMessage, useWalletStatus, useWallets } from "@solana/kit-plugin-wallet/react";
import type { AppClient } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/use-session";

function truncate(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

export function WalletButton() {
  const client = useClient<AppClient>();
  const status = useWalletStatus(client);
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const connect = useConnect(client);
  const disconnect = useDisconnect(client);
  const signMessage = useSignMessage(client);
  const { session, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const address = connected ? String(connected.account.address) : null;
  const signedIn = !!session.wallet && session.wallet === address;

  const signIn = useCallback(async () => {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const { nonce, message } = await fetch("/api/auth/nonce").then((r) => r.json());
      const sigBytes = await signMessage.dispatchAsync(new TextEncoder().encode(message));
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, message, nonce, signature: bs58.encode(sigBytes) }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "sign-in failed");
      await refresh();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [address, signMessage, refresh]);

  // Auto sign-in once a wallet connects and the session is not for this address.
  useEffect(() => {
    if (address && !signedIn && !busy && session.loaded && !session.wallet) void signIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, session.loaded]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    await refresh();
    void disconnect.dispatch();
    setOpen(false);
  }

  if (!mounted) return <Button disabled>Connect wallet</Button>;

  return (
    <div className="relative">
      {address ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-md border bg-white py-1 pl-1 pr-3 text-sm shadow-sm hover:bg-muted"
          title={address}
        >
          <span className="flex size-7 items-center justify-center rounded bg-primary text-xs font-semibold text-white">{address.slice(0, 1).toUpperCase()}</span>
          <span className="font-mono text-xs">{truncate(address)}</span>
          <span className={`size-2 rounded-full ${signedIn ? "bg-sol" : "bg-amber-400"}`} />
        </button>
      ) : (
        <Button onClick={() => setOpen((v) => !v)} disabled={status === "pending"}>
          Connect wallet
        </Button>
      )}
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border bg-popover p-3 shadow-lg">
          {connected ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Connected (testnet)</p>
              <p className="font-mono text-sm break-all">{address}</p>
              {!signedIn && (
                <Button size="sm" className="w-full" onClick={signIn} disabled={busy}>
                  {busy ? "Waiting for signature…" : "Sign in with Solana"}
                </Button>
              )}
              <Button size="sm" variant="outline" className="w-full" onClick={signOut}>
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Choose a wallet</p>
              {wallets.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No wallet detected. Install <a className="underline" href="https://phantom.app" target="_blank" rel="noreferrer">Phantom</a> and switch it to Testnet.
                </p>
              )}
              {wallets.map((w) => (
                <button
                  key={w.name}
                  type="button"
                  disabled={connect.isRunning}
                  onClick={() => {
                    void connect.dispatch(w);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                >
                  {w.icon && <img src={w.icon} alt="" className="size-5 rounded" />}
                  {w.name}
                </button>
              ))}
            </div>
          )}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
