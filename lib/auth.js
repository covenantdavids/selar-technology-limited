import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import crypto from 'crypto';

const key = () => new TextEncoder().encode(process.env.SESSION_SECRET || '');

export async function sign(payload, ttl) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(ttl).sign(key());
}
async function verify(token) {
  try { return (await jwtVerify(token, key())).payload; } catch { return null; }
}
export async function setCookie(name, token, maxAge) {
  (await cookies()).set(name, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge,
  });
}
export async function clearCookie(name) { (await cookies()).delete(name); }
async function read(name) {
  const t = (await cookies()).get(name)?.value;
  return t ? verify(t) : null;
}
export async function getUserId() {
  const p = await read('st_session');
  return p && p.role === 'user' ? p.uid : null;
}
export async function isAdmin() {
  const p = await read('st_admin');
  return !!p && p.role === 'admin';
}
export function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
