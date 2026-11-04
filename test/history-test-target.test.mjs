import { test } from "node:test";
import assert from "node:assert/strict";
import { historyDatabaseUrl } from "../e2e/database-target.mjs";

test("history integration accepts only explicit loopback disposable targets", () => {
  const previous = process.env.NEARBY_HISTORY_TEST_DATABASE_URL;
  try {
    for (const value of [undefined, "postgresql://test@db.example/nearby_history_test", "postgresql://test@127.0.0.1/production", "postgresql://test@127.0.0.1/nearby_history_test?options=-csearch_path=public", "postgresql://test@127.0.0.1/nearby_history_test/other"]) {
      if (value === undefined) delete process.env.NEARBY_HISTORY_TEST_DATABASE_URL;
      else process.env.NEARBY_HISTORY_TEST_DATABASE_URL = value;
      assert.throws(historyDatabaseUrl);
    }
    process.env.NEARBY_HISTORY_TEST_DATABASE_URL = "postgresql://test@127.0.0.1:55441/nearby_history_test_local";
    assert.equal(historyDatabaseUrl().pathname, "/nearby_history_test_local");
  } finally {
    if (previous === undefined) delete process.env.NEARBY_HISTORY_TEST_DATABASE_URL;
    else process.env.NEARBY_HISTORY_TEST_DATABASE_URL = previous;
  }
});
