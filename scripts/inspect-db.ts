import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

async function inspect() {
  const p = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const res = await p.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  console.log("Current tables in database:", res.rows.map((r) => r.table_name));

  for (const t of res.rows) {
    const cols = await p.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`,
      [t.table_name]
    );
    console.log(`\nTable [${t.table_name}]:`);
    console.log(cols.rows.map((c) => `${c.column_name} (${c.data_type})`).join(", "));
  }

  await p.end();
}

inspect().catch(console.error);
