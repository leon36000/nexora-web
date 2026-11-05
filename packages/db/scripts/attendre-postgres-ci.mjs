import postgres from "postgres";

// Le service PostgreSQL CI est isolé dans le pod et partage seulement son socket.
const sql = postgres("postgres://nexora_ci@localhost/postgres", {
  host: "/builds",
  max: 1,
  connect_timeout: 2,
  onnotice: () => {},
});

try {
  for (let attempt = 0; ; attempt++) {
    try {
      await sql`SELECT 1`;
      break;
    } catch (error) {
      if (attempt >= 29) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
} finally {
  await sql.end({ timeout: 2 });
}
