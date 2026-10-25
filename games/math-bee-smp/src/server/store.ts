import type { Identity, Room } from '../game/types.ts';
import { advanceRoom, heartbeat, publicSnapshot, GameError } from '../game/engine.ts';

export interface SessionRow extends Identity { expiresAt: number }
const SESSION_MS = 24 * 60 * 60 * 1000;
const ROOM_MS = 6 * 60 * 60 * 1000;

export async function hashToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}
export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
}
export function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), value => alphabet[value % alphabet.length]).join('');
}
export async function session(db: D1Database, token: string | null, now: number): Promise<SessionRow | null> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return db.prepare('SELECT id, name, avatar, expires_at AS expiresAt FROM guest_sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(await hashToken(token), now).first<SessionRow>();
}
export async function saveSession(db: D1Database, identity: Identity, token: string, now: number): Promise<void> {
  await db.prepare('INSERT INTO guest_sessions (token_hash,id,name,avatar,expires_at) VALUES (?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET name=excluded.name,avatar=excluded.avatar,expires_at=excluded.expires_at')
    .bind(await hashToken(token), identity.id, identity.name, identity.avatar, now + SESSION_MS).run();
}
export async function rateLimit(db: D1Database, key: string, maximum: number, now: number): Promise<void> {
  const bucket = `${key}:${Math.floor(now / 60_000)}`;
  const row = await db.prepare('INSERT INTO api_limits (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits')
    .bind(bucket, now + 120_000).first<{hits:number}>();
  if (!row || row.hits > maximum) throw new GameError('Terlalu banyak permintaan. Tunggu sebentar, ya.', 429, 'RATE_LIMIT');
}
export async function insertRoom(db: D1Database, room: Room, now: number): Promise<boolean> {
  const result = await db.prepare('INSERT OR IGNORE INTO game_rooms (code,version,state,expires_at) VALUES (?,?,?,?)')
    .bind(room.code, room.version, JSON.stringify(room), now + ROOM_MS).run();
  return result.meta.changes === 1;
}
export async function mutateRoom(
  db: D1Database,
  code: string,
  identity: Identity,
  action: ((room:Room, now:number) => void) | null,
  now: number,
  joining = false,
) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const stored = await db.prepare('SELECT version,state FROM game_rooms WHERE code=? AND expires_at>?')
      .bind(code, now).first<{version:number;state:string}>();
    if (!stored) throw new GameError('Room tidak ditemukan atau sudah berakhir.', 404, 'ROOM_NOT_FOUND');
    const room = JSON.parse(stored.state) as Room;
    if (!joining && !room.players.some(p => p.id === identity.id && !p.left)) {
      throw new GameError('Masukkan kode room untuk bergabung dahulu.', 403, 'NOT_A_MEMBER');
    }
    advanceRoom(room, now);
    if (!joining) heartbeat(room, identity.id, now);
    if (action) action(room, now);
    const nextVersion = Math.max(stored.version + 1, room.version);
    room.version = nextVersion;
    const result = await db.prepare('UPDATE game_rooms SET version=?,state=?,expires_at=? WHERE code=? AND version=?')
      .bind(nextVersion, JSON.stringify(room), now + ROOM_MS, code, stored.version).run();
    if (result.meta.changes === 1) return publicSnapshot(room, identity.id, now);
  }
  throw new GameError('Room sedang sibuk. Coba lagi sebentar.', 409, 'CONCURRENT_UPDATE');
}
export async function cleanup(db:D1Database, now:number) {
  await db.batch([
    db.prepare('DELETE FROM guest_sessions WHERE expires_at < ?').bind(now),
    db.prepare('DELETE FROM game_rooms WHERE expires_at < ?').bind(now),
    db.prepare('DELETE FROM api_limits WHERE expires_at < ?').bind(now),
  ]);
}
