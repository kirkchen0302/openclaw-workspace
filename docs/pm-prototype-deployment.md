# pm-prototype Firebase 部署文件

## 專案資訊

| 項目 | 值 |
|------|-----|
| Firebase 專案 | `pm-prototype-a75ce` |
| Hosting URL | https://pm-prototype-a75ce.web.app |
| GitHub Repo | https://github.com/kirkchen0302/openclaw-workspace |
| 部署方式 | GitHub Actions → Firebase Hosting |

---

## URL 路由

| 頁面 | URL |
|------|-----|
| 發票存摺 AI Agent Prototype | https://pm-prototype-a75ce.web.app/prototype/ai_agent |
| AI 管家 Prototype 0408_v1 | https://pm-prototype-a75ce.web.app/prototype/ai_agent/0408_v1 |
| HYVS vs MAVs Dashboard | https://pm-prototype-a75ce.web.app/dashboard/hyvs-mavs |
| 受眾回訪分析 Dashboard | https://pm-prototype-a75ce.web.app/dashboard/audience |

### 舊 URL 轉址（301）
- `/prototype/invoice` → `/prototype/ai_agent`
- `/hyvs-mavs` → `/dashboard/hyvs-mavs`
- `/audience` → `/dashboard/audience`

---

## Auth 設定（Google Sign-In）

**適用頁面：** `/dashboard/hyvs-mavs`、`/dashboard/audience`

**允許登入網域：**
- `@invos.com.tw`
- `@moneybook.com.tw`

**Firebase Auth 設定位置：**
- Firebase Console → pm-prototype-a75ce → Authentication → Sign-in method → Google（啟用）
- Authorized domains：需包含 `pm-prototype-a75ce.web.app`

**GCP API Key 設定（重要！）：**
- GCP Console → pm-prototype-a75ce → APIs & Credentials → API Key
- API restrictions 需包含 **Identity Toolkit API**
- 若登入出現 `auth/api-key-not-valid` 錯誤，檢查此處

---

## CI/CD（GitHub Actions）

**Workflow 檔案：** `.github/workflows/deploy-invoice-prototype.yml`

**觸發條件：**
- Push to `main`，且 `invoice-prototype/**` 或 workflow 檔案有變動

**Environment：** `INVOICE-BFD85`

> 備註：這裡的 Environment 名稱沿用舊名稱，只是 GitHub Environment 的標籤，實際部署的 Firebase 專案仍是 `pm-prototype-a75ce`。不要因為名稱看起來不一致就修改 workflow 的 `environment:`；除非你同步搬移 secrets，否則 GitHub Actions 會在 deploy step 讀不到 credentials。

> 另一個必要護欄：dashboard 原始 HTML 內保留 `__FIREBASE_API_KEY__` 佔位符沒有問題，但 **build 後的 dist 檔案** 必須先完成替換，若仍殘留 placeholder，deploy 必須直接 fail，否則線上登入會出現 `auth/api-key-not-valid`。

**Required Secrets（需在 GitHub Environment 設定）：**
| Secret 名稱 | 用途 |
|-------------|------|
| `PM_PROTOTYPE_FIREBASE_API_KEY` | Firebase Web API Key（`AIzaSy...`） |
| `FIREBASE_SERVICE_ACCOUNT_PM_PROTOTYPE` | Firebase Service Account JSON |

**Build 流程：**
1. `npm ci` → `npm run build`（Vite）
2. Inject API key：`sed` 替換 `__FIREBASE_API_KEY__` 佔位符
3. Copy 靜態 HTML 到 clean URL 目錄：
   - `dist/hyvs-mavs-dashboard.html` → `dist/dashboard/hyvs-mavs/index.html`
   - `dist/audience-dashboard.html` → `dist/dashboard/audience/index.html`
   - `dist/index.html` → `dist/prototype/ai_agent/index.html`
4. Firebase deploy

---

## 已知問題與踩過的坑（2026-03-30）

### 1. Firebase Hosting rewrite 不能指向靜態 HTML
- **問題：** `rewrites` 的 destination 設為 `.html` 檔案會 404
- **原因：** Firebase rewrites 只能指向 `index.html`（SPA fallback）或 Cloud Function，不能指向其他靜態 HTML
- **解法：** Build 時用 `cp` 把 HTML 複製到目錄下的 `index.html`，Firebase 直接 serve 靜態檔

### 2. audience-dashboard.html 忘記加入 git
- **問題：** CI 一直 failure，`Copy dashboards` step 報錯找不到 audience 檔案
- **原因：** 本機有檔案但未 `git add`，CI checkout 時沒有這個檔案
- **解法：** `git add invoice-prototype/public/audience-dashboard.html`

### 3. Firebase API Key 被限制的問題
- **問題：** `auth/api-key-not-valid` 錯誤
- **原因：** GCP API Key 的 **API restrictions** 沒有包含 Identity Toolkit API
- **解法：** GCP Console → Credentials → API Key → API restrictions → 加入 Identity Toolkit API

### 4. GitHub Environment Secret 讀不到
- **問題：** CI build 時 `__FIREBASE_API_KEY__` 沒被替換
- **原因：** Secret 只設在 repo level，但 workflow 指定了 `environment: PM_PROTOTYPE_A75CE`，environment-scoped secret 讀不到 repo-level secret
- **解法：** 把 `PM_PROTOTYPE_FIREBASE_API_KEY` 加到 `PM_PROTOTYPE_A75CE` environment 的 secrets 裡

### 5. authDomain 專案不符
- **問題：** 初期把 `invoice-bfd85` 的 API key 用在 `pm-prototype-a75ce` 的 authDomain，導致 key 和 domain 不在同一個 GCP 專案
- **解法：** 使用 `pm-prototype-a75ce` 自己的 Web API Key，authDomain 設為 `pm-prototype-a75ce.firebaseapp.com`

---

## 檔案結構

```
invoice-prototype/
├── public/
│   ├── hyvs-mavs-dashboard.html   # HYVS/MAVs dashboard（含 OAuth）
│   ├── audience-dashboard.html    # 受眾回訪 dashboard（含 OAuth）
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── App.jsx                    # React App（發票存摺 Prototype）
│   └── firebase.js                # Firebase RTDB 連線
├── firebase.json                  # Firebase Hosting 設定
└── package.json
```

---

*最後更新：2026-03-30*
