import { mock } from "node:test";
import type { BeforeAmapAttempt } from "../src/amap/transport.js";

export let admissionHook: BeforeAmapAttempt = async () => {};
export function setAdmissionHook(hook: BeforeAmapAttempt) { admissionHook = hook; }
mock.module("../src/server/admission.js", { namedExports: { getServerAdmission: () => (...args: Parameters<BeforeAmapAttempt>) => admissionHook(...args) } });
