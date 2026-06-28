const { wrap } = require("./sqlite-wrapper");
const bcrypt = require("bcryptjs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../data/helpdesk.db");

async function initDB() {
  const db = wrap(DB_PATH);

  await db.pragma("journal_mode = WAL");
  await db.pragma("foreign_keys = ON");

  // ── Create Tables ──────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      email       TEXT    NOT NULL UNIQUE,
      password    TEXT,
      auth_source TEXT    NOT NULL DEFAULT 'local' CHECK(auth_source IN ('local','ad')),
      ad_username TEXT,
      role        TEXT    NOT NULL DEFAULT 'user',
      department  TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_no   TEXT    NOT NULL UNIQUE,
      user_id     INTEGER,
      raised_by_name TEXT DEFAULT '',
      raised_by_dept TEXT DEFAULT '',
      complainant_name TEXT DEFAULT '',
      attachment_path TEXT DEFAULT '',
      category    TEXT    NOT NULL CHECK(category IN ('Hardware','Software','INAMS')),
      title       TEXT    NOT NULL,
      description TEXT    NOT NULL,
      priority    TEXT    NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Low','Medium','High','Critical')),
      status      TEXT    NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','In Progress','Closed')),
      remarks     TEXT    DEFAULT '',
      closed_by   INTEGER,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      user_id      INTEGER,
      actor_name   TEXT DEFAULT '',
      action       TEXT    NOT NULL,
      detail       TEXT    DEFAULT '',
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (complaint_id) REFERENCES complaints(id),
      FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_docs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT    NOT NULL,
      description  TEXT    DEFAULT '',
      file_path    TEXT    NOT NULL,
      file_name    TEXT    NOT NULL,
      file_type    TEXT    NOT NULL,
      file_size    INTEGER NOT NULL DEFAULT 0,
      uploaded_by  INTEGER,
      uploaded_by_name TEXT DEFAULT '',
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // ── Migration: add complainant_name column if upgrading from older schema ──
  const cols = await db.all("PRAGMA table_info(complaints)");
  const hasComplainantName = cols.some(c => c.name === "complainant_name");
  if (!hasComplainantName) {
    await db.exec("ALTER TABLE complaints ADD COLUMN complainant_name TEXT DEFAULT ''");
    console.log("Migration: added complainant_name column to complaints table.");
  }
  if (!cols.some(c => c.name === "raised_by_name")) {
    await db.exec("ALTER TABLE complaints ADD COLUMN raised_by_name TEXT DEFAULT ''");
    console.log("Migration: added raised_by_name column to complaints table.");
  }
  if (!cols.some(c => c.name === "raised_by_dept")) {
    await db.exec("ALTER TABLE complaints ADD COLUMN raised_by_dept TEXT DEFAULT ''");
    console.log("Migration: added raised_by_dept column to complaints table.");
  }
  if (!cols.some(c => c.name === "attachment_path")) {
    await db.exec("ALTER TABLE complaints ADD COLUMN attachment_path TEXT DEFAULT ''");
    console.log("Migration: added attachment_path column to complaints table.");
  }

  // Backfill raised_by_name/dept for any existing complaints that don't have it yet,
  // using the current linked user's info (covers complaints created before this migration)
  await db.exec(`
    UPDATE complaints
    SET raised_by_name = (SELECT name FROM users WHERE users.id = complaints.user_id),
        raised_by_dept  = (SELECT department FROM users WHERE users.id = complaints.user_id)
    WHERE (raised_by_name = '' OR raised_by_name IS NULL) AND user_id IS NOT NULL
  `);

  // ── Migration: add actor_name to activity_log ───────────────────────────────
  const logCols = await db.all("PRAGMA table_info(activity_log)");
  if (!logCols.some(c => c.name === "actor_name")) {
    await db.exec("ALTER TABLE activity_log ADD COLUMN actor_name TEXT DEFAULT ''");
    await db.exec(`
      UPDATE activity_log
      SET actor_name = (SELECT name FROM users WHERE users.id = activity_log.user_id)
      WHERE (actor_name = '' OR actor_name IS NULL) AND user_id IS NOT NULL
    `);
    console.log("Migration: added actor_name column to activity_log table.");
  }

  // ── Migration: add AD support columns to users table ────────────────────────
  const userCols = await db.all("PRAGMA table_info(users)");
  if (!userCols.some(c => c.name === "auth_source")) {
    await db.exec("ALTER TABLE users ADD COLUMN auth_source TEXT NOT NULL DEFAULT 'local'");
    console.log("Migration: added auth_source column to users table.");
  }
  if (!userCols.some(c => c.name === "ad_username")) {
    await db.exec("ALTER TABLE users ADD COLUMN ad_username TEXT");
    console.log("Migration: added ad_username column to users table.");
  }

  // ── Seed default users if table is empty ──────────────────────────────────
  const userCount = await db.get("SELECT COUNT(*) as cnt FROM users");
  if (userCount.cnt === 0) {
    const seed = [
      ["IT Admin",       "itadmin",  "admin123",  "admin", "IT"],
      ["Alice Johnson",  "alice@org.local",  "pass123",   "user",  "Finance"],
      ["Bob Smith",      "bob@org.local",    "pass123",   "user",  "HR"],
      ["Carol White",    "carol@org.local",  "pass123",   "user",  "Operations"],
      ["David Kumar",    "david@org.local",  "pass123",   "user",  "Procurement"],
    ];

    for (const [name, email, plain, role, dept] of seed) {
      const hashed = bcrypt.hashSync(plain, 10);
      await db.run(
        "INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)",
        [name, email, hashed, role, dept]
      );
    }

    const comps = [
      ["TKT-0001", 2, "Hardware", "Monitor flickering",
        "The monitor on my desk flickers every few minutes, making it difficult to work.", "High", "Open", ""],
      ["TKT-0002", 3, "Software", "MS Office activation error",
        "Getting activation error 0x80070005 when launching Word.", "Medium", "In Progress", ""],
      ["TKT-0003", 4, "INAMS", "Cannot access INAMS portal",
        "Login page throws 403 Forbidden. Worked fine last week.", "High", "Closed",
        "User credentials were expired. Reset done and access restored."],
      ["TKT-0004", 2, "Software", "VPN disconnecting frequently",
        "VPN drops every 15-20 minutes requiring manual reconnect.", "High", "Open", ""],
      ["TKT-0005", 3, "Hardware", "Keyboard keys sticking",
        "Several keys on keyboard are sticking, particularly spacebar and Enter.", "Low", "In Progress", ""],
    ];

    const userMap = { 2: ["Alice Johnson", "Finance"], 3: ["Bob Smith", "HR"], 4: ["Carol White", "Operations"] };
    for (const c of comps) {
      const [, uid] = c;
      const [rname, rdept] = userMap[uid] || ["", ""];
      await db.run(
        `INSERT INTO complaints (ticket_no, user_id, raised_by_name, raised_by_dept, category, title, description, priority, status, remarks, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [c[0], c[1], rname, rdept, c[2], c[3], c[4], c[5], c[6], c[7]]
      );
    }

    console.log("Database seeded with default users and sample complaints.");
  }

  return db;
}

module.exports = { initDB, DB_PATH };
