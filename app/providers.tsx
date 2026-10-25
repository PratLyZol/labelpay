"use client";

import { createClient } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { ClientProvider } from "@solana/react";
import { DEFAULT_SOLANA_RPC_URL, SOLANA_CHAIN } from "@/lib/solana/network";

const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL;

export const client = createClient()
  .use(walletSigner({ chain: SOLANA_CHAIN }))
  .use(solanaRpc({ rpcUrl }));

export type AppClient = typeof client;

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>;
}
