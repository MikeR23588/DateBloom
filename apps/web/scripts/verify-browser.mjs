import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const projectRoot = path.resolve(webRoot, "../..");
const temporaryParent = path.join(projectRoot, ".verification-tmp");
mkdirSync(temporaryParent, { recursive: true });
const temporaryRoot = mkdtempSync(path.join(temporaryParent, "run-"));
const fixtureRoot = path.join(temporaryRoot, "workspace");
const databasePath = path.join(temporaryRoot, "acceptance.sqlite");
const artifacts = path.join(temporaryRoot, "artifacts");
const passed = [];
let server;
let browser;
let serverOutput = "";

function rows(sql, ...parameters) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try { return database.prepare(sql).all(...parameters); }
  finally { database.close(); }
}

function prepareWorkspace() {
  const excluded = new Set(["node_modules", ".next", ".git", ".turbo", "data", "coverage", "test-results", ".verification-tmp"]);
  const include = (source) => !excluded.has(path.basename(source))
    && !path.basename(source).startsWith(".env") && !source.endsWith(".tsbuildinfo");
  mkdirSync(fixtureRoot);
  for (const name of readdirSync(projectRoot)) {
    const source = path.join(projectRoot, name);
    if (include(source)) cpSync(source, path.join(fixtureRoot, name), { recursive: true, filter: include });
  }
  for (const relative of ["node_modules", "apps/web/node_modules", "packages/contracts/node_modules", "packages/planning/node_modules"]) {
    const source = path.join(projectRoot, relative);
    if (existsSync(source)) symlinkSync(source, path.join(fixtureRoot, relative), process.platform === "win32" ? "junction" : "dir");
  }
  mkdirSync(artifacts);
}

async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function startServer(port) {
  server = spawn(process.execPath, [path.join(webRoot, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: path.join(fixtureRoot, "apps/web"),
    env: { ...process.env, DATEBLOOM_DB_PATH: databasePath, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  const capture = (chunk) => { if (serverOutput.length < 32000) serverOutput += chunk.toString(); };
  server.stdout.on("data", capture);
  server.stderr.on("data", capture);
  server.on("error", capture);
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) throw new Error("The isolated Next.js server exited during startup.");
    let response;
    try { response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(2000) }); }
    catch { /* Compilation can outlast an individual readiness probe. */ }
    if (response?.ok) return;
    if (response?.status >= 500) throw new Error("The isolated app returned a startup error; see the captured server output.");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("The isolated Next.js server did not become ready.");
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const child = server;
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    if (result.status !== 0 && child.exitCode === null && child.signalCode === null) throw new Error("Could not stop the isolated server process tree.");
  } else {
    child.kill("SIGTERM");
  }
  const deadline = Date.now() + 10000;
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  if (child.exitCode === null && child.signalCode === null) throw new Error("The isolated server did not stop.");
  server = undefined;
}

async function check(name, action) {
  await action();
  passed.push(name);
  console.log(`PASS ${name}`);
}

function futureDates() {
  const preferred = new Date();
  preferred.setUTCHours(12, 0, 0, 0);
  preferred.setUTCDate(preferred.getUTCDate() + ((1 - preferred.getUTCDay() + 7) % 7 || 7));
  const alternative = new Date(preferred);
  alternative.setUTCDate(alternative.getUTCDate() + 2);
  return { preferred: preferred.toISOString().slice(0, 10), alternative: alternative.toISOString().slice(0, 10) };
}

const minute = (time, offset = 0) => offset * 1440 + Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const click = (page, selector) => page.evaluate((selector) => document.querySelector(selector).click(), selector);
const step = (page, number) => page.waitForFunction((number) => document.querySelector(".request-progress [aria-current]").textContent.startsWith(number + "."), {}, number);
async function fill(page, selector, value) {
  await page.$eval(selector, (element, value) => {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

function api(page, method = "GET", payload, key) {
  return page.evaluate(async ({ method, payload, key }) => {
    const response = await fetch("/api/v1/date-requests", {
      method, ...(method === "POST" ? {
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(payload),
      } : {}),
    });
    return { status: response.status, body: await response.json() };
  }, { method, payload, key });
}

async function generate(page) {
  const pending = page.waitForResponse((response) => response.url().endsWith("/api/v1/date-requests") && response.request().method() === "POST");
  await click(page, ".request-actions .button");
  const response = await pending;
  return {
    status: response.status(), body: await response.json(),
    payload: JSON.parse(response.request().postData()),
    key: response.request().headers()["idempotency-key"],
  };
}

async function signUp(page, baseUrl, name, email, password) {
  await page.goto(baseUrl + "/login", { waitUntil: "networkidle2" });
  await fill(page, ".auth-form-new [name=name]", name);
  await fill(page, ".auth-form-new [name=email]", email);
  await fill(page, ".auth-form-new [name=password]", password);
  await click(page, ".auth-form-new button");
  await page.waitForFunction(() => location.pathname === "/my-dates");
  await page.waitForSelector(".dashboard-welcome");
  assert.match(await page.$eval(".dashboard-welcome", (element) => element.textContent), new RegExp(name));
}

async function signIn(page, baseUrl, email, password) {
  await page.goto(baseUrl + "/login", { waitUntil: "networkidle2" });
  await fill(page, ".auth-form:not(.auth-form-new) [name=email]", email);
  await fill(page, ".auth-form:not(.auth-form-new) [name=password]", password);
  await click(page, ".auth-form:not(.auth-form-new) button");
}

async function signOut(page) {
  await click(page, ".nav-signout");
  await page.waitForFunction(() => location.pathname === "/login");
  assert.equal((await page.cookies()).some((cookie) => cookie.name === "datebloom_session"), false);
}

async function restoreCookies(page, cookies) {
  await page.setCookie(...cookies.map(({ name, value, domain, path, expires, httpOnly, secure, sameSite }) => ({
    name, value, domain, path, expires, httpOnly, secure, sameSite,
  })));
}

async function run() {
  assert.ok(existsSync(puppeteer.executablePath()), "Install Chrome with: pnpm --filter @datebloom/web exec puppeteer browsers install chrome");
  prepareWorkspace();
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log("Starting the isolated app with an empty database...");
  await startServer(port);
  assert.equal(existsSync(databasePath), false);
  browser = await puppeteer.launch({ headless: true });
  const contextA = await browser.createBrowserContext();
  const contextB = await browser.createBrowserContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const browserErrors = [];
  for (const page of [pageA, pageB]) {
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);
    page.on("pageerror", (error) => browserErrors.push(error.message));
  }
  await pageA.setViewport({ width: 1440, height: 900 });
  await pageB.setViewport({ width: 390, height: 844 });
  const { preferred, alternative } = futureDates();
  let created;

  await check("Required steps block incomplete answers", async () => {
    await pageA.goto(baseUrl + "/request", { waitUntil: "networkidle2" });
    await click(pageA, ".request-actions .button");
    await pageA.waitForSelector(".error");
    await step(pageA, 1);
    for (const [name, value] of Object.entries({
      requestedLocalDate: preferred, alternativeLocalDates: alternative,
      startLocalTime: "17:00", endLocalTime: "17:15", durationMinutes: "120",
    })) await fill(pageA, `[name=${name}]`, value);
    await click(pageA, ".request-actions .button");
    await step(pageA, 2);
    await click(pageA, ".request-actions .button");
    await pageA.waitForSelector(".error");
    await step(pageA, 2);
    await fill(pageA, "[name=budgetDollars]", "200");
    await pageA.select("[name=startingNeighborhood]", "Downtown / Water Street");
    // Keep this alternative-date fixture on checked walking routes as restaurant coverage grows.
    await pageA.select("[name=travelMode]", "walking");
    await fill(pageA, "[name=maximumWalkingMinutes]", "12");
    await click(pageA, "[name=returnToParkedCar]");
    await click(pageA, ".request-actions .button");
    await step(pageA, 3);
    await click(pageA, ".request-actions .button");
    await pageA.waitForSelector(".error");
    await step(pageA, 3);
    await pageA.select("[name=atmosphere]", "relaxed");
    await click(pageA, ".request-actions .button");
    await pageA.waitForSelector(".error");
    await step(pageA, 3);
  });

  await check("Live no-match recovery retains answers and does not save a plan", async () => {
    await click(pageA, "[name=preferredCuisines][value=Thai]");
    await click(pageA, '[name=preferredActivities][value="Outdoor walk"]');
    await click(pageA, ".request-actions .button");
    await step(pageA, 4);
    const failure = await generate(pageA);
    assert.equal(failure.status, 422);
    assert.equal(failure.body.error.code, "NO_MATCHING_ITINERARY");
    await pageA.waitForSelector(".error");
    assert.equal((await api(pageA)).body.data.length, 0);
    assert.equal(rows("SELECT * FROM guest_date_requests").length, 0);
    assert.equal(rows("SELECT timezone FROM cities WHERE slug='tampa'")[0].timezone, "America/New_York");
    await click(pageA, ".request-actions .text-button");
    await step(pageA, 3);
    assert.equal(await pageA.$eval("[name=preferredCuisines][value=Thai]", (element) => element.checked), true);
    assert.equal(await pageA.$eval("[name=budgetDollars]", (element) => element.value), "200");
    await click(pageA, "[name=preferredCuisines][value=Thai]");
    await click(pageA, "[name=preferredCuisines][value=Italian]");
  });

  await check("Real generation searches alternative dates and includes a parked-car return", async () => {
    await click(pageA, ".request-actions .button");
    await step(pageA, 4);
    created = await generate(pageA);
    assert.equal(created.status, 201);
    assert.equal(created.body.plan.requestedLocalDate, alternative);
    assert.deepEqual(created.body.plan.stops.map((stop) => stop.venueId), ["eddie-sams", "curtis-hixon"]);
    assert.equal(created.body.plan.travel.mode, "walking");
    const { stops, travel, durationMinutes, estimatedTotalCents, budgetLimitCents } = created.body.plan;
    assert.equal(durationMinutes, 120);
    assert.ok(estimatedTotalCents <= budgetLimitCents);
    assert.ok(minute(stops[0].endLocalTime) - minute(stops[0].startLocalTime) >= 60);
    assert.equal(minute(travel.returnToStart.endLocalTime, travel.returnToStart.endDayOffset)
      - minute(stops[0].startLocalTime, stops[0].startDayOffset), 120);
    await pageA.waitForSelector(".generated-result");
    assert.match(await pageA.$eval(".generated-result", (element) => element.textContent), /Back to your parked car/);
    const saved = JSON.parse(rows("SELECT details_json FROM guest_date_requests WHERE id=?", created.body.data.id)[0].details_json);
    assert.deepEqual(saved.plan, created.body.plan);
    assert.deepEqual(saved.request.alternativeLocalDates, [alternative]);
    assert.equal(saved.request.requestedLocalDate, preferred);
    assert.equal(saved.request.maximumWalkingMinutes, 12);
    assert.equal(saved.request.returnToParkedCar, true);
    const cookie = (await pageA.cookies()).find((cookie) => cookie.name === "datebloom_guest");
    assert.ok(cookie.httpOnly);
    assert.equal(cookie.sameSite, "Lax");
    assert.ok(cookie.expires > Date.now() / 1000);
  });

  await check("Saved snapshots survive navigation, reload, and identical retries", async () => {
    await click(pageA, ".request-actions a.button");
    await pageA.waitForFunction(() => location.pathname === "/my-dates");
    await pageA.waitForSelector(".generated-plan");
    await pageA.reload({ waitUntil: "networkidle2" });
    assert.equal(await pageA.$eval(".generated-plan h2", (element) => element.textContent), created.body.plan.title);
    const retry = await api(pageA, "POST", created.payload, created.key);
    assert.equal(retry.status, 200);
    assert.deepEqual(retry.body, created.body);
    const conflict = await api(pageA, "POST", { ...created.payload, budgetLimitCents: 18000 }, created.key);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, "IDEMPOTENCY_KEY_REUSED");
    assert.deepEqual((await api(pageA)).body.data.map((item) => item.id), [created.body.data.id]);
  });

  await check("The live API enforces preferences, full duration, and origin validation", async () => {
    for (const overrides of [
      { preferredCuisines: ["Thai"] }, { preferredActivities: ["Bowling"] },
      { settingPreference: "outdoors" }, { dietaryNeeds: "Verified gluten-free required" },
      { accessibilityNeeds: "Verified step-free access required" },
      { budgetLimitCents: 100 }, { durationMinutes: 360 },
    ]) {
      const failure = await api(pageA, "POST", { ...created.payload, ...overrides }, randomUUID());
      assert.equal(failure.status, 422);
      assert.equal(failure.body.error.code, "NO_MATCHING_ITINERARY");
    }
    assert.equal((await api(pageA, "POST", { ...created.payload, maximumWalkingMinutes: 241 }, randomUUID())).status, 400);
    const rejected = await fetch(baseUrl + "/api/v1/date-requests", {
      method: "POST", headers: { Origin: "https://example.test", "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
      body: JSON.stringify(created.payload),
    });
    assert.equal(rejected.status, 403);
    assert.equal((await api(pageA)).body.data.length, 1);
  });

  let other;
  await check("Separate guest browsers have isolated plans and request keys", async () => {
    await pageB.goto(baseUrl, { waitUntil: "networkidle2" });
    assert.deepEqual((await api(pageB)).body.data, []);
    other = await api(pageB, "POST", { ...created.payload, startingNeighborhood: "Hyde Park", travelMode: "flexible" }, created.key);
    assert.equal(other.status, 201);
    assert.notEqual(other.body.data.id, created.body.data.id);
    assert.equal(other.body.plan.travel.mode, "driving");
    assert.equal(other.body.plan.travel.estimatedMinutes, null);
    assert.deepEqual((await api(pageB)).body.data.map((item) => item.id), [other.body.data.id]);
    assert.deepEqual((await api(pageA)).body.data.map((item) => item.id), [created.body.data.id]);
  });

  const password = "Acceptance-" + randomUUID();
  const emailA = "acceptance-a-" + randomUUID() + "@example.test";
  const emailB = "acceptance-b-" + randomUUID() + "@example.test";
  let cookiesA;
  await check("Account creation claims only the current browser's guest plans", async () => {
    await signUp(pageA, baseUrl, "Acceptance A", emailA, password);
    assert.deepEqual((await api(pageA)).body.data.map((item) => item.id), [created.body.data.id]);
    assert.deepEqual((await api(pageB)).body.data.map((item) => item.id), [other.body.data.id]);
    assert.equal(rows("SELECT * FROM guest_date_requests").length, 1);
    cookiesA = await pageA.cookies();
    const cookie = cookiesA.find((cookie) => cookie.name === "datebloom_session");
    assert.ok(cookie.httpOnly);
    assert.equal(cookie.sameSite, "Lax");
    assert.ok(cookie.expires > Date.now() / 1000);
    assert.deepEqual((await api(pageA, "POST", created.payload, created.key)).body, created.body);
  });

  await check("Stored session cookies restore sign-in in another browser context", async () => {
    const restored = await browser.createBrowserContext();
    try {
      const page = await restored.newPage();
      await restoreCookies(page, cookiesA);
      await page.goto(baseUrl + "/my-dates", { waitUntil: "networkidle2" });
      assert.match(await page.$eval(".dashboard-welcome", (element) => element.textContent), /Acceptance A/);
      assert.deepEqual((await api(page)).body.data.map((item) => item.id), [created.body.data.id]);
    } finally { await restored.close(); }
  });

  await check("Account plans stay isolated from another account", async () => {
    await signUp(pageB, baseUrl, "Acceptance B", emailB, password);
    assert.deepEqual((await api(pageB)).body.data.map((item) => item.id), [other.body.data.id]);
    assert.deepEqual((await api(pageA)).body.data.map((item) => item.id), [created.body.data.id]);
    assert.equal(rows("SELECT * FROM guest_date_requests").length, 0);
  });

  await check("Sign-out revokes the session and incorrect credentials do not sign in", async () => {
    const token = cookiesA.find((cookie) => cookie.name === "datebloom_session").value;
    await signOut(pageA);
    assert.equal(rows("SELECT * FROM sessions WHERE token_hash=?", createHash("sha256").update(token).digest("hex")).length, 0);
    assert.deepEqual((await api(pageA)).body.data, []);
    const restored = await browser.createBrowserContext();
    try {
      const page = await restored.newPage();
      await restoreCookies(page, cookiesA);
      await page.goto(baseUrl + "/my-dates", { waitUntil: "networkidle2" });
      assert.deepEqual((await api(page)).body.data, []);
    } finally { await restored.close(); }
    await signIn(pageA, baseUrl, emailA, password + "-incorrect");
    await pageA.waitForFunction(() => new URLSearchParams(location.search).get("error") === "credentials");
    await pageA.waitForSelector(".error");
    assert.deepEqual((await api(pageA)).body.data, []);
  });

  let additional;
  await check("Signing in claims a new guest plan even when request keys collide", async () => {
    additional = await api(pageA, "POST", { ...created.payload, startingNeighborhood: "Hyde Park", travelMode: "flexible", budgetLimitCents: 18000 }, created.key);
    assert.equal(additional.status, 201);
    await signIn(pageA, baseUrl, emailA, password);
    await pageA.waitForFunction(() => location.pathname === "/my-dates");
    const ids = (await api(pageA)).body.data.map((item) => item.id).sort();
    assert.deepEqual(ids, [created.body.data.id, additional.body.data.id].sort());
    assert.equal(rows("SELECT * FROM guest_date_requests").length, 0);
    assert.deepEqual((await api(pageB)).body.data.map((item) => item.id), [other.body.data.id]);
    assert.deepEqual((await api(pageA, "POST", created.payload, created.key)).body, created.body);
  });

  await check("Accounts and saved snapshots persist across an app restart", async () => {
    await stopServer();
    await startServer(port);
    for (const [page, ids, name] of [
      [pageA, [created.body.data.id, additional.body.data.id], "Acceptance A"],
      [pageB, [other.body.data.id], "Acceptance B"],
    ]) {
      await page.goto(baseUrl + "/my-dates", { waitUntil: "networkidle2" });
      assert.deepEqual((await api(page)).body.data.map((item) => item.id).sort(), ids.sort());
      assert.match(await page.$eval(".dashboard-welcome", (element) => element.textContent), new RegExp(name));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    const snapshot = JSON.parse(rows("SELECT details_json FROM date_requests WHERE id=?", created.body.data.id)[0].details_json);
    assert.deepEqual(snapshot.plan, created.body.plan);
    assert.equal(rows("SELECT * FROM users").length, 2);
    assert.equal(rows("SELECT * FROM date_requests").length, 3);
    await pageA.screenshot({ path: path.join(artifacts, "saved-plans-desktop.png"), fullPage: true });
    await pageB.screenshot({ path: path.join(artifacts, "saved-plans-mobile.png"), fullPage: true });
    assert.deepEqual(browserErrors, []);
  });

  for (const [cuisine, venueId, setting, estimate, viewport] of [
    ["Mexican", "nueva-cantina-downtown", "outdoors", 4822, { width: 1440, height: 900 }],
    ["Japanese", "noble-rice", "any", 9060, { width: 390, height: 844 }],
  ]) {
    await check(`Live ${cuisine} request generates and saves the verified downtown branch`, async () => {
      const context = await browser.createBrowserContext();
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(60000);
        page.on("pageerror", error => browserErrors.push(error.message));
        await page.setViewport(viewport);
        await page.goto(baseUrl + "/request", { waitUntil: "networkidle2" });
        assert.match(await page.$eval(".request-form .sample", element => element.textContent), /Mexican, Japanese/);
        for (const [name, value] of Object.entries({ requestedLocalDate: alternative, startLocalTime: "17:00", endLocalTime: "17:15", durationMinutes: "120" })) {
          await fill(page, `[name=${name}]`, value);
        }
        await click(page, ".request-actions .button");
        await step(page, 2);
        await fill(page, "[name=budgetDollars]", "100");
        await page.select("[name=startingNeighborhood]", "Downtown / Water Street");
        await click(page, ".request-actions .button");
        await step(page, 3);
        await page.select("[name=atmosphere]", "relaxed");
        await click(page, `[name=preferredCuisines][value=${cuisine}]`);
        await click(page, '[name=preferredActivities][value="Outdoor walk"]');
        await page.select("[name=settingPreference]", setting);
        if (cuisine === "Mexican") {
          assert.equal(await page.$eval("[name=strictDietaryRequirement]", element => element.checked), false);
          await fill(page, "[name=dietaryNeeds]", "cheese");
        }
        if (cuisine === "Japanese") {
          assert.match(await page.$eval('label:has([name=dietaryNeeds])', element => element.textContent), /Foods or ingredients to avoid/);
          assert.match(await page.$eval("#food-restrictions-help", element => element.textContent), /not foods you like/);
          assert.match(await page.$eval("#food-restrictions-limit", element => element.textContent), /Allergies and strict dietary requirements/);
          await fill(page, "[name=dietaryNeeds]", "cheese");
          await click(page, "[name=strictDietaryRequirement]");
          await click(page, ".request-actions .button");
          await step(page, 4);
          assert.equal(await page.$eval(".request-review", element => {
            const label = [...element.querySelectorAll("dt")].find(label => label.textContent === "Foods to avoid");
            return label.nextElementSibling.textContent;
          }), "cheese");
          const failure = await generate(page);
          assert.equal(failure.status, 422);
          assert.match(failure.body.error.details.reasons.join(" "), /allergy or strict dietary requirement/);
          assert.doesNotMatch(failure.body.error.details.reasons.join(" "), /accessibility/);
          await page.waitForSelector(".error");
          assert.equal((await api(page)).body.data.length, 0);
          assert.equal(await page.$eval(".error button", element => element.textContent), "Edit preferences");
          await page.screenshot({ path: path.join(artifacts, "food-restriction-mobile.png"), fullPage: true });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          await click(page, ".error button");
          await step(page, 3);
          assert.equal(await page.$eval("[name=dietaryNeeds]", element => element.value), "cheese");
          assert.equal(await page.$eval("[name=strictDietaryRequirement]", element => element.checked), true);
          await page.screenshot({ path: path.join(artifacts, "food-restriction-field-mobile.png"), fullPage: true });
          await click(page, "[name=strictDietaryRequirement]");
          await fill(page, "[name=dietaryNeeds]", "");
        }
        await click(page, ".request-actions .button");
        await step(page, 4);
        const result = await generate(page);
        assert.equal(result.status, 201, JSON.stringify(result.body));
        assert.equal(result.body.plan.stops[0].venueId, venueId);
        assert.equal(result.body.plan.stops[0].sourceCheckedOn, "2026-09-28");
        assert.equal(result.body.plan.stops[1].sourceCheckedOn, "2026-09-27");
        assert.equal(result.body.plan.estimatedTotalCents, estimate);
        assert.equal(result.body.plan.durationMinutes, 120);
        assert.equal(result.body.plan.travel.mode, "driving");
        assert.equal(result.body.plan.travel.estimatedMinutes, null);
        if (cuisine === "Mexican") {
          assert.match(result.body.plan.stops[0].description, /Foods to avoid: cheese/);
          assert.match(result.body.plan.stops[0].description, /has not confirmed/);
          assert.match(result.body.plan.adjustments.join(" "), /Foods to avoid: cheese/);
          const stored = JSON.parse(rows("SELECT details_json FROM guest_date_requests WHERE id=?", result.body.data.id)[0].details_json);
          assert.equal(stored.request.dietaryNeeds, "cheese");
          assert.deepEqual(stored.plan, result.body.plan);
          const retry = await api(page, "POST", result.payload, result.key);
          assert.equal(retry.status, 200);
          assert.deepEqual(retry.body, result.body);
          const allergy = await api(page, "POST", { ...result.payload, dietaryNeeds: "dairy allergy" }, randomUUID());
          assert.equal(allergy.status, 422);
          assert.equal((await api(page)).body.data.length, 1);
        }
        await page.waitForSelector(".generated-result");
        assert.doesNotMatch(await page.$eval(".generated-result", element => element.textContent), /Italian dinner/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(artifacts, `${cuisine.toLowerCase()}-result.png`), fullPage: true });
        await click(page, ".request-actions a.button");
        await page.waitForFunction(() => location.pathname === "/my-dates");
        await page.reload({ waitUntil: "networkidle2" });
        assert.deepEqual((await api(page)).body.data.map(item => item.id), [result.body.data.id]);
        assert.equal(await page.$eval(".generated-plan h2", element => element.textContent), result.body.plan.title);
        if (cuisine === "Mexican") assert.match(await page.$eval(".generated-plan", element => element.textContent), /Foods to avoid: cheese/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      } finally { await context.close(); }
    });
  }
  const expansionCases = [
    { name: "Mediterranean dinner", cuisine: "Mediterranean", mealId: "predalina-water-street", activity: "Outdoor walk", start: "17:00", duration: 120, budget: 7240, description: "riverfront", viewport: { width: 1440, height: 900 } },
    { name: "American bowling date", cuisine: "American", mealId: "yeomans-downtown", activity: "Bowling", activityId: "splitsville-channelside", start: "17:00", duration: 120, budget: 10338, description: "45-minute", viewport: { width: 390, height: 844 } },
    { name: "Spanish ship museum date", cuisine: "Spanish", mealId: "columbia-cafe-history", activity: "Museum", activityId: "american-victory", setting: "outdoors", start: "11:00", duration: 180, budget: 8200, description: "weather-exposed", viewport: { width: 390, height: 844 } },
    { name: "Spanish free museum date", cuisine: "Spanish", mealId: "columbia-cafe-history", activity: "Museum", activityId: "tampa-police-museum", start: "11:00", duration: 120, budget: 4900, description: "police-history", viewport: { width: 1440, height: 900 } },
    { name: "French dinner", cuisine: "French", mealId: "boulon-water-street", activity: "Outdoor walk", start: "17:00", duration: 120, budget: 9320, description: "riverfront", viewport: { width: 1440, height: 900 } },
    { name: "Spanish history date", cuisine: "Spanish", mealId: "columbia-cafe-history", activity: "Museum", activityId: "tampa-history", start: "11:00", duration: 240, budget: 9069, description: "Tampa Bay history", viewport: { width: 390, height: 844 } },
    { name: "Spanish park date", cuisine: "Spanish", mealId: "columbia-cafe-history", activity: "Outdoor walk", activityId: "cotanchobee", start: "17:00", duration: 240, budget: 4900, description: "Garrison Channel", viewport: { width: 390, height: 844 } },
    { name: "Italian patio dinner", cuisine: "Italian", mealId: "bavaros-downtown", activity: "Outdoor walk", setting: "outdoors", start: "17:00", duration: 120, budget: 5940, description: "riverfront", viewport: { width: 1440, height: 900 } },
    { name: "Hyde Park candle date", cuisine: "Italian", mealId: "forbici-tampa", activity: "Candle making", activityId: "candle-pour-hyde-park", neighborhood: "Hyde Park", mealSource: "2026-09-27", setting: "indoors", start: "15:45", end: "15:46", duration: 180, budget: 17260, description: "two hours to set", viewport: { width: 390, height: 844 } },
    { name: "SoHo Mexican candle date", cuisine: "Mexican", mealId: "green-lemon-soho", activity: "Candle making", activityId: "candle-pour-hyde-park", neighborhood: "Hyde Park", mealSource: "2026-09-30", setting: "indoors", start: "15:45", end: "15:46", duration: 180, budget: 14660, description: "two hours to set", viewport: { width: 1440, height: 900 } },
  ];
  const plantCoverageDate = alternative <= "2026-11-30" ? alternative : null;
  if (plantCoverageDate) expansionCases.push({ name: "Spanish Plant Museum date", cuisine: "Spanish", mealId: "columbia-cafe-history", activity: "Museum", activityId: "plant-museum", start: "11:00", duration: 180, budget: 7540, description: "Plant Hall", viewport: { width: 390, height: 844 } });
  for (const fixture of expansionCases) {
    await check(`Expansion: ${fixture.name} generates, saves and retries`, async () => {
      const context = await browser.createBrowserContext();
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(60000);
        page.on("pageerror", error => browserErrors.push(error.message));
        await page.setViewport(fixture.viewport);
        await page.goto(baseUrl + "/request", { waitUntil: "networkidle2" });
        for (const [name, value] of Object.entries({ requestedLocalDate: alternative, startLocalTime: fixture.start,
          endLocalTime: fixture.end ?? (fixture.start === "11:00" ? "11:01" : "17:01"), durationMinutes: String(fixture.duration) })) {
          await fill(page, `[name=${name}]`, value);
        }
        await click(page, ".request-actions .button");
        await step(page, 2);
        await fill(page, "[name=budgetDollars]", String(fixture.budget / 100));
        await page.select("[name=startingNeighborhood]", fixture.neighborhood ?? "Downtown / Water Street");
        await click(page, ".request-actions .button");
        await step(page, 3);
        await page.select("[name=atmosphere]", "relaxed");
        await click(page, `[name=preferredCuisines][value=${fixture.cuisine}]`);
        await click(page, `[name=preferredActivities][value="${fixture.activity}"]`);
        await page.select("[name=settingPreference]", fixture.setting ?? "any");
        await click(page, ".request-actions .button");
        await step(page, 4);
        const result = await generate(page);
        assert.equal(result.status, 201);
        assert.equal(result.body.plan.stops[0].venueId, fixture.mealId);
        if (fixture.activityId) assert.equal(result.body.plan.stops[1].venueId, fixture.activityId);
        if (fixture.activityId === "tampa-history") {
          assert.equal(result.body.plan.travel.mode, "walking");
          assert.equal(result.body.plan.travel.estimatedMinutes, 5);
          assert.match(result.body.plan.travel.basis, /on-site walk/);
        }
        assert.ok(result.body.plan.stops[1].description.includes(fixture.description));
        assert.equal(result.body.plan.estimatedTotalCents, fixture.budget);
        assert.equal(result.body.plan.durationMinutes, fixture.duration);
        assert.equal(result.body.plan.stops[0].sourceCheckedOn, fixture.mealSource ?? "2026-09-29");
        const retry = await api(page, "POST", result.payload, result.key);
        assert.equal(retry.status, 200);
        assert.deepEqual(retry.body, result.body);
        await page.waitForSelector(".generated-result");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(artifacts, fixture.name.replaceAll(" ", "-").toLowerCase() + ".png"), fullPage: true });
        await click(page, ".request-actions a.button");
        await page.waitForFunction(() => location.pathname === "/my-dates");
        await page.reload({ waitUntil: "networkidle2" });
        assert.deepEqual((await api(page)).body.data.map(item => item.id), [result.body.data.id]);
        assert.equal(await page.$eval(".generated-plan h2", element => element.textContent), result.body.plan.title);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      } finally { await context.close(); }
    });
  }
  assert.deepEqual(browserErrors, []);
  writeFileSync(path.join(artifacts, "verification.json"), JSON.stringify({ verifiedAt: new Date().toISOString(), checks: passed,
    conditionalChecks: plantCoverageDate ? [] : ["Plant Museum live journey omitted because its verified season has ended; fixed-date unit checks remain."], databasePath }, null, 2));
  console.log(`Verified ${passed.length} live acceptance checks. Artifacts: ${artifacts}`);
}

try {
  await run();
} catch (error) {
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(path.join(artifacts, "failure.txt"), String(error.stack ?? error) + "\n\n" + serverOutput);
  console.error(error);
  console.error(`Failure details: ${path.join(artifacts, "failure.txt")}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await stopServer();
  // Only remove the disposable copy created by this run; keep the database and evidence.
  if (!process.exitCode && existsSync(fixtureRoot)) {
    const resolvedFixture = realpathSync(fixtureRoot);
    const resolvedRun = realpathSync(temporaryRoot);
    assert.equal(path.dirname(resolvedFixture), resolvedRun);
    assert.equal(path.basename(resolvedFixture), "workspace");
    rmSync(resolvedFixture, { recursive: true, force: true });
  }
}
