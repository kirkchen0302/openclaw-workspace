# PM 方法論框架
> 整合 34 個 PM Skill 的核心精華，收斂為一套可操作的工作邏輯。

---

## 核心信念

**好的 PM 工作，本質上只在回答三個問題：**

1. **我在解決誰的什麼問題？**（正確問題）
2. **這個解法真的有效嗎？**（正確解法）
3. **這件事值得現在做嗎？**（正確優先序）

所有工具和方法論，都是在幫你更嚴謹地回答這三個問題。

---

## 全局觀：兩個菱形

```
        發散                    收斂
         ◇  ──────────────────  ◇
        /  \                  /  \
       /    \                /    \
  問題空間    \    問題定義   /    解法空間
              \____________/
              
    Discover → → → Define → → → Develop → → → Deliver
    （理解現實）  （聚焦問題）  （找到解法）   （驗證交付）
```

**Mr. PM 的 Double Diamond** 是整個 PM 工作的骨架。
其他所有工具都是在各個節點上深化這個過程。

---

## 第一個菱形：找到正確問題

### 發散：真正理解用戶

**核心工具：JTBD + 用戶訪談**

先問「用戶在做什麼」，不要先問「用戶需要什麼功能」。

```
用戶雇用這個產品，是為了完成什麼任務？
               ↓
在什麼情境下？觸發點是什麼？
               ↓
他們原本怎麼解決？為什麼不夠好？
               ↓
成功完成任務後，他的生活有什麼改變？
```

**訪談原則（The Mom Test）：**
- 問過去行為，不問對未來的假設（「你上次怎麼做？」不是「你會用嗎？」）
- 問他的生活，不要 pitch 你的想法
- 找情緒強烈的時刻——那裡通常有真實的痛點

> 工具：`pawel-interview-script` 產生腳本 → `pawel-summarize-interview` 整理逐字稿

---

### 收斂：定義值得解決的問題

**核心工具：Opportunity Solution Tree（OST）**

把散亂的用戶洞察，組織成可以決策的結構：

```
Desired Outcome（你對哪個指標負責）
    ├── Opportunity A（用戶需求/痛點）
    │       ├── Solution A1
    │       └── Solution A2
    ├── Opportunity B
    │       ├── Solution B1
    │       └── Solution B2
    └── Opportunity C
```

**機會優先排序公式：**
```
Opportunity Score = 重要性 × (1 − 滿意度)
```
重要但現有解法很爛的 = 最值得做的機會。

**判斷問題的維度（Mr. PM HMW 評估）：**
- 影響力：這個問題有多痛？
- 規模：有多少人遇到這個問題？
- 可行性：我們能解決嗎？

> 工具：`pawel-opportunity-solution-tree` / `opportunity-solution-trees`（pmprompt）

---

## 第二個菱形：找到正確解法

### 發散：多視角想解法

**不要只從 PM 視角想功能。**

```
PM 視角    → 商業價值、策略對齊、用戶影響
Designer   → 體驗流程、操作直覺、視覺呈現
Engineer   → 技術可能性、數據應用、可擴展性
```

最好的想法常常來自工程師。每個問題至少想 3 個解法，再選。

> 工具：`pawel-brainstorm-ideas-existing`

---

### 收斂：選擇解法前先找假設

**在動手做之前，先問：「哪些假設如果錯了，這個功能就沒有意義？」**

四個風險維度：
- **Value**：用戶真的需要這個嗎？
- **Usability**：用戶能學會用嗎？
- **Viability**：法務/財務/業務可以支持嗎？
- **Feasibility**：技術上做得到嗎？

把最高風險的假設，設計成最輕量的實驗去驗證，再決定要不要做。

> 工具：`pawel-identify-assumptions-existing` → `pawel-brainstorm-experiments-existing`

---

### 定案：讓方向清晰的工具

| 情境 | 最好的工具 | 做什麼 |
|------|----------|--------|
| 新功能/新產品要立案 | `working-backwards`（Amazon PR/FAQ） | 先寫「上線後的新聞稿」，如果寫不出來代表方向還不清楚 |
| 要寫給工程師看的規格 | `prd-writer` | 產出完整 PRD |
| 從頭規劃整個產品（繁中） | `mrpm-product-planning` | Double Diamond 互動引導 + HTML 報告 |
| 高風險、高不確定 | `design-sprint` | 5 天壓縮版驗證 |
| 擺脫估時陷阱 | `shape-up` | 固定時間、可變範疇 |

---

## 優先排序：這件事值得現在做嗎？

### 季度層次：OKR

```
一個季度只有一個最重要的 Objective。
用 2-3 個 Key Result 衡量是否達成。
每週 check-in，不是每季 check-in。
```

OKR 的作用是聚焦，不是追蹤所有工作。

> 工具：`okrs`

---

### 功能層次：RICE vs 機會評分

**RICE**（適合有用戶量數據時）：
```
(Reach × Impact × Confidence) / Effort
```

**Opportunity Score + ICE**（適合早期 Discovery 時）：
```
先找最值得解決的問題（Opportunity Score）
再評估解法（Impact × Confidence / Effort）
```

> 工具：`feature-prioritization-assistant` / `pawel-prioritize-features`

---

### 決策品質：Thinking in Bets

**好的決策 ≠ 好的結果。** 別用結果回頭評判決策品質。

實用做法：
- 決策前：寫下假設和成功條件
- 執行中：設定 Kill Criteria（什麼時候要停）
- 執行後：評估「當時的決策過程」是否嚴謹，而不只是「結果好不好」

> 工具：`thinking-in-bets`

---

## 成長：怎麼讓更多人用、留下來

### 留存的核心：讓使用越多越難離開

```
Level 1：找到你的 Core Action（用戶用產品最重要的一個動作）
Level 2：使用 Core Action 讓用戶積累好處（Accruing Benefits）
Level 3：讓用戶有東西可以失去（Mounting Loss）—— 這是真正的護城河
```

> 工具：`hierarchy-of-engagement`

---

### 習慣養成：Hooked Model

```
外部觸發 → 行動（越簡單越好）→ 變動獎賞（不確定性製造期待）→ 投入（讓用戶放更多進去）
                                                                    ↓
                                                         下次更容易被觸發（內部觸發形成）
```

> 工具：`hooked-model`

---

### 成長引擎：迴路，不是漏斗

```
Funnel 是線性的：每次都要重新灌流量
Loop 是複利的：每個用戶帶來更多用戶
```

四種主要 Loop：
- **Viral Loop**：用戶 A 邀請 → 用戶 B 加入 → B 再邀請
- **Content Loop**：用戶貢獻內容 → 吸引更多用戶 → 更多內容
- **PLG Loop**：用戶用產品 → 升級付費 → 更多資源做產品
- **Sales Loop**：ARR → 更多業務 → 更多 ARR

> 工具：`growth-loops` / `product-led-growth`

---

## 驗證：怎麼知道這個做法是對的

### 實驗設計原則

```
先定義成功條件，再跑實驗。
決定好「如果這個數字達到 X，我們就做；達不到就砍」。
```

常見錯誤：
- P-hacking：一直看數據，直到看到想要的結果
- Sample Ratio Mismatch：實驗組和對照組的人數比例不對
- 過早停止：數字剛剛好看就停，但還沒統計顯著

經驗法則：**66-92% 的實驗是失敗的。** 這是正常的，不是浪費。

> 工具：`ab-test-designer` → `trustworthy-experiments`

---

### 指標系統

```
North Star Metric（一個能代表核心價值交付的指標）
        ↑
Input Metrics（推動 NSM 的槓桿）
        +
Health Metrics（確保沒有副作用）
        +
Business Metrics（收入、成本）
```

好指標的條件：
1. **可理解**：能建立共同語言
2. **可比較**：跨時間看趨勢，不是快照
3. **比率/比例**：比絕對數字更有意義
4. **能改變行為**：如果這個指標不會讓你做不同的事，它就沒有用

> 工具：`pawel-metrics-dashboard`

---

## 長期競爭：為什麼是我們

### 護城河的本質

Power = 帶來超額回報的屬性 + 讓競爭對手無法複製的屏障

七種護城河（由強到弱）：
1. **Counter-Positioning**：顛覆者做的事，現有玩家模仿會傷自己
2. **Scale Economies**：規模越大，成本越低
3. **Data**（延伸）：數據越多，產品越好，吸引更多用戶
4. **Network Effects**：用戶越多，產品越有價值
5. **Switching Costs**：換掉你要付出太高代價
6. **Branding**：品牌帶來的溢價
7. **Cornered Resource**：獨家掌握的資源

> 工具：`seven-powers`

---

### 定位：為什麼選你不選別人

```
不是「我比競品好」，而是「在哪種情境下，我是唯一正確的選擇」

競爭替代品是什麼？（用戶現在怎麼解決這個問題）
          ↓
你有什麼他們沒有的差異化屬性？
          ↓
哪種用戶最在乎這個差異？
          ↓
什麼市場類別讓你的價值最顯而易見？
```

> 工具：`positioning-canvas`

---

## 溝通：讓別人跟你一起往前

### 對外：策略敘事

不要說「我們有 X 功能」。要說：
```
世界正在發生什麼改變？
（舊規則）舊的玩法有什麼代價？
（新規則）新的贏家是怎麼做的？
我們幫你成為新規則的贏家。
```

> 工具：`strategic-narrative`

### 對內：Radical Candor

給 feedback 的兩個維度要同時做到：
- **Care Personally**：我說這些，是因為我在乎你的成長
- **Challenge Directly**：但我不會因為怕你不舒服就不說

> 工具：`radical-candor`

---

## 一頁速查：我現在遇到什麼情境？

```
我要做什麼？                          → 用什麼

訪談用戶                               pawel-interview-script
整理訪談逐字稿                         pawel-summarize-interview
整理 CS / 用戶反饋                     user-feedback-synthesizer
理解用戶真正的需求                     jobs-to-be-done
建立 OST 機會樹                        pawel-opportunity-solution-tree
腦力激盪功能想法                       pawel-brainstorm-ideas-existing
找出功能的風險假設                     pawel-identify-assumptions-existing
設計低成本驗證實驗                     pawel-brainstorm-experiments-existing
從頭規劃產品（中文引導）               mrpm-product-planning
定義新功能（Amazon 逆向工作）          working-backwards
寫 PRD                                 prd-writer
功能優先排序（有數據）                 feature-prioritization-assistant (RICE)
功能優先排序（早期）                   pawel-prioritize-features
設定季度 OKR                           okrs
設計 A/B 測試                          ab-test-designer
確保實驗結果可信                       trustworthy-experiments
建立指標/KPI 系統                      pawel-metrics-dashboard
評估成長引擎                           growth-loops / product-led-growth
提升 DAU 留存                          hierarchy-of-engagement / hooked-model
分析競爭護城河                         seven-powers
做產品定位                             positioning-canvas
寫對外溝通/pitch                       strategic-narrative
快速驗證高風險方向                     design-sprint
跳脫估時陷阱                           shape-up
做困難的溝通                           radical-candor
寫 release notes / 進度更新            stakeholder-update-generator
衡量 Product-Market Fit                pmf-survey
```

---

## 各 Skill 完整文件

→ 個別 MD：`docs/pm-skills/`
→ 分類索引：`docs/pm-skills/PM_SKILLS_MASTER.md`

---

*整合自 pmprompt（25）、Pawel Huryn / Product Compass（8）、Mr. PM（1）*
*最後更新：2026-04-02*
