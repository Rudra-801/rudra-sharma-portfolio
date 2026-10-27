"use strict";
require("dotenv").config({
  path: require("node:path").join(__dirname, ".env"),
});
const express = require("express"),
  helmet = require("helmet"),
  { rateLimit } = require("express-rate-limit"),
  path = require("node:path");
const { validateContact, createContactStore } = require("./contact-store");
const ROOT = path.resolve(__dirname, "..");
function createApp({ store = createContactStore() } = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY)
    app.set("trust proxy", Number(process.env.TRUST_PROXY));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.get("/api/health", (_req, res) =>
    res.json({
      ok: true,
      service: "Rudra Portfolio",
      contactStorage: store.mode,
    }),
  );
  app.post(
    "/api/contact",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 8,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: {
        error: "Too many messages. Please try again later or email me.",
      },
    }),
    express.json({ limit: "12kb" }),
    async (req, res) => {
      if (req.body?.website)
        return res
          .status(400)
          .json({ error: "Unable to accept this submission." });
      const value = validateContact(req.body);
      if (!value)
        return res
          .status(400)
          .json({
            error:
              "Enter a name (2–80 characters), valid email and message (10–3000 characters).",
          });
      try {
        const id = await store.save(value);
        res
          .status(201)
          .json({
            ok: true,
            id,
            message:
              store.mode === "local"
                ? "Saved in this local preview. For a real enquiry, please use the email link."
                : "Thank you. Your message has been received.",
          });
      } catch {
        res
          .status(503)
          .json({
            error:
              "Message storage is temporarily unavailable. Please use the email link.",
          });
      }
    },
  );
  // Preserve the bundled demo resource routes, without exposing their raw static server.
  const legacy = require("./native-server");
  app.use("/api", (req, res, next) => {
    if (process.env.NODE_ENV === "production" && req.method !== "GET")
      return res
        .status(503)
        .json({ error: "Demo writes are disabled in production." });
    req.url = req.originalUrl;
    legacy.emit("request", req, res);
  });
  app.use((req, res, next) => {
    let p;
    try {
      p = decodeURIComponent(req.path);
    } catch {
      return res.sendStatus(400);
    }
    if (
      /(^|\/)(\.|backend(?:\/|$)|node_modules(?:\/|$)|tools(?:\/|$)|test(?:s)?(?:\/|$)|package(?:-lock)?\.json|.*(?:credential|service.account).*\.json)/i.test(
        p,
      )
    )
      return res.sendStatus(404);
    next();
  });
  app.use(
    "/assets",
    express.static(path.join(ROOT, "assets"), {
      dotfiles: "deny",
      maxAge: "1h",
    }),
  );
  app.use(
    "/projects",
    express.static(path.join(ROOT, "projects"), {
      dotfiles: "deny",
      maxAge: "1h",
    }),
  );
  for (const file of [
    "index.html",
    "style.css",
    "script.js",
    "projects-data.js",
    "robots.txt",
  ])
    app.get("/" + file, (_req, res) => res.sendFile(path.join(ROOT, file)));
  app.get("/", (_req, res) => res.sendFile(path.join(ROOT, "index.html")));
  app.use((_req, res) => res.status(404).sendFile(path.join(ROOT, "404.html")));
  app.use((err, _req, res, _next) =>
    res
      .status(err.status === 413 ? 413 : 400)
      .json({
        error:
          err.status === 413 ? "Message is too large." : "Invalid request.",
      }),
  );
  return app;
}
if (require.main === module) {
  try {
    createApp().listen(
      Number(process.env.PORT || 5500),
      process.env.HOST || "127.0.0.1",
      () =>
        console.log(
          "Portfolio: http://127.0.0.1:" + (process.env.PORT || 5500),
        ),
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
module.exports = { createApp };
