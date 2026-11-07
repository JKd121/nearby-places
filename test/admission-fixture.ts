import { mock } from "node:test";
import type { BeforeAmapAttempt } from "../src/amap/transport.js";

export let admissionHook: BeforeAmapAttempt = async () => {};
export function setAdmissionHook(hook: BeforeAmapAttempt) { admissionHook = hook; }
mock.module("../src/server/admission.js", { namedExports: { getServerAdmission: () => (...args: Parameters<BeforeAmapAttempt>) => admissionHook(...args) } });

export const getTestAccess = () => ({ key: process.env.AMAP_WEB_SERVICE_KEY ?? "test-key", options: { beforeAttempt: (...args: Parameters<BeforeAmapAttempt>) => admissionHook(...args) } });
mock.module("../src/server/amap-access.js", { namedExports: { resolveAmapAccess: async () => { if (!process.env.AMAP_WEB_SERVICE_KEY?.trim()) { const { MissingServerKeyError } = await import("../src/server/amap.js"); throw new MissingServerKeyError(); } return getTestAccess(); } } });
