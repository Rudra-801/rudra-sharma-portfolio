"use strict";
const fs = require("node:fs"),
  path = require("node:path");
function validateContact(body = {}) {
  const { name, email, message } = body;
  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof message !== "string"
  )
    return null;
  const value = {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    message: message.trim(),
  };
  if (
    value.name.length < 2 ||
    value.name.length > 80 ||
    value.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) ||
    value.message.length < 10 ||
    value.message.length > 3000
  )
    return null;
  return value;
}
function createContactStore(env = process.env) {
  const mode = env.CONTACT_STORE || "local";
  if (mode === "firebase") {
    const projectId = env.PORTFOLIO_FIREBASE_PROJECT_ID;
    if (!projectId || projectId === "personalized-recommendersystem")
      throw new Error(
        "Set a separate PORTFOLIO_FIREBASE_PROJECT_ID. NEXZO is explicitly disallowed.",
      );
    if (!env.PORTFOLIO_FIREBASE_CREDENTIALS)
      throw new Error(
        "PORTFOLIO_FIREBASE_CREDENTIALS must point to a separate portfolio service account JSON.",
      );
    const credentials = JSON.parse(
      fs.readFileSync(env.PORTFOLIO_FIREBASE_CREDENTIALS, "utf8"),
    );
    if (credentials.project_id !== projectId)
      throw new Error(
        "Portfolio credentials must match the isolated portfolio project.",
      );
    const { initializeApp, cert } = require("firebase-admin/app"),
      { getFirestore, FieldValue } = require("firebase-admin/firestore");
    const app = initializeApp(
      { credential: cert(credentials), projectId },
      "rudra-portfolio",
    );
    const db = getFirestore(app);
    return {
      mode,
      async check() {
        return true;
      },
      async save(value) {
        const row = await db
          .collection("portfolioContacts")
          .add({ ...value, createdAt: FieldValue.serverTimestamp() });
        return row.id;
      },
    };
  }
  if (mode === "mongodb") {
    const mongoose = require("mongoose"),
      Contact = require("./src/models/Contact");
    if (!env.MONGODB_URI)
      throw new Error("MONGODB_URI required for mongodb mode.");
    const ready = mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    ready.catch(() => {});
    return {
      mode,
      async check() {
        await ready;
        return mongoose.connection.readyState === 1;
      },
      async save(value) {
        await ready;
        return String((await Contact.create(value))._id);
      },
    };
  }
  if (mode !== "local")
    throw new Error("CONTACT_STORE must be local, firebase or mongodb.");
  if (env.NODE_ENV === "production")
    throw new Error(
      "Production requires configured firebase or mongodb contact storage.",
    );
  const file =
    env.CONTACT_DATA_FILE ||
    path.join(__dirname, "data", "portfolio-contacts.json");
  return {
    mode,
    async check() {
      return true;
    },
    async save(value) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const rows = fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file, "utf8"))
        : [];
      const id = require("node:crypto").randomUUID();
      rows.push({ ...value, id, createdAt: new Date().toISOString() });
      const temp = file + ".tmp";
      fs.writeFileSync(temp, JSON.stringify(rows, null, 2));
      fs.renameSync(temp, file);
      return id;
    },
  };
}
module.exports = { validateContact, createContactStore };
