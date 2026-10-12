// Kysely on top of Node's built-in SQLite (node:sqlite), so there is no native npm dependency.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { Kysely, SqliteDialect, type SqliteDatabase, type SqliteStatement } from "kysely";
import type { DB } from "./db-types.ts";

export const DB_PATH = fileURLToPath(new URL("../../db/esplain.db", import.meta.url));

export function openSqlite(readOnly = false): DatabaseSync {
  const db = new DatabaseSync(DB_PATH, { readOnly });
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function bind(params: ReadonlyArray<unknown>): SQLInputValue[] {
  return params.map((p) => (typeof p === "boolean" ? Number(p) : p) as SQLInputValue);
}

function adapt(db: DatabaseSync): SqliteDatabase {
  return {
    close: () => db.close(),
    prepare(sql): SqliteStatement {
      const stmt = db.prepare(sql);
      return {
        reader: stmt.columns().length > 0,
        all: (params) => stmt.all(...bind(params)),
        run: (params) => stmt.run(...bind(params)),
        iterate: (params) => stmt.iterate(...bind(params)),
      };
    },
  };
}

export function openDb(readOnly = true): Kysely<DB> {
  return new Kysely<DB>({ dialect: new SqliteDialect({ database: adapt(openSqlite(readOnly)) }) });
}
