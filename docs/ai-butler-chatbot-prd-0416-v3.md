# 消費小幫手 Chatbot PRD — 0416_v3

> 版本：0416_v3
> Prototype：https://pm-prototype-a75ce.web.app/prototype/ai_agent/0416_v3/
> 前一版 PRD：`docs/ai-butler-chatbot-prd-0415-v1.md`
> 最後更新：2026-04-16
> 狀態：Prototype 完成，待工程開發

---

## 1. 產品概述

### 1.1 產品名稱

消費小幫手

### 1.2 產品目標

分析用戶過去 12 個月的電子發票，找出隱藏消費模式和省錢機會。

### 1.3 核心價值主張

讓用戶「有感」——透過驚訝的數字揭露不知不覺的消費行為。不是教訓用戶「你亂花錢」，而是用數據讓用戶自己發現「原來我在這上面花這麼多」。

### 1.4 目標用戶

台灣電子發票使用者，已完成載具歸戶。

### 1.5 成功指標（KPI）

| KPI | 定義 | 目標 |
|-----|------|------|
| 用戶互動率 | 點擊任一 Hook 按鈕的比例 | ≥ 60% |
| 歸戶轉換率 | 點擊歸戶 CTA 的比例 | ≥ 15% |
| 回訪率 | 7 天內再次開啟 Chatbot 的比例 | ≥ 25% |

---

## 2. 版本差異摘要（vs 0415_v1）

| 面向 | 0415_v1 | 0416_v3 |
|------|---------|---------|
| Hook 數量 | 3 個（recurring / pattern / topcategory） | **3 個（hidden / save / time）** |
| 開場 | 直接顯示 | **Bottom Sheet 授權 Dialog** |
| Hook 1 | 訂閱 + 重複消費 | **隱藏花費全貌（Hero Card + 通路×品類）** |
| Hook 2 | 隱藏規律 | **省錢分析（訂閱 + 帳單 + 聰明消費）** |
| Hook 3 | 最大品類 + 省錢 | **時間模式（時段 + 星期 + 深夜 + 週末）** |
| 公共事業費 | 無展開 | **可展開柱狀圖（最近 6 期）** |
| 訂閱未偵測 | 文字提示 | **常見服務列表 + 月費參考** |
| 授權拒絕 | 無後續 | **In-chat CTA 可重新開始** |
| 主題色 | 深色 | **白色主題** |

---

## 3. 使用者流程

### 3.1 授權流程（Bottom Sheet Dialog）

Phase: `"auth"`

1. 顯示 Bottom Sheet Dialog
   - Avatar：gradient ✨
   - 標題：「消費小幫手」
   - 副標題：「AI 發票分析助手」

2. 開場文案：

```
嗨！我是你的消費小幫手 👋

接下來我會分析你過去 12 個月的 {invoiceCount} 張發票資料，幫你找出隱藏的消費模式和省錢機會。
```

3. 按鈕選項：

| 按鈕 | 樣式 | 行為 |
|------|------|------|
| 「好，開始分析 🚀」 | primary (filled) | 1-2s typing indicator → 分析摘要 → phase `"ready"` |
| 「先不用了」 | secondary (outlined) | phase `"declined"` → 拒絕訊息 + 重新開始 CTA |

4. 拒絕後續：

```
沒問題！你隨時可以開始分析 👇
```
+ 藍色 CTA 按鈕「🚀 開始分析我的消費」（點擊後消失，進入分析流程）

### 3.2 分析摘要

Phase: `"ready"`

```
嗨！我分析了你 {count} 張發票的消費數據 📊
你過去一年消費 ${total}（月均 ${monthly}），我發現了一些有趣的事...
你最常消費的通路是「{topShop}」，花最多的品項是「{topItem}」。
選一個你感興趣的問題，我來幫你深入分析 👇
```

### 3.3 三個 Hook 互動流程

| # | Hook 按鈕文字 | ID | 核心問題 |
|---|-------------|-----|---------|
| 1 | 「我最大的隱藏花費是什麼？」 | `hidden` | 隱藏花費全貌 |
| 2 | 「我一年可以省多少？」 | `save` | 省錢機會分析 |
| 3 | 「我的錢都在什麼時候不見的？」 | `time` | 時間消費模式 |

使用者每點一個 Hook，該按鈕從 Quick Replies 中移除。三個都點完後不再顯示按鈕。

---

## 4. Hook 1：我最大的隱藏花費是什麼？

### 4.1 破題（Hero Card）

**開場震撼句**（Shocking lead）：

```
光是「{name}」你就花了 ${amount}——買了 {count} 次，平均每次 ${avg}。
```

**Hero Card**：
- Label：「你花最多錢買的東西」
- 品項名稱（18px, bold）
- 金額：藍色大字 `$amount`（32px, font-weight 800, color `#3560FF`）
- 副標：「{count} 次，佔總支出 {pct}%」

### 4.2 花費排行

DataCard，取 Tier 1 前 6 名品項：

| 欄位 | 說明 |
|------|------|
| label | 品項名稱（最多 18 字，超過截斷加 …） |
| value | `$amount` |
| sub | `{count}次，佔{pct}%` |
| bar | 百分比 progress bar（barColor = `#3560FF`） |

### 4.3 通路消費分布

文字：「你的錢都花在哪些通路：」

DataCard `🏪 通路消費分布`，取 `storeCategoryMatrix` 前 6 名：

| 欄位 | 說明 |
|------|------|
| label | 通路名稱（去除「股份有限公司」「有限公司」，最多 12 字） |
| value | `$amount` |
| sub | 品類分布，e.g.「速食餐點 56%、茶飲 17%」 |

### 4.4 亮眼重複品項

若某通路有重複購買品項 ≥ 8 次，在 sub 中追加：

```
⚡ 光「{item}」就買了 {count} 次（${total}）
```

品項名稱最多 12 字。

---

## 5. Hook 2：我一年可以省多少？

分為 3 個 bubbles 依序顯示。

### 5.1 訂閱服務分析（Bubble 1）

**有偵測到訂閱**：

DataCard `📱 訂閱服務`：
- 每個訂閱一行：名稱 + `$月費/月` + 備註（品項名 + 扣款次數）
- 最後一行：「年度合計」，金額紅色（`#F4252D`）
- CTA：「📋 歸戶訂閱發票」（secondary）

**未偵測到訂閱**：

文字：
```
📱 目前沒有偵測到訂閱服務的發票。

但你可能有以下服務正在扣款，只是發票沒歸戶進來：
```

DataCard `常見訂閱服務（確認是否有在使用）`：

| 項目 | 月費 |
|------|------|
| 🎬 Netflix / Disney+ | $170-390/月 |
| 🎵 Spotify / KKBOX / Apple Music | $149-170/月 |
| ☁️ iCloud / Google One 雲端空間 | $30-300/月 |
| 📺 YouTube Premium | $179/月 |
| 🛵 UberEats / foodpanda 會員 | $120-169/月 |
| 🛒 酷澎 WOW / 蝦皮 VIP | $59-99/月 |

文字：「如果有在使用以上服務，建議歸戶載具讓發票進來，才能完整追蹤你的訂閱支出。」

CTA：「📋 歸戶訂閱發票」（primary）

### 5.2 公共事業費分析（Bubble 2，含可展開柱狀圖）

**有偵測到帳單**：

Utility Card `🏠 公共事業費`：
- 每筆帳單一行：
  - 名稱 + 「每期 ${perPeriod}」
  - 副標：「共 {count} 期，年度 ${annual}」
  - 可展開：點擊 ▼ 箭頭展開最近 6 期柱狀圖
- 柱狀圖規格：
  - 高度 60px
  - 最多 6 根 bar
  - 高度等比例（最高 44px）
  - 每根 bar 上方顯示金額（9px），下方顯示月份（9px）
- 年度合計（粗體）

**有滯納金**：
- AlertCard `⚠️ 你過去一年有 ${amt} 滯納金`
  - 內文：「因為逾期繳費而被收取違約金。這筆錢完全可以避免——只要開啟繳費提醒，就不會再忘記繳費了。」
- CTA 1：「🔔 立即設定繳費提醒，不再被罰」（primary）
- CTA 2：「📋 歸戶繳費發票」（secondary）

**無滯納金**：
- cta-row：[「📋 歸戶繳費發票」, 「🔔 設定繳費提醒」]（均 secondary，flex 排列）

**未偵測到帳單**：

文字：「🏠 你的發票中沒有出現電費、水費、瓦斯費。這些帳單可能還沒歸戶到載具。」

cta-row：[「📋 歸戶繳費發票」(primary), 「🔔 設定繳費提醒」(secondary)]

### 5.3 滯納金偵測與提醒

偵測關鍵字：`滯納金`、`違約金`、`逾期`

遍歷所有品項，累加含上述關鍵字的金額。有滯納金時插入 AlertCard + CTA（見 5.2）。

### 5.4 聰明消費建議（Bubble 3）

**SmartBuy DataCard**：

條件：`currentPrice > 0 && betterPrice > 0`

DataCard `💡 買更省的方式`：
- label：品項名稱（最多 15 字）
- value：`$currentPrice → $betterPrice`（valueColor = `#00BD64` success）
- sub：具體建議

**Per-item tips**（依品類觸發）：

| 條件 | 輸出 |
|------|------|
| ☕ 咖啡品類 yearly > $1,000 | 「自備杯折 $3-5 + 考慮平價品牌，年省 ~${save}」 |
| 🏪 零食/飲料品類 yearly > $800 | 「超商同款在超市省 20-30%，年省 ~${save}」 |
| 🥛 乳製品品類 yearly > $1,000 | 「固定在超市採購，比超商便宜 15-25%，年省 ~${save}」 |
| 🍔 餐飲品類 count ≥ 8 | 「善用 App 優惠券和集點，每次省 10-15%」 |

另加 engine `saves` 中不重複的通用建議。

**合計**：「合計可省 ${totalSaveable}/年」+ `fmtComparisons` 換算。

**Fallback**（無任何建議時）：

```
💡 你的消費整體看起來還算合理。持續留意重複性支出，有意識地消費就是最好的省錢方式。
```

### 5.5 消費心理學換算框架（fmtComparisons）

三層換算，讓省下的錢「有感」：

**Layer 1 — Self-anchoring（自我錨定）**：
- 取用戶 visits ≥ 5 的常去品牌
- 排除帳單類（電費/水費/瓦斯費/電信費/網路）和被省品類
- 選 avg 最接近 $200 的品牌作為錨
- 輸出：「等於你去『{brand}』{times} 次（均 ${avg}）」
- 條件：times ≥ 2

**Layer 2 — Experiential alternative（體驗替代）**：

| 金額門檻 | 輸出 |
|---------|------|
| ≥ $20,000 | ✈️ 一趟東京 5 天自由行（傳統航空來回 $14,000 + 住宿餐飲） |
| ≥ $10,000 | ✈️ 一趟東京 3 天快閃（廉航來回 $5,000 + 住宿） |
| ≥ $5,000 | 🏖️ 一趟國內兩天一夜小旅行（住宿 + 交通 + 吃喝） |
| meals ≥ 2（amount / 600） | 🍽️ 跟朋友吃 {meals} 次好餐廳（人均 $600） |
| ≥ $3,000 | 💪 {months} 個月的健身房會員（amount / 988） |

取前 2 項。

**Layer 3 — Daily loss frame（每日流失感）**：

```
daily = amount / 365
```

| daily 門檻 | 輸出 |
|-----------|------|
| ≥ $155 | 💸 每天 ${daily} 正在溜走——等於每天丟掉一杯星巴克拿鐵（$155） |
| ≥ $100 | 💸 每天 ${daily} 正在溜走——等於每天丟掉一杯路易莎拿鐵（$100） |
| ≥ $55 | 💸 每天 ${daily} 正在溜走——等於每天丟掉一杯路易莎美式（$55） |
| ≥ $30 | 💸 每天 ${daily} 正在溜走——等於每天丟掉一瓶超商飲料 |
| ≥ $10 | 💸 每天 ${daily} 不知不覺流出去 |
| 全部不符合 | 「這筆 ${amount} 積少成多，值得注意。」 |

整體最多輸出 4 行。

---

## 6. Hook 3：我的錢都在什麼時候不見的？

分為 4 個 bubbles。

### 6.1 破題優先級（Bubble 1）

依下列優先級選擇最驚訝的數字開場：

| 優先級 | 條件 | 文案 |
|--------|------|------|
| 1 | `lateNight.pct ≥ 10` AND `peakHour.hour ≥ 22` | 「你過去一年有 ${total} 是在深夜花掉的，佔了你總消費的 {pct}%。\n\n深夜的消費決策力比白天低很多，這些錢很多是『滑手機滑出來的』。」 |
| 2 | `weekendPremium.pct ≥ 20` | 「你週末每筆消費比平日貴 {pct}%——平日均 ${weekdayAvg}，但到了週末變成 ${weekendAvg}。\n\n週末容易『犒賞自己』，不知不覺花更多。」 |
| 3 | peakMonth 存在 | 「你 {month} 花了全年最多的 ${amount}。\n\n可能有大筆消費或季節性支出，值得回頭看看那個月發生了什麼。」 |
| 4 | peakHour 存在 | 「你的消費高峰在 {hour} 點，光這個時段就花了 ${amount}。」 |

### 6.2 消費時段分布（Bubble 2）

文字：「你花最多錢的時段是 {peakHour} 點（${amount}）。看看你的錢在一天中怎麼分布的：」

DataCard `⏰ 消費時段分布`，5 個時段：

| 時段 | 時間範圍 |
|------|---------|
| 早上 | 6:00 - 11:59 |
| 中午 | 12:00 - 14:59 |
| 下午 | 15:00 - 17:59 |
| 晚上 | 18:00 - 21:59 |
| 深夜 | 22:00 - 05:59 |

每行：label + `${amount}（{pct}%）` + progress bar。

### 6.3 星期消費分布（Bubble 3）

DataCard `📅 星期消費分布`：
- 週一到週日，每行：label + `日均 ${avg}` + progress bar（高度依最大日均比例）

**破財日分析**（if `dayRatio ≥ 1.5`）：

```
{maxDay}是你的「破財日」——日均消費 ${maxDayAvg}，是{minDay}（${minDayAvg}）的 {dayRatio} 倍。

{若 maxDay 是週六/週日：週末通常是採購日和外出日，花費自然偏高。但知道差距有多大，就能有意識地控制。}
{若 maxDay 是平日：這天可能是你固定的採購或外食日，注意一下是否有衝動消費。}
```

### 6.4 深夜消費 + 週末溢價 + 行動建議（Bubble 4）

**深夜消費 AlertCard**（if `lateNight.pct ≥ 10`）：
- Icon：🌙
- Title：「深夜消費佔 {pct}%（${total}）」
- Body：「深夜（22:00-06:00）的消費通常衝動性更高。減少 30% 就能年省 ${saveable}。」

**週末溢價**（if `weekendPremium.pct ≥ 20`）：

```
📆 你週末每筆消費比平日貴 {pct}%
平日均 ${weekdayAvg} → 週末 ${weekendAvg}
```

**消費最高月份**（if peakMonth 存在）：

```
📊 消費最高的月份：{month}（${amount}）
```

**行動建議**（依條件組合）：

| 條件 | 建議 |
|------|------|
| `lateNight.pct ≥ 10` | 🌙 設定「深夜冷靜期」——22 點後超過 $200 的消費，先加購物車明天再決定 |
| `weekendPremium.pct ≥ 20` | 📝 週末出門前列好清單和預算，減少衝動消費 |
| peakMonth 存在 | 📆 留意消費高峰月份，提前規劃大筆支出 |
| 以上皆無 | 📝 出門前列清單，避免衝動消費 |

---

## 7. 偵測引擎邏輯

### 7.1 訂閱偵測（3 層方法）

**Method 1a — 品項關鍵字**：

```
月費, 年費, 月訂閱, 季訂閱, 年訂閱, 訂閱費, 訂閱制,
訂閱方案, 訂閱服務, 訂閱月費, 訂閱年費,
uber one, pandapro, panda pro, 蝦皮vip, wow 會員
```

**Method 1b — Regex**：

```js
/(youtube|spotify).*premium/i
/^youtube$/i
```

**Method 2 — 通路 × 品項配對**：

| 通路關鍵字 | 品項關鍵字 |
|-----------|----------|
| ubereats, uber eats, 優食台灣, uber | uber one, 訂閱 |
| foodpanda, 富胖達 | pandapro, panda pro, 訂閱 |
| 酷澎, coupang | wow, 會員, 訂閱 |
| spotify | premium, 訂閱, 月費 |
| netflix | 訂閱, 月費, netflix |
| disney, 迪士尼 | 訂閱, 月費 |
| apple, itunes | icloud, 訂閱, 月費 |
| google | 訂閱, 月費, youtube, premium |
| kkbox | 訂閱, 月費 |
| 蝦皮, shopee | vip, 訂閱 |
| line | 訂閱, 月費, premium |

**排除**：Apple Store / momo購物 的硬體購買（除非品項明確含「訂閱」或「月費」）。

**去重**：同通路 + 相同金額（四捨五入）視為同一訂閱。

### 7.2 公共事業費偵測（5 類）

| 類別 | 通路關鍵字 | 品項關鍵字 |
|------|----------|----------|
| 電費 | 台灣電力, 台電 | 電費 |
| 水費 | 自來水 | 水費 |
| 瓦斯 | （無） | 瓦斯 |
| 電信費 | 台灣大哥大, 中華電信, 遠傳 | 電信, 月租 |
| 保險費 | 國泰人壽, 南山人壽, 富邦人壽 | 保費, 保險 |

每類輸出：
- `name`：類別名稱
- `perPeriod`：每期平均金額（total / count）
- `annual`：年化金額（annualise(sum, span)）
- `count`：偵測到的期數
- `periods`：最近 6 期 `[{date, amount}]`，供柱狀圖使用

附加邏輯：若電費年化 > $15,000，追加提示「電費偏高，可到台電網站試算時間電價是否划算」。

### 7.3 滯納金偵測

**關鍵字**：`滯納金`、`違約金`、`逾期`

遍歷所有品項（flattenItems），若品項名稱包含上述關鍵字，累加金額。

### 7.4 重複消費偵測（含 Per-Visit 邏輯）

**一般品項**：
- 依品項名稱分群
- 門檻：≥ 5 次
- 排除外送平台、「其他」「外送服務費」「餐飲消費」「訂閱服務」品類

**Per-Visit 通路**（以發票為單位，一張發票 = 一次消費）：

```
爭鮮, 藏壽司, 壽司郎, くら寿司, スシロー,
麥當勞, 肯德基, 摩斯漢堡, 漢堡王, Subway
```

- 這些通路的品項不拆解（e.g. 麥當勞「餐-十塊雞 + 配-大薯 + 可樂」= 一次消費）
- 門檻：≥ 5 次 visits

### 7.5 包裝價差偵測

**邏輯**：同通路 + 同商品（正規化名稱後）→ 不同價格變體 → 計算價差

**品名正規化**：去除末尾的 `\d+(罐|入|組|盒|包|袋|瓶|片|個)` 後綴 + 合併空白

**觸發門檻**：
- 最貴 / 最便宜變體價差 ≥ 30%（`most.price > cheapest.price * 1.3`）
- 最貴變體單價 ≥ $100
- 年省金額 ≥ $500

**不適用品類**（NO_BULK_CATS，不存在「大包裝」概念）：

```
速食餐點, 便當/正餐, 餐飲消費, 壽司/迴轉, 滷味/小食, 麵包/烘焙, 手搖飲
```

**年省計算**：
```
currentSpend = sum(variant.price * variant.count)
ifCheapest = totalBought * cheapest.price
saveable = currentSpend - ifCheapest
yearlySave = annualise(saveable, span)
```

### 7.6 受眾分群（12 種標籤）

| 標籤 | 偵測方式 | 門檻 | 關鍵訊號 |
|------|---------|------|---------|
| 外食族 | 通路佔比 (store_pct) | ≥ 20% | ubereats, uber eats, foodpanda, 麥當勞, 肯德基, 摩斯漢堡, 爭鮮, 藏壽司 |
| 超商族 | 通路佔比 (store_pct) | ≥ 25% | 7-11, 全家, 萊爾富 |
| 超市採購族 | 通路佔比 (store_pct) | ≥ 15% | 全聯, 家樂福, 美廉社 |
| 咖啡族 | 品項佔比 (item_pct) | ≥ 5% | 咖啡, 美式, 拿鐵, 摩卡, 卡布, 冷萃 |
| 健身/健康族 | 品項次數 (item_count) | ≥ 15 | 雞胸, 蛋白, 優格, 沙拉, 燕麥, 豆漿, LP33, 益生菌 + 健身工廠 |
| 飲料族 | 品項佔比 (item_pct) | ≥ 8% | 氣泡水, 可樂, 雪碧, 奶茶, 果汁, 紅茶, 綠茶 |
| 零食控 | 品項佔比 (item_pct) | ≥ 4% | 餅乾, 洋芋片, 巧克力, 糖果, 軟糖 |
| 新手爸媽 | 品項次數 (item_count) | ≥ 3 | 尿布, 奶粉, 副食品, 嬰兒, 寶寶, 奶瓶, 紙尿褲, pampers, 幫寶適, 妙而舒, 哺乳 |
| 美妝保養族 | 品項次數 (item_count) | ≥ 5 | 面膜, 卸妝, 防曬, 乳液, 保濕, 精華, 粉底 + 寶雅, 屈臣氏, 康是美 |
| 網購族 | 通路佔比 (store_pct) | ≥ 10% | momo, 蝦皮, shopee, 酷澎, coupang, pchome |
| 開車族 | 品項次數 (item_count) | ≥ 5 | 無鉛汽油, 柴油, 95無鉛, 92無鉛 + 台灣中油, 北基加油站, 停車場 |
| 毛小孩家長 | 品項次數 (item_count) | ≥ 3 | 飼料, 貓砂, 寵物, 倉鼠（注意：「熱狗」不觸發） |

**分群邏輯**：
- 每人可有多個標籤
- 按 score 排序，最高分為主標籤
- store_pct 型：score = 命中發票佔比
- item_pct 型：score = 命中品項佔比
- item_count 型：score = storeHits + itemHits

### 7.7 消費特徵偵測（6 種信號）

| 信號 | Emoji | 品項關鍵字 | 通路關鍵字 | 排除 |
|------|-------|----------|----------|------|
| 嬰幼兒 | 👶 | 尿布, 奶粉, 奶瓶, 嬰兒, 寶寶, 副食品, 幫寶適, pampers, 哺乳 | — | — |
| 寵物 | 🐾 | 飼料, 貓砂, 寵物, 倉鼠 | — | — |
| 咖啡 | ☕ | 咖啡, 美式, 拿鐵 | — | — |
| 酒類 | 🍺 | 啤酒, 紅酒, 白酒, 威士忌, 清酒, 酒 | — | 酒精燈, 酒精棉 |
| 服飾 | 👗 | 服飾, 童裝, 褲, 衣, 洋裝 | uniqlo, zara, h&m, gu, net | — |
| 開車族 | 🚗 | 無鉛汽油, 柴油, 95無鉛, 92無鉛 | 中油, 加油站 | — |

若偵測到信號，年化金額後加入 signals 列表。附加：若固定支出年化 > $15,000，加入「⚡ 電費偏高」信號。

### 7.8 時間模式偵測

**消費高峰時段**：按小時累計金額，取金額最高的小時。

**星期消費差異**：
- 按星期分組（週一到週日）
- 計算每天的日均消費 = total / distinctDays
- `dayRatio = maxDay.avg / minDay.avg`
- 觸發門檻：dayRatio ≥ 1.5 → 顯示「破財日」分析

**月份消費**：按年月分組，取金額最高的月份。

**時段分桶**：5 個 buckets（早上/中午/下午/晚上/深夜），按金額降序排列。

**深夜消費**：

```
lateNightTotal = SUM(amount WHERE hour >= 22 OR hour < 6)
lateNightPct = lateNightTotal / totalTimedAmount × 100
lateNightSaveable = lateNightTotal × 0.3
```

排除外送平台。觸發：pct ≥ 10%。

**週末溢價**：

```
weekdayAvg = weekdayTotal / weekdayCount
weekendAvg = weekendTotal / weekendCount
weekendPremiumPct = (weekendAvg - weekdayAvg) / weekdayAvg × 100
```

週末定義：週六（dow=6）、週日（dow=0）。觸發：pct ≥ 20%。

**頻率暴增**：

```
sortedMonths 按年月排序，取中位切成 firstHalf / secondHalf
befMonthly = brandFirst[store] / firstHalf.size
aftMonthly = brandSecond[store] / secondHalf.size
surgeRatio = aftMonthly / befMonthly
```

觸發：`surgeRatio ≥ 2` 且 `secondHalf visits ≥ 5`。排除帳單類和「其他」品類。

### 7.9 隱藏花費小偷偵測（5 類）

| 類型 | Icon | 標籤 | 觸發條件 | Severity |
|------|------|------|---------|----------|
| 頻率暴增 (surge) | 🚀 | 頻率暴增 | surgeRatio ≥ 2 | ≥3 倍: high, 其他: medium |
| 深夜消費 (latenight) | 🌙 | 深夜消費 | lateNight.pct ≥ 10% | ≥20%: high, 其他: medium |
| 週末溢價 (weekend) | 📆 | 週末溢價 | weekendPremium.pct ≥ 20% | ≥40%: high, 其他: medium |
| 小額高頻 (smallfreq) | 🏪 | 小額高頻 | count ≥ 8 且 avg < $100 | 年化 ≥$3,000: medium, 其他: low |
| 品類膨脹 (catgrowth) | 📈 | 品類膨脹 | 前後期成長 ≥ 50%（first ≥ $500） | ≥100%: high, 其他: medium |

排序：high → medium → low。

### 7.10 通路×品類交叉分析

**Store → Category Matrix**（storeCategoryMatrix）：
- 遍歷所有發票（排除外送平台）
- 品項分類後排除「其他」「外送服務費」「餐飲消費」
- 按通路分群，累計各品類金額
- 篩選：通路總金額 > $500
- 排序：金額降序，取前 8 家
- 每家取前 4 大品類，含 pct

**Category → Store Matrix**（categoryStoreMatrix）：
- 反向由 storeCategoryMatrix 建構
- 按品類金額降序，取前 6 類
- 每類取前 4 大通路

---

## 8. 排除邏輯

| 排除對象 | 關鍵字 | 原因 |
|---------|--------|------|
| 外送平台 | ubereats, uber eats, foodpanda, uber, 外送 | 發票是服務費，非實際食物消費 |
| 網購/量販 | momo, 蝦皮, shopee, 酷澎, coupang, 好市多, costco, pchome, yahoo | 箱購單價不可比 |
| 帳單 | 電費, 水費, 瓦斯, 電信費, 保險費 | 固定支出，不適用省錢建議 |
| 速食/壽司品項拆解 | 麥當勞, 肯德基, 摩斯漢堡, 漢堡王, Subway, 爭鮮, 藏壽司, 壽司郎 | 一餐的組成，用 visit 計 |
| 餐飲類包裝價差 | NO_BULK_CATS 列表 | 餐飲不可大包裝 |
| 酒精燈/酒精棉 | 酒精燈, 酒精棉 | 非酒類消費，排除於酒類信號偵測 |
| 熱狗 | — | 食物中的「狗」字不算毛小孩，已從關鍵字移除 |
| it.price 已是行總金額 | — | 不乘 qty，避免重複計算 |

---

## 9. 語氣原則

| ❌ 不要 | ✅ 要 |
|--------|------|
| 「浪費」 | 「值得重新想想」 |
| 「你亂花錢」 | 「你可能沒注意到」 |
| 「壽司盤 31 次」 | 「藏壽司 8 次 $4,800」 |
| 「餐-十塊雞 9 次」 | 「麥當勞 X 次」 |
| 「深夜亂買」 | 「深夜消費的決策力較低」 |
| 追問重複 Hook 內容 | 追問帶來新 insight |
| 1 個訂閱還追問分析 | ≥ 2 個訂閱才追問 |

**核心原則**：
- 正面、不批判——像朋友提醒，不像老師教訓
- 用數據說話——讓用戶自己發現問題
- 具體可行動——每個洞察都有明確的下一步

---

## 10. 資料架構

### 10.1 發票資料格式

```js
// 每張發票
{
  shop: String,        // 通路/商家名稱
  amount: Number,      // 發票總金額
  yearMonth: String,   // "2025-06"
  week: String,        // 週次
  issued_at: String,   // ISO datetime "2025-06-15T14:30:00"
  items: [             // 品項明細
    {
      name: String,    // 品項名稱
      price: Number,   // 行總金額（已含 qty，不再乘 qty）
      qty: Number      // 數量（僅供參考）
    }
  ]
}
```

### 10.2 引擎輸出格式

`computeInsightData(invoices, invoiceCount, totalAmount)` 回傳：

```js
{
  total: Number,              // 總消費金額
  invoices: Number,           // 發票數量
  monthly: Number,            // 月均消費

  signals: [String],          // 消費特徵信號列表

  tier1: [{                   // 花費排行 Top 6
    name, amount, count, pct
  }],
  tier1Total: Number,

  tier2: [{                   // 通路排行 Top 6
    store, amount, items
  }],
  tier2Total: Number,

  subscriptions: [{           // 訂閱服務
    name, monthlyAmount, note
  }],

  utilities: {                // 公共事業費
    bills: [{
      name, perPeriod, annual, count,
      periods: [{ date, amount }]
    }],
    penalties: [{ name, amount }],
    tips: [String]
  },

  smartBuy: [{                // 包裝價差建議
    item, currentPrice, betterPrice, tip
  }],

  comparison: {               // 跟同級距比較
    monthlyAvg, tierMedian, position,
    comparisons: [{ item, yourPrice, medianPrice }],
    conclusion: String
  },

  repeatItems: [{             // 重複消費品項
    name, count, total, cat, shop
  }],

  audience: {                 // 受眾分群
    tags: [String],
    primary: String
  },

  lateNight: {                // 深夜消費
    pct, total, saveable
  },
  weekendPremium: {           // 週末溢價
    pct, weekdayAvg, weekendAvg
  },
  frequencySurges: [{         // 頻率暴增
    brand, before, after, ratio
  }],

  fmtComparisons: Function,  // 換算函式 (amount, excludeCat?) => String

  saves: [{                   // 通用省錢建議
    icon, item, detail, action, save
  }],

  storeCategoryMatrix: [{     // 通路×品類矩陣
    shop, total, topCats: [{ cat, amount, pct }]
  }],
  categoryStoreMatrix: [{     // 品類×通路矩陣
    cat, total, stores: [{ shop, amount }]
  }],
  hiddenThieves: [{           // 隱藏花費小偷
    type, icon, label, title, detail, severity
  }],
  timePatterns: {             // 時間模式
    peakHour: { hour, amount },
    peakMonth: { month, amount },
    dayOfWeek: [{ wk, avg, total }],
    maxDay, minDay, dayRatio,
    timeBuckets: [{ name, amount }]
  }
}
```

### 10.3 BQ 預計算架構

**三層架構**：

```
┌────────────────────────────────────────────┐
│ Layer 1: BQ Scheduled Query（每日 09:30）    │
│ 全量用戶預計算 → user_spending_insights 表    │
│ 增量：只算過去 7 天有新發票的用戶              │
└──────────────┬─────────────────────────────┘
               ▼
┌────────────────────────────────────────────┐
│ Layer 2: API                                │
│ GET /insights/{member_hk}                   │
│ 從快取表讀取，毫秒級回應                      │
└──────────────┬─────────────────────────────┘
               ▼
┌────────────────────────────────────────────┐
│ Layer 3: App UI                             │
│ 3 張卡片 + Chatbot，模板填入數字               │
│ 金額全用年度累計，最大化衝擊力                  │
└────────────────────────────────────────────┘
```

**快取表 Schema**：

```sql
CREATE TABLE IF NOT EXISTS `user_spending_insights` (
  member_hk         BYTES,
  computed_at        TIMESTAMP,
  total_12m          INT64,
  invoice_count      INT64,
  -- Card 1: Top store
  c1_store           STRING,
  c1_amount          INT64,
  c1_pct             FLOAT64,
  -- Card 2: Savings
  c2_total_saving    INT64,
  c2_saving_freq     INT64,
  c2_saving_sub      INT64,
  c2_saving_late_night INT64,
  -- Card 3: Timing
  c3_peak_hour       INT64,
  c3_peak_hour_amount INT64,
  c3_peak_month      STRING,
  c3_peak_month_amount INT64,
  c3_weekend_premium_pct FLOAT64
);
```

**成本估算**：

| 項目 | 估算 |
|------|------|
| 全量首次計算（270 萬用戶） | ~$50-100（一次性） |
| 每日增量更新（20-50 萬有新發票） | ~$5-15/天 |
| 建議 | 先跑 1 萬用戶驗證，再決定全量 |

---

## 11. UI 元件規格

### 11.1 Design Tokens

```js
const T = {
  brand:       "#3560FF",    // 主色——品牌藍
  brandLight:  "#82A8FF",    // 淺藍
  bg:          "#FFFFFF",    // 背景白
  bgSunken:    "#F7F8F9",    // 下沉背景（卡片內底色、typing bubble）
  textBold:    "#101119",    // 主文字——粗體標題
  textDefault: "#3B3C43",    // 一般內文
  textSubtle:  "#737380",    // 輔助說明文字
  border:      "#EDEFF3",    // 邊框 / 分隔線
  success:     "#00BD64",    // 省錢正向——綠色
  danger:      "#F4252D",    // 警示/滯納金——紅色
  font:        "-apple-system,BlinkMacSystemFont,'SF Pro Text','PingFang TC',sans-serif",
};
```

### 11.2 DataCard

通用資料卡片元件。

| 屬性 | 說明 |
|------|------|
| title | 卡片標題（13px, bold, textBold） |
| rows[] | 每行資料 |
| rows[].label | 左側文字（13px, textDefault） |
| rows[].value | 右側數值（13px, bold 600, textBold） |
| rows[].valueColor | 可選覆寫顏色（e.g. danger, success） |
| rows[].sub | 副標（12px, textSubtle） |
| rows[].bar | 0-100，顯示 progress bar（高 6px, 圓角 3px, bgSunken 底, brand 填充） |
| rows[].barColor | 可選覆寫 bar 顏色 |
| children | 卡片底部額外內容 |

**樣式**：bg white, border 1px border, borderRadius 12px, padding 14px 16px。

### 11.3 AlertCard

警示卡片，用於滯納金、深夜消費等需要強調的資訊。

| 屬性 | 說明 |
|------|------|
| icon | 左側 emoji（16px） |
| title | 標題（13px, bold 700, danger 色） |
| children | 內文（13px, textDefault, lineHeight 1.6） |

**樣式**：background `#FFF5F5`, border 1px `#FED7D7`, borderRadius 12px。

### 11.4 CtaButton（含 flex 模式）

行動按鈕元件。

| 屬性 | 說明 |
|------|------|
| primary | Boolean——filled (brand bg, white text) or outlined (brand border, brand text) |
| label | 按鈕文字 |
| done | Boolean——已點過則變灰色 disabled |
| onClick | 點擊回調 |
| flex | Boolean——若 true 則 flex:1（用於 cta-row 並排） |

**樣式**：
- 未點擊 primary：background brand, color white, border none
- 未點擊 secondary：background bg, color brand, border 1.5px solid brand
- 已點擊 done：background bgSunken, color textSubtle, border border, cursor default
- padding：flex ? `8px 10px` : `10px 14px`
- borderRadius 20px, fontSize 13, fontWeight 600
- 非 flex 模式：width 100%, display block

### 11.5 Hero Card

大數字震撼卡片，用於 Hook 1 開場。

| 欄位 | 樣式 |
|------|------|
| label | 13px, textSubtle |
| name | 18px, bold 700, textBold |
| amount | **32px, bold 800, brand 色** |
| sub | 13px, textSubtle |

### 11.6 Utility Card（可展開柱狀圖）

公共事業費專用卡片。

**結構**：
- 外框：DataCard 同款樣式（bg white, border, borderRadius 12）
- 每筆帳單：
  - 左：名稱（13px, textDefault）
  - 右：「每期 ${perPeriod}」+ ▼ 箭頭（11px, textSubtle, 可旋轉 180deg）
  - 副標：「共 {count} 期，年度 ${annual}」（12px, textSubtle）
  - 展開區：柱狀圖
- 底部分隔線 + 年度合計

**柱狀圖規格**：
- 容器高度：60px
- 最多 6 根 bar（最近 6 期）
- 柱高度：等比例，最高 44px，最低 4px
- 柱顏色：brand 色
- 柱上方：金額（9px, textSubtle, fontWeight 500）
- 柱下方：月份（9px, textSubtle，取 date.slice(5)）
- 柱間距：gap 4px
- flex 均分寬度

### 11.7 QuickReplies

水平滾動的 chip 按鈕列。

| 屬性 | 說明 |
|------|------|
| chips[] | `{ key, label }` 陣列 |
| onTap | 點擊回調 |

**樣式**：
- 容器：flex, gap 8px, overflowX auto, padding 8px 16px, -webkit-overflow-scrolling touch
- 每個 chip：padding 8px 16px, borderRadius 20px, border 1.5px solid brand, bg white, color brand, 13px bold 600, whiteSpace nowrap, flexShrink 0

### 11.8 TypingIndicator

三個跳動圓點，模擬打字中。

**樣式**：
- 容器：bgSunken, borderRadius `18px 18px 18px 4px`, padding 12px 18px, flex, gap 5
- 圓點：8px × 8px, borderRadius 4px, textSubtle 色
- 動畫：`aichat6-bounce 1.2s infinite`，每點延遲 0.2s

---

## 12. CTA 行為定義

所有 CTA 點擊後觸發 `addTodo(todoText)`，加入待辦事項列表，並回覆確認訊息。

| CTA | todoText | 類型 |
|-----|----------|------|
| 📋 歸戶訂閱發票 | 到 App 載具歸戶頁面，確認所有訂閱服務都已歸戶（Netflix / Spotify / iCloud 等） | 歸戶引導 |
| 📋 歸戶繳費發票 | 到 App 載具歸戶頁面，確認台電、自來水、瓦斯公司都已歸戶 | 歸戶引導 |
| 🔔 立即設定繳費提醒，不再被罰 | 設定公共事業費繳費提醒（電費、水費、瓦斯費到期前 3 天通知，避免滯納金） | 功能引導 |
| 🔔 設定繳費提醒 | 設定公共事業費繳費提醒（電費、水費、瓦斯費到期前通知） | 功能引導 |
| 🚀 開始分析我的消費 | （直接觸發分析流程，不加 todo） | 授權重試 |

CTA 點擊後變灰色 disabled 狀態，不可重複點擊。

---

## 13. 自由輸入處理

使用者可在輸入框自由打字，系統依下列優先順序匹配：

| 優先順序 | 匹配方式 | 行為 |
|---------|---------|------|
| 1 | Phase 為 auth/loading | 自動觸發分析流程 → 顯示摘要 |
| 2 | 關鍵字匹配 Hook | `/花\|隱藏\|最多/` → hidden<br>`/省\|訂閱\|帳單/` → save<br>`/時間\|什麼時候\|深夜\|週末/` → time |
| 3 | Tier 1 品項名稱匹配 | 回覆該品項的金額、次數、佔比 |
| 4 | Tier 2 通路名稱/品項匹配 | 回覆該通路的消費金額 + 常買品項 |
| 5 | 無匹配（fallback） | 回覆總消費概況 + 最依賴通路 + 引導選擇快速問題 |

已回答過的 Hook 不會被關鍵字重複觸發。

---

## 14. 技術架構

### 14.1 檔案清單

| 檔案 | 功能 |
|------|------|
| `aiChatV6.jsx` | Chatbot UI：Bottom Sheet 授權 + 3 Hook + 自由輸入 + 可展開柱狀圖 |
| `insightEngineV2.js` | 偵測引擎：訂閱偵測 + 固定支出 + 滯納金 + 重複消費 + 包裝價差 + 受眾分群 + 深夜/週末/暴增 + 隱藏小偷 + 通路×品類矩陣 |
| `itemClassifier.js` | 品項分類器（30+ 品類） |
| `invoicePrototypeV3.jsx` | 主容器：Firebase 登入 + 發票資料載入 |
| `shopMapping.js` | 通路對照表（resolveShop） |
| `refresh_rtdb.py` | BQ → RTDB 資料更新腳本 |

### 14.2 部署

| 元件 | URL |
|------|-----|
| Prototype | https://pm-prototype-a75ce.web.app/prototype/ai_agent/0416_v3/ |
| AI Proxy | https://invoice-claude-proxy.kirk-chen-669.workers.dev |
| GitHub | https://github.com/kirkchen0302/openclaw-workspace |

---

## 15. 所有閾值一覽

| 偵測項目 | 閾值 | 說明 |
|---------|------|------|
| 重複消費門檻 | ≥ 5 次 | 品項或 per-visit 通路出現 5 次以上 |
| 亮眼重複品項 | ≥ 8 次 | 通路內單品項 8 次以上才在通路卡中 highlight |
| Tier 1 品項候選 | amount > $3,000 OR count ≥ 5 | 進入花費排行的門檻 |
| 通路×品類矩陣最低金額 | > $500 | 通路總金額低於 $500 不進入矩陣 |
| 訂閱 Method 2 排除 | Apple Store, momo購物 | 除非品項明確含「訂閱/月費」 |
| 包裝價差比例 | ≥ 30% | most.price > cheapest.price * 1.3 |
| 包裝最低單價 | ≥ $100 | 低價商品不值得比較 |
| 包裝年省門檻 | ≥ $500 | 年省低於 $500 不顯示 |
| 深夜消費觸發 | pct ≥ 10% | 佔比達 10% 才顯示深夜相關分析 |
| 深夜消費省錢倍率 | × 30% | 假設可減少 30% 深夜消費 |
| 週末溢價觸發 | pct ≥ 20% | 每筆消費比平日貴 20% 以上 |
| 頻率暴增觸發 | ratio ≥ 2 | 後半期月頻率 ≥ 前半期 2 倍 |
| 頻率暴增最低 visits | ≥ 5 | 後半期至少 5 次 visits |
| 破財日觸發 | dayRatio ≥ 1.5 | 最高日均 / 最低日均 ≥ 1.5 倍 |
| 受眾：外食族 | store_pct ≥ 20% | 通路發票佔比 |
| 受眾：超商族 | store_pct ≥ 25% | 通路發票佔比 |
| 受眾：超市採購族 | store_pct ≥ 15% | 通路發票佔比 |
| 受眾：咖啡族 | item_pct ≥ 5% | 品項佔比 |
| 受眾：健身/健康族 | item_count ≥ 15 | 品項 + 通路命中次數 |
| 受眾：飲料族 | item_pct ≥ 8% | 品項佔比 |
| 受眾：零食控 | item_pct ≥ 4% | 品項佔比 |
| 受眾：新手爸媽 | item_count ≥ 3 | 品項命中次數 |
| 受眾：美妝保養族 | item_count ≥ 5 | 品項 + 通路命中次數 |
| 受眾：網購族 | store_pct ≥ 10% | 通路發票佔比 |
| 受眾：開車族 | item_count ≥ 5 | 品項 + 通路命中次數 |
| 受眾：毛小孩家長 | item_count ≥ 3 | 品項命中次數 |
| 電費偏高信號 | > $15,000/年 | 固定支出年化超過此值 |
| 聰明消費：咖啡 | yearly > $1,000 | 觸發自備杯建議 |
| 聰明消費：零食/飲料 | yearly > $800 | 觸發超市替代建議 |
| 聰明消費：乳製品 | yearly > $1,000 | 觸發超市採購建議 |
| 聰明消費：餐飲 | count ≥ 8 | 觸發 App 優惠券建議 |
| 隱藏小偷：小額高頻 | count ≥ 8, avg < $100 | 年化 ≥ $3,000 為 medium |
| 隱藏小偷：品類膨脹 | 成長 ≥ 50%, 前期 ≥ $500 | 成長 ≥ 100% 為 high |
| 比價觸發 | pct_above ≥ 30% | 你的均價比市場中位數貴 30% 以上 |
| Layer 1 錨定：品牌 visits | ≥ 5 | 常去品牌才作為錨定 |
| Layer 1 錨定：品牌 avg | > $30 | 均消太低的不作為錨定 |
| Layer 3 daily loss | ≥ $30 | 才顯示「每天 $X 正在溜走」 |
| fmtComparisons times | ≥ 2 | 等於去某店 2 次以上才顯示 |
| Benchmark 級距 | 5 級 | 5-10K / 10-20K / 20-40K / 40-60K / 60K+ |

**Benchmark 級距詳細**：

| 月均消費範圍 | tier_range | tier_median | tier_users |
|------------|-----------|-------------|------------|
| < $10,000 | 5-10K | $7,500 | 892,341 |
| $10,000 - $19,999 | 10-20K | $14,200 | 723,156 |
| $20,000 - $39,999 | 20-40K | $26,004 | 506,814 |
| $40,000 - $59,999 | 40-60K | $48,500 | 198,432 |
| ≥ $60,000 | 60K+ | $72,000 | 85,210 |

**Position 判定**：

| pct_diff vs tier_median | Position |
|------------------------|----------|
| ≤ -20% | 偏低 |
| -20% ~ -5% | 中下 |
| -5% ~ +5% | 中等 |
| +5% ~ +20% | 中上 |
| > +20% | 偏高 |

**市場中位價（用於比價）**：

| 品類 | 中位價 | 匹配關鍵字 |
|------|-------|----------|
| 咖啡 | $55 | 咖啡, 美式, 拿鐵, 摩卡, 卡布 |
| 瓶裝飲料 | $29 | 氣泡水, 礦泉水, 可樂, 雪碧, 多喝水, PET |
| 乳製品 | $52 | 鮮乳, 鮮奶, 牛奶, 豆漿, 優格, 優酪 |
| 零食 | $46 | 餅乾, 洋芋片, 巧克力, 糖果, 零食 |
| 鮮食/便當 | $48 | 便當, 飯糰, 三明治, 餐盒, 涼麵, 鮮食 |

**通用省錢規則（SAVE_RULES）**：

| 匹配關鍵字 | Icon | 建議 | 省錢比例 |
|----------|------|------|---------|
| 尿布, 奶粉, 奶瓶, 嬰兒, 寶寶, 副食品, 幫寶適, 哺乳 | 🍼 | 改買大包裝 | 40% |
| 咖啡, 美式, 拿鐵 | ☕ | 自備杯折扣 + 量販包 | 35% |
| 飯糰, 三明治, 便當, 涼麵, 鮮食 | 🍱 | 超商品改超市/自帶 | 30% |
| 餅乾, 洋芋片, 零食, 巧克力, 糖果 | 🍪 | 量販店囤貨替代超商 | 30% |
| 飲料, 可樂, 氣泡水, 礦泉水, 茶 | 🥤 | 改買箱裝或自備水壺 | 35% |
| 衛生紙, 面紙, 濕紙巾 | 🧻 | 網購量販價更低 | 30% |

---

## 16. 版本歷史

| 版本 | 日期 | 重點 |
|------|------|------|
| 0408_v1 | 04-09 | 初版 card-based |
| 0409_v2 | 04-09 | Chatbot + 樹狀敘事鏈 |
| 0409_v3 | 04-10 | 動態 Insight Engine |
| 0410_v4 | 04-10 | 新用戶 Onboarding |
| 0410_v5 | 04-10 | 品項明細 + itemClassifier |
| 0411_v1 | 04-11 | 全 Hook 可點 + AUTOPAY |
| 0411_v3 | 04-12 | 正面語氣 + 開場震撼排序 |
| 0414_v1 | 04-14 | 6 Hook + 複合品類 + BENCHMARK + PATTERN |
| 0414_v2 | 04-14 | 3 固定 Hook + 2 層 + 12 受眾標籤 + 品類專屬省法 |
| 0415_v1 | 04-15 | 深夜/週末/暴增偵測 + 包裝價差 + 8 省錢策略 + BQ 架構 |
| **0416_v3** | **04-16** | **消費小幫手重新命名 + Bottom Sheet 授權 + 白色主題 + Hero Card + 通路×品類矩陣 + 可展開柱狀圖 + 常見訂閱列表 + 隱藏花費小偷偵測 + 消費心理學換算框架** |

---

## 17. 待優化

1. **BQ 預計算實作**：SQL query + scheduled job，先跑 1 萬用戶驗證
2. **訂閱偵測關鍵字擴充**：HBO, Hulu, LINE, 遠傳/台哥大月租等
3. **包裝偵測 NLP 強化**：目前用後綴正規化，可加入品名相似度比對
4. **品項名稱正規化改善**：處理更多不規則命名（全形/半形、空格/無空格等）
5. **增量更新最佳化**：只重算有新發票的用戶，降低 BQ 計算成本
6. **文案 A/B test**：驗證哪種表述最有感（震撼數字 vs 溫和提醒）
7. **深夜偵測排除公用事業**：電費水費的開立時間不代表消費行為
8. **通路名稱 mapping 優化**：目前用公司全名，需建立更完整的通路對照表
