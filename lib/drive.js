import { db } from "./db";
import { parse, seal } from "./connectors";

// Modo Drive: a private file space whose files live ONLY in your own Google Drive or Dropbox.
// Modo keeps just the connection (encrypted) — no file data is stored in Modo's database.
// Google Drive uses the "drive.file" permission: Modo can only see files it created (its own "Modo" folder).
// Dropbox uses an "App folder" app: Modo can only see Apps/<your app name>.

export const PROVIDERS = {
  gdrive: { label: "Google Drive" },
  dropbox: { label: "Dropbox" },
};

export async function driveConnector() {
  const c = await db.connector.findFirst({ where: { type: { in: ["gdrive", "dropbox"] } }, orderBy: { createdAt: "desc" } });
  return c ? { id: c.id, type: c.type, cfg: parse(c), enabled: c.enabled } : null;
}
export async function saveDriveCfg(id, patch) {
  const c = await db.connector.findUnique({ where: { id } });
  const cfg = { ...parse(c), ...patch };
  await db.connector.update({ where: { id }, data: { config: seal(cfg) } });
  return cfg;
}

// ── OAuth ──
export function authorizeUrl(type, cfg, redirectUri, state) {
  if (type === "dropbox") return `https://www.dropbox.com/oauth2/authorize?${new URLSearchParams({ client_id: cfg.clientId, response_type: "code", token_access_type: "offline", redirect_uri: redirectUri, state })}`;
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirectUri, response_type: "code", scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email", access_type: "offline", prompt: "consent", include_granted_scopes: "true", state })}`;
}
async function tokenCall(type, form) {
  const url = type === "dropbox" ? "https://api.dropboxapi.com/oauth2/token" : "https://oauth2.googleapis.com/token";
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${PROVIDERS[type].label}: ${d.error_description || d.error_summary || d.error || r.status}`);
  return d;
}
export async function exchangeCode(type, cfg, code, redirectUri) {
  const d = await tokenCall(type, { code, grant_type: "authorization_code", client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri });
  if (!d.refresh_token) throw new Error(`${PROVIDERS[type].label} didn't give a long-term token. Remove Modo from your account's connected apps and connect again.`);
  let account = "";
  try {
    if (type === "dropbox") { const r = await fetch("https://api.dropboxapi.com/2/users/get_current_account", { method: "POST", headers: { authorization: `Bearer ${d.access_token}` } }); account = (await r.json()).email || ""; }
    else { const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization: `Bearer ${d.access_token}` } }); account = (await r.json()).email || ""; }
  } catch {}
  return { refreshToken: d.refresh_token, account };
}
const _tok = new Map(); // connector id → { token, until }
async function token(conn) {
  const hit = _tok.get(conn.id);
  if (hit && hit.until > Date.now() + 60000) return hit.token;
  if (!conn.cfg.refreshToken) throw new Error("Drive isn't connected yet. Open Drive and press Connect.");
  const d = await tokenCall(conn.type, { grant_type: "refresh_token", refresh_token: conn.cfg.refreshToken, client_id: conn.cfg.clientId, client_secret: conn.cfg.clientSecret });
  _tok.set(conn.id, { token: d.access_token, until: Date.now() + (d.expires_in || 3600) * 1000 });
  return d.access_token;
}

// ── Dropbox ──
const dbxArg = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
async function dbx(conn, path, body) {
  const r = await fetch("https://api.dropboxapi.com/2/" + path, { method: "POST", headers: { authorization: `Bearer ${await token(conn)}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text(); let d = {}; try { d = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error("Dropbox: " + (d.error_summary || text || r.status).toString().slice(0, 200));
  return d;
}
const joinPath = (parent, name) => `${parent && parent !== "/" ? parent.replace(/\/$/, "") : ""}/${String(name).replace(/[\\/]/g, "-")}`;

// ── Google Drive ──
async function gd(conn, path, init = {}) {
  const r = await fetch("https://www.googleapis.com/drive/v3/" + path, { ...init, headers: { authorization: `Bearer ${await token(conn)}`, ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers || {}) } });
  if (r.status === 204) return {};
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Google Drive: " + (d.error?.message || r.status));
  return d;
}
const FOLDER = "application/vnd.google-apps.folder";
async function gRoot(conn) {
  if (conn.cfg.rootId) return conn.cfg.rootId;
  const f = await gd(conn, "files", { method: "POST", body: JSON.stringify({ name: "Modo", mimeType: FOLDER }) });
  conn.cfg = await saveDriveCfg(conn.id, { rootId: f.id });
  return f.id;
}
const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// ── Common operations (folder = Dropbox path or Google folder id; "" = the Modo root) ──
export async function listFolder(conn, folder = "") {
  if (conn.type === "dropbox") {
    let d = await dbx(conn, "files/list_folder", { path: folder || "", limit: 500 });
    const all = [...d.entries];
    while (d.has_more && all.length < 2000) { d = await dbx(conn, "files/list_folder/continue", { cursor: d.cursor }); all.push(...d.entries); }
    return all.map((e) => ({ id: e.path_display, name: e.name, folder: e[".tag"] === "folder", size: e.size ?? null, modified: e.server_modified || null }));
  }
  const root = await gRoot(conn);
  const d = await gd(conn, `files?${new URLSearchParams({ q: `'${q(folder || root)}' in parents and trashed=false`, fields: "files(id,name,mimeType,size,modifiedTime)", orderBy: "folder,name", pageSize: "1000" })}`);
  return (d.files || []).map((f) => ({ id: f.id, name: f.name, folder: f.mimeType === FOLDER, size: f.size ? Number(f.size) : null, modified: f.modifiedTime }));
}
export async function makeFolder(conn, parent, name) {
  if (conn.type === "dropbox") { const d = await dbx(conn, "files/create_folder_v2", { path: joinPath(parent, name), autorename: true }); return { id: d.metadata.path_display }; }
  const f = await gd(conn, "files", { method: "POST", body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent || (await gRoot(conn))] }) });
  return { id: f.id };
}
export async function removeItem(conn, id) {
  if (conn.type === "dropbox") return dbx(conn, "files/delete_v2", { path: id });
  return gd(conn, `files/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ trashed: true }) }); // goes to Google Drive trash (recoverable)
}
export async function renameItem(conn, id, name) {
  if (conn.type === "dropbox") { const to = joinPath(id.replace(/\/[^/]*$/, ""), name); const d = await dbx(conn, "files/move_v2", { from_path: id, to_path: to, autorename: true }); return { id: d.metadata.path_display }; }
  await gd(conn, `files/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name }) });
  return { id };
}
// Where the browser uploads a file directly (big files never pass through Modo's server).
export async function uploadTarget(conn, parent, name, size, mime, origin) {
  if (conn.type === "dropbox") {
    const d = await dbx(conn, "files/get_temporary_upload_link", { commit_info: { path: joinPath(parent, name), mode: "add", autorename: true }, duration: 3600 });
    return { url: d.link, method: "POST", headers: { "content-type": "application/octet-stream" } };
  }
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
    method: "POST",
    headers: { authorization: `Bearer ${await token(conn)}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": mime || "application/octet-stream", ...(size ? { "x-upload-content-length": String(size) } : {}), origin },
    body: JSON.stringify({ name, parents: [parent || (await gRoot(conn))] }),
  });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error("Google Drive: " + (d.error?.message || r.status)); }
  return { url: r.headers.get("location"), method: "PUT", headers: { "content-type": mime || "application/octet-stream" } };
}
// Server-side upload of small content (backups).
export async function putFile(conn, folderName, name, content, mime = "application/json") {
  if (conn.type === "dropbox") {
    const r = await fetch("https://content.dropboxapi.com/2/files/upload", { method: "POST", headers: { authorization: `Bearer ${await token(conn)}`, "content-type": "application/octet-stream", "dropbox-api-arg": dbxArg({ path: `/${folderName}/${name}`, mode: "overwrite" }) }, body: content });
    if (!r.ok) throw new Error("Dropbox: " + (await r.text()).slice(0, 200));
    return r.json();
  }
  const root = await gRoot(conn);
  const found = await gd(conn, `files?${new URLSearchParams({ q: `'${q(root)}' in parents and name='${q(folderName)}' and mimeType='${FOLDER}' and trashed=false`, fields: "files(id)" })}`);
  const parent = found.files?.[0]?.id || (await makeFolder(conn, root, folderName)).id;
  const boundary = "modo" + Date.now();
  const body = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n${content}\r\n--${boundary}--`;
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", { method: "POST", headers: { authorization: `Bearer ${await token(conn)}`, "content-type": `multipart/related; boundary=${boundary}` }, body });
  if (!r.ok) throw new Error("Google Drive: " + (await r.text()).slice(0, 200));
  return r.json();
}
// Download: Dropbox gives a short-lived direct link; Google is streamed through Modo (keeps the token private).
export async function downloadResponse(conn, id) {
  if (conn.type === "dropbox") { const d = await dbx(conn, "files/get_temporary_link", { path: id }); return { redirect: d.link }; }
  const meta = await gd(conn, `files/${encodeURIComponent(id)}?fields=name,mimeType,size`);
  if (meta.mimeType?.startsWith("application/vnd.google-apps")) throw new Error("This is a Google Docs file. Open it in Google Drive.");
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { headers: { authorization: `Bearer ${await token(conn)}` } });
  if (!r.ok) throw new Error("Google Drive: download failed (" + r.status + ")");
  return { stream: r.body, name: meta.name, mime: meta.mimeType, size: meta.size };
}
