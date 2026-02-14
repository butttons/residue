const migrations = import.meta.glob("../migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

export async function applyMigrations(db: D1Database): Promise<void> {
  const files = Object.keys(migrations).sort();
  for (const file of files) {
    const sql = migrations[file] as string;
    for (const stmt of sql.split(";").filter((s) => s.trim())) {
      await db.prepare(stmt).run();
    }
  }
}
