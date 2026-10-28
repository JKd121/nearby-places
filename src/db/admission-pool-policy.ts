/** Preparation owns cold connect; reservation/SQL/HTTP deadlines stay separate. */
export function admissionPoolPolicy(vercel: boolean) {
  return {
    max: 4,
    min: vercel ? 0 : 1,
    idleTimeoutMillis: vercel ? 5_000 : 60_000,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 8_000,
    // Intentionally omitted from connection startup: statement_timeout,
    // lock_timeout and idle_in_transaction_session_timeout.
    // Defer provider startup-parameter compatibility investigation.
    // PostgresAdmissionStore retains its existing transaction-local limits.
    query_timeout: 1_200,
  };
}
