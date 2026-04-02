# PM Skills 方法論整合手冊

> 整合 34 個 PM Skill（3 個來源），依工作階段與情境分類，快速找到對的工具。

---

## 📦 Skill 來源一覽

| 來源 | 數量 | 路徑 |
|-----|------|------|
| **pmprompt**（Nir Eyal、Clayton Christensen、Teresa Torres 等） | 25 個 | `~/.openclaw/workspace/.agents/skills/` |
| **Pawel Huryn**（Product Compass，Continuous Discovery） | 8 個 | `~/.openclaw/skills/pm-product-discovery/` |
| **Mr. PM**（Double Diamond 中文引導框架） | 1 個 | `~/.openclaw/skills/product-planning/` |

---

## 📌 快速索引：我現在要做什麼？

| 我的任務 | 用哪個 Skill |
|---------|------------|
| 寫 PRD / 規格文件 | `prd-writer` |
| 定義新功能/產品方向 | `working-backwards` |
| 整理用戶反饋/找問題 | `user-feedback-synthesizer` |
| 決定先做哪個功能 | `feature-prioritization-assistant` `pawel-prioritize-features` |
| 設定季度 OKR | `okrs` |
| 設計 A/B 測試 | `ab-test-designer` `trustworthy-experiments` |
| 理解用戶為什麼用/不用 | `jobs-to-be-done` |
| 規劃產品成長策略 | `growth-loops` `product-led-growth` |
| 建立競爭護城河 | `seven-powers` |
| 跟 stakeholder 溝通 | `stakeholder-update-generator` `radical-candor` |
| 快速驗證想法 | `design-sprint` `shape-up` |
| 準備用戶訪談 | `pawel-interview-script` |
| 整理訪談逐字稿 | `pawel-summarize-interview` |
| 找出功能的風險假設 | `pawel-identify-assumptions-existing` |
| 設計驗證實驗 | `pawel-brainstorm-experiments-existing` |
| 腦力激盪新功能想法 | `pawel-brainstorm-ideas-existing` |
| 建立指標/KPI 儀表板 | `pawel-metrics-dashboard` |
| 從頭做產品企劃（繁中引導） | `mrpm-product-planning` |

---

## 🗺️ 依 PM 工作階段分類

### 1️⃣ Discovery — 發現問題、定義機會

**核心問題：我在解決誰的什麼問題？**

#### `jobs-to-be-done` — 用戶雇用你的真實原因 *(pmprompt)*
- 框架：Clayton Christensen / Bob Moesta
- 用途：理解用戶購買/使用/放棄的根本動機
- 關鍵問題：「用戶雇用這個產品來完成什麼任務？」
- 適用：訪談設計、流失分析、找真正的競爭對手

#### `opportunity-solution-trees` — 機會解法樹 *(pmprompt)*
- 框架：Teresa Torres（Continuous Discovery Habits）
- 用途：把用戶機會與商業指標連結，系統化 Discovery
- 結構：Desired Outcome → Opportunities → Solutions → Experiments
- 適用：每週持續 Discovery、避免直接跳到解法

#### `pawel-opportunity-solution-tree` — 機會解法樹（可執行版）*(Pawel Huryn)*
- 同 Teresa Torres OST，但附帶 Opportunity Score 計算（Importance × (1 − Satisfaction)）
- 輸出：完整 OST 樹狀結構 + 實驗設計
- 適用：有用戶研究資料時，直接跑出完整 OST

#### `pmf-survey` — 衡量 Product-Market Fit *(pmprompt)*
- 框架：Sean Ellis / Rahul Vohra（Superhuman）
- 核心問題：「如果無法繼續使用這個產品，你會有多失望？」
- 門檻：40% 選「非常失望」= PMF
- 適用：判斷是否該 pivot、用數據指導 roadmap

#### `user-feedback-synthesizer` — 用戶反饋歸納 *(pmprompt)*
- 用途：快速歸類大量 CS 票、訪談筆記、問卷
- 輸出：主題分群、嚴重度、優先順序、Quick Wins
- 適用：規劃 roadmap 前、看 CS 數據時（如今天的小工具分析）

#### `pawel-interview-script` — 用戶訪談腳本 *(Pawel Huryn)*
- 框架：The Mom Test（Rob Fitzpatrick）
- 輸出：開場 → 暖場 → JTBD 探索 → 收尾 的完整腳本 + 筆記模板
- 原則：問過去行為，不問對未來的看法；不 pitch 產品
- 適用：進行用戶訪談前

#### `pawel-summarize-interview` — 訪談逐字稿整理 *(Pawel Huryn)*
- 用途：把訪談錄音稿轉成 JTBD 結構化摘要
- 輸出：現行解法、喜歡什麼、痛點、關鍵洞察、Action Items
- 適用：訪談結束後整理筆記

#### `pawel-brainstorm-ideas-existing` — 三視角功能腦力激盪 *(Pawel Huryn)*
- 用途：從 PM / Designer / Engineer 三個角度各出 5 個想法，再收斂前 5
- 適用：找功能靈感、避免單一視角盲點

---

### 2️⃣ Define — 定義解法、確認方向

**核心問題：我們要做什麼、為什麼值得做？**

#### `working-backwards` — 從終點逆向工作（Amazon PR/FAQ）*(pmprompt)*
- 框架：Amazon 內部方法論
- 做法：先寫「假設已上線的新聞稿 + FAQ」，再決定要不要做
- 用途：強迫釐清「為誰做、解決什麼、成功長什麼樣」
- 適用：新功能/產品立案、說服 stakeholder

#### `mrpm-product-planning` — Double Diamond 產品企劃引導 *(Mr. PM，繁中)*
- 框架：Double Diamond（先發散再收斂 × 2）
- 四階段：Discover（Persona + User Journey）→ Define（HMW + 機會評估）→ Develop（解法 + MVP）→ Deliver（指標 + 規格）
- 輸出：互動式引導 + 最終 HTML 企劃報告
- 適用：從頭規劃產品、產品改版、中文環境下與 stakeholder 溝通

#### `prd-writer` — 寫 PRD *(pmprompt)*
- 結構：問題陳述 → 解法 → 功能需求 → 技術需求 → 成功指標 → 風險
- 適用：功能正式立案後、給工程師開始開發前

#### `pawel-identify-assumptions-existing` — 找出功能風險假設 *(Pawel Huryn)*
- 四個風險維度：Value / Usability / Viability / Feasibility
- 用途：在開工前找出「如果這個假設錯了，這個功能就沒有意義」的地方
- 適用：功能 pre-mortem、壓力測試

#### `design-sprint` — 五天設計衝刺（Jake Knapp / GV）*(pmprompt)*
- 用途：在高風險、高不確定性的問題上，用一週驗證方向
- 流程：Map → Sketch → Decide → Prototype → Test
- 適用：全新產品、重大功能、stakeholder 意見分歧時

#### `shape-up` — 形塑 + 固定時間開發（Basecamp/37signals）*(pmprompt)*
- 核心概念：先「塑形」（固定時間、可變範疇），再讓團隊自主執行
- 取代 Scrum 的方式：6 週週期 + Betting Table
- 適用：擺脫估時陷阱、給工程師更多自主空間

---

### 3️⃣ Prioritize — 優先排序

**核心問題：這麼多事，先做哪個？**

#### `feature-prioritization-assistant` — RICE 評分 *(pmprompt)*
- 公式：(Reach × Impact × Confidence) / Effort
- 輸出：各功能 RICE 分數排序 + 推薦優先順序
- 適用：roadmap 規劃、跟 stakeholder 討論優先順序

#### `pawel-prioritize-features` — 多維度功能優先排序 *(Pawel Huryn)*
- 評估維度：Impact / Effort / Risk / Strategic Alignment
- 使用 Opportunity Score（Importance × (1 − Satisfaction)）評估用戶需求
- 輸出：Top 5 推薦 + 理由 + 被排除的原因
- 適用：有 backlog 要整理時

#### `okrs` — 目標與關鍵結果（Andy Grove / John Doerr）*(pmprompt)*
- 結構：1 個野心 Objective + 2-3 個可量化 Key Results
- 節奏：季度 OKR + 每週 check-in
- 適用：季度規劃、讓團隊聚焦在最重要的事

#### `thinking-in-bets` — 決策品質框架（Annie Duke）*(pmprompt)*
- 核心：把每個決定視為「下注」，評估勝率而非結果
- 用途：避免「結果論」偏誤、做更好的不確定決策
- 適用：高風險決策、事後複盤、設計 Kill Criteria

---

### 4️⃣ Grow — 成長策略

**核心問題：怎麼讓更多人用、留下來、付錢？**

#### `growth-loops` — 成長迴路（Brian Balfour / Elena Verna）*(pmprompt)*
- 概念：Funnel 是線性的，Loop 是複利的
- 類型：Viral Loop、Content Loop、Sales Loop、Product Loop
- 適用：設計可持續的成長引擎、減少對付費廣告的依賴

#### `product-led-growth` — 產品驅動成長（Elena Verna）*(pmprompt)*
- 核心：產品本身驅動獲客、啟動、留存、商業化
- 關鍵概念：PQL（Product Qualified Lead）、Freemium 設計
- 適用：B2C / B2B SaaS 的自助式成長策略

#### `hierarchy-of-engagement` — 參與度層次（Sarah Tavel）*(pmprompt)*
- 三層：Core Action → Virtuous Cycle → Mounting Loss
- 用途：找到「使用越多越難離開」的設計方式
- 適用：消費型產品的留存設計

#### `hooked-model` — 習慣養成模型（Nir Eyal）*(pmprompt)*
- 四步驟：Trigger → Action → Variable Reward → Investment
- 用途：設計讓用戶自動回訪的功能
- 適用：提升 DAU/MAU、降低外部觸發依賴

#### `pawel-metrics-dashboard` — 指標儀表板設計 *(Pawel Huryn)*
- 框架：North Star Metric + Input Metrics + Health Metrics + Business Metrics
- 輸出：指標定義表 + 儀表板排版 + Alert 設定 + 工具推薦
- 好指標標準（Ben Yoskovitz）：可理解、可比較、比率/比例、能改變行為
- 適用：建立 KPI 追蹤系統、定義 NSM

#### `product-led-seo` — 產品驅動 SEO（Eli Schwartz）*(pmprompt)*
- 概念：SEO 是產品問題，不是行銷問題
- 適用：有程式化頁面機會的產品、評估 SEO 投資價值

---

### 5️⃣ Validate — 驗證假設

**核心問題：這個想法真的行得通嗎？**

#### `ab-test-designer` — A/B 測試設計 *(pmprompt)*
- 輸出：假設、主要指標、樣本數、測試時長、分析計畫
- 適用：上線前驗證功能效果

#### `trustworthy-experiments` — 可信賴的實驗（Ronny Kohavi）*(pmprompt)*
- 重點：66-92% 的實驗是失敗的；8% 有無效結果
- 避免：P-hacking、Sample Ratio Mismatch、過早停止測試
- 適用：建立嚴謹的實驗文化、確保數據可信

#### `pawel-brainstorm-experiments-existing` — 設計低成本驗證實驗 *(Pawel Huryn)*
- 方法：Fake door test、Wizard of Oz、Prototype、A/B、Survey
- 原則：測量實際行為，不測意見；上線測試要有風險控制
- 輸出：每個假設 → 實驗方法 + 指標 + 成功門檻
- 適用：上線前用最少資源驗證假設

---

### 6️⃣ Strategy — 長期競爭策略

**核心問題：五年後為什麼是我們贏？**

#### `seven-powers` — 七種競爭護城河（Hamilton Helmer）*(pmprompt)*
- 七種 Power：Scale Economies、Network Effects、Counter-Positioning、Switching Costs、Branding、Cornered Resource、Process Power
- 用途：評估長期競爭壁壘、規劃第二成長曲線
- 適用：策略規劃、投資評估

#### `positioning-canvas` — 定位畫布（April Dunford）*(pmprompt)*
- 五要素：競爭替代品 → 差異化屬性 → 目標客群 → 市場類別 → 相關趨勢
- 用途：讓「為什麼選你」的答案一目瞭然
- 適用：新產品上市、重新定位、對齊 sales/marketing

#### `strategic-narrative` — 策略敘事（Andy Raskin）*(pmprompt)*
- 做法：不賣產品，賣「世界正在改變，這是贏家的玩法」
- 適用：pitch deck、對齊全公司敘事、對外傳播

#### `hierarchy-of-marketplaces` — 平台市場層次（Sarah Tavel）*(pmprompt)*
- 三步驟：Focus（聚焦 niche）→ Tip（達到臨界點）→ Dominate（擴張）
- 適用：雙邊市場產品策略

#### `monetizing-innovation` — 商業化設計（Madhavan Ramanujam）*(pmprompt)*
- 核心：先了解 Willingness to Pay，再決定要做什麼
- 適用：定價策略、方案分層設計、功能取捨

---

### 7️⃣ Communicate — 溝通與協作

**核心問題：怎麼讓大家理解、對齊、往前走？**

#### `stakeholder-update-generator` — Stakeholder 更新 *(pmprompt)*
- 用途：撰寫 release notes、sprint 更新、進度報告
- 適用：每次上線後、定期 PM 週報

#### `radical-candor` — 直接誠實的溝通（Kim Scott）*(pmprompt)*
- 核心：同時「真誠關心人」+「直接挑戰事」
- 四象限：Radical Candor / Obnoxious Aggression / Ruinous Empathy / Manipulative Insincerity
- 適用：給 feedback、績效面談、建立團隊文化

---

## 🔗 常見情境的組合應用

### 情境 A：規劃一個新功能
1. `jobs-to-be-done` → 確認用戶真正的需求
2. `opportunity-solution-trees` → 找出機會、生成解法
3. `working-backwards` → 寫 PR/FAQ 確認方向
4. `prd-writer` → 產出正式文件
5. `feature-prioritization-assistant` → 在多功能間決定優先順序

### 情境 B：分析用戶問題（如 CS 反饋）
1. `user-feedback-synthesizer` → 歸納分類
2. `jobs-to-be-done` → 找根本原因
3. `thinking-in-bets` → 決定哪個先修
4. `ab-test-designer` / `trustworthy-experiments` → 上線後驗證

### 情境 C：季度規劃
1. `okrs` → 設定季度目標
2. `feature-prioritization-assistant` → RICE 排序
3. `shape-up` → 塑形後交給團隊執行
4. `stakeholder-update-generator` → 對齊 stakeholder

### 情境 D：成長瓶頸
1. `hierarchy-of-engagement` → 找核心行動
2. `growth-loops` → 設計成長迴路
3. `product-led-growth` → 評估 PLG 機會
4. `pmf-survey` → 確認 PMF 狀況

---

## 📚 個別 Skill 文件路徑

所有 skill 的完整內容存放於：
`/Users/kirk/.openclaw/workspace/docs/pm-skills/`

### pmprompt（25 個）
- [ab-test-designer.md](./ab-test-designer.md)
- [design-sprint.md](./design-sprint.md)
- [feature-prioritization-assistant.md](./feature-prioritization-assistant.md)
- [growth-loops.md](./growth-loops.md)
- [hierarchy-of-engagement.md](./hierarchy-of-engagement.md)
- [hierarchy-of-marketplaces.md](./hierarchy-of-marketplaces.md)
- [hooked-model.md](./hooked-model.md)
- [jobs-to-be-done.md](./jobs-to-be-done.md)
- [monetizing-innovation.md](./monetizing-innovation.md)
- [okrs.md](./okrs.md)
- [opportunity-solution-trees.md](./opportunity-solution-trees.md)
- [pmf-survey.md](./pmf-survey.md)
- [positioning-canvas.md](./positioning-canvas.md)
- [prd-writer.md](./prd-writer.md)
- [product-led-growth.md](./product-led-growth.md)
- [product-led-seo.md](./product-led-seo.md)
- [radical-candor.md](./radical-candor.md)
- [seven-powers.md](./seven-powers.md)
- [shape-up.md](./shape-up.md)
- [stakeholder-update-generator.md](./stakeholder-update-generator.md)
- [strategic-narrative.md](./strategic-narrative.md)
- [thinking-in-bets.md](./thinking-in-bets.md)
- [trustworthy-experiments.md](./trustworthy-experiments.md)
- [user-feedback-synthesizer.md](./user-feedback-synthesizer.md)
- [working-backwards.md](./working-backwards.md)

### Pawel Huryn / Product Compass（8 個）
- [pawel-brainstorm-experiments-existing.md](./pawel-brainstorm-experiments-existing.md)
- [pawel-brainstorm-ideas-existing.md](./pawel-brainstorm-ideas-existing.md)
- [pawel-identify-assumptions-existing.md](./pawel-identify-assumptions-existing.md)
- [pawel-interview-script.md](./pawel-interview-script.md)
- [pawel-metrics-dashboard.md](./pawel-metrics-dashboard.md)
- [pawel-opportunity-solution-tree.md](./pawel-opportunity-solution-tree.md)
- [pawel-prioritize-features.md](./pawel-prioritize-features.md)
- [pawel-summarize-interview.md](./pawel-summarize-interview.md)

### Mr. PM（1 個）
- [mrpm-product-planning.md](./mrpm-product-planning.md)

---

*最後更新：2026-04-02*
*來源：pmprompt.com / Pawel Huryn (Product Compass) / Mr. PM*
