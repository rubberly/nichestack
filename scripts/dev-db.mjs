// Starts a real local Postgres with no installer, Docker or account needed.
// Data lives in ./.dev-db (git-ignored). Leave this running in its own terminal; Ctrl+C stops it.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const PORT = 5433;
const pg = new EmbeddedPostgres({
  databaseDir: "./.dev-db",
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true,
  onLog: () => {},
});

if (!existsSync("./.dev-db/PG_VERSION")) {
  console.log("First run: creating the local database (takes a few seconds)...");
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase("nichestack");
} catch {
  // already exists
}

console.log(`\n✅ Local Postgres is running.
   DATABASE_URL="postgresql://postgres:postgres@localhost:${PORT}/nichestack"
   Keep this window open. Press Ctrl+C to stop.\n`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
