const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { createApp } = require("../backend/server"),
  { createContactStore } = require("../backend/contact-store");
async function withServer(store, fn) {
  const server = createApp({ store }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    await fn("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
const valid = {
  name: "Portfolio QA",
  email: "qa@example.com",
  message: "Local contact flow verification only.",
};
test("contact validation, persistence, errors and private paths", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-test-")),
    file = path.join(dir, "contacts.json");
  const store = createContactStore({
    CONTACT_STORE: "local",
    CONTACT_DATA_FILE: file,
  });
  await withServer(store, async (base) => {
    assert.equal((await fetch(base + "/api/health")).status, 200);
    for (const body of [
      {},
      { ...valid, name: "a" },
      { ...valid, email: "invalid" },
      { ...valid, message: "short" },
      { ...valid, message: "a".repeat(3001) },
      { ...valid, website: "spam" },
    ])
      assert.equal(
        (
          await fetch(base + "/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        ).status,
        400,
      );
    const sent = await fetch(base + "/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valid),
    });
    assert.equal(sent.status, 201);
    assert.equal(JSON.parse(fs.readFileSync(file))[0].email, valid.email);
    for (const route of [
      "/backend/data/store.json",
      "/backend/.env",
      "/.git/config",
      "/projects/insighthub/backend/.env",
      "/package.json",
      "/missing-page",
    ])
      assert.equal((await fetch(base + route)).status, 404, route);
    for (const route of [
      "/",
      "/api/projects",
      "/api/pulsechat/rooms",
      "/api/cartforge/products",
      "/api/quizops/questions",
      "/api/taskflow/tasks",
      "/api/studenthub/students",
      "/api/expenseflow/transactions",
    ])
      assert.equal((await fetch(base + route)).status, 200, route);
  });
  fs.rmSync(dir, { recursive: true });
});
test("failed persistence never reports success", async () =>
  withServer(
    {
      mode: "test",
      save: async () => {
        throw new Error("offline");
      },
    },
    async (base) => {
      const r = await fetch(base + "/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });
      assert.equal(r.status, 503);
    },
  ));
test("isolated Firebase and production configuration guards", () => {
  assert.throws(
    () =>
      createContactStore({
        CONTACT_STORE: "firebase",
        PORTFOLIO_FIREBASE_PROJECT_ID: "personalized-recommendersystem",
      }),
    /disallowed/,
  );
  assert.throws(
    () =>
      createContactStore({
        CONTACT_STORE: "firebase",
        PORTFOLIO_FIREBASE_PROJECT_ID: "separate-portfolio",
      }),
    /CREDENTIALS/,
  );
  assert.throws(
    () => createContactStore({ NODE_ENV: "production" }),
    /Production requires/,
  );
});
test("all portfolio local links and image sources exist", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  for (const [, target] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    assert.ok(fs.existsSync(path.join(__dirname, "..", target)), target);
  }
  for (const id of [
    "nexzo/dist/Home",
    "insighthub/index",
    "gamepro/index",
    "pulsechat/index",
    "cartforge/index",
    "quizops/index",
    "taskflow/index",
    "studenthub/index",
    "expenseflow/index",
  ])
    assert.ok(
      fs.existsSync(path.join(__dirname, "../projects", id + ".html")),
      id,
    );
});
