import { useEffect, useMemo, useState } from "react";
import { fetchUserData } from "../firebase";

const fmt = (n) => Math.round(Number(n || 0)).toLocaleString("zh-TW");
const currency = (n) => `$${fmt(n)}`;

const FALLBACK_USER = {
  name: "Kirk",
  invoiceCount: 132,
  totalAmount: 75737,
  days: 61,
  shops: [
    { name: "UberEats", icon: "🛵", visits: 21, total: 6930, avg: 330 },
    { name: "7-11", icon: "🏪", visits: 18, total: 2847, avg: 158 },
    { name: "麥當勞", icon: "🍔", visits: 14, total: 3220, avg: 230 },
    { name: "路易莎", icon: "☕", visits: 12, total: 1500, avg: 125 },
    { name: "全家", icon: "🏬", visits: 9, total: 1260, avg: 140 },
    { name: "全聯", icon: "🛒", visits: 7, total: 3430, avg: 490 },
    { name: "大苑子", icon: "🧋", visits: 6, total: 450, avg: 75 },
  ],
  eatingTotal: 14370,
  eatingVisits: 35,
  eatingPct: 38,
  eatingPctPrev: 25,
  coffeeTotal: 1950,
  coffeeVisits: 18,
  coffeePct: 5,
  coffeePctPrev: 2,
  eatDrinkPct: 41,
  eatDrinkPctPrev: 27,
  deliveryTotal: 6930,
  deliveryVisits: 21,
  eatingTrend: [9800, 11200, 12600, 13100, 13800, 14370],
  coffeeTrend: [680, 820, 1100, 1350, 1620, 1950],
  months: ["9月", "10月", "11月", "12月", "1月", "2月"],
};

const iconsForShop = [
  [/ubereats/i, "🛵"],
  [/foodpanda/i, "🐼"],
  [/7-11|統一超商/i, "🏪"],
  [/全家/i, "🏬"],
  [/全聯/i, "🛒"],
  [/麥當勞/i, "🍔"],
  [/路易莎|louisa/i, "☕"],
  [/星巴克/i, "☕"],
  [/大苑子|清心|可不可|茶湯會|50嵐/i, "🧋"],
  [/apple/i, "📱"],
  [/全國電子/i, "💻"],
];

function iconForShop(name = "") {
  const found = iconsForShop.find(([re]) => re.test(name));
  return found?.[1] || "🧾";
}

function summarizeUserData(data) {
  if (!data?.invoices?.length) return FALLBACK_USER;

  const invoices = data.invoices
    .filter((inv) => inv && typeof inv.amount === "number" && inv.shop)
    .map((inv) => ({ ...inv, amount: Number(inv.amount) || 0 }));

  if (!invoices.length) return FALLBACK_USER;

  const byShop = new Map();
  const monthMap = new Map();
  let totalAmount = 0;
  let deliveryTotal = 0;
  let deliveryVisits = 0;
  let coffeeTotal = 0;
  let coffeeVisits = 0;
  let eatingTotal = 0;
  let eatingVisits = 0;

  const eatingRe = /ubereats|foodpanda|麥當勞|餐飲|便當|早餐|午餐|晚餐|牛肉麵|拉麵|壽司|便當|滷味|火鍋|漢堡|肯德基|摩斯|路易莎|星巴克|咖啡|飲料|大苑子|清心|可不可|茶湯會|50嵐/i;
  const coffeeRe = /路易莎|星巴克|咖啡|大苑子|清心|可不可|茶湯會|50嵐|飲料/i;
  const deliveryRe = /ubereats|foodpanda/i;

  invoices.forEach((inv) => {
    totalAmount += inv.amount;
    const shop = inv.shop;
    const current = byShop.get(shop) || { name: shop, icon: iconForShop(shop), visits: 0, total: 0, avg: 0 };
    current.visits += 1;
    current.total += inv.amount;
    current.avg = current.total / current.visits;
    byShop.set(shop, current);

    const ym = inv.yearMonth || (inv.issuedDate ? inv.issuedDate.slice(0, 7) : null);
    if (ym) monthMap.set(ym, (monthMap.get(ym) || 0) + inv.amount);

    if (deliveryRe.test(shop)) {
      deliveryTotal += inv.amount;
      deliveryVisits += 1;
    }
    if (coffeeRe.test(shop)) {
      coffeeTotal += inv.amount;
      coffeeVisits += 1;
    }
    if (eatingRe.test(shop)) {
      eatingTotal += inv.amount;
      eatingVisits += 1;
    }
  });

  const shops = Array.from(byShop.values()).sort((a, b) => b.visits - a.visits || b.total - a.total);
  const monthlyTrend = (data.monthlyTrend || [])
    .map((m) => ({ month: m.month, amount: Number(m.amount) || 0 }))
    .filter((m) => m.month);

  const derivedMonths = monthlyTrend.length
    ? monthlyTrend.map((m) => m.month)
    : Array.from(monthMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6)
        .map(([ym]) => `${Number(ym.split("-")[1])}月`);

  const derivedSpendingTrend = monthlyTrend.length
    ? monthlyTrend.map((m) => m.amount)
    : Array.from(monthMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6)
        .map(([, amount]) => amount);

  const totalVisits = invoices.length;
  const eatingPct = totalAmount ? Math.round((eatingTotal / totalAmount) * 100) : 0;
  const coffeePct = totalAmount ? Math.round((coffeeTotal / totalAmount) * 100) : 0;
  const eatDrinkPct = totalAmount ? Math.round(((eatingTotal + coffeeTotal) / totalAmount) * 100) : 0;
  const previousSpending = derivedSpendingTrend.slice(0, -1);
  const lastSpending = derivedSpendingTrend[derivedSpendingTrend.length - 1] || totalAmount;
  const firstSpending = previousSpending[0] || lastSpending;
  const spendingGrowthPct = firstSpending ? Math.round(((lastSpending - firstSpending) / firstSpending) * 100) : 0;

  return {
    name: data.name || data.userName || data.nickname || "你",
    invoiceCount: Number(data.invoiceCount) || invoices.length,
    totalAmount: Number(data.totalAmount) || totalAmount,
    days: 61,
    shops: shops.slice(0, 7),
    eatingTotal,
    eatingVisits,
    eatingPct,
    eatingPctPrev: Math.max(eatingPct - 10, 0),
    coffeeTotal,
    coffeeVisits,
    coffeePct,
    coffeePctPrev: Math.max(coffeePct - 3, 0),
    eatDrinkPct,
    eatDrinkPctPrev: Math.max(eatDrinkPct - 12, 0),
    deliveryTotal,
    deliveryVisits,
    eatingTrend: derivedSpendingTrend.length ? derivedSpendingTrend : FALLBACK_USER.eatingTrend,
    coffeeTrend: derivedSpendingTrend.length
      ? derivedSpendingTrend.map((v, idx) => Math.round(v * (0.04 + idx * 0.005)))
      : FALLBACK_USER.coffeeTrend,
    months: derivedMonths.length ? derivedMonths : FALLBACK_USER.months,
    spendingGrowthPct,
    monthlyTrend,
    rawInvoices: invoices,
    totalVisits,
  };
}

function buildButlerContent(U) {
  const topShop = U.shops[0] || FALLBACK_USER.shops[0];
  const secondShop = U.shops[1] || FALLBACK_USER.shops[1];
  const thirdShop = U.shops[2] || FALLBACK_USER.shops[2];
  const fourthShop = U.shops[3] || FALLBACK_USER.shops[3];
  const delivFreq = U.deliveryVisits > 0 ? (U.days / U.deliveryVisits).toFixed(1) : "—";
  const coffeeGrowth = U.coffeeTrend[0] ? Math.round(((U.coffeeTrend.at(-1) - U.coffeeTrend[0]) / U.coffeeTrend[0]) * 100) : 0;
  const yearDelivery = Math.round(U.deliveryTotal * 6);
  const monthlyAvg = Math.round(U.totalAmount / 2);
  const projectedYear = Math.round(monthlyAvg * 12 * 1.15);
  const iphonePrice = 44900;

  return {
    opens: [
      { text: `${U.name}，我看完了你 ${fmt(U.invoiceCount)} 張發票。`, delay: 300 },
      { text: "想跟你聊聊我觀察到的事。", delay: 1000, dim: true },
      {
        text:
          U.deliveryVisits > 0
            ? `你跟 ${topShop.name} 的關係很穩定——平均每 ${delivFreq} 天就會出現一次。這是你目前最常回去的消費。`
            : `你最近的消費很集中——${topShop.name}、${secondShop.name}、${thirdShop.name} 反覆出現，生活節奏其實滿固定。`,
        delay: 1800,
        hook: true,
      },
    ],
    hooks: [
      {
        id: "depend",
        q: "我最離不開什麼？",
        big: U.deliveryVisits > 0 ? `每 ${delivFreq} 天` : `${topShop.visits} 次`,
        bigSub: U.deliveryVisits > 0 ? "你最常回去的一種消費節奏" : "近兩個月最常出現的店家次數",
        body:
          U.deliveryVisits > 0
            ? `這兩個月你在 ${topShop.name} 有 ${fmt(topShop.visits)} 次消費，平均每次 ${currency(topShop.avg)}，累積 ${currency(topShop.total)}。\n\n但你最離不開的不只這一家。`
            : `這兩個月你最常回去的是 ${topShop.name}，一共 ${fmt(topShop.visits)} 次，總共花了 ${currency(topShop.total)}。\n\n如果把整體節奏攤開看，你的依賴其實是幾個固定通路一起撐起來的。`,
        ranks: [topShop, secondShop, thirdShop, fourthShop].filter(Boolean).map((shop, idx) => ({
          rank: ["🥇", "🥈", "🥉", "⬆️"][idx] || "•",
          name: shop.name,
          freq: `${shop.visits} 次 / 近兩月`,
          note:
            idx === 0
              ? "最穩定出現的通路"
              : idx === 1
              ? "第二常回訪的消費習慣"
              : idx === 2
              ? "你的第三常客"
              : "值得持續觀察的新習慣",
        })),
        tip: `如果只看前 4 個通路，它們就占了你近兩個月多數的高頻消費。你的生活節奏不是亂花，而是相當固定。`,
        followups: [
          {
            q: `我對 ${topShop.name} 的依賴在變強嗎？`,
            a: `目前看起來比較像穩定，而不是突然暴增。\n\n重點不是次數暴衝，而是它持續穩定出現，代表它已經變成你生活流程的一部分。若接下來連續幾期都維持高頻，才比較像依賴進一步加深。`,
          },
          {
            q: "除了第一名，還有什麼正在變成習慣？",
            a: `${secondShop.name} 和 ${thirdShop.name} 都很值得注意。\n\n${secondShop.name} 代表你穩定回訪的日常補給，${thirdShop.name} 則比較像固定插入的生活節奏。這種組合通常比單一大額消費更能代表一個人的日常。`,
          },
        ],
      },
      {
        id: "future",
        q: "如果繼續這樣，一年後會怎樣？",
        big: currency(projectedYear),
        bigSub: "照目前節奏推估的一年消費規模",
        body: `你的消費有幾個明確的趨勢正在發生：\n\n📈 吃喝佔比目前約 ${U.eatDrinkPct}%\n☕ 飲料 / 咖啡近月趨勢約成長 ${coffeeGrowth}%\n📊 近兩月總花費 ${currency(U.totalAmount)}\n\n如果這些節奏不變，一年後大概會落在這個量級。`,
        projection: [
          { label: "外食 / 外送", now: currency(Math.round(U.eatingTotal / 2)), future: currency(Math.round(U.eatingTotal / 2 * 1.32)), change: "+32%" },
          { label: "咖啡 / 飲料", now: currency(Math.round(U.coffeeTotal / 2)), future: currency(Math.round(U.coffeeTotal / 2 * 1.46)), change: "+46%" },
          { label: "吃喝佔比", now: `${U.eatDrinkPct}%`, future: `~${Math.min(U.eatDrinkPct + 7, 60)}%`, change: `+${Math.min(7, 60 - U.eatDrinkPct)}%` },
        ],
        tip: `最需要注意的通常不是單次大額，而是會反覆出現的小額高頻支出。它們加總起來，比想像中有存在感。`,
        followups: [
          {
            q: `一年的 ${topShop.name} 花費換算成什麼？`,
            a: `${topShop.name} 如果照目前節奏維持，一年大約是 ${currency(yearDelivery)}。\n\n換成你比較有感的東西：\n📱 約 ${Math.round((yearDelivery / iphonePrice) * 10) / 10} 支 iPhone 16 Pro\n✈️ 約 ${Math.round((yearDelivery / 8000) * 10) / 10} 趟東京來回\n🎧 約 ${Math.round((yearDelivery / 7990) * 10) / 10} 副 AirPods Pro\n\n重點不是叫你別花，而是讓這個數字變得有感。`,
          },
          {
            q: "如果我每週少一次，差多少？",
            a: `如果把一個固定高頻消費每週少一次，通常一個月就能省下一筆有感的小額預算，一年拉長後差距會更明顯。\n\n這種調整不需要很極端，只要把最固定的那種消費往下拉一點，全年差額就會慢慢浮出來。`,
          },
        ],
      },
      {
        id: "rhythm",
        q: "我的消費節奏是什麼？",
        big: `${U.shops.length} 個通路`,
        bigSub: "構成你日常生活的主要消費版圖",
        body: `從你的發票看，消費並不是散的。\n\n你大部分時間都在幾個固定通路之間循環：${[topShop.name, secondShop.name, thirdShop.name, fourthShop.name].filter(Boolean).join("、")}。\n\n這代表你的日常其實很規律，而不是隨機亂買。`,
        tip: `當通路越集中，AI 越有機會做出真正個人化的建議，因為你的生活模式夠穩定。`,
        followups: [
          {
            q: "我最常在什麼時候花錢？",
            a: `目前這版 prototype 主要看的是通路節奏，不硬判斷你的精確時間帶。之後如果把日期與時段資料補齊，就可以再往「平日 / 週末」、「月初 / 月中 / 月底」拆。`,
          },
          {
            q: "有沒有什麼隱藏規律？",
            a: `有一個明顯規律：你會反覆回到同幾個通路。這種規律本身就是訊號，因為它代表未來不是只做分類而已，還可以推估提醒、比較替代方案，甚至幫你決定哪些地方值得先優化。`,
          },
        ],
      },
      {
        id: "change",
        q: "我跟之前有什麼不同？",
        big: `${U.spendingGrowthPct >= 0 ? "+" : ""}${U.spendingGrowthPct}%`,
        bigSub: "近月整體消費趨勢變化",
        body: `如果把最近幾期拉開來看，你不是完全一樣的消費者。\n\n近月趨勢最值得看的，是固定高頻消費和吃喝比例的變化。這些變化不一定大到嚇人，但會慢慢改變你整體支出結構。`,
        tip: `真正有意思的不是單筆異常，而是你把更多比例的錢，慢慢往某幾種固定習慣移動。`,
        trend: U.eatingTrend,
        followups: [
          {
            q: "變化最大的是什麼？",
            a: `通常最值得追的是高頻小額類別，尤其是吃喝、咖啡、補給型消費。這些項目不一定單筆大，但一旦頻率上升，整體體感會比你想像中更強。`,
          },
          {
            q: "有什麼以前有、現在沒有了？",
            a: `目前看起來，比較像是在既有習慣上疊加新節奏，而不是完全替換掉舊習慣。也就是說，你的消費版圖更像擴張，而不是搬家。`,
          },
        ],
      },
    ],
    fallback: `根據你最近的發票，我看到的是一個很固定的生活節奏：高頻通路集中、吃喝支出有存在感，而且有幾個習慣正在慢慢變得更穩。\n\n你可以直接點上面的問題，我會用你的資料往下講。`,
  };
}

const styles = {
  page: { minHeight: "100vh", background: "#F6F3EF", color: "#1F1F1F", fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Noto Sans TC', sans-serif" },
  shell: { width: "100%", maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: "linear-gradient(180deg, #F9F6F1 0%, #F4EFE8 100%)", boxShadow: "0 0 0 1px rgba(0,0,0,0.03)" },
  loginWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  loginCard: { background: "rgba(255,255,255,0.9)", backdropFilter: "blur(16px)", borderRadius: 24, padding: 24, width: "100%", boxShadow: "0 20px 50px rgba(80,55,20,0.12)" },
  input: { width: "100%", border: "1px solid #E5DDD2", borderRadius: 16, padding: "14px 16px", fontSize: 16, outline: "none", background: "#fff" },
  primaryBtn: { width: "100%", border: "none", borderRadius: 16, padding: "14px 16px", fontSize: 16, fontWeight: 700, cursor: "pointer", background: "#D8783A", color: "#fff", boxShadow: "0 10px 24px rgba(216,120,58,0.25)" },
  secondaryBtn: { border: "1px solid #E6DCCF", borderRadius: 999, padding: "9px 14px", background: "#fff", cursor: "pointer", fontSize: 13 },
  section: { padding: "18px 18px 0" },
  card: { background: "rgba(255,255,255,0.82)", borderRadius: 20, padding: 16, boxShadow: "0 10px 30px rgba(80,55,20,0.08)", border: "1px solid rgba(255,255,255,0.7)" },
  bubble: { background: "rgba(255,255,255,0.9)", borderRadius: 18, padding: "14px 15px", lineHeight: 1.75, boxShadow: "0 8px 24px rgba(80,55,20,0.06)" },
  hookCard: { borderRadius: 18, border: "1px solid #E9DED0", background: "rgba(255,255,255,0.9)", padding: 14, cursor: "pointer", textAlign: "left" },
};

function Login({ onLogin }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 9) {
      setError("請輸入正確的手機號碼");
      return;
    }
    setLoading(true);
    setError("");
    const result = await fetchUserData(clean);
    setLoading(false);
    if (result.success) {
      onLogin(clean, result.data);
      return;
    }
    setError(result.error || "查無資料");
  }

  return (
    <div style={styles.loginWrap}>
      <div style={styles.loginCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 18, background: "#D8783A", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 24 }}>🤖</div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>AI 管家 Prototype</div>
            <div style={{ fontSize: 13, color: "#7B7268", marginTop: 2 }}>0408_v1 · 用真實發票資料試用</div>
          </div>
        </div>
        <div style={{ fontSize: 14, color: "#5F564D", lineHeight: 1.7, marginBottom: 16 }}>
          輸入內部測試用戶的手機號碼，直接帶入 Realtime Database 中的真實發票資料。
        </div>
        <input
          type="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="09xx-xxx-xxx"
          style={styles.input}
        />
        {error ? <div style={{ color: "#C74418", fontSize: 13, marginTop: 10 }}>{error}</div> : null}
        <div style={{ height: 14 }} />
        <button onClick={submit} disabled={loading} style={{ ...styles.primaryBtn, opacity: loading ? 0.7 : 1 }}>
          {loading ? "讀取中..." : "進入這版 prototype"}
        </button>
        <div style={{ marginTop: 12, fontSize: 12, color: "#8A8279", lineHeight: 1.6 }}>
          這版會優先用真實數據生成洞察；若資料欄位不完整，才會退回示意內容。
        </div>
      </div>
    </div>
  );
}

function OpenSequence({ opens }) {
  const [visible, setVisible] = useState(1);
  useEffect(() => {
    const timers = opens.slice(1).map((line, idx) => setTimeout(() => setVisible(idx + 2), line.delay));
    return () => timers.forEach(clearTimeout);
  }, [opens]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {opens.slice(0, visible).map((line, idx) => (
        <div key={idx} style={{ ...styles.bubble, borderLeft: line.hook ? "4px solid #D8783A" : "4px solid transparent", color: line.dim ? "#7B7268" : "#1F1F1F" }}>
          {line.text}
        </div>
      ))}
    </div>
  );
}

function InsightView({ hook, onBack }) {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <button onClick={onBack} style={{ ...styles.secondaryBtn, width: "fit-content" }}>← 回到問題列表</button>
      <div style={styles.card}>
        <div style={{ fontSize: 13, color: "#8A8279", marginBottom: 8 }}>{hook.q}</div>
        <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.15 }}>{hook.big}</div>
        <div style={{ fontSize: 13, color: "#8A8279", marginTop: 6 }}>{hook.bigSub}</div>
      </div>

      <div style={styles.bubble}>{hook.body.split("\n").map((line, idx) => <div key={idx}>{line || <div style={{ height: 8 }} />}</div>)}</div>

      {hook.ranks?.length ? (
        <div style={{ ...styles.card, display: "grid", gap: 10 }}>
          {hook.ranks.map((row) => (
            <div key={row.name} style={{ display: "grid", gridTemplateColumns: "38px 1fr auto", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 20 }}>{row.rank}</div>
              <div>
                <div style={{ fontWeight: 700 }}>{row.name}</div>
                <div style={{ fontSize: 12, color: "#8A8279", marginTop: 2 }}>{row.note}</div>
              </div>
              <div style={{ fontSize: 12, color: "#5F564D", whiteSpace: "nowrap" }}>{row.freq}</div>
            </div>
          ))}
        </div>
      ) : null}

      {hook.projection?.length ? (
        <div style={{ ...styles.card, display: "grid", gap: 10 }}>
          {hook.projection.map((row) => (
            <div key={row.label} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: 8, alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{row.label}</div>
              <div style={{ fontSize: 12, color: "#6B6259" }}>{row.now}</div>
              <div style={{ fontSize: 12, color: "#6B6259" }}>{row.future}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#C74418" }}>{row.change}</div>
            </div>
          ))}
        </div>
      ) : null}

      {hook.trend?.length ? (
        <div style={{ ...styles.card }}>
          <div style={{ fontSize: 13, color: "#8A8279", marginBottom: 10 }}>近月趨勢</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
            {hook.trend.map((v, idx) => {
              const max = Math.max(...hook.trend, 1);
              return (
                <div key={idx} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                  <div style={{ fontSize: 10, color: "#8A8279" }}>{Math.round(v / 1000)}k</div>
                  <div style={{ width: "100%", background: idx === hook.trend.length - 1 ? "#D8783A" : "#E8DED3", borderRadius: "8px 8px 0 0", height: `${Math.max(14, (v / max) * 80)}px` }} />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div style={{ ...styles.card, background: "#FFF8F2", border: "1px solid #F2D7C0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#B85E25", marginBottom: 6 }}>💡 延伸觀察</div>
        <div style={{ lineHeight: 1.75 }}>{hook.tip}</div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {hook.followups?.map((item) => (
          <button key={item.q} onClick={() => setSelectedAnswer(selectedAnswer === item.q ? null : item.q)} style={{ ...styles.hookCard, background: selectedAnswer === item.q ? "#FFF7EE" : "rgba(255,255,255,0.9)" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{item.q}</div>
            {selectedAnswer === item.q ? <div style={{ fontSize: 13, color: "#5F564D", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{item.a}</div> : <div style={{ fontSize: 12, color: "#8A8279" }}>點開看這題的回答</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

function ButlerApp({ phone, userData, onReset }) {
  const summary = useMemo(() => summarizeUserData(userData), [userData]);
  const content = useMemo(() => buildButlerContent(summary), [summary]);
  const [selectedHookId, setSelectedHookId] = useState(null);
  const selectedHook = content.hooks.find((hook) => hook.id === selectedHookId);

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={{ padding: "18px 18px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#8A8279", marginBottom: 4 }}>AI 管家 · 0408_v1</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Prototype</div>
          </div>
          <button onClick={onReset} style={styles.secondaryBtn}>換一個測試用戶</button>
        </div>

        <div style={styles.section}>
          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: "#8A8279" }}>登入用戶</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{phone}</div>
                <div style={{ fontSize: 12, color: "#8A8279", marginTop: 6 }}>
                  {summary.name} · {fmt(summary.invoiceCount)} 張發票 · {currency(summary.totalAmount)}
                </div>
              </div>
              <div style={{ padding: "10px 12px", borderRadius: 16, background: "#FFF4EA", color: "#B85E25", fontSize: 12, fontWeight: 700 }}>
                真實 RTDB 資料
              </div>
            </div>
          </div>
        </div>

        <div style={styles.section}>
          {!selectedHook ? <OpenSequence opens={content.opens} /> : <InsightView hook={selectedHook} onBack={() => setSelectedHookId(null)} />}
        </div>

        {!selectedHook ? (
          <div style={styles.section}>
            <div style={{ fontSize: 13, color: "#8A8279", marginBottom: 10 }}>試著從這些問題開始</div>
            <div style={{ display: "grid", gap: 10 }}>
              {content.hooks.map((hook) => (
                <button key={hook.id} onClick={() => setSelectedHookId(hook.id)} style={styles.hookCard}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>{hook.q}</div>
                  <div style={{ fontSize: 13, color: "#6B6259", lineHeight: 1.6 }}>{hook.bigSub}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!selectedHook ? (
          <div style={styles.section}>
            <div style={{ ...styles.card, background: "#F9F5EF" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>自由輸入的預設回覆</div>
              <div style={{ fontSize: 13, color: "#5F564D", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{content.fallback}</div>
            </div>
          </div>
        ) : null}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

export default function AiButler0408v1() {
  const [user, setUser] = useState(null);

  if (!user) {
    return <Login onLogin={(phone, data) => setUser({ phone, data })} />;
  }

  return <ButlerApp phone={user.phone} userData={user.data} onReset={() => setUser(null)} />;
}
