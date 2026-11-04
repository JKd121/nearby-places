import { Socket } from "node:net";

// A missing mock must fail locally, including attempts made through pg/http.
Socket.prototype.connect = function () { throw new Error("API isolation: real sockets are disabled"); };
globalThis.fetch = async () => { throw new Error("API isolation: install an explicit fetch mock"); };
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/nearby_api_test";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.AMAP_WEB_SERVICE_KEY = "synthetic-api-key";

for (const key of ["AMAP_UPSTREAM_TIMEOUT_MS", "AMAP_REQUEST_TIMEOUT_MS", "AMAP_MAX_RESPONSE_BYTES", "AMAP_HOST_MAX_DURATION_MS"]) delete process.env[key];
