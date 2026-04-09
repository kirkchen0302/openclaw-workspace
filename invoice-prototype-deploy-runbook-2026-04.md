# invoice-prototype 部署執行文件

最後更新：2026-04-09

適用專案：`pm-prototype-a75ce`

---

## 1. 目標

這份文件是 `invoice-prototype` 的正式部署 runbook，目的是避免再次發生：

- GitHub Actions 可以跑，但讀不到 secrets
- dashboard 上線後仍殘留 `__FIREBASE_API_KEY__`
- Firebase Hosting deploy 因 service account JSON 格式錯誤而失敗
- 誤把 GitHub Environment / repo secrets / Firebase project 名稱混為一談

---

## 2. 實際部署目標

### Firebase 專案
- `pm-prototype-a75ce`

### Hosting 網址
- `https://pm-prototype-a75ce.web.app`

### GitHub Repo
- `https://github.com/kirkchen0302/openclaw-workspace`

### 主要路徑
- AI Agent Prototype：`/prototype/ai_agent`
- AI Butler 0408 v1：`/prototype/ai_agent/0408_v1`
- HYVS/MAVS Dashboard：`/dashboard/hyvs-mavs`
- Audience Dashboard：`/dashboard/audience`

---

## 3. 現行正確做法（重要）

### GitHub Actions secret 來源
**現在已改成直接使用 repository-level Actions secrets。**

不要再依賴 GitHub Environment-scoped secrets。

### 目前需要的 repository secrets
在 GitHub repo 這裡設定：

- `Settings`
- `Secrets and variables`
- `Actions`
- `Secrets`

必須存在：

1. `PM_PROTOTYPE_FIREBASE_API_KEY`
   - 值：Firebase Web API key（`AIza...`）

2. `FIREBASE_SERVICE_ACCOUNT_PM_PROTOTYPE`
   - 值：**合法 JSON 格式** 的 service account 內容
   - 建議直接用原始 `.json` 檔 parse 後寫入，不要手動複製時破壞換行/跳脫

---

## 4. 正常部署流程

### Workflow 檔案
- `.github/workflows/deploy-invoice-prototype.yml`

### 自動流程
GitHub Actions 會執行：

1. `npm ci`
2. `Debug secret presence`
3. `scripts/prepare_invoice_prototype_deploy.sh`
4. `Deploy to Firebase Hosting`

### prepare script
- `scripts/prepare_invoice_prototype_deploy.sh`

這支腳本會做：

1. 檢查 `VITE_FIREBASE_API_KEY` 是否存在
2. `npm run build`
3. 將 dashboard 內的 `__FIREBASE_API_KEY__` 替換成真的 API key
4. 建立 clean URL 目錄
5. 複製 `index.html` 到對應部署路徑
6. 檢查 `dist/` 是否仍殘留 `__FIREBASE_API_KEY__`
   - 若有，直接 fail

---

## 5. 部署成功後怎麼驗證

### A. GitHub Actions
確認最新 workflow run 成功：
- `Deploy invoice-prototype to Firebase Hosting`
- conclusion = `success`

### B. 線上頁面驗證
至少驗以下兩件事：

#### 1. Dashboard HTML 不可再有 placeholder
用 curl 檢查：

```bash
curl -ks https://pm-prototype-a75ce.web.app/dashboard/hyvs-mavs/ | grep -o '__FIREBASE_API_KEY__\|AIza[[:alnum:]_-]*\|pm-prototype-a75ce\.firebaseapp\.com' | head -20
```

### 正常結果
應該看到：
- `AIza...`
- `pm-prototype-a75ce.firebaseapp.com`

### 不正常結果
如果還看到：
- `__FIREBASE_API_KEY__`

代表壞版仍在線上。

#### 2. 實際登入測試
直接打開：
- `https://pm-prototype-a75ce.web.app/dashboard/hyvs-mavs`

如果出現：
- `auth/api-key-not-valid`

優先檢查 API key 是否真的已注入到 live HTML。

---

## 6. 這次實際踩到的坑與解法

---

### 坑 1：GitHub Environment 名稱混亂

#### 現象
workflow 一度使用：
- `PM_PROTOTYPE_A75CE`

但實際 secret 存放位置曾是：
- `INVOICE_BFD85`
- 甚至中途還混進過 `INVOICE-BFD85`

#### 問題
GitHub Actions 對 environment 名稱是**精準匹配**。
底線 `_` 和連字號 `-` 是不同名稱。

#### 解法
最後直接放棄 environment-scoped secrets，改成：
- **repository-level Actions secrets**

#### 教訓
不要把 deploy 成功依賴在容易混淆的 environment naming 上。

---

### 坑 2：dashboard 上線後仍是 `__FIREBASE_API_KEY__`

#### 現象
頁面可以打開，但登入失敗，出現：
- `auth/api-key-not-valid`

#### 根因
live HTML 仍然保留：
- `__FIREBASE_API_KEY__`

代表 build 後沒有把 API key 注入進 dashboard。

#### 解法
把 build + inject + copy 路徑收斂到：
- `scripts/prepare_invoice_prototype_deploy.sh`

並加上保護：
- 如果 `dist/` 裡還有 `__FIREBASE_API_KEY__`，deploy 直接 fail

#### 教訓
不要讓 placeholder 有機會上 live。

---

### 坑 3：service account secret JSON 格式壞掉

#### 現象
GitHub Actions log 顯示：

```text
SyntaxError: Bad control character in string literal in JSON
Error: Failed to authenticate, have you run firebase login?
```

#### 根因
`FIREBASE_SERVICE_ACCOUNT_PM_PROTOTYPE` 雖然存在，但內容不是合法 JSON。
通常是 `private_key` 的換行 / 跳脫字元被破壞。

#### 解法
不要手動亂貼 service account JSON。
應該：
1. 直接使用原始 `.json` 檔
2. `json.loads()`
3. 再 `json.dumps()` 成合法單行 JSON
4. 重新寫回 GitHub secret

#### 教訓
service account secret 不是普通文字，不能隨便改格式。

---

### 坑 4：0 秒失敗但沒有 job log

#### 現象
workflow 幾乎瞬間失敗，`jobs=[]`，`log not found`

#### 根因
workflow YAML 本身壞掉，導致 GitHub 根本沒成功展開 job。

#### 解法
直接檢查 workflow 檔尾是否被污染、殘留多餘字元。
這次實際出現了檔尾多出：
- `a75ce`
- 重複 `entryPoint`

#### 教訓
0 秒失敗通常先懷疑 workflow syntax / YAML 本身。

---

### 坑 5：GitHub CLI 在不同 user / 環境不共享登入狀態

#### 現象
在某個 terminal 中 `gh auth status` 成功，
但 OpenClaw 工具環境裡執行 `gh` 仍然顯示未登入。

#### 根因
不同使用者 / 不同 home：
- 使用者終端：`/Users/kirk.chen`
- OpenClaw 工具環境：`/Users/kirk`

GitHub CLI keyring / config 不共享。

#### 解法
最後在 OpenClaw 工具環境內直接完成 device login。

#### 教訓
看到 `gh auth status` 成功，不代表所有 shell / service 環境都共享那份登入狀態。

---

## 7. 若未來再失敗，排查順序

### Step 1：先看 workflow 有沒有真的跑起來
- 如果 0 秒失敗、jobs 為空 → 檢查 YAML

### Step 2：看 `Debug secret presence`
- 如果 secret = `missing` → 先檢查 repository secrets
- 不要先懷疑 Firebase

### Step 3：看 `Prepare deploy assets`
- 如果失敗：通常是 API key 沒進來，或 placeholder 未替換

### Step 4：看 `Deploy to Firebase Hosting`
- 如果失敗：通常是 service account JSON 格式錯、或 Firebase deploy auth 問題

### Step 5：驗 live HTML
直接檢查：
- 是 `AIza...`
- 還是 `__FIREBASE_API_KEY__`

這一步可以最快分辨「deploy 成功但內容壞」還是「deploy 根本沒成功」。

---

## 8. 這次最後成功的關鍵點

### 成功 run
- `24178008777`

### 關鍵修復
1. workflow 改讀 repository-level secrets
2. repo secrets 補上：
   - `PM_PROTOTYPE_FIREBASE_API_KEY`
   - `FIREBASE_SERVICE_ACCOUNT_PM_PROTOTYPE`
3. service account secret 重新用合法 JSON 寫入
4. 重新觸發 deploy

### 成功驗證
live HTML 已可看到：
- Firebase API key（`AIza...`）
- `pm-prototype-a75ce.firebaseapp.com`

不再有：
- `__FIREBASE_API_KEY__`

---

## 9. 建議後續

### 建議保留
- `Debug secret presence`
- `scripts/prepare_invoice_prototype_deploy.sh`
- `docs/deployment-sanity-checklist.md`

### 建議避免
- 不要再改回 environment-scoped secrets，除非真的有強需求
- 不要手動複製 service account JSON 並自行修改換行
- 不要用 rerun 舊失敗 run 來驗證新的 secret 修正，盡量用 fresh commit 觸發新 run

---

## 10. 相關文件
- `docs/pm-prototype-deployment.md`
- `docs/deployment-sanity-checklist.md`
- `docs/deploy-env-name-incident-2026-04-09.md`
- `scripts/prepare_invoice_prototype_deploy.sh`
