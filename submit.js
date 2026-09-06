/*!
 * submit.js — 학생 결과물 자동 제출 (공용 클라이언트)
 * ------------------------------------------------------------
 * 어떤 수업 앱에서든 아래 두 줄로 "제출" 기능을 붙일 수 있습니다.
 *
 *   <script src="submit.js"></script>
 *   <script>
 *     Submit.init({ activity:"world-map", activityTitle:"세계지형-나만의지도" });
 *     // 제출 버튼에서:
 *     Submit.dialog({ files:[{ name:"지도.png", mime:"image/png", data:dataURL }] });
 *   </script>
 *
 * endpoint/token은 init 인자로 주거나, 페이지에 window.SUBMIT_ENDPOINT / window.SUBMIT_TOKEN 로 미리 정해도 됩니다.
 * 학생이 입력한 학급·번호·이름은 이 기기에 기억되어 다음 앱에서도 자동으로 채워집니다.
 */
(function (global) {
  "use strict";

  var cfg = {
    endpoint: global.SUBMIT_ENDPOINT || "",
    token: global.SUBMIT_TOKEN || "",
    activity: "activity",
    activityTitle: "",
    klasses: ["6-1"],           // 드롭다운에 보일 학급 목록
    askNumber: true,            // 번호 입력칸 표시
    timeoutMs: 60000
  };
  var KEY = "submit.student.v1";

  function init(o) { for (var k in o) if (o.hasOwnProperty(k)) cfg[k] = o[k]; if (!cfg.activityTitle) cfg.activityTitle = cfg.activity; return api; }

  function getStudent() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } }
  function setStudent(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  /* dataURL / Blob / 문자열 → base64 */
  function toBase64(f) {
    return new Promise(function (res, rej) {
      if (typeof f.data === "string") {
        if (f.data.indexOf("data:") === 0) return res(f.data.split(",")[1]);
        return res(btoa(unescape(encodeURIComponent(f.data))));   // 일반 텍스트
      }
      if (f.data instanceof Blob) {
        var r = new FileReader();
        r.onload = function () { res(String(r.result).split(",")[1]); };
        r.onerror = function () { rej(new Error("파일을 읽지 못했어요.")); };
        return r.readAsDataURL(f.data);
      }
      rej(new Error("지원하지 않는 데이터 형식"));
    });
  }

  /* 실제 전송 */
  function send(opts) {
    if (!cfg.endpoint) return Promise.reject(new Error("제출 주소(endpoint)가 설정되지 않았어요."));
    var st = opts.student || getStudent();
    if (!st.name) return Promise.reject(new Error("이름을 입력해 주세요."));
    return Promise.all((opts.files || []).map(function (f) {
      return toBase64(f).then(function (b64) { return { name: f.name, mime: f.mime || "application/octet-stream", label: f.label, data: b64 }; });
    })).then(function (files) {
      var payload = { token: cfg.token, activity: cfg.activity, activityTitle: cfg.activityTitle,
                      klass: st.klass, number: st.number, name: st.name, files: files, meta: opts.meta || null };
      var ctrl = ("AbortController" in global) ? new AbortController() : null;
      var timer = ctrl && setTimeout(function () { ctrl.abort(); }, cfg.timeoutMs);
      return fetch(cfg.endpoint, { method: "POST", body: JSON.stringify(payload), redirect: "follow",
                                   headers: { "Content-Type": "text/plain;charset=utf-8" }, signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { return r.text(); })
        .then(function (t) {
          var j; try { j = JSON.parse(t); } catch (e) { throw new Error("서버 응답을 읽지 못했어요."); }
          if (!j.ok) throw new Error(j.error || "제출 실패");
          return j;
        })
        .catch(function (e) { throw (e.name === "AbortError") ? new Error("시간이 너무 오래 걸려요. 다시 시도해 주세요.") : e; })
        .then(function (j) { if (timer) clearTimeout(timer); return j; }, function (e) { if (timer) clearTimeout(timer); throw e; });
    });
  }

  /* 학급·번호·이름 묻는 작은 창 → 전송 → 결과 표시 */
  function dialog(opts) {
    return new Promise(function (resolve, reject) {
      var st = getStudent();
      var wrap = document.createElement("div");
      wrap.innerHTML =
        '<div class="sbm-back">' +
        ' <form class="sbm-box">' +
        '  <h3>제출하기</h3><p class="sbm-sub">' + esc(cfg.activityTitle) + '</p>' +
        '  <div class="sbm-row">' +
        '   <label>학급<select name="klass">' + cfg.klasses.map(function (k) { return '<option' + (k === st.klass ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join("") + '</select></label>' +
        (cfg.askNumber ? '   <label>번호<input name="number" inputmode="numeric" maxlength="2" value="' + esc(st.number || "") + '"></label>' : "") +
        '   <label class="grow">이름<input name="name" maxlength="12" required value="' + esc(st.name || "") + '" placeholder="이름"></label>' +
        '  </div>' +
        '  <div class="sbm-msg" aria-live="polite"></div>' +
        '  <div class="sbm-btns"><button type="button" class="sbm-cancel">취소</button><button type="submit" class="sbm-ok">제출</button></div>' +
        ' </form></div>';
      injectCss();
      document.body.appendChild(wrap);
      var form = wrap.querySelector("form"), msg = wrap.querySelector(".sbm-msg"), ok = wrap.querySelector(".sbm-ok");
      var nameEl = form.elements.name; if (!nameEl.value) nameEl.focus();

      function close() { wrap.remove(); }
      wrap.querySelector(".sbm-cancel").onclick = function () { close(); reject(new Error("cancel")); };
      form.onsubmit = function (ev) {
        ev.preventDefault();
        var s = { klass: form.elements.klass.value, number: cfg.askNumber ? form.elements.number.value.trim() : "", name: nameEl.value.trim() };
        if (!s.name) { msg.textContent = "이름을 입력해 주세요."; msg.className = "sbm-msg bad"; return; }
        setStudent(s);
        ok.disabled = true; ok.textContent = "보내는 중…"; msg.textContent = ""; msg.className = "sbm-msg";
        send({ files: opts.files, meta: opts.meta, student: s }).then(function (j) {
          msg.textContent = "제출 완료! 선생님 폴더에 저장되었어요."; msg.className = "sbm-msg good";
          ok.textContent = "완료"; wrap.querySelector(".sbm-cancel").textContent = "닫기";
          setTimeout(close, 1800); resolve(j);
        }).catch(function (e) {
          msg.textContent = "제출 실패: " + e.message; msg.className = "sbm-msg bad";
          ok.disabled = false; ok.textContent = "다시 제출";
        });
      };
    });
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function injectCss() {
    if (document.getElementById("sbm-css")) return;
    var s = document.createElement("style"); s.id = "sbm-css";
    s.textContent =
      ".sbm-back{position:fixed;inset:0;background:rgba(12,18,15,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}" +
      ".sbm-box{background:#fff;color:#1C231E;border-radius:14px;padding:20px 20px 16px;width:min(440px,100%);box-shadow:0 20px 50px -20px rgba(0,0,0,.5);font:15px/1.5 'IBM Plex Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif}" +
      ".sbm-box h3{margin:0;font-size:20px}.sbm-sub{margin:2px 0 14px;color:#5E6A60;font-size:13.5px}" +
      ".sbm-row{display:flex;gap:8px;flex-wrap:wrap}.sbm-row label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#5E6A60}" +
      ".sbm-row label.grow{flex:1;min-width:120px}.sbm-row input,.sbm-row select{font:inherit;font-size:16px;padding:8px 10px;border:1px solid #D5DACF;border-radius:8px;color:#1C231E;background:#fff;width:100%}" +
      ".sbm-row input[name=number]{width:64px}" +
      ".sbm-msg{min-height:22px;margin:10px 0 4px;font-size:14px;font-weight:500}.sbm-msg.good{color:#2E7D4F}.sbm-msg.bad{color:#C2372D}" +
      ".sbm-btns{display:flex;justify-content:flex-end;gap:8px}.sbm-btns button{font:inherit;font-size:14.5px;padding:9px 16px;border-radius:9px;border:1px solid #D5DACF;background:#fff;cursor:pointer}" +
      ".sbm-ok{background:#2A5E63!important;color:#fff!important;border-color:#2A5E63!important}.sbm-ok:disabled{opacity:.6}";
    document.head.appendChild(s);
  }

  var api = { init: init, send: send, dialog: dialog, getStudent: getStudent, setStudent: setStudent, config: cfg };
  global.Submit = api;
})(window);
