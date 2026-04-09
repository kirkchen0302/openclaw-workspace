import { useState, useEffect, useMemo, useCallback } from "react";

const fmt = (n) => n.toLocaleString();

const USER = {
  name: "Kirk",
  period: "114年 11-12月",
  periodInvoices: 132,
  periodAmount: 75737,
  prevPeriodAmount: 114100,
  daysToLottery: 3,
  shopStats: [
    { shop: "UberEats", icon: "🛵", visits: 21, total: 6930, avg: 330, cat: "外送" },
    { shop: "麥當勞", icon: "🍔", visits: 14, total: 3220, avg: 230, cat: "外食" },
    { shop: "7-11", icon: "🏪", visits: 18, total: 2847, avg: 158, cat: "超商" },
    { shop: "全聯", icon: "🛒", visits: 7, total: 3430, avg: 490, cat: "超市" },
    { shop: "路易莎", icon: "☕", visits: 12, total: 1500, avg: 125, cat: "咖啡" },
    { shop: "全家", icon: "🏬", visits: 9, total: 1260, avg: 140, cat: "超商" },
    { shop: "大苑子", icon: "🧋", visits: 6, total: 450, avg: 75, cat: "飲料" },
  ],
  catTrends: {
    "外食/外送": [9800, 11200, 12600, 13100, 13800, 14370],
    "咖啡/飲料": [680, 820, 1100, 1350, 1620, 1950],
    "超商": [3800, 3600, 4200, 3900, 4400, 4107],
  },
  trendMonths: ["9月", "10月", "11月", "12月", "1月", "2月"],
  recentInvoices: [
    { time: "2小時前", shop: "7-11 新北中和店", amt: 89, icon: "🏪" },
    { time: "昨天", shop: "UberEats 台灣", amt: 285, icon: "🛵" },
    { time: "昨天", shop: "路易莎 板橋店", amt: 125, icon: "☕" },
    { time: "2天前", shop: "全聯 中和店", amt: 467, icon: "🛒" },
    { time: "3天前", shop: "麥當勞 板橋車站", amt: 189, icon: "🍔" },
  ],
  peer: { group: "25-34歲·雙北·上班族", avgPeriod: 84000, eatingOutPct: 25 },
  subs: [
    { name: "UberEats+", fee: 178, saved: 98, status: "danger" },
    { name: "foodpanda Pro", fee: 149, saved: 225, status: "good" },
  ],
  bills: [{ name: "台電電費", icon: "⚡", days: 2, amt: 1240, status: "urgent" }],
  monthlyTrend: [
    { m: "9月", amt: 52300 },
    { m: "10月", amt: 48700 },
    { m: "11月", amt: 55200 },
    { m: "12月", amt: 61400 },
    { m: "1月", amt: 65890 },
    { m: "2月", amt: 75737 },
  ],
};

const INVOICES = [
  { day: "28", wk: "週六", shop: "統一超商新北市第一四六二分公司", type: "載具", amt: 211, code: "WS-35424532" },
  { day: "28", wk: "週六", shop: "何發菊", type: "載具", amt: 415, code: "XL-10590583" },
  { day: "27", wk: "週五", shop: "統一超商新北市第一一四九分公司", type: "載具", amt: 49, code: "WQ-33144486" },
  { day: "27", wk: "週五", shop: "唯達餐飲有限公司", type: "載具", amt: 720, code: "XD-57715765" },
  { day: "27", wk: "週五", shop: "Nintendo Co., Ltd.", type: "載具", amt: 720, code: "VZ-20375644" },
  { day: "26", wk: "週四", shop: "明菓薯股份有限公司", type: "載具", amt: 140, code: "XK-22943815" },
  { day: "25", wk: "週三", shop: "旭騰餐飲有限公司", type: "載具", amt: 250, code: "XK-36504750" },
  { day: "24", wk: "週二", shop: "Apple", type: "載具", amt: 90, code: "AP-00112233" },
  { day: "23", wk: "週一", shop: "麥當勞", type: "載具", amt: 189, code: "MD-55667788" },
];

const S = {
  root: {
    width: 375, minHeight: "100vh", background: "#F2F2F7",
    fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','PingFang TC',sans-serif",
    position: "relative", margin: "0 auto", display: "flex", flexDirection: "column",
  },
  screen: { flex: 1, overflowY: "auto", paddingBottom: 140 },
  tabBar: {
    position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 375,
    background: "rgba(249,249,249,0.94)", backdropFilter: "blur(20px)",
    borderTop: "0.5px solid #C6C6C8", display: "flex", alignItems: "flex-end",
    justifyContent: "space-around", zIndex: 100, paddingBottom: 4, paddingTop: 4,
  },
};

const TABS = [
  { key: "invoices", label: "我的發票", d: "M4 4h16v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4z" },
  { key: "points", label: "集點兌禮", d: "M20 7h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM10 4h4v3h-4V4z" },
  { key: "scan", label: "掃描對獎", d: "M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M19 5h-6v6h6V5z" },
  { key: "carrier", label: "載具管理", d: "M2 6h4v1H2zm0 3h4v1H2zm0 3h4v1H2zm6-6h4v1H8zm0 3h4v1H8zm0 3h4v1H8zm6-6h4v1h-4zm0 3h4v1h-4zm0 3h4v1h-4zM4 17h16v2H4z" },
  { key: "home", label: "首頁", d: "M12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z" },
  { key: "ai", label: "AI 管家" },
];

function TabBar({ tab, setTab }) {
  return (
    <div style={S.tabBar}>
      {TABS.map((t) => {
        const active = tab === t.key;
        const isAI = t.key === "ai";
        return (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
              cursor: "pointer", border: "none", background: "transparent",
              padding: "4px 0 2px", minWidth: 52,
            }}
          >
            {isAI ? (
              <div style={{
                width: 24, height: 24, borderRadius: 7,
                background: active ? "linear-gradient(135deg,#5B7FFF,#8B5CF6)" : "transparent",
                border: active ? "none" : "1.5px solid #8E8E93",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, color: active ? "#fff" : "#8E8E93",
              }}>
                ✦
              </div>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "#007AFF" : "#8E8E93"}>
                <path d={t.d} />
              </svg>
            )}
            <span style={{ fontSize: 10, color: active ? "#007AFF" : "#8E8E93", fontWeight: active ? 600 : 400 }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MiniBar({ values, months, color, height = 56 }) {
  const max = Math.max(...values);
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height }}>
      {values.map((v, i) => {
        const h = Math.max((v / max) * (height - 16), 4);
        const isLast = i === values.length - 1;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ fontSize: 10, fontWeight: isLast ? 700 : 400, color: isLast ? color : "#AEAEB2" }}>
              {v >= 1000 ? (v / 1000).toFixed(1) + "k" : "$" + v}
            </div>
            <div style={{ width: "100%", height: h, borderRadius: "3px 3px 0 0", background: isLast ? color : "#E0E0E0" }} />
            <div style={{ fontSize: 9, color: "#8E8E93" }}>{months[i]}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── AI 管家頁 ─────────────────────────────────────────────────────────────
function AIAgentPage() {
  const [expandedId, setExpandedId] = useState(null);
  const [showPeer, setShowPeer] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [dispText, setDispText] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setReveal(true), 200);
    return () => clearTimeout(t);
  }, []);

  const toggle = (id) => setExpandedId((p) => (p === id ? null : id));

  const d = USER;
  const eT = d.catTrends["外食/外送"];
  const cT = d.catTrends["咖啡/飲料"];
  const eatOut = d.shopStats.filter((x) => x.cat === "外送" || x.cat === "外食");
  const eatOutTotal = eatOut.reduce((s, x) => s + x.total, 0);
  const eatOutVisits = eatOut.reduce((s, x) => s + x.visits, 0);
  const conv = d.shopStats.filter((x) => x.cat === "超商");
  const convVisits = conv.reduce((s, x) => s + x.visits, 0);
  const convTotal = conv.reduce((s, x) => s + x.total, 0);
  const convWeekly = Math.round(convVisits / 8);
  const coffee = d.shopStats.find((x) => x.shop === "路易莎");
  const eatingGrowth = Math.round(((eT[5] - eT[0]) / eT[0]) * 100);
  const coffeeGrowth = Math.round(((cT[5] - cT[0]) / cT[0]) * 100);
  const monthDiff = d.periodAmount - d.prevPeriodAmount;
  const monthDiffPct = Math.round((monthDiff / d.prevPeriodAmount) * 100);

  const insights = useMemo(() => {
    const items = [];

    items.push({
      id: "diary", emoji: "📔", tag: "本期消費日誌", tagBg: "#F0F5FF", tagColor: "#007AFF",
      headline: "這一期你外食了 " + eatOutVisits + " 次，花了 $" + fmt(eatOutTotal),
      subline: "共 " + d.periodInvoices + " 張發票 · 去了 " + d.shopStats.length + " 個不同通路",
      hasExpand: true,
    });

    items.push({
      id: "trend", emoji: "📈", tag: "你的趨勢變化",
      tagBg: eatingGrowth > 20 ? "#FFF0F0" : "#F0FFF4",
      tagColor: eatingGrowth > 20 ? "#E8453C" : "#34C759",
      headline: "外食花費半年內增加了 " + eatingGrowth + "%",
      subline: "從 $" + fmt(eT[0]) + "/月 → $" + fmt(eT[5]) + "/月",
      hasExpand: true,
    });

    if (convWeekly >= 3) {
      items.push({
        id: "save", emoji: "💡", tag: "高頻消費觀察", tagBg: "#F0FFF4", tagColor: "#34C759",
        headline: "你每週去超商約 " + convWeekly + " 次",
        subline: "本期超商累計 $" + fmt(convTotal) + "，部分品項轉超市可省約 30%",
        hasExpand: true,
      });
    }

    if (coffee && coffee.visits >= 8) {
      items.push({
        id: "habit", emoji: "☕", tag: "消費習慣", tagBg: "#F5F0FF", tagColor: "#AF52DE",
        headline: "路易莎是你的固定班底 — 每 " + Math.round(60 / coffee.visits) + " 天一杯",
        subline: "本期 " + coffee.visits + " 次 · $" + fmt(coffee.total) + " · 均 $" + coffee.avg + "/杯",
        hasExpand: true,
      });
    }

    const trend = d.monthlyTrend;
    const last3 = trend.slice(-3);
    const avgGr = Math.round(((last3[2].amt - last3[0].amt) / last3[0].amt) * 100 / 2);
    const predicted = Math.round(trend[5].amt * (1 + avgGr / 100));
    items.push({
      id: "predict", emoji: "🔮", tag: "下月預估", tagBg: "#FFF8E1", tagColor: "#FF9500",
      headline: "照目前趨勢，3 月預估花 $" + fmt(predicted),
      subline: "近 3 個月平均月增 " + avgGr + "%",
      hasExpand: true, predicted,
    });

    const bad = d.subs.find((s) => s.status === "danger");
    if (bad) {
      items.push({
        id: "sub", emoji: "📱", tag: "訂閱提醒", tagBg: "#FFF0F0", tagColor: "#E8453C",
        headline: bad.name + " 本月虧 $" + (bad.fee - bad.saved),
        subline: "月費 $" + bad.fee + "，只省了 $" + bad.saved,
        hasExpand: false,
      });
    }

    const bill = d.bills.find((b) => b.status === "urgent");
    if (bill) {
      items.push({
        id: "bill", emoji: bill.icon, tag: "帳單到期", tagBg: "#FFF8E1", tagColor: "#FF9500",
        headline: bill.name + "約 " + bill.days + " 天後到期",
        subline: "預估 $" + fmt(bill.amt),
        hasExpand: false,
      });
    }

    return items;
  }, []);

  const [actionDone, setActionDone] = useState({});
  const [activeSheet, setActiveSheet] = useState(null); // budget, track, list, achieve
  const [budgets, setBudgets] = useState([]);
  const [shoppingList, setShoppingList] = useState([
    { id: 1, text: "罐裝咖啡（全聯）", done: false },
    { id: 2, text: "瓶裝飲料（全聯）", done: false },
    { id: 3, text: "零食餅乾（全聯）", done: false },
  ]);
  const [budgetDraft, setBudgetDraft] = useState({ cat: "", amount: "", period: "本期" });
  const [newListItem, setNewListItem] = useState("");

  const markDone = (key) => setActionDone((p) => ({ ...p, [key]: true }));

  // Budget presets for each insight
  const budgetPresets = {
    "diary-budget": { cat: "總消費", amount: "70000", icon: "🎯" },
    "trend-alert": { cat: "外食/外送", amount: "12000", icon: "🍽️" },
    "trend-reduce": { cat: "外食/外送", amount: "10000", icon: "📉" },
    "habit-budget": { cat: "咖啡/飲料", amount: "1200", icon: "☕" },
    "predict-cap": { cat: "總消費", amount: "65000", icon: "🚧" },
    "predict-alert": { cat: "總消費", amount: "70000", icon: "🔔" },
  };

  function openBudgetSheet(actionKey) {
    const preset = budgetPresets[actionKey] || { cat: "總消費", amount: "50000", icon: "🎯" };
    setBudgetDraft({ cat: preset.cat, amount: preset.amount, period: "本期", icon: preset.icon, actionKey });
    setActiveSheet("budget");
  }

  function saveBudget() {
    const amt = parseInt(budgetDraft.amount) || 0;
    if (amt <= 0) return;
    const spent = budgetDraft.cat === "總消費" ? d.periodAmount
      : budgetDraft.cat === "外食/外送" ? eatOutTotal
      : budgetDraft.cat === "咖啡/飲料" ? (d.shopStats.filter((x) => x.cat === "咖啡" || x.cat === "飲料").reduce((s, x) => s + x.total, 0))
      : 0;
    const newBudget = {
      id: Date.now(),
      cat: budgetDraft.cat,
      icon: budgetDraft.icon || "🎯",
      target: amt,
      spent: spent,
      period: budgetDraft.period,
    };
    setBudgets((p) => [...p.filter((b) => b.cat !== budgetDraft.cat), newBudget]);
    if (budgetDraft.actionKey) markDone(budgetDraft.actionKey);
    setActiveSheet("track");
  }

  function ActionBtn({ label, icon, color, actionKey, primary, onPress }) {
    const done = actionDone[actionKey];
    const isBudget = actionKey && budgetPresets[actionKey];
    const hasBudget = isBudget && budgets.some((b) => b.cat === (budgetPresets[actionKey]?.cat));
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onPress) { onPress(); return; }
          if (hasBudget) { setActiveSheet("track"); return; }
          if (isBudget) { openBudgetSheet(actionKey); return; }
          if (actionKey === "save-list") { setActiveSheet("list"); return; }
          if (actionKey === "sub-pause" || actionKey === "bill-pay") { markDone(actionKey); return; }
          markDone(actionKey);
        }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "9px 12px", borderRadius: 10, cursor: "pointer",
          fontSize: 13, fontWeight: 600, flex: 1,
          border: (done || hasBudget) ? "1.5px solid #34C759" : primary ? "none" : "1px solid #E5E5EA",
          background: (done || hasBudget) ? "#E8F5E9" : primary ? color : "#fff",
          color: (done || hasBudget) ? "#34C759" : primary ? "#fff" : "#3C3C43",
          transition: "all 0.2s",
        }}
      >
        <span>{(done || hasBudget) ? "📊" : icon}</span>
        <span>{hasBudget ? "查看追蹤" : done ? "已設定" : label}</span>
      </button>
    );
  }

  // ── Sheet: Budget Setting ─────────────────────────────────────────
  function BudgetSheet() {
    const amounts = budgetDraft.cat === "總消費"
      ? ["50000", "60000", "70000", "80000"]
      : budgetDraft.cat === "外食/外送"
      ? ["8000", "10000", "12000", "15000"]
      : ["800", "1000", "1200", "1500"];

    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        onClick={() => setActiveSheet(null)}>
        <div onClick={(e) => e.stopPropagation()}
          style={{ width: 375, background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", maxHeight: "80vh", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: "#E0E0E0" }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
            {budgetDraft.icon} 設定{budgetDraft.cat}預算
          </div>
          <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 20 }}>
            AI 會在接近預算時提醒你，幫你控制花費
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, color: "#8E8E93", marginBottom: 8 }}>預算期間</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {["本期", "下一期", "每期"].map((p) => (
              <button key={p} onClick={() => setBudgetDraft((d) => ({ ...d, period: p }))}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600,
                  border: budgetDraft.period === p ? "2px solid #007AFF" : "1px solid #E5E5EA",
                  background: budgetDraft.period === p ? "#F0F5FF" : "#fff",
                  color: budgetDraft.period === p ? "#007AFF" : "#8E8E93",
                }}>
                {p}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, color: "#8E8E93", marginBottom: 8 }}>預算金額</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {amounts.map((a) => (
              <button key={a} onClick={() => setBudgetDraft((d) => ({ ...d, amount: a }))}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600,
                  border: budgetDraft.amount === a ? "2px solid #007AFF" : "1px solid #E5E5EA",
                  background: budgetDraft.amount === a ? "#F0F5FF" : "#fff",
                  color: budgetDraft.amount === a ? "#007AFF" : "#8E8E93",
                }}>
                ${fmt(parseInt(a))}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <span style={{ fontSize: 13, color: "#8E8E93" }}>或自訂：</span>
            <input
              value={budgetDraft.amount}
              onChange={(e) => setBudgetDraft((d) => ({ ...d, amount: e.target.value.replace(/\D/g, "") }))}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid #E5E5EA", fontSize: 16, fontWeight: 600, outline: "none", textAlign: "center" }}
              placeholder="輸入金額"
            />
          </div>

          {budgetDraft.amount && parseInt(budgetDraft.amount) > 0 && (
            <div style={{ background: "#F8F8FA", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 4 }}>預覽</div>
              <div style={{ fontSize: 14, color: "#1C1C1E", lineHeight: 1.6 }}>
                {budgetDraft.cat === "總消費"
                  ? "本期已花 $" + fmt(d.periodAmount) + "，預算 $" + fmt(parseInt(budgetDraft.amount)) + (d.periodAmount > parseInt(budgetDraft.amount) ? " — 已超出！" : " — 還有 $" + fmt(parseInt(budgetDraft.amount) - d.periodAmount) + " 額度")
                  : budgetDraft.cat === "外食/外送"
                  ? "本期外食已花 $" + fmt(eatOutTotal) + "，預算 $" + fmt(parseInt(budgetDraft.amount))
                  : "本期咖啡已花 $" + fmt(d.shopStats.filter((x) => x.cat === "咖啡" || x.cat === "飲料").reduce((s, x) => s + x.total, 0)) + "，預算 $" + fmt(parseInt(budgetDraft.amount))
                }
              </div>
            </div>
          )}

          <button onClick={saveBudget}
            style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "#007AFF", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
            確認設定
          </button>
        </div>
      </div>
    );
  }

  // ── Sheet: Budget Tracking ────────────────────────────────────────
  function TrackSheet() {
    const activeBudgets = budgets.length > 0 ? budgets : [
      { id: 0, cat: "總消費", icon: "🎯", target: 70000, spent: d.periodAmount, period: "本期" },
    ];

    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        onClick={() => setActiveSheet(null)}>
        <div onClick={(e) => e.stopPropagation()}
          style={{ width: 375, background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", maxHeight: "85vh", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: "#E0E0E0" }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>📊 預算追蹤</div>
          <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 20 }}>AI 幫你即時追蹤花費進度</div>

          {activeBudgets.map((b) => {
            const pct = Math.min(Math.round((b.spent / b.target) * 100), 100);
            const over = b.spent > b.target;
            const remaining = b.target - b.spent;
            const barColor = over ? "#E8453C" : pct > 80 ? "#FF9500" : "#34C759";
            const daysLeft = d.daysToLottery;

            return (
              <div key={b.id} style={{ background: "#F8F8FA", borderRadius: 14, padding: "16px", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{b.icon}</span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{b.cat}</div>
                      <div style={{ fontSize: 12, color: "#8E8E93" }}>{b.period}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: over ? "#E8453C" : "#1C1C1E" }}>
                      ${fmt(b.spent)}
                    </div>
                    <div style={{ fontSize: 12, color: "#8E8E93" }}>/ ${fmt(b.target)}</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ height: 8, borderRadius: 4, background: "#E5E5EA", overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ height: "100%", borderRadius: 4, background: barColor, width: pct + "%", transition: "width 0.6s ease" }} />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: barColor }}>
                    {over ? "已超出 $" + fmt(Math.abs(remaining)) : pct + "% 已使用"}
                  </span>
                  <span style={{ fontSize: 12, color: "#8E8E93" }}>
                    {over ? "" : "剩餘 $" + fmt(remaining)}
                  </span>
                </div>

                {!over && remaining > 0 && (
                  <div style={{ marginTop: 10, padding: "8px 10px", background: "#fff", borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: "#636366", lineHeight: 1.5 }}>
                      🤖 開獎前還剩 {daysLeft} 天，平均每天可花 ${fmt(Math.round(remaining / Math.max(daysLeft, 1)))}。
                      {pct < 50 && " 目前控制得很好！"}
                      {pct >= 80 && pct < 100 && " 快到預算上限了，注意控制喔。"}
                    </div>
                  </div>
                )}

                {over && (
                  <div style={{ marginTop: 10, padding: "8px 10px", background: "#FFF5F5", borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: "#E8453C", lineHeight: 1.5 }}>
                      ⚠️ 已超出預算。不過其中有全國電子 $45,799 大額消費，扣除後日常支出 $30,000 尚在控制中。
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Achievement preview */}
          <div style={{ background: "linear-gradient(135deg, #FFF8E1, #FFFDE7)", borderRadius: 14, padding: "16px", marginBottom: 12, border: "1px solid #FFE082" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 24 }}>🏆</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#F57F17" }}>達標獎勵</div>
                <div style={{ fontSize: 12, color: "#8E8E93" }}>預算內完成本期，即可獲得</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "8px", textAlign: "center" }}>
                <div style={{ fontSize: 20 }}>🪙</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>+50 金幣</div>
              </div>
              <div style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "8px", textAlign: "center" }}>
                <div style={{ fontSize: 20 }}>🎖️</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>省錢達人徽章</div>
              </div>
              <div style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "8px", textAlign: "center" }}>
                <div style={{ fontSize: 20 }}>📊</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>專屬報告</div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setActiveSheet("budget")}
              style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid #E5E5EA", background: "#fff", color: "#007AFF", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              + 新增預算
            </button>
            <button onClick={() => setActiveSheet(null)}
              style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: "#007AFF", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              完成
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Sheet: Shopping List ───────────────────────────────────────────
  function ListSheet() {
    const toggleItem = (id) => {
      setShoppingList((p) => p.map((item) => item.id === id ? { ...item, done: !item.done } : item));
    };
    const addItem = () => {
      if (!newListItem.trim()) return;
      setShoppingList((p) => [...p, { id: Date.now(), text: newListItem.trim(), done: false }]);
      setNewListItem("");
    };
    const doneCount = shoppingList.filter((x) => x.done).length;
    const allDone = doneCount === shoppingList.length && shoppingList.length > 0;

    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        onClick={() => { setActiveSheet(null); markDone("save-list"); }}>
        <div onClick={(e) => e.stopPropagation()}
          style={{ width: 375, background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", maxHeight: "80vh", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: "#E0E0E0" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>📝 採購清單</div>
            <span style={{ fontSize: 13, color: "#8E8E93" }}>{doneCount}/{shoppingList.length} 完成</span>
          </div>
          <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 16 }}>
            下次去全聯時，把這些品項順手帶回來
          </div>

          {allDone && (
            <div style={{ background: "linear-gradient(135deg, #E8F5E9, #C8E6C9)", borderRadius: 12, padding: "14px", marginBottom: 12, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>🎉</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#2E7D32" }}>全部買到了！</div>
              <div style={{ fontSize: 13, color: "#4CAF50", marginTop: 2 }}>預估省了 $87，做得好！</div>
            </div>
          )}

          {shoppingList.map((item) => (
            <div key={item.id}
              onClick={() => toggleItem(item.id)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
                borderBottom: "0.5px solid #F0F0F0", cursor: "pointer",
              }}>
              <div style={{
                width: 24, height: 24, borderRadius: 12,
                border: item.done ? "none" : "2px solid #D1D1D6",
                background: item.done ? "#34C759" : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, color: "#fff", transition: "all 0.2s", flexShrink: 0,
              }}>
                {item.done && "✓"}
              </div>
              <span style={{
                fontSize: 15, color: item.done ? "#8E8E93" : "#1C1C1E",
                textDecoration: item.done ? "line-through" : "none",
                transition: "all 0.2s",
              }}>
                {item.text}
              </span>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input
              value={newListItem}
              onChange={(e) => setNewListItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
              placeholder="新增品項..."
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid #E5E5EA", fontSize: 14, outline: "none" }}
            />
            <button onClick={addItem}
              style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#007AFF", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              新增
            </button>
          </div>

          <button onClick={() => { setActiveSheet(null); markDone("save-list"); }}
            style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "#34C759", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 16 }}>
            儲存清單
          </button>
        </div>
      </div>
    );
  }

  function renderExpand(item) {
    if (item.id === "diary") {
      return (
        <div>
          <div style={{ fontSize: 13, color: "#3C3C43", lineHeight: 1.7, marginBottom: 10 }}>
            AI 幫你整理了這一期最常去的地方：
          </div>
          {d.shopStats.slice(0, 5).map((s) => (
            <div key={s.shop} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", borderRadius: 8, padding: "8px 10px", marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.shop}</span>
                <span style={{ fontSize: 12, color: "#8E8E93", marginLeft: 6 }}>{s.visits} 次</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>${fmt(s.total)}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 12, color: "#8E8E93" }}>📝 這只是幫你記錄，花得開心最重要。</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <ActionBtn label="設定本期預算目標" icon="🎯" color="#007AFF" actionKey="diary-budget" primary />
            <ActionBtn label="分享消費紀錄" icon="📤" color="#007AFF" actionKey="diary-share" />
          </div>
        </div>
      );
    }
    if (item.id === "trend") {
      return (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#8E8E93", marginBottom: 8 }}>外食/外送 近 6 個月</div>
          <MiniBar values={eT} months={d.trendMonths} color="#E8453C" height={72} />
          <div style={{ fontSize: 12, fontWeight: 600, color: "#8E8E93", marginTop: 12, marginBottom: 8 }}>
            咖啡/飲料 <span style={{ color: "#AF52DE" }}>(+{coffeeGrowth}%)</span>
          </div>
          <MiniBar values={cT} months={d.trendMonths} color="#AF52DE" />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <ActionBtn label="設定外食預算提醒" icon="🔔" color="#E8453C" actionKey="trend-alert" primary />
            <ActionBtn label="設定減量目標" icon="📉" color="#E8453C" actionKey="trend-reduce" />
          </div>
          <div style={{ marginTop: 14, borderTop: "1px solid #F0F0F0", paddingTop: 10 }}>
            {!showPeer ? (
              <button
                onClick={(e) => { e.stopPropagation(); setShowPeer(true); }}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #D1D1D6", background: "#fff", color: "#007AFF", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
              >
                👥 想看看同類用戶的參考？
              </button>
            ) : (
              <div style={{ background: "#F8F8FA", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#007AFF", marginBottom: 4 }}>
                  👥 同類參考（{d.peer.group}）
                </div>
                <div style={{ fontSize: 13, color: "#3C3C43", lineHeight: 1.6 }}>
                  同類用戶每期消費約 ${fmt(d.peer.avgPeriod)}，外食佔 {d.peer.eatingOutPct}%。
                </div>
                <div style={{ fontSize: 11, color: "#8E8E93", marginTop: 4, fontStyle: "italic" }}>
                  ⚠️ 僅供參考，每人狀況不同。
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
    if (item.id === "save") {
      const priceRows = [
        { i: "罐裝咖啡", c: "$42", s: "$28" },
        { i: "瓶裝飲料", c: "$35", s: "$22" },
        { i: "零食餅乾", c: "$45", s: "$32" },
      ];
      return (
        <div>
          <div style={{ fontSize: 13, color: "#3C3C43", lineHeight: 1.7, marginBottom: 10 }}>
            你在 7-11 和全家的消費頻率很高。重複購買的品項在超市通常便宜不少：
          </div>
          <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ display: "flex", padding: "7px 12px", background: "#F8F8F8", fontSize: 12, fontWeight: 600, color: "#8E8E93" }}>
              <span style={{ flex: 2 }}>品項</span>
              <span style={{ flex: 1, textAlign: "center" }}>超商</span>
              <span style={{ flex: 1, textAlign: "center" }}>超市</span>
            </div>
            {priceRows.map((r, j) => (
              <div key={j} style={{ display: "flex", padding: "8px 12px", borderTop: "0.5px solid #F0F0F0", fontSize: 13 }}>
                <span style={{ flex: 2 }}>{r.i}</span>
                <span style={{ flex: 1, textAlign: "center", color: "#8E8E93" }}>{r.c}</span>
                <span style={{ flex: 1, textAlign: "center", color: "#34C759", fontWeight: 600 }}>{r.s}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#8E8E93", lineHeight: 1.6, marginBottom: 10 }}>
            💡 你已經每週去全聯，把超商的固定品項順手在那買就好。方便優先也完全合理。
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <ActionBtn label="建立採購清單" icon="📝" color="#34C759" actionKey="save-list" primary />
            <ActionBtn label="下次提醒我" icon="⏰" color="#34C759" actionKey="save-remind" />
          </div>
        </div>
      );
    }
    if (item.id === "habit") {
      const last3Coffee = cT.slice(-3);
      return (
        <div>
          <div style={{ fontSize: 13, color: "#3C3C43", lineHeight: 1.7 }}>
            加上大苑子（{d.shopStats.find((x) => x.shop === "大苑子").visits} 次），咖啡飲料花費趨勢：
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {last3Coffee.map((v, i) => (
              <div key={i} style={{ flex: 1, background: "#fff", borderRadius: 8, padding: 8, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#8E8E93" }}>{d.trendMonths[i + 3]}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#AF52DE", marginTop: 2 }}>${fmt(v)}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <ActionBtn label="設定每週咖啡預算" icon="☕" color="#AF52DE" actionKey="habit-budget" primary />
            <ActionBtn label="追蹤這個習慣" icon="📊" color="#AF52DE" actionKey="habit-track" />
          </div>
        </div>
      );
    }
    if (item.id === "predict") {
      const all = [...d.monthlyTrend, { m: "3月(預)", amt: item.predicted, pred: true }];
      const mx = Math.max(...all.map((x) => x.amt));
      return (
        <div>
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 72, marginBottom: 6 }}>
            {all.map((t, i) => {
              const h = Math.max((t.amt / mx) * 56, 4);
              const isLast = i === all.length - 1;
              const isPrev = i === all.length - 2;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{ fontSize: 9, fontWeight: isLast || isPrev ? 700 : 400, color: isLast ? "#FF9500" : isPrev ? "#1C1C1E" : "#AEAEB2" }}>
                    {Math.round(t.amt / 1000)}k
                  </div>
                  <div style={{
                    width: "100%", height: h, borderRadius: "3px 3px 0 0",
                    background: isLast ? "#FF9500" : isPrev ? "#1C1C1E" : "#E0E0E0",
                    opacity: t.pred ? 0.5 : 1,
                    border: t.pred ? "1.5px dashed #FF9500" : "none",
                  }} />
                  <div style={{ fontSize: 8, color: isLast ? "#FF9500" : "#8E8E93" }}>{t.m}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: "#8E8E93", lineHeight: 1.6, marginBottom: 10 }}>
            ⚠️ 2 月有全國電子 $45,799 大額消費。扣除後日常支出約 $30,000，趨勢平穩。預估僅供參考。
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <ActionBtn label="設定月花費上限" icon="🚧" color="#FF9500" actionKey="predict-cap" primary />
            <ActionBtn label="開啟超額提醒" icon="🔔" color="#FF9500" actionKey="predict-alert" />
          </div>
        </div>
      );
    }
    return null;
  }

  const quickQs = ["這期跟上期比", "哪裡花最多？", "怎麼省更多？", "我的消費習慣"];
  const AI_RES = {
    "這期跟上期比": "本期 $" + fmt(d.periodAmount) + " vs 上期 $" + fmt(d.prevPeriodAmount) + "\n\n有一筆全國電子 $45,799 大額消費。扣掉的話日常支出約 $30,000，比上期的日常花費還低。",
    "哪裡花最多？": "本期前五名：\n🛵 UberEats $6,930（21次）\n🛒 全聯 $3,430（7次）\n🍔 麥當勞 $3,220（14次）\n🏪 7-11 $2,847（18次）\n☕ 路易莎 $1,500（12次）",
    "怎麼省更多？": "最容易做到的：\n\n1️⃣ 超商固定品項改在全聯買，同品牌省 30%\n\n2️⃣ 暫停 UberEats+ 訂閱，本月只用 2 次，暫停直接省 $178/月\n\n加起來每月省約 $1,400。",
    "我的消費習慣": "你是「高頻外食 + 日常超商」型：\n\n🍽 外食/外送佔最大宗\n🏪 超商每週去 3-4 次\n☕ 咖啡是固定習慣\n🛒 全聯每週 1 次",
  };

  const sendQ = useCallback((q) => {
    const question = q || input.trim();
    if (!question || typing) return;
    setMessages((p) => [...p, { role: "user", text: question }]);
    setInput("");
    setTyping(true);
    setDispText("");
    const ans = AI_RES[question] || "讓我看看你的發票... 你是「高頻外食型」消費者，想了解哪個面向？";
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDispText(ans.slice(0, i));
      if (i >= ans.length) {
        clearInterval(iv);
        setTyping(false);
        setMessages((p) => [...p, { role: "ai", text: ans }]);
        setDispText("");
      }
    }, 10);
  }, [input, typing]);

  return (
    <div>
      <div style={{ background: "#fff", padding: "14px 16px 12px", borderBottom: "0.5px solid #C6C6C8" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#5B7FFF,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff" }}>✦</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>AI 管家</div>
          </div>
          <div style={{ fontSize: 11, color: "#8E8E93", textAlign: "right" }}>
            <div style={{ fontWeight: 500 }}>{d.period}</div>
            <div>{d.periodInvoices} 張發票</div>
          </div>
        </div>
      </div>

      <div style={{ margin: "10px 16px", borderRadius: 14, background: "linear-gradient(135deg,#1C1C1E,#2C2C2E)", padding: 16, opacity: reveal ? 1 : 0, transition: "all 0.5s" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>開獎倒數</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>
              {d.daysToLottery}
              <span style={{ fontSize: 14, fontWeight: 400, color: "rgba(255,255,255,0.5)" }}> 天</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>本期消費</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>${fmt(d.periodAmount)}</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
          {d.name}，開獎前 AI 幫你整理了本期消費回顧 👇
        </div>
      </div>

      <div style={{ padding: "0 16px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#8E8E93" }}>最近入帳</span>
          <span style={{ fontSize: 12, color: "#007AFF", cursor: "pointer" }}>查看全部 →</span>
        </div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {d.recentInvoices.slice(0, 4).map((inv, i) => (
            <div key={i} style={{ minWidth: 130, background: "#fff", borderRadius: 12, padding: "10px 12px", border: "1px solid #E5E5EA", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{inv.icon}</span>
                <span style={{ fontSize: 11, color: "#8E8E93" }}>{inv.time}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.shop}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>${fmt(inv.amt)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 16px 0" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📊 本期消費回顧</div>
        {insights.map((item, idx) => {
          const isExp = expandedId === item.id;

          if (!item.hasExpand) {
            return (
              <div key={item.id} style={{ background: "#fff", borderRadius: 12, padding: "10px 14px", marginBottom: 8, border: "1px solid " + item.tagColor + "22" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{item.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.headline}</div>
                    <div style={{ fontSize: 12, color: "#8E8E93" }}>{item.subline}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: item.tagBg, color: item.tagColor }}>{item.tag}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {item.id === "sub" && (
                    <ActionBtn label="暫停訂閱" icon="⏸️" color="#E8453C" actionKey="sub-pause" primary />
                  )}
                  {item.id === "sub" && (
                    <ActionBtn label="設定使用提醒" icon="🔔" color="#E8453C" actionKey="sub-remind" />
                  )}
                  {item.id === "bill" && (
                    <ActionBtn label="前往繳費" icon="💳" color="#FF9500" actionKey="bill-pay" primary />
                  )}
                  {item.id === "bill" && (
                    <ActionBtn label="設定繳費提醒" icon="⏰" color="#FF9500" actionKey="bill-remind" />
                  )}
                </div>
              </div>
            );
          }

          return (
            <div key={item.id} style={{ background: "#fff", borderRadius: 14, marginBottom: 10, overflow: "hidden", border: "1px solid #E5E5EA" }}>
              <div onClick={() => toggle(item.id)} style={{ padding: 14, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: item.tagBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                    {item.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: item.tagBg, color: item.tagColor }}>{item.tag}</span>
                    <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, marginTop: 4 }}>{item.headline}</div>
                    <div style={{ fontSize: 13, color: "#8E8E93", marginTop: 2 }}>{item.subline}</div>
                  </div>
                  <span style={{ color: "#C7C7CC", fontSize: 12, marginTop: 4, transition: "transform 0.2s", transform: isExp ? "rotate(180deg)" : "none" }}>▼</span>
                </div>
              </div>
              {isExp && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #F2F2F7" }}>
                  <div style={{ marginTop: 12, background: item.tagBg, borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: item.tagColor, marginBottom: 8 }}>🤖 AI 整理</div>
                    {renderExpand(item)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ height: 8 }} />

      {/* Budget tracking mini card - shows when budgets exist */}
      {budgets.length > 0 && (
        <div style={{ padding: "0 16px 8px" }}>
          <button onClick={() => setActiveSheet("track")}
            style={{ width: "100%", background: "#fff", borderRadius: 12, padding: "12px 14px", border: "1px solid #E5E5EA", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>📊</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>預算追蹤中</div>
              <div style={{ fontSize: 12, color: "#8E8E93" }}>{budgets.length} 個預算目標進行中</div>
            </div>
            <span style={{ color: "#007AFF", fontSize: 13, fontWeight: 600 }}>查看 →</span>
          </button>
        </div>
      )}

      {/* Sheets */}
      {activeSheet === "budget" && <BudgetSheet />}
      {activeSheet === "track" && <TrackSheet />}
      {activeSheet === "list" && <ListSheet />}

      <div style={{ position: "fixed", bottom: 58, left: "50%", transform: "translateX(-50%)", width: 375, zIndex: 99 }}>
        {!chatOpen ? (
          <div style={{ padding: "0 16px 6px" }}>
            <button
              onClick={() => setChatOpen(true)}
              style={{ width: "100%", padding: "12px 16px", borderRadius: 22, border: "none", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.1)", fontSize: 14, color: "#8E8E93", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}
            >
              <span style={{ width: 28, height: 28, borderRadius: 14, background: "linear-gradient(135deg,#5B7FFF,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", flexShrink: 0 }}>✦</span>
              <span style={{ flex: 1 }}>想深入了解？問 AI 管家...</span>
            </button>
          </div>
        ) : (
          <div style={{ margin: "0 8px", background: "#fff", borderRadius: "18px 18px 0 0", boxShadow: "0 -4px 20px rgba(0,0,0,0.12)", overflow: "hidden", maxHeight: 340, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #F2F2F7", flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>💬 AI 管家</span>
              <button onClick={() => { setChatOpen(false); setMessages([]); }} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#8E8E93" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", padding: "8px 0", color: "#8E8E93", fontSize: 13 }}>看到什麼想深入了解的？問我就對了</div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "82%", padding: "9px 13px",
                  borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background: m.role === "user" ? "#007AFF" : "#F2F2F7",
                  color: m.role === "user" ? "#fff" : "#1C1C1E",
                  fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap",
                }}>
                  {m.text}
                </div>
              ))}
              {typing && dispText && (
                <div style={{ alignSelf: "flex-start", maxWidth: "82%", padding: "9px 13px", borderRadius: "16px 16px 16px 4px", background: "#F2F2F7", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {dispText}<span style={{ opacity: 0.3 }}>|</span>
                </div>
              )}
            </div>
            {!typing && (
              <div style={{ padding: "6px 14px", display: "flex", gap: 5, flexWrap: "wrap", flexShrink: 0 }}>
                {quickQs.map((q) => (
                  <button key={q} onClick={() => sendQ(q)} style={{ padding: "5px 10px", borderRadius: 14, border: "1px solid #D1D1D6", background: "#fff", color: "#007AFF", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, padding: "8px 14px 10px", flexShrink: 0 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendQ(); }}
                placeholder="輸入問題..."
                style={{ flex: 1, padding: "9px 14px", borderRadius: 20, border: "1px solid #D1D1D6", fontSize: 13, outline: "none" }}
              />
              <button onClick={() => sendQ()} style={{ width: 34, height: 34, borderRadius: 17, background: "#007AFF", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, flexShrink: 0 }}>↑</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 發票頁 ────────────────────────────────────────────────────────────────
function InvoicesPage() {
  return (
    <div>
      <div style={{ background: "#fff", padding: "12px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "0.5px solid #C6C6C8" }}>
        <span style={{ fontSize: 22, fontWeight: 700 }}>我的發票</span>
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ fontSize: 18, color: "#8E8E93" }}>🔍</span>
          <span style={{ fontSize: 18, color: "#8E8E93" }}>⋯</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "10px 0", background: "#fff" }}>
        <button style={{ border: "none", background: "none", fontSize: 18, color: "#007AFF" }}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 600 }}>115年 1-2月</span>
        <button style={{ border: "none", background: "none", fontSize: 18, color: "#007AFF" }}>›</button>
      </div>
      <div style={{ margin: "8px 16px 10px", background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #E5E5EA" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>📅</span>
          <div>
            <div style={{ fontSize: 12, color: "#8E8E93" }}>開獎倒數</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>21天 / 共 132 張</div>
          </div>
        </div>
      </div>
      <div style={{ padding: "4px 16px 8px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>2月</span>
        <span style={{ fontSize: 16, fontWeight: 700 }}>$75,737</span>
      </div>
      <div style={{ background: "#fff", margin: "0 16px", borderRadius: 12, overflow: "hidden" }}>
        {INVOICES.map((inv, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderBottom: i < INVOICES.length - 1 ? "0.5px solid #E5E5EA" : "none" }}>
            <div style={{ width: 36, flexShrink: 0, textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{inv.day}</div>
              <div style={{ fontSize: 11, color: "#8E8E93" }}>{inv.wk}</div>
            </div>
            <div style={{ flex: 1, paddingLeft: 12, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.shop}</div>
              <div style={{ fontSize: 12, color: "#8E8E93", display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <span style={{ background: "#F2F2F7", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>{inv.type}</span>
                <span>{inv.code}</span>
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>${fmt(inv.amt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 首頁 ──────────────────────────────────────────────────────────────────
function NativeHomePage() {
  return (
    <div>
      <div style={{ background: "linear-gradient(180deg,#E3F0F9 0%,#EFF7FB 50%,#F2F2F7 100%)", padding: "16px 16px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ position: "relative", width: 36, height: 36 }}>
            <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#5B9BD5,#2E75B6)", borderRadius: 7, transform: "rotate(20deg)", position: "absolute", top: 3, left: 0 }} />
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ fontSize: 22 }}>🐬</span>
            <span style={{ fontSize: 18, color: "#8E8E93" }}>❓</span>
            <span style={{ fontSize: 18, color: "#8E8E93" }}>⚙️</span>
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 26, fontWeight: 300 }}>Hello！</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Kirk</div>
          <div style={{ fontSize: 20, marginTop: 6 }}>
            快到期了 <span style={{ color: "#2E75B6", fontWeight: 600 }}>發票記得去領獎！</span>
          </div>
        </div>
        <div style={{ display: "flex", padding: "14px 0" }}>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 4 }}>本月發票</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>0</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #C7D4DE", paddingLeft: 16 }}>
            <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 4 }}>金幣</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>9</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #C7D4DE", paddingLeft: 16 }}>
            <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 4 }}>票券</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>12</div>
          </div>
        </div>
      </div>
      <div style={{ margin: "0 16px 12px", background: "#fff", borderRadius: 14, padding: 18, border: "1px solid #E5E5EA" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>消費分析</span>
          <span style={{ fontSize: 16, color: "#C7C7CC" }}>→</span>
        </div>
        <div style={{ fontSize: 14, color: "#8E8E93", marginBottom: 20 }}>本月消費明細累積中</div>
        <div style={{ display: "flex", justifyContent: "center", paddingBottom: 8 }}>
          <div style={{ position: "relative", width: 140, height: 140 }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="56" fill="none" stroke="#E8E8ED" strokeWidth="14" />
            </svg>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>0</div>
              <div style={{ fontSize: 12, color: "#8E8E93" }}>筆消費明細</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 掃描對獎 ──────────────────────────────────────────────────────────────
function ScanPage() {
  const [activeTab, setActiveTab] = useState("scan");
  return (
    <div>
      <div style={{ background: "#fff", padding: "12px 16px 0", borderBottom: "0.5px solid #C6C6C8" }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>掃描對獎</div>
        <div style={{ display: "flex" }}>
          {[{ k: "scan", l: "掃描輸入" }, { k: "manual", l: "手動對獎" }, { k: "win", l: "中獎號碼" }].map((tab) => (
            <button
              key={tab.k}
              onClick={() => setActiveTab(tab.k)}
              style={{
                flex: 1, paddingBottom: 10, border: "none", background: "none", cursor: "pointer",
                fontSize: 14, fontWeight: activeTab === tab.k ? 600 : 400,
                color: activeTab === tab.k ? "#1C1C1E" : "#8E8E93",
                borderBottom: activeTab === tab.k ? "2px solid #1C1C1E" : "2px solid transparent",
              }}
            >
              {tab.l}
            </button>
          ))}
        </div>
      </div>
      {activeTab === "scan" && (
        <div>
          <div style={{ background: "#1A1A1A", height: 300, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <div style={{ width: 180, height: 120, border: "2px solid rgba(255,255,255,0.3)", borderRadius: 8 }} />
            <div style={{ position: "absolute", bottom: 16, display: "flex", gap: 10 }}>
              <button style={{ padding: "8px 20px", borderRadius: 20, border: "1.5px solid #fff", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 13 }}>電子發票</button>
              <button style={{ padding: "8px 20px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.4)", background: "transparent", color: "#fff", fontSize: 13 }}>傳統發票</button>
            </div>
          </div>
          <div style={{ background: "#fff", padding: "20px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>請將鏡頭對準發票 QRCode</div>
            <div style={{ fontSize: 13, color: "#8E8E93" }}>適度調整掃描距離以便相機對焦</div>
          </div>
        </div>
      )}
      {activeTab === "manual" && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔢</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>手動對獎</div>
        </div>
      )}
      {activeTab === "win" && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>中獎號碼</div>
        </div>
      )}
    </div>
  );
}

// ── 集點兌禮 ──────────────────────────────────────────────────────────────
function PointsPage() {
  const [mainTab, setMainTab] = useState("tasks");
  const [filter, setFilter] = useState("為你推薦");
  const filters = ["為你推薦", "購物回饋", "中獎名單", "理財專區"];
  const tasks = [
    { bg: "linear-gradient(135deg,#FFF3D6,#FFE8A3)", label: "每日簽到", emoji: "💰", title: "每日簽到", deadline: "無期限" },
    { bg: "linear-gradient(135deg,#E8F5E9,#C8E6C9)", label: "輕鬆填答問卷", emoji: null, title: "$30 購物金直接送！", deadline: "2026/12/31", cta: "立即拿好禮" },
    { bg: "linear-gradient(135deg,#E3F2FD,#BBDEFB)", label: "分享好友任務", emoji: "🎉", title: "分享給朋友，各得 50 金幣", deadline: "2026/06/30" },
  ];

  return (
    <div>
      <div style={{ background: "#fff", padding: "12px 16px 0", borderBottom: "0.5px solid #C6C6C8" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 700 }}>集點兌禮</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ width: 20, height: 20, borderRadius: 10, background: "#FBBF24", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 700 }}>G</span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>8</span>
          </div>
        </div>
        <div style={{ display: "flex" }}>
          <button onClick={() => setMainTab("tasks")} style={{ flex: 1, paddingBottom: 10, border: "none", background: "none", cursor: "pointer", fontSize: 15, fontWeight: mainTab === "tasks" ? 600 : 400, color: mainTab === "tasks" ? "#1C1C1E" : "#8E8E93", borderBottom: mainTab === "tasks" ? "2px solid #1C1C1E" : "2px solid transparent" }}>任務</button>
          <button onClick={() => setMainTab("shop")} style={{ flex: 1, paddingBottom: 10, border: "none", background: "none", cursor: "pointer", fontSize: 15, fontWeight: mainTab === "shop" ? 600 : 400, color: mainTab === "shop" ? "#1C1C1E" : "#8E8E93", borderBottom: mainTab === "shop" ? "2px solid #1C1C1E" : "2px solid transparent" }}>商城</button>
        </div>
      </div>
      {mainTab === "tasks" && (
        <div>
          <div style={{ display: "flex", gap: 8, padding: "12px 16px", overflowX: "auto" }}>
            {filters.map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 16px", borderRadius: 20, border: "none", background: filter === f ? "#1C1C1E" : "#F2F2F7", color: filter === f ? "#fff" : "#1C1C1E", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{f}</button>
            ))}
          </div>
          <div style={{ padding: "0 16px" }}>
            {tasks.map((tk, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 14, marginBottom: 12, overflow: "hidden", border: "1px solid #E5E5EA" }}>
                <div style={{ background: tk.bg, padding: "20px 16px", position: "relative" }}>
                  {tk.emoji && (
                    <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", fontSize: 48, opacity: 0.3 }}>{tk.emoji}</div>
                  )}
                  <div style={{ fontSize: i === 0 ? 22 : 16, fontWeight: i === 0 ? 800 : 700 }}>{tk.label}</div>
                </div>
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{tk.title}</div>
                    <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 4 }}>⏰ {tk.deadline}</div>
                  </div>
                  {tk.cta && (
                    <button style={{ padding: "8px 16px", borderRadius: 20, border: "none", background: "#2E75B6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{tk.cta}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {mainTab === "shop" && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🛍️</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>商城</div>
        </div>
      )}
    </div>
  );
}

// ── 載具管理 ──────────────────────────────────────────────────────────────
function CarrierPage() {
  const [activeTab, setActiveTab] = useState("barcode");
  const [autoBright, setAutoBright] = useState(true);

  return (
    <div>
      <div style={{ background: "#fff", padding: "12px 16px 0", borderBottom: "0.5px solid #C6C6C8" }}>
        <span style={{ fontSize: 22, fontWeight: 700, display: "block", marginBottom: 12 }}>載具管理</span>
        <div style={{ display: "flex" }}>
          {[{ k: "barcode", l: "手機條碼" }, { k: "bind", l: "載具歸戶" }, { k: "member", l: "會員卡管理" }].map((tab) => (
            <button
              key={tab.k}
              onClick={() => setActiveTab(tab.k)}
              style={{
                flex: 1, paddingBottom: 10, border: "none", background: "none", cursor: "pointer",
                fontSize: 14, fontWeight: activeTab === tab.k ? 600 : 400,
                color: activeTab === tab.k ? "#1C1C1E" : "#8E8E93",
                borderBottom: activeTab === tab.k ? "2px solid #1C1C1E" : "2px solid transparent",
              }}
            >
              {tab.l}
            </button>
          ))}
        </div>
      </div>
      {activeTab === "barcode" && (
        <div style={{ padding: 16 }}>
          <div style={{ textAlign: "center", marginBottom: 16, fontSize: 13, color: "#8E8E93" }}>結帳時請出示，供店員掃描</div>
          <div style={{ background: "#fff", borderRadius: 14, padding: "24px 20px", border: "1px solid #E5E5EA", marginBottom: 16, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <div style={{ width: 260, height: 56, background: "repeating-linear-gradient(90deg, #1C1C1E 0px, #1C1C1E 2px, transparent 2px, transparent 5px)", borderRadius: 2 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#F2F2F7", borderRadius: 10, padding: "10px 16px" }}>
              <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: 1 }}>手機條碼：/HZQ+PMQ</span>
              <button style={{ width: 32, height: 32, borderRadius: 8, background: "#007AFF", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontSize: 14 }}>📋</span>
              </button>
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E5EA", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "0.5px solid #E5E5EA" }}>
              <span style={{ fontSize: 15 }}>自動調整螢幕亮度</span>
              <div
                onClick={() => setAutoBright(!autoBright)}
                style={{ width: 48, height: 28, borderRadius: 14, background: autoBright ? "#34C759" : "#E5E5EA", cursor: "pointer", position: "relative", transition: "background 0.2s" }}
              >
                <div style={{ width: 24, height: 24, borderRadius: 12, background: "#fff", position: "absolute", top: 2, left: autoBright ? 22 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "0.5px solid #E5E5EA" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15 }}>驗證碼狀態</span>
                <span style={{ fontSize: 12, color: "#34C759", fontWeight: 600, background: "#E8F5E9", padding: "2px 8px", borderRadius: 6 }}>正常</span>
              </div>
              <button style={{ padding: "5px 14px", borderRadius: 8, border: "1.5px solid #007AFF", background: "#fff", color: "#007AFF", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>設定</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "0.5px solid #E5E5EA", cursor: "pointer" }}>
              <span style={{ fontSize: 15 }}>匯款帳戶</span>
              <span style={{ color: "#C7C7CC" }}>›</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15 }}>桌面小工具設定</span>
                <span style={{ fontSize: 12, color: "#8E8E93", background: "#F2F2F7", padding: "2px 8px", borderRadius: 6 }}>已設定</span>
              </div>
              <button style={{ padding: "5px 14px", borderRadius: 8, border: "1.5px solid #007AFF", background: "#fff", color: "#007AFF", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>設定</button>
            </div>
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: "#8E8E93", lineHeight: 1.6 }}>
            消費待店家上傳發票資料至財政部，即可在發票存摺頁面查詢發票與消費明細，時間約幾個小時至 2 天不等。
          </div>
        </div>
      )}
      {activeTab === "bind" && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>載具歸戶</div>
        </div>
      )}
      {activeTab === "member" && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💳</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>會員卡管理</div>
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function InvoicePrototypeV3() {
  const [tab, setTab] = useState("ai");

  let content = null;
  if (tab === "invoices") content = <InvoicesPage />;
  else if (tab === "points") content = <PointsPage />;
  else if (tab === "scan") content = <ScanPage />;
  else if (tab === "carrier") content = <CarrierPage />;
  else if (tab === "home") content = <NativeHomePage />;
  else content = <AIAgentPage />;

  return (
    <div>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}::-webkit-scrollbar{display:none}`}</style>
      <div style={S.root}>
        <div style={S.screen}>{content}</div>
        <TabBar tab={tab} setTab={setTab} />
      </div>
    </div>
  );
}
