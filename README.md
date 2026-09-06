# 학생 결과물 자동 제출함 — 설치 순서

수업 앱(아티팩트)에서 학생이 **제출 버튼 한 번**으로 선생님 드라이브 폴더에 결과물을 저장하는 공용 시스템입니다.
그림·글·JSON 등 수 MB짜리 결과물용이며, 동영상 같은 대용량은 기존 `student-drive-upload` 서버를 그대로 씁니다.

```
학생 앱 (GitHub Pages)  ──POST──▶  Apps Script 웹앱  ──▶  드라이브 제출함/학급/활동/번호_이름.png
   submit.js 내장                    Code.gs                 + 제출기록 시트
                                    gallery.html  ◀── 선생님 갤러리(같은 주소로 접속)
```

## 폴더 구성

| 파일 | 용도 |
|---|---|
| `apps-script/Code.gs` | 제출 서버 (Apps Script) |
| `apps-script/gallery.html` | 선생님용 갤러리 화면 (Apps Script 안에 HTML 파일로) |
| `submit.js` | 학생 앱에 붙이는 공용 클라이언트 |
| `world-map.html` | 제출 버튼이 붙은 첫 적용 예 (submit.js 내장) |

---

## 1단계 — 제출 서버 배포 (선생님이 직접, 10분)

1. https://script.google.com → **새 프로젝트** → 이름 "제출함"
2. 기본 `Code.gs` 내용을 지우고 `apps-script/Code.gs` 전체를 붙여넣기
3. 왼쪽 `+` → **HTML** → 이름 `gallery` → `apps-script/gallery.html` 전체를 붙여넣기
4. `Code.gs` 위쪽 `CONFIG` 수정
   - `ROOT_FOLDER_ID`: 제출물을 모을 폴더 ID. 공유드라이브 폴더를 쓰려면 그 폴더를 열고 주소 끝(`folders/` 뒤) 문자열을 넣기. 비워두면 내 드라이브에 `제출함` 폴더를 자동 생성
   - `TOKEN`: 아무 문자열로 변경 (학생 앱에도 같은 값)
5. **배포 → 새 배포 → ⚙ 유형: 웹 앱**
   - 실행 사용자: **나**
   - 액세스 권한: **모든 사용자** (학생 로그인 없이 제출하기 위함)
   - 처음 배포 시 권한 승인 창 → 고급 → 안전하지 않음(계속) → 허용
6. 나오는 **웹 앱 URL** (`https://script.google.com/macros/s/…/exec`) 복사
7. 확인: 브라우저에서 `웹앱URL?action=ping` 열어 `{"ok":true…}`가 보이면 성공

> 코드를 수정한 뒤에는 **배포 → 배포 관리 → ✎ → 버전: 새 버전 → 배포**를 해야 반영됩니다. URL은 그대로 유지됩니다.

## 2단계 — 학생 앱에 주소 넣기

`world-map.html` 맨 위의 설정 블록:

```html
<script>
  window.SUBMIT_ENDPOINT = "https://script.google.com/macros/s/…/exec";  // 1단계 URL
  window.SUBMIT_TOKEN    = "wolhang-2026";                              // CONFIG.TOKEN 과 동일
  window.SUBMIT_KLASSES  = ["6-1"];                                     // 필요하면 ["6-1","6-2"]
</script>
```

## 3단계 — GitHub Pages에 올리기

claude.ai 아티팩트 주소에서는 외부 전송이 막혀 있어 **반드시 GitHub Pages(또는 다른 호스팅) 주소**로 학생이 접속해야 합니다.

```bash
# 새 저장소를 만든 경우 (예: jch1696/student-drive-upload2)
git init && git add . && git commit -m "자동 제출함 + 세계지형 지도"
git branch -M main
git remote add origin https://github.com/jch1696/student-drive-upload2.git
git push -u origin main
```

GitHub → Settings → Pages → Branch: `main` / `(root)` → Save.
학생 접속 주소: `https://jch1696.github.io/student-drive-upload2/world-map.html`

## 4단계 — 교실 테스트

1. 학생용 주소를 열고 지도 만들기 → **지도 그림 만들기 → 선생님께 제출**
2. 학급·번호·이름 입력 → 제출 → "제출 완료" 확인
3. 드라이브 `제출함/6-1/세계지형-나만의지도/07_이름.png` 생성 및 `제출기록` 시트 확인
4. 웹앱 URL을 그대로 브라우저에서 열면 **갤러리**가 뜹니다 (선생님 로그인 상태). 발표 모드 → 화살표로 넘기기

학교 네트워크에서 `script.google.com`이 차단되어 있으면 제출이 실패합니다. 첫날 한 번 확인하세요.

---

## 새 수업 앱에 붙이는 방법 (앞으로)

```html
<script>
  window.SUBMIT_ENDPOINT = "…/exec"; window.SUBMIT_TOKEN = "…"; window.SUBMIT_KLASSES = ["6-1"];
</script>
<script src="submit.js"></script>   <!-- 또는 파일 내용을 <script>로 인라인 -->
<script>
  Submit.init({ activity: "zentangle", activityTitle: "젠탱글-내작품" });

  document.getElementById("submitBtn").onclick = function () {
    Submit.dialog({
      files: [{ name: "작품.png", mime: "image/png", data: canvas.toDataURL("image/png") }],
      meta: { anything: "시트 메모 칸에 기록됨" }
    });
  };
</script>
```

- `files[].data`는 dataURL, Blob, 일반 문자열(글) 모두 가능. 여러 파일이면 `label`로 구분(`07_이름_label.png`)
- 학생이 한 번 입력한 학급·번호·이름은 그 기기에 기억되어 다른 앱에서도 자동으로 채워집니다
- 같은 학생이 다시 제출하면 기본은 덮어쓰기 (`CONFIG.RESUBMIT = "version"`이면 `_2`, `_3` 보관)
- 파일 크기 상한은 요청당 25MB(`CONFIG.MAX_MB`). 동영상은 기존 수합 서버 사용

## 문제가 생기면

| 증상 | 확인 |
|---|---|
| 제출 버튼이 회색 | `SUBMIT_ENDPOINT`가 비어 있음 |
| "인증 실패(token)" | 앱의 `SUBMIT_TOKEN` ≠ `CONFIG.TOKEN` |
| "서버 응답을 읽지 못했어요" | 배포 액세스 권한이 "모든 사용자"가 아님, 또는 새 버전 미배포 |
| 갤러리 썸네일이 안 보임 | 선생님 계정으로 로그인되지 않은 브라우저 |
