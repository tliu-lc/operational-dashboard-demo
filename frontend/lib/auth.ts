import { SignJWT, jwtVerify } from "jose";

export const COOKIE_NAME = "hc_session";
const EXPIRY_SECONDS = 60 * 60 * 24; // 24h

function getKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET manquant");
  return new TextEncoder().encode(secret);
}

export async function createToken(username: string): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_SECONDS}s`)
    .sign(getKey());
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, getKey());
  return payload;
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: EXPIRY_SECONDS,
  path: "/",
};
