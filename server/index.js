require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");

const { initDB } = require("./db");

// ── Ensure data directory exists ─────────────────────────────────────────────
const dataDir = path.join(__dirname, "../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ── Ensure uploads directory exists (for complaint screenshot attachments) ──
const uploadsDir = path.join(__dirname, "../data/uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Ensure knowledge-docs directory exists (for reference documents) ────────
const knowledgeDocsDir = path.join(__dirname, "../data/knowledge-docs");
if (!fs.existsSync(knowledgeDocsDir)) fs.mkdirSync(knowledgeDocsDir, { recursive: true });

// ── Express app ───────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// Serve uploaded attachment images so the frontend can display them
app.use("/uploads", express.static(uploadsDir));

// Serve knowledge reference documents for in-browser viewing/download
app.use("/knowledge-files", express.static(knowledgeDocsDir));

const clientBuild = path.join(__dirname, "../client/dist");

async function start() {
  const db = await initDB();

  app.use("/api/auth",       require("./routes/auth")(db));
  app.use("/api/complaints", require("./routes/complaints")(db));
  app.use("/api/users",      require("./routes/users")(db));
  app.use("/api/knowledge",  require("./routes/knowledge")(db));

  app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

  if (fs.existsSync(clientBuild)) {
    app.use(express.static(clientBuild));
    app.get("*", (_req, res) => res.sendFile(path.join(clientBuild, "index.html")));
  } else {
    app.get("/", (_req, res) => res.json({ message: "API running. Build the React client to serve the UI." }));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log("\n========================================");
    console.log(`  IT Help Desk  ->  http://localhost:${PORT}`);
    console.log("========================================");
    if (process.env.AD_URL) {
      console.log("  Active Directory login: ENABLED");
      console.log(`  AD Server: ${process.env.AD_URL}`);
      console.log(`  AD Domain: ${process.env.AD_DOMAIN}`);
    } else {
      console.log("  Active Directory login: NOT CONFIGURED");
      console.log("  (copy .env.example to .env and fill in your DC details)");
    }
    console.log("========================================\n");
  });
}

start().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
