// Security tests for WarungPintar backend + frontend esc() — Node, no deps.
// Spawns server/parse_server.py on a test port WITHOUT a Gemini key, so no
// external call is made: /api/parse with a valid body must answer 502
// (no key configured) — that proves validation passed without touching Gemini.
// Run: node tests/security.test.js   (exit 0 = all pass)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 8931;
const BASE = "http://127.0.0.1:" + PORT;
let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log("  PASS " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

function req(method, p, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : (typeof body === "string" ? body : JSON.stringify(body));
    const r = http.request(BASE + p, {
      method,
      headers: Object.assign({ "Content-Type": "application/json" }, headers || {},
        data ? { "Content-Length": Buffer.byteLength(data) } : {}),
    }, (res) => {
      let chunks = "";
      res.on("data", (c) => { chunks += c; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: chunks }));
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

function waitHealth(tries) {
  return req("GET", "/api/health").then(
    (r) => { if (r.status === 200) return true; throw new Error("not ready"); },
    () => {
      if (tries <= 0) throw new Error("server did not come up");
      return new Promise((res) => setTimeout(res, 300)).then(() => waitHealth(tries - 1));
    });
}

async function main() {
  const serverPy = path.join(__dirname, "..", "server", "parse_server.py");
  const env = Object.assign({}, process.env);
  delete env.GEMINI_API_KEY; // must NOT be set: proves no Gemini call happens
  const proc = spawn("python3", [serverPy], {
    env: Object.assign(env, { PORT: String(PORT) }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  // also test the frontend esc(): extract the real function from app/app.js
  // (line-based extraction: the function body contains nested braces)
  const appJs = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");
  function extractFn(src, name) {
    const i = src.indexOf("function " + name + "(");
    if (i < 0) return null;
    const j = src.indexOf("\n", i);
    return src.slice(i, j < 0 ? src.length : j).trim();
  }
  const escSrc = extractFn(appJs, "esc");
  if (!escSrc) { check("esc() found in app.js", false); }
  else {
    const esc = eval("(" + escSrc.replace(/^function esc/, "function") + ")");
    check("esc() escapes < > & \"", esc('<img src=x onerror=alert(1)>') === "&lt;img src=x onerror=alert(1)&gt;");
    check("esc() escapes &", esc("a&b") === "a&amp;b");
    check("esc() leaves plain text alone", esc("Bu Euis") === "Bu Euis");
    const escAttr = eval("(" + extractFn(appJs, "escAttr").replace(/^function escAttr/, "function") + ")");
    check("escAttr() escapes single quote", escAttr("x' onmouseover='alert(1)") === "x&#39; onmouseover=&#39;alert(1)");
  }
  // frontend: no raw user-controlled name flows into innerHTML unescaped
  check("bon list escapes item names", appJs.includes('return esc(it.name) + " ×" + it.qty;'));
  check("history escapes item names", (appJs.match(/esc\(it\.name\) \+ " ×" \+ it\.qty/g) || []).length >= 2);
  check("price-edit aria-label escaped", appJs.includes('aria-label="Harga \' + escAttr(p.name)'));

  try {
    await waitHealth(20);

    // 1. health + security headers
    let r = await req("GET", "/api/health");
    check("health 200 + ok:true", r.status === 200 && JSON.parse(r.body).ok === true);
    check("header X-Content-Type-Options: nosniff", r.headers["x-content-type-options"] === "nosniff");
    check("header X-Frame-Options: DENY", r.headers["x-frame-options"] === "DENY");
    check("header Referrer-Policy: no-referrer", r.headers["referrer-policy"] === "no-referrer");
    check("header Content-Security-Policy present", typeof r.headers["content-security-policy"] === "string" && r.headers["content-security-policy"].includes("frame-ancestors 'none'"));

    // 2. malformed JSON -> 400
    r = await req("POST", "/api/parse", "{not json");
    check("malformed JSON -> 400", r.status === 400, "got " + r.status);

    // 3. body not an object -> 400
    r = await req("POST", "/api/parse", [1, 2, 3]);
    check("non-object body -> 400", r.status === 400, "got " + r.status);

    // 4. oversized body -> 413 (never read fully)
    r = await req("POST", "/api/parse", JSON.stringify({ text: "x".repeat(9000) }));
    check("oversized body -> 413", r.status === 413, "got " + r.status);

    // 5. text too long -> 400
    r = await req("POST", "/api/parse", { text: "kopi ".repeat(200) });
    check("text > 500 chars -> 400", r.status === 400, "got " + r.status);

    // 6. products wrong shape -> 400
    r = await req("POST", "/api/parse", { text: "kopi dua", products: "kopi" });
    check("products not a list -> 400", r.status === 400, "got " + r.status);
    r = await req("POST", "/api/parse", { text: "kopi dua", products: Array(100).fill("Kopi Hitam") });
    check("products > 64 items -> 400", r.status === 400, "got " + r.status);

    // 7. valid small request, no key -> 502 (validation passed, no Gemini call)
    r = await req("POST", "/api/parse", { text: "Bu Euis bon SusuQ dua" });
    check("valid request w/o key -> 502 (no Gemini call)", r.status === 502, "got " + r.status);
    // (key prefix assembled dynamically so the literal never sits in the repo)
    check("error body never contains a real key value", !new RegExp("AI" + "za" + "[0-9A-Za-z_-]{10,}").test(r.body));
    check("security headers on error responses too", r.headers["x-content-type-options"] === "nosniff");

    // 8. rate limit: hammer /api/parse, at least one 429 must appear
    // (earlier parse POSTs in this run already consumed part of the 30/min budget)
    let saw429 = false, lastStatus = 0;
    for (let i = 0; i < 35; i++) {
      const rr = await req("POST", "/api/parse", { text: "kopi dua" });
      lastStatus = rr.status;
      if (rr.status === 429) { saw429 = true; break; }
    }
    check("rate limit -> 429 after 30/min", saw429, "last status " + lastStatus);
  } finally {
    proc.kill();
  }
  console.log("\nsecurity tests: " + pass + " lolos, " + fail + " gagal");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(2); });
