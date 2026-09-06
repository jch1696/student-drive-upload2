/**
 * 학생 결과물 자동 제출함 (Google Apps Script 웹앱)
 * ------------------------------------------------------------
 * 여러 수업 앱(아티팩트)에서 공용으로 쓰는 제출 서버입니다.
 *  - POST  : 학생 앱이 보낸 파일(그림·글·JSON)을 드라이브에 저장 + 시트에 기록
 *  - GET   : 선생님용 갤러리 화면(HTML) / 제출 목록(JSON)
 *
 * 설치:
 *  1. script.google.com → 새 프로젝트 → 이 파일 내용을 Code.gs에 붙여넣기
 *  2. 파일 추가(HTML) → 이름 "gallery" → gallery.html 내용 붙여넣기
 *  3. 아래 CONFIG 수정 (ROOT_FOLDER_ID, TOKEN)
 *  4. 배포 → 새 배포 → 유형: 웹 앱
 *       실행 사용자: 나(선생님 계정)   /   액세스 권한: 모든 사용자
 *  5. 웹앱 URL(…/exec)을 복사해 학생 앱의 SUBMIT_ENDPOINT에 넣기
 */

var CONFIG = {
  // 제출물이 쌓일 최상위 폴더 ID. (드라이브에서 폴더 열면 주소 끝 부분)
  // 비워두면("") 내 드라이브에 "제출함" 폴더를 자동으로 만듭니다.
  ROOT_FOLDER_ID: "",

  // 학생 앱과 서버가 공유하는 간단한 암호. 아무 문자열로 바꾸고, 학생 앱에도 같은 값을 넣습니다.
  TOKEN: "wolhang-2026",

  // 제출 기록 시트 이름 (루트 폴더 안에 자동 생성)
  LOG_SHEET_NAME: "제출기록",

  // 같은 학생이 다시 제출하면: "overwrite" = 이전 파일을 휴지통으로, "version" = _2, _3 붙여 보관
  RESUBMIT: "overwrite",

  // 요청 1건당 최대 크기 (MB). Apps Script 한계 때문에 40 이상은 권장하지 않음
  MAX_MB: 25
};

/* ───────────────────────── 진입점 ───────────────────────── */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = parseBody_(e);
    if (body.token !== CONFIG.TOKEN) return json_({ ok: false, error: "인증 실패(token)" });

    var activity = clean_(body.activity || "기타");
    var title    = clean_(body.activityTitle || activity);
    var klass    = clean_(body.klass || "미지정");
    var name     = clean_(body.name || "");
    var number   = clean_(body.number || "");
    if (!name) return json_({ ok: false, error: "이름이 없습니다." });
    if (!body.files || !body.files.length) return json_({ ok: false, error: "파일이 없습니다." });

    var totalBytes = 0;
    body.files.forEach(function (f) { totalBytes += Math.floor((f.data || "").length * 0.75); });
    if (totalBytes > CONFIG.MAX_MB * 1024 * 1024)
      return json_({ ok: false, error: "파일이 너무 큽니다(최대 " + CONFIG.MAX_MB + "MB)." });

    var folder = ensurePath_([klass, title]);
    var studentTag = (number ? pad2_(number) + "_" : "") + name;
    var saved = [];

    body.files.forEach(function (f, idx) {
      var ext = extOf_(f.name, f.mime);
      var base = studentTag + (body.files.length > 1 ? "_" + (f.label || (idx + 1)) : "");
      var fileName = uniqueName_(folder, base, ext);
      var blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mime || "application/octet-stream", fileName);
      var file = folder.createFile(blob);
      saved.push({ id: file.getId(), name: file.getName(), url: file.getUrl() });
    });

    log_([new Date(), klass, number, name, title, activity, saved.map(function (s) { return s.name; }).join(", "),
          saved.map(function (s) { return s.url; }).join(" "), body.meta ? JSON.stringify(body.meta).slice(0, 500) : ""]);

    return json_({ ok: true, saved: saved, folder: folder.getUrl() });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === "list")   return json_(listSubmissions_(p.klass, p.activity));
  if (p.action === "tree")   return json_(tree_());
  if (p.action === "ping")   return json_({ ok: true, time: new Date() });
  // 기본: 갤러리 화면 (선생님 로그인 상태에서 열면 드라이브 미리보기가 보입니다)
  var t = HtmlService.createTemplateFromFile("gallery");
  t.tree = JSON.stringify(tree_());
  return t.evaluate().setTitle("제출함 갤러리").addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// 갤러리 화면에서 google.script.run으로 호출
function apiList(klass, activity) { return listSubmissions_(klass, activity); }
function apiTree() { return tree_(); }

/* ───────────────────────── 드라이브 ───────────────────────── */

function rootFolder_() {
  if (CONFIG.ROOT_FOLDER_ID) return DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("ROOT_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (_) {} }
  var f = DriveApp.createFolder("제출함");
  props.setProperty("ROOT_ID", f.getId());
  return f;
}

function ensurePath_(parts) {
  var cur = rootFolder_();
  parts.forEach(function (p) {
    var it = cur.getFoldersByName(p);
    cur = it.hasNext() ? it.next() : cur.createFolder(p);
  });
  return cur;
}

function uniqueName_(folder, base, ext) {
  var want = base + ext;
  var existing = folder.getFilesByName(want);
  if (!existing.hasNext()) return want;
  if (CONFIG.RESUBMIT === "overwrite") {
    while (existing.hasNext()) existing.next().setTrashed(true);
    return want;
  }
  var n = 2;
  while (folder.getFilesByName(base + "_" + n + ext).hasNext()) n++;
  return base + "_" + n + ext;
}

function listSubmissions_(klass, title) {
  var out = [];
  var root = rootFolder_();
  var kIt = klass ? root.getFoldersByName(klass) : root.getFolders();
  while (kIt.hasNext()) {
    var kf = kIt.next();
    var aIt = title ? kf.getFoldersByName(title) : kf.getFolders();
    while (aIt.hasNext()) {
      var af = aIt.next();
      var files = af.getFiles();
      while (files.hasNext()) {
        var f = files.next();
        out.push({ klass: kf.getName(), activity: af.getName(), id: f.getId(), name: f.getName(),
                   mime: f.getMimeType(), size: f.getSize(), updated: f.getLastUpdated(), url: f.getUrl() });
      }
    }
  }
  out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  return { ok: true, count: out.length, items: out };
}

function tree_() {
  var root = rootFolder_(), tree = {};
  var kIt = root.getFolders();
  while (kIt.hasNext()) {
    var kf = kIt.next(), list = [];
    var aIt = kf.getFolders();
    while (aIt.hasNext()) list.push(aIt.next().getName());
    tree[kf.getName()] = list.sort();
  }
  return { ok: true, root: root.getUrl(), tree: tree };
}

/* ───────────────────────── 기록 시트 ───────────────────────── */

function log_(row) {
  var root = rootFolder_();
  var it = root.getFilesByName(CONFIG.LOG_SHEET_NAME);
  var ss;
  if (it.hasNext()) ss = SpreadsheetApp.open(it.next());
  else {
    ss = SpreadsheetApp.create(CONFIG.LOG_SHEET_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(root);
    ss.getActiveSheet().appendRow(["제출시각", "학급", "번호", "이름", "활동", "활동코드", "파일", "링크", "메모"]);
  }
  ss.getSheets()[0].appendRow(row);
}

/* ───────────────────────── 유틸 ───────────────────────── */

function parseBody_(e) {
  var raw = e && e.postData && e.postData.contents;
  if (!raw) throw new Error("본문이 없습니다.");
  return JSON.parse(raw);
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function clean_(s) {
  return String(s).replace(/[\\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}
function pad2_(n) { n = String(n).replace(/\D/g, ""); return n.length === 1 ? "0" + n : n; }
function extOf_(name, mime) {
  var m = /\.([a-z0-9]{1,5})$/i.exec(name || "");
  if (m) return "." + m[1].toLowerCase();
  var map = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg",
              "application/json": ".json", "text/plain": ".txt", "text/html": ".html", "application/pdf": ".pdf",
              "audio/webm": ".webm", "video/webm": ".webm", "audio/mpeg": ".mp3" };
  return map[mime] || "";
}
