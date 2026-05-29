import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createToken, COOKIE_NAME, COOKIE_OPTIONS } from "@/lib/auth";

// Map<ip, {count, resetAt}>
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX = 5;
const WINDOW_MS = 15 * 60 * 1000;

function getUsers(): Record<string, string> {
  // AUTH_USERS_B64 : JSON encodé base64 (évite les problèmes d'interpolation dotenv avec les $ de bcrypt)
  // AUTH_USERS     : JSON brut (Secret Manager en prod — pas de dotenv expansion)
  const b64 = process.env.AUTH_USERS_B64;
  const raw = b64
    ? Buffer.from(b64, "base64").toString("utf-8")
    : (process.env.AUTH_USERS ?? "{}");
  return JSON.parse(raw);
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  const now = Date.now();

  // Nettoyer les entrées expirées
  for (const [key, val] of attempts.entries()) {
    if (now >= val.resetAt) attempts.delete(key);
  }

  const entry = attempts.get(ip);
  if (entry && entry.count >= MAX && now < entry.resetAt) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans 15 minutes." },
      { status: 429 }
    );
  }

  const { username, password } = await req.json();

  let valid = false;
  try {
    const users = getUsers();
    const hash = users[username];
    if (hash) valid = await bcrypt.compare(password, hash);
  } catch {
    valid = false;
  }

  if (!valid) {
    // Incrémenter le compteur de tentatives échouées
    const current = attempts.get(ip);
    if (current && now < current.resetAt) {
      current.count += 1;
    } else {
      attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    }
    await new Promise(r => setTimeout(r, 400));
    return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
  }

  // Réinitialiser le compteur après login réussi
  attempts.delete(ip);

  const token = await createToken(username);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS);
  return res;
}
