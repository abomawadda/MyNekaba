#!/usr/bin/env node
/* global process */
import { validateJitServerEnv } from "../../api/_lib/jitAuthCore.js";

const result = validateJitServerEnv(process.env);

console.log(JSON.stringify({
  ok: result.ok,
  required: result.required,
  missing: result.missing,
  issues: result.issues,
}, null, 2));

if (!result.ok) {
  process.exitCode = 1;
}
