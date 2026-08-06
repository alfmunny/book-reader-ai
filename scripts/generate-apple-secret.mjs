#!/usr/bin/env node
/**
 * Generates the AUTH_APPLE_SECRET JWT for NextAuth's Apple provider.
 * Valid for 6 months — regenerate before it expires.
 *
 * Usage:
 *   node scripts/generate-apple-secret.mjs \
 *     --team-id XXXXXXXXXX \
 *     --key-id  XXXXXXXXXX \
 *     --client-id com.bookreader.ai.web \
 *     --key-file /path/to/AuthKey_XXXX.p8
 */
import { readFileSync } from "fs";
import { createSign } from "crypto";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0 || !args[i + 1]) { console.error(`Missing --${name}`); process.exit(1); }
  return args[i + 1];
}

const teamId   = arg("team-id");    // 10-char Apple Developer Team ID
const keyId    = arg("key-id");     // Key ID from developer portal
const clientId = arg("client-id"); // Services ID (e.g. com.bookreader.ai.web)
const keyPath  = arg("key-file");   // path to downloaded .p8 file

const privateKey = readFileSync(keyPath, "utf8");
const now        = Math.floor(Date.now() / 1000);
const exp        = now + 15_777_000; // 6 months in seconds

// JWT header + payload (Apple requires ES256 + kid header)
const header  = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
const payload = Buffer.from(JSON.stringify({
  iss: teamId,
  iat: now,
  exp,
  aud: "https://appleid.apple.com",
  sub: clientId,
})).toString("base64url");

const data      = `${header}.${payload}`;
const sign      = createSign("SHA256");
sign.update(data);
const signature = sign.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }, "base64url");

const jwt = `${data}.${signature}`;
console.log("\nAUTH_APPLE_SECRET=");
console.log(jwt);
console.log(`\nExpires: ${new Date(exp * 1000).toISOString()}`);
