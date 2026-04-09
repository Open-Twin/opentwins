import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

function findMigrationsDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // Walk up to find src/db/migrations
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, 'src', 'db', 'migrations');
    if (existsSync(candidate)) return candidate;
    dir = resolve(dir, '..');
  }
  // Fallback
  return resolve(__dirname, 'migrations');
}

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const migrationsDir = findMigrationsDir();
  if (!existsSync(migrationsDir)) return;

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name)
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(resolve(migrationsDir, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
  }
}
