# 發票存摺 Prototype

**AI Agent 驅動的個人財務洞察應用 — 從發票數據到行動建議**

🌐 **Live Demo**: https://pm-prototype-a75ce.web.app  
📦 **GitHub**: https://github.com/kirkchen0302/openclaw-workspace

---

## 核心概念：AI Agent 邏輯框架

### OST（Opportunity Solution Tree）

```
用戶目標：掌握自己的消費全貌，不讓錢不明不白流掉
│
├── Opportunity 1：消費紀錄不透明
│   └── Solution: 發票自動彙整 + 視覺化分析
│       └── 從財政部電子發票平台撈取用戶載具發票，自動分類統計
│
├── Opportunity 2：訂閱費用不自覺累積
│   └── Solution: 訂閱效益 ROI 分析
│       └── 計算外送訂閱（免運費 vs 月費）實際效益，協助用戶判斷是否值得
│
├── Opportunity 3：固定帳單容易忘繳
│   └── Solution: 帳單週期 AI 偵測
│       └── 從發票出現頻率推算繳費週期，提前提醒
│
└── Opportunity 4：消費習慣未被用於省錢
    └── Solution: 個人化 AI 任務生成
        └── 依消費頻率與金額，為每位用戶生成不同難度的達標任務
```

---

## AI Agent 三層架構

```
┌─────────────────────────────────────────────────────┐
│                    Perception Layer                  │
│  發票資料解析 → 店家辨識 → 消費分類 → 週期偵測         │
│  （BigQuery / Firebase Realtime Database）           │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│                    Reasoning Layer                   │
│  訂閱 ROI 計算 → 帳單週期推估 → 任務難度動態調整       │
│  → AI 洞察生成 → 個人化問題推薦                       │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│                     Action Layer                     │
│  個人化 Dashboard 渲染 → AI 管家問答 → 任務加入/更換   │
│  → 訂閱評估建議 → 帳單提醒 CTA                       │
└─────────────────────────────────────────────────────┘
```

---

## 用戶情境（User Scenarios）

### Scenario A：消費反思型用戶（Kirk, 0935322826）
> 「我每個月到底花了多少？錢都去哪了？」

- 每月 60+ 張發票，消費金額高
- foodpanda + Uber Eats 雙訂閱，但外送頻率不穩定
- AI 偵測：某月外送訂閱出現虧損，主動提醒評估
- 任務設計：針對高頻通路（7-11、全家）設定挑戰性達標次數

### Scenario B：精打細算型用戶（0972248795）
> 「我想確認自己的消費是否有在省錢。」

- 消費分布集中，月均消費約 $14,000
- 只有 Uber Eats 一個外送訂閱
- AI 分析訂閱效益，確認是否持續划算
- 帳單偵測：電信費（台灣大哥大）週期追蹤

---

## AI 個人化設計原則

### 1. 任務難度個人化
```
任務門檻 = 用戶近6個月平均月次 + 挑戰加成（+2次 or +30%）
獎勵金額 = 依消費頻率分級（高頻 $50 / 中頻 $30 / 低頻 $20）
```

### 2. 訂閱 ROI 動態計算
```
ROI = 本月省運費總額（叫外送次數 × 平均運費$49）- 月費
> 0 → 划算（綠色）
< 0 → 虧損（紅色警示）
```

### 3. 帳單週期推算（基準日：2026/3/25）
```
電費 / 水費：每 2 個月，分別在奇/偶數月底到期
電信費 / 保險費：每月底到期
距離到期天數 = 下次到期日 - 基準日
```

### 4. AI 管家動態問題
- 依用戶最常去的通路生成個人化問題
- 問題集存放於 Firebase RTDB `/qa`，可不改程式碼直接更新
- 未知問題：Fallback 引導至發票分析頁

---

## 技術架構

| 層級 | 技術 |
|---|---|
| 前端 | React 19 + Vite（純 inline styles，375px 寬） |
| 資料來源 | BigQuery（production-379804）|
| 資料儲存 | Firebase Realtime Database（asia-southeast1）|
| 部署 | Firebase Hosting（pm-prototype-a75ce.web.app）|
| 版控 | GitHub（kirkchen0302/openclaw-workspace）|

### RTDB 資料結構
```
/users/{phone}
  ├── invoices[]       # 近6個月發票列表
  ├── pieData[]        # 消費分類比例
  ├── monthlyTrend[]   # 月度消費趨勢
  ├── deliverySubs[]   # 外送訂閱分析
  ├── flatSubs[]       # 定額訂閱追蹤
  └── autoTasks[]      # 個人化 AI 任務

/qa                    # AI 管家問題集（可直接在 Console 編輯）
/subscriptionConfig    # 訂閱通路設定
```

---

## 頁面功能說明

| 頁面 | 功能 | AI 個人化程度 |
|---|---|---|
| 🏠 首頁 | 消費總覽、月趨勢、AI 洞察輪播 | ⭐⭐⭐⭐ 全動態 |
| 🧾 發票頁 | 發票列表、AI 管家問答 | ⭐⭐⭐ 問題依行為生成 |
| 📷 掃描頁 | 發票掃描 / 對獎 | ⭐ 靜態示意 |
| 🎯 任務頁 | AI 自動任務、更換任務 | ⭐⭐⭐⭐ 依消費能力動態 |
| 📱 訂閱頁 | 外送 ROI + 定額追蹤 | ⭐⭐⭐⭐ 依發票計算 |
| 📋 帳單頁 | 週期偵測 + 趨勢分析 | ⭐⭐⭐ 依發票頻率推算 |

---

## 資料更新方式

### 新增測試用戶
1. 在 BigQuery 跑查詢取得發票資料
2. 執行 Python 處理腳本轉換格式
3. 上傳至 Firebase RTDB `/users/{手機號碼}`

### 更新 AI 問題集
直接在 Firebase Console → Realtime Database → `/qa` 新增 key-value：
```json
{
  "問題文字": "AI 回答內容"
}
```

### 新增訂閱通路
修改 Firebase RTDB → `/subscriptionConfig`：
```json
{
  "deliverySubs": ["Uber Eats", "foodpanda"],
  "flatSubs": ["Google", "Apple", "Nintendo", "YouTube", "Netflix", "Disney+"]
}
```

---

## 未來演進方向

- [ ] 串接真實 AI 模型（GPT / Claude）取代靜態問答
- [ ] Cloud Functions 自動每日更新用戶發票資料
- [ ] 推播通知：帳單到期前 3 天自動推送
- [ ] 更多分類模型：提升「其他」類別的辨識率
- [ ] 多用戶測試：從 2 位擴展至更大測試群體
