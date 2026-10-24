import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export interface SessionData {
  wallet?: string;
}

export const sessionOptions: SessionOptions = {
  password: env.SESSION_SECRET.padEnd(32, "x"),
  cookieName: "labelpay_session",
  cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function requireWallet(): Promise<string | null> {
  const s = await getSession();
  return s.wallet ?? null;
}
