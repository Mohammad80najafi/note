mod db;

use axum::{
    extract::{Path, Query, Request, State},
    http::{header, HeaderMap, StatusCode},
    middleware::Next,
    response::{AppendHeaders, IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use db::{backup_from_row, blocks_of_page, get_block_row, get_page_row, now_ms, page_from_row, Backup, Block, Page};
use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use uuid::Uuid;

type Db = Arc<Mutex<Connection>>;

/// Deserialize `Option<Option<T>>` so JSON `null` → Some(None) (i.e. "clear it"),
/// a missing key → None ("leave untouched"), and a value → Some(Some(v)).
fn double_option<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    T: serde::Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    serde::Deserialize::deserialize(de).map(Some)
}

fn descendants(con: &Connection, root: &str) -> Vec<String> {
    let mut stmt = con
        .prepare(
            "WITH RECURSIVE d(id) AS (
                SELECT ?1
                UNION ALL
                SELECT p.id FROM pages p JOIN d ON p.parent_id = d.id
             )
             SELECT id FROM d",
        )
        .unwrap();
    let rows = stmt.query_map(params![root], |r| r.get::<_, String>(0)).unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

// ---------------- pages ----------------

async fn health() -> Json<Value> {
    Json(json!({ "ok": true, "server": "notion-server-rust" }))
}

async fn list_pages(State(db): State<Db>) -> Json<Value> {
    let con = db.lock().unwrap();
    let mut stmt = con
        .prepare("SELECT * FROM pages ORDER BY position, created_at")
        .unwrap();
    let pages: Vec<Page> = stmt
        .query_map([], page_from_row)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(json!({ "pages": pages }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePage {
    parent_id: Option<String>,
    title: Option<String>,
    icon: Option<String>,
    after_page_id: Option<String>,
    /// Gregorian ISO day "YYYY-MM-DD" to attach this note to.
    date: Option<String>,
}

async fn create_page(State(db): State<Db>, Json(body): Json<CreatePage>) -> Json<Value> {
    let con = db.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let now = now_ms();
    let pos: f64 = match &body.after_page_id {
        Some(after) => {
            let after_pos: f64 = con
                .query_row("SELECT position FROM pages WHERE id=?1", params![after], |r| {
                    r.get(0)
                })
                .unwrap_or(0.0);
            let next: Option<f64> = con
                .query_row(
                    "SELECT position FROM pages WHERE parent_id IS ?1 AND is_trashed=0 AND position > ?2 ORDER BY position LIMIT 1",
                    params![body.parent_id, after_pos],
                    |r| r.get(0),
                )
                .ok();
            match next {
                Some(n) => (after_pos + n) / 2.0,
                None => after_pos + 1.0,
            }
        }
        None => {
            let max: f64 = con
                .query_row(
                    "SELECT COALESCE(MAX(position), 0) FROM pages WHERE parent_id IS ?1",
                    params![body.parent_id],
                    |r| r.get(0),
                )
                .unwrap_or(0.0);
            max + 1.0
        }
    };
    con.execute(
        "INSERT INTO pages (id, parent_id, title, icon, cover, is_favorite, is_trashed, position, date, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, NULL, 0, 0, ?5, ?6, ?7, ?7)",
        params![id, body.parent_id, body.title.unwrap_or_default(), body.icon, pos, body.date, now],
    )
    .unwrap();
    // a fresh page starts with one empty paragraph, like Notion
    con.execute(
        "INSERT INTO blocks (id, page_id, type, content, checked, collapsed, indent, position, created_at, updated_at)
         VALUES (?1, ?2, 'paragraph', '', 0, 0, 0, 1.0, ?3, ?3)",
        params![Uuid::new_v4().to_string(), id, now],
    )
    .unwrap();
    Json(json!(get_page_row(&con, &id).unwrap()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetPageQuery {
    #[serde(default)]
    _x: Option<String>,
}

async fn get_page(
    State(db): State<Db>,
    Path(id): Path<String>,
    Query(_q): Query<GetPageQuery>,
) -> Result<Json<Value>, StatusCode> {
    let con = db.lock().unwrap();
    let page = get_page_row(&con, &id).ok_or(StatusCode::NOT_FOUND)?;
    let blocks = blocks_of_page(&con, &id);
    let mut crumbs: Vec<Value> = Vec::new();
    let mut cur = page.parent_id.clone();
    let mut guard = 0;
    while let Some(pid) = cur {
        if guard > 20 {
            break;
        }
        guard += 1;
        if let Some(p) = get_page_row(&con, &pid) {
            crumbs.push(json!({ "id": p.id, "title": p.title, "icon": p.icon }));
            cur = p.parent_id;
        } else {
            break;
        }
    }
    crumbs.reverse();
    Ok(Json(json!({ "page": page, "blocks": blocks, "breadcrumbs": crumbs })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePage {
    title: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    icon: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    cover: Option<Option<String>>,
    parent_id: Option<String>,
    is_favorite: Option<bool>,
    is_trashed: Option<bool>,
    position: Option<f64>,
    /// Some(Some(iso)) set a day, Some(None) clears it.
    #[serde(default, deserialize_with = "double_option")]
    date: Option<Option<String>>,
    is_pinned: Option<bool>,
}

async fn update_page(
    State(db): State<Db>,
    Path(id): Path<String>,
    Json(body): Json<UpdatePage>,
) -> Result<Json<Value>, StatusCode> {
    let con = db.lock().unwrap();
    let now = now_ms();
    if let Some(t) = &body.title {
        con.execute("UPDATE pages SET title=?1, updated_at=?2 WHERE id=?3", params![t, now, id]).unwrap();
    }
    if let Some(icon) = &body.icon {
        match icon {
            Some(v) => con.execute("UPDATE pages SET icon=?1, updated_at=?2 WHERE id=?3", params![v, now, id]).unwrap(),
            None => con.execute("UPDATE pages SET icon=NULL, updated_at=?1 WHERE id=?2", params![now, id]).unwrap(),
        };
    }
    if let Some(cover) = &body.cover {
        match cover {
            Some(v) => con.execute("UPDATE pages SET cover=?1, updated_at=?2 WHERE id=?3", params![v, now, id]).unwrap(),
            None => con.execute("UPDATE pages SET cover=NULL, updated_at=?1 WHERE id=?2", params![now, id]).unwrap(),
        };
    }
    if let Some(p) = &body.parent_id {
        con.execute("UPDATE pages SET parent_id=?1, updated_at=?2 WHERE id=?3", params![p, now, id]).unwrap();
    }
    if let Some(f) = body.is_favorite {
        con.execute("UPDATE pages SET is_favorite=?1, updated_at=?2 WHERE id=?3", params![f as i64, now, id]).unwrap();
    }
    if let Some(t) = body.is_trashed {
        // trash / restore the whole subtree
        con.execute(
            "UPDATE pages SET is_trashed=?1, updated_at=?2 WHERE id IN (
                WITH RECURSIVE d(id) AS (
                    SELECT ?3 UNION ALL
                    SELECT p.id FROM pages p JOIN d ON p.parent_id = d.id
                ) SELECT id FROM d
            )",
            params![t as i64, now, id],
        )
        .unwrap();
    }
    if let Some(pos) = body.position {
        con.execute("UPDATE pages SET position=?1, updated_at=?2 WHERE id=?3", params![pos, now, id]).unwrap();
    }
    if let Some(d) = body.date {
        match d {
            Some(v) => con.execute("UPDATE pages SET date=?1, updated_at=?2 WHERE id=?3", params![v, now, id]).unwrap(),
            None => con.execute("UPDATE pages SET date=NULL, updated_at=?1 WHERE id=?2", params![now, id]).unwrap(),
        };
    }
    if let Some(p) = body.is_pinned {
        con.execute("UPDATE pages SET is_pinned=?1, updated_at=?2 WHERE id=?3", params![p as i64, now, id]).unwrap();
    }
    let page = get_page_row(&con, &id).ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(json!(page)))
}

// ---------------- app lock (site-wide PIN) ----------------

const LOCK_COOKIE: &str = "nlk_session";

fn hash_pin(salt: &str, pin: &str) -> String {
    let mut h = Sha256::new();
    h.update(salt.as_bytes());
    h.update(b"::notion-lock::");
    h.update(pin.as_bytes());
    h.finalize().iter().map(|b| format!("{:02x}", b)).collect()
}

/// Random hex string from time/process entropy pushed through SHA-256.
/// Fine for a local single-user app lock (salt + session tokens).
fn random_hex(n: usize) -> String {
    let mut out = String::new();
    let mut ctr: u64 = 0;
    while out.len() < n {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0);
        let mut h = Sha256::new();
        h.update(nanos.to_le_bytes());
        h.update(ctr.to_le_bytes());
        h.update(std::process::id().to_le_bytes());
        let d = h.finalize();
        for b in d {
            out.push_str(&format!("{:02x}", b));
        }
        ctr += 1;
    }
    out.chars().take(n).collect()
}

struct LockState {
    enabled: bool,
    locked: bool,
    length: i64,
}

/// Row exists = enabled; session_token NULL/empty = locked.
fn lock_state(con: &Connection) -> LockState {
    con.query_row(
        "SELECT pin_len, session_token FROM app_lock WHERE id = 1",
        [],
        |r| {
            let len: i64 = r.get(0)?;
            let tok: Option<String> = r.get(1)?;
            Ok(LockState {
                enabled: true,
                locked: tok.as_ref().map_or(true, |t| t.is_empty()),
                length: len,
            })
        },
    )
    .unwrap_or(LockState { enabled: false, locked: false, length: 0 })
}

fn cookie_token(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    for pair in raw.split(';') {
        let mut it = pair.trim().splitn(2, '=');
        if it.next()?.trim() == LOCK_COOKIE {
            return it.next().map(|v| v.trim().to_string());
        }
    }
    None
}

fn session_valid(con: &Connection, headers: &HeaderMap) -> bool {
    let tok: Option<String> = con
        .query_row("SELECT session_token FROM app_lock WHERE id = 1", [], |r| r.get(0))
        .ok()
        .flatten();
    match tok {
        Some(t) if !t.is_empty() => cookie_token(headers).as_deref() == Some(t.as_str()),
        _ => false,
    }
}

fn locked_err() -> Response {
    (StatusCode::UNAUTHORIZED, Json(json!({ "error": "locked" }))).into_response()
}

fn bad_pin_err() -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": "bad_pin" }))).into_response()
}

/// While the lock is armed and the visitor has no valid session cookie,
/// every data endpoint returns 401 — the whole site is truly locked.
async fn lock_guard(State(db): State<Db>, req: Request, next: Next) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().as_str();
    let st = {
        let con = db.lock().unwrap();
        lock_state(&con)
    };
    if st.enabled {
        let public = (path == "/api/lock" && method == "GET")
            || (path == "/api/lock/verify" && method == "POST")
            || (path == "/api/lock/engage" && method == "POST");
        if !public {
            let ok = {
                let con = db.lock().unwrap();
                session_valid(&con, req.headers())
            };
            if !ok {
                return locked_err();
            }
        }
    }
    next.run(req).await
}

async fn lock_status(State(db): State<Db>) -> Json<Value> {
    let con = db.lock().unwrap();
    let st = lock_state(&con);
    Json(json!({ "enabled": st.enabled, "locked": st.locked, "length": st.length }))
}

#[derive(Deserialize)]
struct SetPin {
    pin: String,
}

async fn lock_setup(State(db): State<Db>, headers: HeaderMap, Json(body): Json<SetPin>) -> Response {
    let pin = body.pin.trim().to_string();
    let digits = !pin.is_empty() && pin.chars().all(|c| c.is_ascii_digit());
    if !digits || pin.len() < 4 || pin.len() > 8 {
        return bad_pin_err();
    }
    let con = db.lock().unwrap();
    let st = lock_state(&con);
    if st.enabled && !session_valid(&con, &headers) {
        // changing the PIN requires an unlocked session
        return locked_err();
    }
    let salt = random_hex(32);
    let hash = hash_pin(&salt, &pin);
    let tok = random_hex(48);
    con.execute(
        "INSERT INTO app_lock (id, pin_salt, pin_hash, pin_len, session_token) VALUES (1, ?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET pin_salt=?1, pin_hash=?2, pin_len=?3, session_token=?4",
        params![salt, hash, pin.len() as i64, tok],
    )
    .unwrap();
    (
        AppendHeaders([(header::SET_COOKIE, format!("{LOCK_COOKIE}={tok}; Path=/; HttpOnly; SameSite=Lax"))]),
        Json(json!({ "ok": true, "enabled": true, "locked": false })),
    )
        .into_response()
}

async fn lock_verify(State(db): State<Db>, Json(body): Json<SetPin>) -> Response {
    let (salt, hash, len) = {
        let con = db.lock().unwrap();
        con.query_row(
            "SELECT pin_salt, pin_hash, pin_len FROM app_lock WHERE id = 1",
            [],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)),
        )
        .ok()
    }
    .unwrap_or_default();
    if salt.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "no_lock" }))).into_response();
    }
    let ok = body.pin.chars().count() == len as usize && hash_pin(&salt, &body.pin) == hash;
    if !ok {
        // small delay to blunt brute force, WITHOUT holding the db lock
        std::thread::sleep(Duration::from_millis(200));
        return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "wrong_pin" }))).into_response();
    }
    let tok = random_hex(48);
    {
        let con = db.lock().unwrap();
        con.execute("UPDATE app_lock SET session_token=?1 WHERE id = 1", params![tok]).unwrap();
    }
    (
        AppendHeaders([(header::SET_COOKIE, format!("{LOCK_COOKIE}={tok}; Path=/; HttpOnly; SameSite=Lax"))]),
        Json(json!({ "ok": true })),
    )
        .into_response()
}

async fn lock_engage(State(db): State<Db>) -> Json<Value> {
    let con = db.lock().unwrap();
    con.execute("UPDATE app_lock SET session_token=NULL WHERE id = 1", []).unwrap();
    Json(json!({ "ok": true, "locked": true }))
}

async fn lock_disable(State(db): State<Db>, headers: HeaderMap) -> Response {
    let con = db.lock().unwrap();
    if !session_valid(&con, &headers) {
        return locked_err();
    }
    con.execute("DELETE FROM app_lock WHERE id = 1", []).unwrap();
    (
        AppendHeaders([(header::SET_COOKIE, format!("{LOCK_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"))]),
        Json(json!({ "ok": true })),
    )
        .into_response()
}

// ---------------- backups ----------------

async fn list_backups(State(db): State<Db>) -> Json<Value> {
    let con = db.lock().unwrap();
    let mut stmt = con
        .prepare("SELECT * FROM backups ORDER BY created_at DESC")
        .unwrap();
    let backups: Vec<Backup> = stmt
        .query_map([], backup_from_row)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(json!({ "backups": backups }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateBackup {
    /// Exact ISO days covered by this backup (single day or an expanded range).
    days: Vec<String>,
    format: Option<String>,
    page_count: Option<i64>,
}

async fn create_backup(State(db): State<Db>, Json(body): Json<CreateBackup>) -> Json<Value> {
    let con = db.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let now = now_ms();
    let mut days = body.days.clone();
    days.sort();
    days.dedup();
    let start = days.first().cloned().unwrap_or_default();
    let end = days.last().cloned().unwrap_or_default();
    let format = body.format.unwrap_or_else(|| "json".to_string());
    let page_count = body.page_count.unwrap_or(0);
    let days_json = serde_json::to_string(&days).unwrap();
    con.execute(
        "INSERT INTO backups (id, days, start_date, end_date, format, page_count, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, days_json, start, end, format, page_count, now],
    )
    .unwrap();
    let bk: Backup = con
        .query_row("SELECT * FROM backups WHERE id=?1", params![id], backup_from_row)
        .unwrap();
    Json(json!(bk))
}

async fn delete_backup(State(db): State<Db>, Path(id): Path<String>) -> Json<Value> {
    let con = db.lock().unwrap();
    con.execute("DELETE FROM backups WHERE id=?1", params![id]).unwrap();
    Json(json!({ "ok": true }))
}

async fn purge_page(State(db): State<Db>, Path(id): Path<String>) -> Json<Value> {
    let con = db.lock().unwrap();
    let ids = descendants(&con, &id);
    for pid in &ids {
        con.execute("DELETE FROM blocks WHERE page_id=?1", params![pid]).unwrap();
    }
    for pid in &ids {
        con.execute("DELETE FROM pages WHERE id=?1", params![pid]).unwrap();
    }
    Json(json!({ "deleted": ids.len() }))
}

fn dup_page_rec(con: &Connection, src_id: &str, new_parent: Option<&str>) -> String {
    let src = get_page_row(con, src_id).unwrap();
    let new_id = Uuid::new_v4().to_string();
    let now = now_ms();
    let max: f64 = con
        .query_row(
            "SELECT COALESCE(MAX(position), 0) FROM pages WHERE parent_id IS ?1",
            params![new_parent],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    con.execute(
        "INSERT INTO pages (id, parent_id, title, icon, cover, is_favorite, is_trashed, position, date, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6, ?7, ?8, ?8)",
        params![new_id, new_parent, format!("{} (copy)", src.title), src.icon, src.cover, max + 1.0, src.date, now],
    )
    .unwrap();
    let blocks = blocks_of_page(con, src_id);
    for b in blocks {
        con.execute(
            "INSERT INTO blocks (id, page_id, type, content, meta, checked, collapsed, indent, position, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
            params![Uuid::new_v4().to_string(), new_id, b.block_type, b.content, b.meta, b.checked as i64, b.collapsed as i64, b.indent, b.position, now],
        )
        .unwrap();
    }
    let children: Vec<String> = {
        let mut stmt = con
            .prepare("SELECT id FROM pages WHERE parent_id = ?1 AND is_trashed = 0 ORDER BY position")
            .unwrap();
        let rows = stmt.query_map(params![src_id], |r| r.get::<_, String>(0)).unwrap();
        rows.filter_map(|r| r.ok()).collect()
    };
    for c in children {
        dup_page_rec(con, &c, Some(&new_id));
    }
    new_id
}

async fn duplicate_page(State(db): State<Db>, Path(id): Path<String>) -> Json<Value> {
    let con = db.lock().unwrap();
    let new_id = dup_page_rec(&con, &id, None);
    Json(json!(get_page_row(&con, &new_id).unwrap()))
}

// ---------------- blocks ----------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateBlock {
    page_id: String,
    r#type: Option<String>,
    content: Option<String>,
    after_id: Option<String>,
    indent: Option<i64>,
}

async fn create_block(State(db): State<Db>, Json(body): Json<CreateBlock>) -> Json<Value> {
    let con = db.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let now = now_ms();
    let t = body.r#type.unwrap_or_else(|| "paragraph".to_string());
    let content = body.content.unwrap_or_default();
    let indent = body.indent.unwrap_or(0);
    let pos: f64 = match &body.after_id {
        Some(after) => {
            let after_pos: f64 = con
                .query_row("SELECT position FROM blocks WHERE id=?1", params![after], |r| r.get(0))
                .unwrap_or(0.0);
            let next: Option<f64> = con
                .query_row(
                    "SELECT position FROM blocks WHERE page_id=?1 AND position > ?2 ORDER BY position LIMIT 1",
                    params![body.page_id, after_pos],
                    |r| r.get(0),
                )
                .ok();
            match next {
                Some(n) => (after_pos + n) / 2.0,
                None => after_pos + 1.0,
            }
        }
        None => {
            let max: f64 = con
                .query_row(
                    "SELECT COALESCE(MAX(position), 0) FROM blocks WHERE page_id=?1",
                    params![body.page_id],
                    |r| r.get(0),
                )
                .unwrap_or(0.0);
            max + 1.0
        }
    };
    con.execute(
        "INSERT INTO blocks (id, page_id, type, content, checked, collapsed, indent, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?6, ?7, ?7)",
        params![id, body.page_id, t, content, indent, pos, now],
    )
    .unwrap();
    Json(json!(get_block_row(&con, &id).unwrap()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateBlock {
    r#type: Option<String>,
    content: Option<String>,
    meta: Option<String>,
    checked: Option<bool>,
    collapsed: Option<bool>,
    indent: Option<i64>,
}

async fn update_block(
    State(db): State<Db>,
    Path(id): Path<String>,
    Json(body): Json<UpdateBlock>,
) -> Result<Json<Value>, StatusCode> {
    let con = db.lock().unwrap();
    let now = now_ms();
    if let Some(t) = &body.r#type {
        con.execute("UPDATE blocks SET type=?1, updated_at=?2 WHERE id=?3", params![t, now, id]).unwrap();
    }
    if let Some(c) = &body.content {
        con.execute("UPDATE blocks SET content=?1, updated_at=?2 WHERE id=?3", params![c, now, id]).unwrap();
    }
    if let Some(m) = &body.meta {
        con.execute("UPDATE blocks SET meta=?1, updated_at=?2 WHERE id=?3", params![m, now, id]).unwrap();
    }
    if let Some(c) = body.checked {
        con.execute("UPDATE blocks SET checked=?1, updated_at=?2 WHERE id=?3", params![c as i64, now, id]).unwrap();
    }
    if let Some(c) = body.collapsed {
        con.execute("UPDATE blocks SET collapsed=?1, updated_at=?2 WHERE id=?3", params![c as i64, now, id]).unwrap();
    }
    if let Some(i) = body.indent {
        con.execute("UPDATE blocks SET indent=?1, updated_at=?2 WHERE id=?3", params![i, now, id]).unwrap();
    }
    let block = get_block_row(&con, &id).ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(json!(block)))
}

async fn delete_block(State(db): State<Db>, Path(id): Path<String>) -> Json<Value> {
    let con = db.lock().unwrap();
    con.execute("DELETE FROM blocks WHERE id=?1", params![id]).unwrap();
    Json(json!({ "ok": true }))
}

#[derive(Deserialize)]
struct ReorderBody {
    ids: Vec<String>,
}

async fn reorder_blocks(
    State(db): State<Db>,
    Path(page_id): Path<String>,
    Json(body): Json<ReorderBody>,
) -> Json<Value> {
    let con = db.lock().unwrap();
    let now = now_ms();
    for (i, bid) in body.ids.iter().enumerate() {
        con.execute(
            "UPDATE blocks SET position=?1, updated_at=?2 WHERE id=?3 AND page_id=?4",
            params![i as f64, now, bid, page_id],
        )
        .unwrap();
    }
    Json(json!({ "blocks": blocks_of_page(&con, &page_id) }))
}

// ---------------- trash & search ----------------

async fn trash_list(State(db): State<Db>) -> Json<Value> {
    let con = db.lock().unwrap();
    let mut stmt = con
        .prepare("SELECT * FROM pages WHERE is_trashed = 1 ORDER BY updated_at DESC")
        .unwrap();
    let pages: Vec<Page> = stmt
        .query_map([], page_from_row)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    Json(json!({ "pages": pages }))
}

fn strip_html(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

fn build_path(con: &Connection, page_id: &str) -> Vec<Value> {
    let mut crumbs: Vec<Value> = Vec::new();
    let mut cur = get_page_row(con, page_id).and_then(|p| p.parent_id);
    let mut guard = 0;
    while let Some(pid) = cur {
        if guard > 20 {
            break;
        }
        guard += 1;
        if let Some(p) = get_page_row(con, &pid) {
            crumbs.push(json!({ "id": p.id, "title": p.title, "icon": p.icon }));
            cur = p.parent_id;
        } else {
            break;
        }
    }
    crumbs.reverse();
    crumbs
}

fn make_snippet(content: &str, q: &str) -> String {
    let plain = strip_html(content);
    let lower = plain.to_lowercase();
    let ql = q.to_lowercase();
    if let Some(idx) = lower.find(&ql) {
        let start = if idx > 40 { idx - 40 } else { 0 };
        let start = if plain.is_char_boundary(start) { start } else { 0 };
        let end = (start + 140).min(plain.len());
        let end = if plain.is_char_boundary(end) { end } else { plain.len() };
        let mut snip = plain[start..end].trim().to_string();
        if start > 0 {
            snip.insert_str(0, "…");
        }
        if end < plain.len() {
            snip.push('…');
        }
        snip
    } else {
        let mut snip = plain.chars().take(100).collect::<String>();
        if plain.chars().count() > 100 {
            snip.push('…');
        }
        snip
    }
}

async fn search(State(db): State<Db>, Query(qs): Query<HashMap<String, String>>) -> Json<Value> {
    let q = qs.get("q").cloned().unwrap_or_default();
    let con = db.lock().unwrap();
    let mut results: Vec<Value> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    if q.trim().is_empty() {
        // recent pages
        let mut stmt = con
            .prepare(
                "SELECT * FROM pages WHERE is_trashed = 0 ORDER BY updated_at DESC LIMIT 8",
            )
            .unwrap();
        let pages: Vec<Page> = stmt
            .query_map([], page_from_row)
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        for p in pages {
            results.push(json!({
                "pageId": p.id, "title": p.title, "icon": p.icon,
                "snippet": "", "path": build_path(&con, &p.id),
            }));
        }
        return Json(json!({ "recent": true, "results": results }));
    }

    let like = format!("%{}%", q.replace(' ', "%"));

    // pages by title
    {
        let mut stmt = con
            .prepare(
                "SELECT * FROM pages WHERE is_trashed = 0 AND title LIKE ?1 ORDER BY updated_at DESC LIMIT 10",
            )
            .unwrap();
        let pages: Vec<Page> = stmt
            .query_map(params![like], page_from_row)
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        for p in pages {
            if seen.insert(p.id.clone()) {
                results.push(json!({
                    "pageId": p.id, "title": p.title, "icon": p.icon,
                    "snippet": "", "path": build_path(&con, &p.id),
                }));
            }
        }
    }

    // blocks by content
    {
        let mut stmt = con
            .prepare(
                "SELECT b.content, p.id, p.title, p.icon FROM blocks b
                 JOIN pages p ON p.id = b.page_id
                 WHERE p.is_trashed = 0 AND b.content LIKE ?1
                 ORDER BY b.updated_at DESC LIMIT 30",
            )
            .unwrap();
        let rows = stmt
            .query_map(params![like], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<String>>(3)?,
                ))
            })
            .unwrap();
        for row in rows.filter_map(|r| r.ok()) {
            let (content, pid, title, icon) = row;
            if seen.insert(pid.clone()) {
                results.push(json!({
                    "pageId": pid, "title": title, "icon": icon,
                    "snippet": make_snippet(&content, &q),
                    "path": build_path(&con, &pid),
                }));
            }
            if results.len() >= 20 {
                break;
            }
        }
    }

    Json(json!({ "recent": false, "results": results }))
}

// ---------------- export relay (robust downloads, survives sandboxed contexts) ----------------

/// Client-built export payload (JSON / Markdown / print-HTML) stored briefly on
/// disk and served back as a real URL — so downloads work even where blob `<a
/// download>` clicks or iframe print() are blocked by the browser.
#[derive(Deserialize)]
struct ExportBody {
    filename: String,
    mime: String,
    content: String,
}

fn exports_dir() -> std::path::PathBuf {
    std::path::PathBuf::from("/home/z/my-project/db/exports")
}

/// Keep the exports dir tidy: drop files older than 24h, cap at 80 exports.
fn prune_exports(dir: &std::path::Path) {
    const TTL_MS: u128 = 24 * 60 * 60 * 1000;
    const MAX_FILES: usize = 80;
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut files: Vec<(std::path::PathBuf, std::time::SystemTime)> = Vec::new();
    for e in rd.filter_map(|e| e.ok()) {
        let Ok(meta) = e.metadata() else { continue };
        let modified = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        if now.saturating_sub(
            modified
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0),
        ) > TTL_MS
        {
            let _ = std::fs::remove_file(e.path());
        } else {
            files.push((e.path(), modified));
        }
    }
    if files.len() > MAX_FILES {
        files.sort_by_key(|(_, m)| *m);
        let excess = files.len() - MAX_FILES;
        for (path, _) in files.into_iter().take(excess) {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn safe_component(s: &str, fallback: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('_').to_string();
    if trimmed.is_empty() || trimmed == "." {
        fallback.to_string()
    } else {
        trimmed
    }
}

async fn create_export(State(db): State<Db>, Json(body): Json<ExportBody>) -> Response {
    let _ = db; // state kept for symmetry + future per-user quotas
    let dir = exports_dir();
    let _ = std::fs::create_dir_all(&dir);
    prune_exports(&dir);

    let id = Uuid::new_v4().simple().to_string();
    let name = safe_component(&body.filename, "export.txt");
    let mime = body.mime.trim().to_string();
    if mime.is_empty() || mime.len() > 120 || mime.contains('\n') || mime.contains('\r') {
        return (StatusCode::BAD_REQUEST, Json(json!({"error":"bad mime"}))).into_response();
    }
    if body.content.len() > 64 * 1024 * 1024 {
        return (StatusCode::PAYLOAD_TOO_LARGE, Json(json!({"error":"too large"}))).into_response();
    }

    let path = dir.join(format!("{id}.bin"));
    if std::fs::write(&path, &body.content).is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error":"write failed"}))).into_response();
    }
    let _ = std::fs::write(dir.join(format!("{id}.mime")), &mime);
    let _ = std::fs::write(dir.join(format!("{id}.name")), &name);

    Json(json!({ "id": id, "url": format!("/api/export/{}", id) })).into_response()
}

async fn serve_export(
    Path(id): Path<String>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    // ids are uuid "simple" hex only — reject anything else
    if id.len() != 32 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let dir = exports_dir();
    let path = dir.join(format!("{id}.bin"));
    let Ok(bytes) = std::fs::read(&path) else {
        return (StatusCode::NOT_FOUND, Json(json!({"error":"expired"}))).into_response();
    };
    let mime = std::fs::read_to_string(dir.join(format!("{id}.mime")))
        .unwrap_or_else(|_| "application/octet-stream".to_string());
    let name = std::fs::read_to_string(dir.join(format!("{id}.name")))
        .unwrap_or_else(|_| "export.txt".to_string());
    let inline = q.get("inline").map(|v| v == "1").unwrap_or(false);
    let disp = if inline {
        format!("inline; filename=\"{name}\"")
    } else {
        format!("attachment; filename=\"{name}\"")
    };
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, mime),
            (header::CONTENT_DISPOSITION, disp),
            (header::CACHE_CONTROL, "no-store".to_string()),
        ],
        bytes,
    )
        .into_response()
}

#[tokio::main]
async fn main() {
    let db_path = std::env::var("NOTION_DB")
        .unwrap_or_else(|_| "/home/z/my-project/db/notion.db".to_string());
    let con = db::open_db(&db_path);
    let db: Db = Arc::new(Mutex::new(con));

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/pages", get(list_pages).post(create_page))
        .route(
            "/api/pages/{id}",
            get(get_page).patch(update_page).delete(purge_page),
        )
        .route("/api/pages/{id}/duplicate", post(duplicate_page))
        .route("/api/pages/{id}/blocks/reorder", post(reorder_blocks))
        .route("/api/trash", get(trash_list))
        .route("/api/backups", get(list_backups).post(create_backup))
        .route("/api/backups/{id}", delete(delete_backup))
        .route("/api/blocks", post(create_block))
        .route("/api/blocks/{id}", axum::routing::patch(update_block).delete(delete_block))
        .route("/api/search", get(search))
        .route("/api/lock", get(lock_status))
        .route("/api/lock/setup", post(lock_setup))
        .route("/api/lock/verify", post(lock_verify))
        .route("/api/lock/engage", post(lock_engage))
        .route("/api/lock/disable", post(lock_disable))
        .route("/api/export", post(create_export))
        .route("/api/export/{id}", get(serve_export))
        .layer(axum::extract::DefaultBodyLimit::max(70 * 1024 * 1024))
        .layer(axum::middleware::from_fn_with_state(db.clone(), lock_guard))
        .with_state(db);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3030);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .expect("bind failed");
    println!("notion-server (Rust/Axum) listening on 0.0.0.0:{}", port);
    axum::serve(listener, app).await.unwrap();
}

// silence unused import warning for Block type used implicitly through json
#[allow(dead_code)]
fn _t(_: Block) {}
