use rusqlite::{params, Connection, Row};
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub icon: Option<String>,
    pub cover: Option<String>,
    pub is_favorite: bool,
    pub is_trashed: bool,
    pub is_pinned: bool,
    pub position: f64,
    /// Gregorian ISO day "YYYY-MM-DD" the note is attached to (calendar view).
    pub date: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// One backup session: the exact set of ISO days the user exported,
/// the chosen format and how many notes were included.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub id: String,
    /// JSON array of "YYYY-MM-DD" strings covered by this backup.
    pub days: String,
    pub start_date: String,
    pub end_date: String,
    pub format: String,
    pub page_count: i64,
    pub created_at: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub id: String,
    pub page_id: String,
    #[serde(rename = "type")]
    pub block_type: String,
    pub content: String,
    pub meta: String,
    pub checked: bool,
    pub collapsed: bool,
    pub indent: i64,
    pub position: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

pub fn page_from_row(r: &Row) -> rusqlite::Result<Page> {
    Ok(Page {
        id: r.get("id")?,
        parent_id: r.get("parent_id")?,
        title: r.get("title")?,
        icon: r.get("icon")?,
        cover: r.get("cover")?,
        is_favorite: r.get::<_, i64>("is_favorite")? != 0,
        is_trashed: r.get::<_, i64>("is_trashed")? != 0,
        is_pinned: r.get::<_, i64>("is_pinned")? != 0,
        position: r.get("position")?,
        date: r.get("date")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
    })
}

pub fn backup_from_row(r: &Row) -> rusqlite::Result<Backup> {
    Ok(Backup {
        id: r.get("id")?,
        days: r.get("days")?,
        start_date: r.get("start_date")?,
        end_date: r.get("end_date")?,
        format: r.get("format")?,
        page_count: r.get("page_count")?,
        created_at: r.get("created_at")?,
    })
}

pub fn block_from_row(r: &Row) -> rusqlite::Result<Block> {
    Ok(Block {
        id: r.get("id")?,
        page_id: r.get("page_id")?,
        block_type: r.get("type")?,
        content: r.get("content")?,
        meta: r.get("meta")?,
        checked: r.get::<_, i64>("checked")? != 0,
        collapsed: r.get::<_, i64>("collapsed")? != 0,
        indent: r.get("indent")?,
        position: r.get("position")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
    })
}

pub fn get_page_row(con: &Connection, id: &str) -> Option<Page> {
    con.query_row("SELECT * FROM pages WHERE id = ?1", params![id], page_from_row)
        .ok()
}

pub fn get_block_row(con: &Connection, id: &str) -> Option<Block> {
    con.query_row("SELECT * FROM blocks WHERE id = ?1", params![id], block_from_row)
        .ok()
}

pub fn blocks_of_page(con: &Connection, page_id: &str) -> Vec<Block> {
    let mut stmt = con
        .prepare("SELECT * FROM blocks WHERE page_id = ?1 ORDER BY position, created_at")
        .unwrap();
    let rows = stmt
        .query_map(params![page_id], block_from_row)
        .unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

pub fn open_db(path: &str) -> Connection {
    // make sure the parent directory exists (fresh machines / custom NOTION_DB)
    if let Some(parent) = std::path::Path::new(path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let con = Connection::open(path)
        .unwrap_or_else(|e| panic!("cannot open db at {path}: {e}"));
    con.pragma_update(None, "journal_mode", "WAL").ok();
    con.pragma_update(None, "foreign_keys", "ON").ok();
    con.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS pages (
            id TEXT PRIMARY KEY,
            parent_id TEXT,
            title TEXT NOT NULL DEFAULT '',
            icon TEXT,
            cover TEXT,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            is_trashed INTEGER NOT NULL DEFAULT 0,
            position REAL NOT NULL DEFAULT 0,
            date TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS backups (
            id TEXT PRIMARY KEY,
            days TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            format TEXT NOT NULL DEFAULT 'json',
            page_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS blocks (
            id TEXT PRIMARY KEY,
            page_id TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'paragraph',
            content TEXT NOT NULL DEFAULT '',
            meta TEXT NOT NULL DEFAULT '',
            checked INTEGER NOT NULL DEFAULT 0,
            collapsed INTEGER NOT NULL DEFAULT 0,
            indent INTEGER NOT NULL DEFAULT 0,
            position REAL NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_lock (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            pin_salt TEXT NOT NULL,
            pin_hash TEXT NOT NULL,
            pin_len INTEGER NOT NULL,
            session_token TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parent_id);
        CREATE INDEX IF NOT EXISTS idx_blocks_page ON blocks(page_id);
        "#,
    )
    .expect("schema error");
    migrate(&con);
    seed_if_empty(&con);
    con
}

/// One-time migration for pre-calendar databases: add pages.date and
/// backfill it with each page's creation day, so existing notes show
/// up on the calendar on the day they were written.
fn migrate(con: &Connection) {
    let has_date: i64 = con
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('pages') WHERE name='date'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_date == 0 {
        con.execute_batch(
            "ALTER TABLE pages ADD COLUMN date TEXT;
             UPDATE pages SET date = date(created_at/1000, 'unixepoch', 'localtime');",
        )
        .expect("date migration failed");
        println!("migrated pages: added date column + backfilled");
    }

    let has_pinned: i64 = con
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('pages') WHERE name='is_pinned'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_pinned == 0 {
        con.execute_batch("ALTER TABLE pages ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;")
            .expect("is_pinned migration failed");
        println!("migrated pages: added is_pinned column");
    }
}

/// Gregorian ISO day (UTC) without pulling in chrono — for seeding only.
fn today_iso() -> String {
    let days = now_ms().div_euclid(86_400_000);
    // Howard Hinnant's civil_from_days
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

fn seed_block(
    con: &Connection,
    page_id: &str,
    t: &str,
    content: &str,
    indent: i64,
    checked: bool,
    collapsed: bool,
    pos: f64,
) {
    let now = now_ms();
    con.execute(
        "INSERT INTO blocks (id, page_id, type, content, checked, collapsed, indent, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![Uuid::new_v4().to_string(), page_id, t, content, checked as i64, collapsed as i64, indent, pos, now],
    )
    .unwrap();
}

fn seed_page(con: &Connection, parent: Option<&str>, title: &str, icon: Option<&str>, pos: f64) -> String {
    let id = Uuid::new_v4().to_string();
    let now = now_ms();
    con.execute(
        "INSERT INTO pages (id, parent_id, title, icon, cover, is_favorite, is_trashed, position, date, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, NULL, 0, 0, ?5, ?6, ?7, ?7)",
        params![id, parent, title, icon, pos, today_iso(), now],
    )
    .unwrap();
    id
}

fn seed_if_empty(con: &Connection) {
    let count: i64 = con
        .query_row("SELECT COUNT(*) FROM pages", [], |r| r.get(0))
        .unwrap();
    if count > 0 {
        return;
    }

    // ---- Getting Started ----
    let p1 = seed_page(con, None, "Getting Started", Some("🚀"), 1.0);
    let b = |t: &str, c: &str, ind: i64, ck: bool, col: bool, pos: f64| {
        seed_block(con, &p1, t, c, ind, ck, col, pos);
    };
    seed_block(con, &p1, "callout", "👋 Welcome to your workspace! <b>This app is a faithful Notion clone</b> — and its entire backend is written in <b>Rust</b> 🦀 (Axum + SQLite).", 0, false, false, 1.0);
    b("heading_1", "Quickstart", 0, false, false,  2.0);
    b("todo", "Create a new page from the sidebar (+ button)", 0, true, false,  3.0);
    b("todo", "Press <code>/</code> on an empty line to open the block menu", 0, false, false,  4.0);
    b("todo", "Hover any block to grab the ⠿ handle — drag to reorder", 0, false, false,  5.0);
    b("heading_2", "Try the basics", 0, false, false,  6.0);
    b("bulleted", "Click anywhere and just start typing", 0, false, false,  7.0);
    b("bulleted", "Select text to see the toolbar — bold, italic, underline, <code>code</code>", 0, false, false,  8.0);
    b("bulleted", "Type <code>#</code>, <code>-</code>, <code>[]</code> or <code>&gt;</code> + space for markdown shortcuts", 0, false, false,  9.0);
    b("bulleted", "Use <b>Ctrl+K</b> to search your workspace", 0, false, false,  10.0);
    seed_block(con, &p1, "divider", "", 0, false, false, 11.0);
    b("quote", "Simplicity is the ultimate sophistication.", 0, false, false,  12.0);
    b("toggle", "What can this editor do?", 0, false, true, 13.0);
    b("paragraph", "All the core Notion blocks: headings, to-dos, bulleted & numbered lists, toggles, quotes, callouts, code blocks, dividers and images.", 1, false, false, 14.0);
    b("paragraph", "Everything is stored in a Rust-powered API and survives refreshes.", 1, false, false, 15.0);
    b("heading_3", "A bit of code", 0, false, false,  16.0);
    seed_block(con, &p1, "code", "fn main() {\n    println!(\"Hello from Rust! 🦀\");\n}", 0, false, false, 17.0);
    b("paragraph", "", 0, false, false, 18.0);

    // ---- child page ----
    let p2 = seed_page(con, Some(&p1), "Roadmap", Some("🗺️"), 1.0);
    seed_block(con, &p2, "heading_2", "Up next", 0, false, false, 1.0);
    seed_block(con, &p2, "todo", "Multiplayer editing (CRDT)", 0, false, false, 2.0);
    seed_block(con, &p2, "todo", "Comments & mentions", 0, false, false, 3.0);
    seed_block(con, &p2, "todo", "Databases (tables, boards)", 0, false, false, 4.0);

    // ---- Quick Note ----
    let p3 = seed_page(con, None, "Quick Note", Some("📝"), 2.0);
    seed_block(con, &p3, "paragraph", "This is a fresh page. Click here and start typing — everything saves automatically.", 0, false, false, 1.0);
}
