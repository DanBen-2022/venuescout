import { Pool } from "pg";
import shows from "@/data/shows.json";

const g = globalThis as unknown as { _vsPool?: Pool; _vsReady?: Promise<void> };

function connectionString() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function pool(): Pool {
  if (!g._vsPool) {
    const url = connectionString();
    const local = /localhost|127\.0\.0\.1|\/var\/run/.test(url);
    g._vsPool = new Pool({ connectionString: url, max: 5, ssl: local ? undefined : { rejectUnauthorized: true } });
  }
  return g._vsPool;
}

// Creates tables on first use and seeds the 2027 Javits show calendar once.
export function ready(): Promise<void> {
  if (!g._vsReady) {
    g._vsReady = (async () => {
      const db = pool();
      await db.query(`
        create table if not exists users (
          id uuid primary key default gen_random_uuid(),
          email text not null unique,
          name text not null,
          role text not null check (role in ('owner','manager','sales')),
          password_hash text,
          active boolean not null default true,
          created_at timestamptz not null default now()
        );
        create table if not exists invites (
          token text primary key,
          email text not null,
          role text not null check (role in ('owner','manager','sales')),
          invited_by uuid references users(id),
          created_at timestamptz not null default now(),
          used_at timestamptz
        );
        create table if not exists docs (
          collection text not null,
          id text not null,
          data jsonb not null,
          updated_at timestamptz not null default now(),
          updated_by uuid references users(id),
          primary key (collection, id)
        );
        create table if not exists meta (key text primary key, value text);
        create table if not exists audit (
          id bigserial primary key,
          at timestamptz not null default now(),
          actor_id uuid,
          actor_name text,
          action text not null,
          collection text,
          doc_id text,
          summary text not null,
          changes jsonb,
          ip text
        );
        create index if not exists audit_doc on audit (collection, doc_id, id desc);
      `);
      const seeded = await db.query(`select 1 from meta where key = 'seed_shows_2027'`);
      if (!seeded.rowCount) {
        for (const s of shows as Array<Record<string, unknown>>) {
          const { id, ...data } = s;
          await db.query(
            `insert into docs (collection, id, data) values ('shows', $1, $2) on conflict do nothing`,
            [id, data]
          );
        }
        await db.query(`insert into meta (key, value) values ('seed_shows_2027', now()::text) on conflict do nothing`);
      }
    })().catch((e) => {
      g._vsReady = undefined;
      throw e;
    });
  }
  return g._vsReady;
}

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ready();
  const r = await pool().query(text, params);
  return r.rows as T[];
}
