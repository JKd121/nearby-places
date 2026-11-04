// Deliberately ignore DATABASE_URL and all dotenv files when choosing a test DB.
export function historyDatabaseUrl() {
  const value = process.env.NEARBY_HISTORY_TEST_DATABASE_URL;
  if (!value) throw new Error("Set NEARBY_HISTORY_TEST_DATABASE_URL to a disposable loopback database");
  const url = new URL(value);
  if (!["postgresql:", "postgres:"].includes(url.protocol) || url.hostname !== "127.0.0.1" ||
      !/^\/nearby_history_test[a-z0-9_]*$/.test(url.pathname) || url.search || url.hash) {
    throw new Error("History integration requires a loopback nearby_history_test database without URL options");
  }
  return url;
}
