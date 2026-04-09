import { useState, useEffect, useRef } from "react";

const fmt = (n) => n.toLocaleString();

// ── 用戶數據 ─────────────────────────────────────────────────────────
const U = {
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
  eatDrinkPct: 41,
  eatDrinkPctPrev: 27,
  deliveryTotal: 6930,
  deliveryVisits: 21,
  eatingTrend: [9800, 11200, 12600, 13100, 13800, 14370],
  coffeeTrend: [680, 820, 1100, 1350, 1620, 1950],
  months: ["9月", "10月", "11月", "12月", "1月", "2月"],
};

const delivFreq = (U.days / U.deliveryVisits).toFixed(1);
const coffeeGrowth = Math.round(((U.coffeeTrend[5] - U.coffeeTrend[0]) / U.coffeeTrend[0]) * 100);
const eatingGrowth = Math.round(((U.eatingTrend[5] - U.eatingTrend[0]) / U.eatingTrend[0]) * 100);
const yearDelivery = Math.round(U.deliveryTotal * 6);
const yearCoffee = Math.round(U.coffeeTotal * 6);
const iphonePrice = 44900;

// ── 開場 ─────────────────────────────────────────────────────────────
const OPENS = [
  { text: U.name + "，我看完了你 " + U.invoiceCount + " 張發票。", delay: 400 },
  { text: "想跟你聊聊我觀察到的事。", delay: 1200, dim: true },
  { text: "你跟 UberEats 的關係很穩定——不管平日還是假日，平均每 " + delivFreq + " 天就會叫一次。這是你最離不開的消費。", delay: 2200, hook: true },
];

// ── 鉤子 ─────────────────────────────────────────────────────────────
const HOOKS = [
  {
    id: "depend",
    q: "我最離不開什麼？",
    big: "每 " + delivFreq + " 天",
    bigSub: "你叫一次外送的頻率",
    body: "你這兩個月叫了 " + U.deliveryVisits + " 次 UberEats，從來沒有連續超過 4 天不叫。平均每次花 $" + U.shops[0].avg + "，兩個月下來 $" + fmt(U.deliveryTotal) + "。\n\n但你最離不開的不只外送。",
    ranks: [
      { rank: "🥇", name: "UberEats", freq: "每 " + delivFreq + " 天", note: "從沒斷過，你的第一依賴" },
      { rank: "🥈", name: "7-11", freq: "每 3.4 天", note: "最穩定的習慣，週週都去" },
      { rank: "🥉", name: "麥當勞", freq: "每 4.4 天", note: "你的第三常客" },
      { rank: "⬆️", name: "路易莎", freq: "每 5.1 天", note: "頻率半年翻倍，正在變成新依賴" },
    ],
    tip: "路易莎值得注意——半年前你每月去 4 次，現在 6 次，頻率還在加速。它正在悄悄變成你的日常必需品。",
    followups: [
      { q: "我對 UberEats 的依賴在變強嗎？", a: "其實稍微在穩定。\n\n你的 UberEats 近 6 個月頻率：每月 12→11→10→11→10→11 次。\n\n頻率沒有明顯增加，但也沒減少——穩定維持每月 10-12 次。\n\n不過你的單次金額從 $290 升到 $330，所以雖然次數差不多，但花的錢變多了。" },
      { q: "除了外送，還有什麼正在變成習慣？", a: "成長最快的兩個：\n\n☕ 路易莎：半年前每月 4 次 → 現在 6 次（+50%）\n你跟路易莎的關係正在快速升溫。\n\n🧋 大苑子：半年前每月 1 次 → 現在 3 次（+200%）\n增幅最大，從「偶爾喝」變成「固定喝」。\n\n整體來看，你的飲料消費正在悄悄擴張——從佔總花費 2% 升到了 " + U.coffeePct + "%。" },
    ],
  },
  {
    id: "future",
    q: "如果繼續這樣，一年後？",
    big: "$" + fmt(Math.round(U.totalAmount / 2 * 12 * 1.15)),
    bigSub: "照目前趨勢，你未來一年的預估總花費",
    body: "你的消費有幾個明確的趨勢正在發生：\n\n📈 外食佔比持續上升：" + U.eatingPctPrev + "% → " + U.eatingPct + "%\n☕ 咖啡飲料加速成長：半年 +" + coffeeGrowth + "%\n📊 吃喝合計佔比：" + U.eatDrinkPctPrev + "% → " + U.eatDrinkPct + "%",
    projection: [
      { label: "外食/外送", now: "$7,185/月", future: "~$9,500/月", change: "+32%" },
      { label: "咖啡/飲料", now: "$975/月", future: "~$2,400/月", change: "+146%" },
      { label: "吃喝佔比", now: U.eatDrinkPct + "%", future: "~50%", change: "+" + (50 - U.eatDrinkPct) + "%" },
    ],
    tip: "變化最劇烈的不是外送（已經穩定），而是咖啡飲料——照半年的成長速度，一年後每月咖啡花費可能從 $975 變成 $2,400。",
    followups: [
      { q: "一年的外送費換算成什麼？", a: "照目前頻率，一年外送費約 $" + fmt(yearDelivery) + "。\n\n換算成你查得到價格的東西：\n\n📱 iPhone 16 Pro（$" + fmt(iphonePrice) + "）—— 差一點就能買\n✈️ 東京來回 " + (yearDelivery / 8000).toFixed(1) + " 趟（$8,000/趟）\n🎮 Switch " + (yearDelivery / 9780).toFixed(1) + " 台（$9,780/台）\n\n這些都是官方售價，可以自己查。" },
      { q: "如果每週少叫 2 次，差多少？", a: "你現在每週叫約 2.4 次，每次 $330。\n\n每週少 2 次：\n• 每月省 $" + fmt(Math.round(330 * 2 * 4.3)) + "\n• 一年省 $" + fmt(Math.round(330 * 2 * 52)) + "\n• 夠飛東京 " + (Math.round(330 * 2 * 52) / 8000).toFixed(1) + " 趟\n\n重點不是「你應該少叫」，而是讓你知道差距有多大，你自己決定。" },
    ],
  },
  {
    id: "rhythm",
    q: "我的消費節奏是什麼？",
    big: "7 個通路",
    bigSub: "構成你日常生活的消費版圖",
    body: "從你的發票看，你的一週大概長這樣：",
    weekPattern: [
      { period: "平日（週一到五）", items: ["🛵 午餐或晚餐靠 UberEats（每週 2-3 次）", "🍔 麥當勞穿插其中（每週 1-2 次）", "🏪 7-11 幾乎天天報到（每週 2-3 次）", "☕ 路易莎固定出現（每週 1-2 次）"] },
      { period: "週末", items: ["🛒 全聯採購一次", "🏬 全家偶爾出現", "🧋 大苑子週末喝一杯"] },
    ],
    tip: "有趣的是，你的消費幾乎集中在 7 家店。這 7 家佔了 132 張發票中的 87 張（66%）。你的消費節奏很規律——外送和超商是平日支柱，全聯是週末儀式。",
    followups: [
      { q: "我最常在什麼時候花錢？", a: "從發票日期分布看：\n\n📅 月初（1-10 號）：消費偏低，約佔 28%\n📅 月中（11-20 號）：消費最高，約佔 40%\n📅 月底（21-31 號）：消費中等，約佔 32%\n\n你的消費在月中最集中，可能跟發薪日或生活節奏有關。" },
      { q: "我有沒有什麼隱藏的規律？", a: "有一個有趣的模式：\n\n你每次去全聯的隔天，外送頻率會明顯降低。推測是買了食材，隔天會自己準備。\n\n但這個效果通常只維持 1-2 天，然後又回到外送節奏。\n\n另外，你的 7-11 消費在週一特別高（平均 $185），其他天約 $140。" },
    ],
  },
  {
    id: "change",
    q: "我跟半年前有什麼不同？",
    big: "+" + eatingGrowth + "%",
    bigSub: "你的外食花費半年增長幅度",
    body: "你半年前和現在，是不太一樣的消費者。",
    changes: {
      up: [
        { icon: "🍽", label: "外食佔比", detail: U.eatingPctPrev + "% → " + U.eatingPct + "%（每月多花 $4,570）" },
        { icon: "☕", label: "咖啡飲料", detail: "$680/月 → $975/月（+" + Math.round((975 - 680) / 680 * 100) + "%）" },
        { icon: "🧋", label: "手搖飲", detail: "幾乎從零變成固定消費" },
      ],
      stable: [
        { icon: "🛒", label: "全聯", detail: "每月 ~$1,715，幾乎沒變" },
        { icon: "🏪", label: "超商", detail: "每月 ~$2,054，小幅波動" },
      ],
    },
    tip: "最值得注意的是「吃跟喝」的佔比變化：半年前合計 " + U.eatDrinkPctPrev + "%，現在 " + U.eatDrinkPct + "%。你花在吃喝上的比例，從不到三成升到超過四成。",
    trend: U.eatingTrend,
    trendLabel: "外食花費趨勢 — 半年增長 " + eatingGrowth + "%",
    trendColor: "#E8453C",
    followups: [
      { q: "變化最大的是什麼？", a: "增幅最大的三個消費：\n\n🥇 大苑子：+200%（每月 1 次 → 3 次）\n🥈 咖啡飲料整體：+187%（$680 → $1,950/兩月）\n🥉 麥當勞：+34%（每月 5 次 → 7 次）\n\n大苑子的增幅最驚人，雖然金額不大，但從「偶爾」變成了「固定」。這通常是一個新消費習慣正在形成的訊號。" },
      { q: "有什麼是消失的消費嗎？", a: "沒有明顯「消失」的通路。你半年前常去的店，現在還是常去。\n\n但有微妙的變化：你在 7-11 的大額消費（$200+）減少了——半年前每月 3-4 次，現在 1-2 次。\n\n整體來看，你的消費版圖在「擴張」而不是「替換」——新的習慣加上去了，但舊的沒有被取代。" },
    ],
  },
];

const DEFAULT_REPLY = "根據你的 " + U.invoiceCount + " 張發票，你的消費集中在 7 個主要通路，生活節奏很規律——平日靠外送和超商，週末去全聯。\n\n最明顯的趨勢是外食和咖啡都在增加，而且還在加速中。\n\n試試上面的問題，每一個都是我從你的發票裡觀察到的。";

// ── 元件 ─────────────────────────────────────────────────────────────
function TrendChart({ values, labels, color, height }) {
  const h = height || 64;
  const mx = Math.max(...values);
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: h }}>
      {values.map((v, i) => {
        const bh = Math.max((v / mx) * (h - 16), 4);
        const last = i === values.length - 1;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ fontSize: 10, fontWeight: last ? 700 : 400, color: last ? color : "#636366" }}>
              {v >= 1000 ? (v / 1000).toFixed(1) + "k" : "$" + v}
            </div>
            <div style={{ width: "100%", height: bh, borderRadius: "3px 3px 0 0", background: last ? color : "#3A3A3C" }} />
            <div style={{ fontSize: 9, color: "#636366" }}>{labels[i]}</div>
          </div>
        );
      })}
    </div>
  );
}

function InsightBubble({ hook }) {
  return (
    <div style={{ alignSelf: "flex-start", width: "88%", background: "#1C1C1E", borderRadius: "20px 20px 20px 4px", padding: "4px 16px 16px" }}>
      {/* Big number */}
      <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
        <div style={{ fontSize: 38, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{hook.big}</div>
        <div style={{ fontSize: 13, color: "#8E8E93", marginTop: 6 }}>{hook.bigSub}</div>
      </div>

      {/* Body */}
      <div style={{ fontSize: 14, color: "#E5E5EA", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{hook.body}</div>

      {/* Dependency ranks */}
      {hook.ranks && (
        <div style={{ marginTop: 12 }}>
          {hook.ranks.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: i === 0 ? "rgba(255,255,255,0.06)" : "transparent", borderRadius: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{r.rank}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", width: 72 }}>{r.name}</span>
              <span style={{ fontSize: 13, color: "#FFD60A", fontWeight: 600, width: 72 }}>{r.freq}</span>
              <span style={{ fontSize: 12, color: "#8E8E93", flex: 1 }}>{r.note}</span>
            </div>
          ))}
        </div>
      )}

      {/* Projection table */}
      {hook.projection && (
        <div style={{ marginTop: 12, background: "rgba(255,255,255,0.04)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "flex", padding: "8px 12px", borderBottom: "1px solid #2C2C2E" }}>
            <span style={{ flex: 2, fontSize: 11, color: "#636366" }}>項目</span>
            <span style={{ flex: 2, fontSize: 11, color: "#636366", textAlign: "center" }}>現在</span>
            <span style={{ flex: 2, fontSize: 11, color: "#636366", textAlign: "center" }}>一年後</span>
            <span style={{ flex: 1, fontSize: 11, color: "#636366", textAlign: "right" }}>變化</span>
          </div>
          {hook.projection.map((p, i) => (
            <div key={i} style={{ display: "flex", padding: "8px 12px", borderBottom: i < hook.projection.length - 1 ? "1px solid #2C2C2E" : "none", alignItems: "center" }}>
              <span style={{ flex: 2, fontSize: 13, color: "#E5E5EA" }}>{p.label}</span>
              <span style={{ flex: 2, fontSize: 13, color: "#8E8E93", textAlign: "center" }}>{p.now}</span>
              <span style={{ flex: 2, fontSize: 13, color: "#FF9500", textAlign: "center", fontWeight: 600 }}>{p.future}</span>
              <span style={{ flex: 1, fontSize: 12, color: "#E8453C", textAlign: "right", fontWeight: 600 }}>{p.change}</span>
            </div>
          ))}
        </div>
      )}

      {/* Week pattern */}
      {hook.weekPattern && (
        <div style={{ marginTop: 10 }}>
          {hook.weekPattern.map((wp, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#FFD60A", marginBottom: 6 }}>{wp.period}</div>
              {wp.items.map((item, j) => (
                <div key={j} style={{ fontSize: 13, color: "#E5E5EA", lineHeight: 1.8, paddingLeft: 4 }}>{item}</div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Change lists */}
      {hook.changes && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#E8453C", marginBottom: 6 }}>變多的</div>
          {hook.changes.up.map((c, i) => (
            <div key={i} style={{ fontSize: 13, color: "#E5E5EA", lineHeight: 1.8, paddingLeft: 4 }}>
              {c.icon} {c.label}：{c.detail}
            </div>
          ))}
          <div style={{ fontSize: 12, fontWeight: 600, color: "#8E8E93", marginTop: 8, marginBottom: 6 }}>穩定的</div>
          {hook.changes.stable.map((c, i) => (
            <div key={i} style={{ fontSize: 13, color: "#8E8E93", lineHeight: 1.8, paddingLeft: 4 }}>
              {c.icon} {c.label}：{c.detail}
            </div>
          ))}
        </div>
      )}

      {/* Trend chart */}
      {hook.trend && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 8 }}>{hook.trendLabel}</div>
          <TrendChart values={hook.trend} labels={U.months} color={hook.trendColor} />
        </div>
      )}

      {/* Tip */}
      {hook.tip && (
        <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(255,255,255,0.06)", borderRadius: 10, borderLeft: "3px solid #FF9500" }}>
          <div style={{ fontSize: 13, color: "#FFD60A", lineHeight: 1.6, fontWeight: 500 }}>💡 {hook.tip}</div>
        </div>
      )}
    </div>
  );
}

// ── AI Chat ──────────────────────────────────────────────────────────
export default function AIChat() {
  const [msgs, setMsgs] = useState([]);
  const [phase, setPhase] = useState("opening");
  const [step, setStep] = useState(0);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [dispText, setDispText] = useState("");
  const [usedIds, setUsedIds] = useState([]);
  const [followups, setFollowups] = useState([]);
  const scrollRef = useRef(null);
  const typingRef = useRef(false);
  const ivRef = useRef(null);

  useEffect(() => {
    const timers = OPENS.map((o, i) => setTimeout(() => setStep(i + 1), o.delay));
    const end = setTimeout(() => setPhase("hooks"), OPENS[OPENS.length - 1].delay + 800);
    return () => { timers.forEach(clearTimeout); clearTimeout(end); };
  }, []);

  useEffect(() => {
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 60);
  }, [msgs, dispText, step, typing]);

  function stop() {
    typingRef.current = false;
    setTyping(false);
    setDispText("");
    if (ivRef.current) { clearInterval(ivRef.current); ivRef.current = null; }
  }

  function typeText(text) {
    stop();
    typingRef.current = true;
    setTyping(true);
    let i = 0;
    ivRef.current = setInterval(() => {
      if (!typingRef.current) return;
      i++;
      setDispText(text.slice(0, i));
      if (i >= text.length) {
        stop();
        setMsgs((p) => [...p, { role: "ai", text }]);
      }
    }, 12);
  }

  function showInsight(hook) {
    stop();
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs((p) => [...p, { role: "ai", hook }]);
      setFollowups(hook.followups || []);
    }, 800);
  }

  function tapHook(hook) {
    stop();
    setMsgs((p) => [...p, { role: "user", text: hook.q }]);
    setUsedIds((p) => [...p, hook.id]);
    setFollowups([]);
    setTimeout(() => showInsight(hook), 400);
  }

  function tapFollowup(fq) {
    stop();
    setMsgs((p) => [...p, { role: "user", text: fq.q }]);
    setFollowups([]);
    setTimeout(() => typeText(fq.a), 400);
  }

  function sendFree() {
    const q = input.trim();
    if (!q) return;
    stop();
    setMsgs((p) => [...p, { role: "user", text: q }]);
    setInput("");
    setFollowups([]);
    setTimeout(() => typeText(DEFAULT_REPLY), 400);
  }

  const available = HOOKS.filter((h) => !usedIds.includes(h.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#000" }}>
      {/* Header */}
      <div style={{ padding: "14px 16px 12px", borderBottom: "0.5px solid #2C2C2E", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: "linear-gradient(135deg,#5B7FFF,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff" }}>✦</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>AI 管家</div>
          <div style={{ fontSize: 12, color: "#636366" }}>已分析 {U.invoiceCount} 張發票</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Opening */}
        {OPENS.map((o, i) => {
          if (step <= i) return null;
          return (
            <div key={"o" + i} style={{
              alignSelf: "flex-start", maxWidth: o.hook ? "88%" : "80%",
              background: "#1C1C1E", borderRadius: "20px 20px 20px 4px",
              padding: o.hook ? "14px 16px" : "12px 16px",
              borderLeft: o.hook ? "3px solid #FF9500" : "none",
            }}>
              <div style={{ fontSize: o.hook ? 15 : 14, color: o.dim ? "#8E8E93" : "#E5E5EA", lineHeight: 1.6, fontWeight: o.hook ? 500 : 400 }}>
                {o.text}
              </div>
            </div>
          );
        })}

        {/* Chat messages */}
        {msgs.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={"m" + i} style={{ alignSelf: "flex-end", maxWidth: "75%", background: "#007AFF", borderRadius: "20px 20px 4px 20px", padding: "10px 16px" }}>
                <div style={{ fontSize: 14, color: "#fff", lineHeight: 1.5 }}>{m.text}</div>
              </div>
            );
          }
          if (m.hook) {
            return <InsightBubble key={"m" + i} hook={m.hook} />;
          }
          return (
            <div key={"m" + i} style={{ alignSelf: "flex-start", maxWidth: "85%", background: "#1C1C1E", borderRadius: "20px 20px 20px 4px", padding: "12px 16px" }}>
              <div style={{ fontSize: 14, color: "#E5E5EA", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{m.text}</div>
            </div>
          );
        })}

        {/* Typing */}
        {typing && !dispText && (
          <div style={{ alignSelf: "flex-start", background: "#1C1C1E", borderRadius: "20px 20px 20px 4px", padding: "12px 16px" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[0, 1, 2].map((d) => (
                <div key={d} style={{ width: 8, height: 8, borderRadius: 4, background: "#636366", animation: "pulse 1s infinite " + (d * 0.2) + "s" }} />
              ))}
            </div>
          </div>
        )}
        {typing && dispText && (
          <div style={{ alignSelf: "flex-start", maxWidth: "85%", background: "#1C1C1E", borderRadius: "20px 20px 20px 4px", padding: "12px 16px" }}>
            <div style={{ fontSize: 14, color: "#E5E5EA", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {dispText}<span style={{ opacity: 0.4 }}>|</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom */}
      <div style={{ flexShrink: 0, borderTop: "0.5px solid #2C2C2E", marginBottom: 56 }}>
        {!typing && (followups.length > 0 || (available.length > 0 && phase === "hooks")) && (
          <div style={{ maxHeight: 160, overflowY: "auto", padding: "8px 16px 0" }}>
            {followups.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: "#636366", marginBottom: 6 }}>追問更多：</div>
                {followups.map((fq, i) => (
                  <button key={i} onClick={() => tapFollowup(fq)} style={{
                    display: "block", width: "100%", padding: "10px 14px", borderRadius: 12,
                    border: "1px solid #3A3A3C", background: "#1C1C1E",
                    color: "#E5E5EA", fontSize: 13, fontWeight: 500,
                    cursor: "pointer", textAlign: "left", marginBottom: 6,
                  }}>
                    {fq.q}
                  </button>
                ))}
              </div>
            )}
            {available.length > 0 && phase === "hooks" && (
              <div style={{ marginBottom: 6 }}>
                {followups.length > 0 && (
                  <div style={{ fontSize: 11, color: "#636366", marginBottom: 6, marginTop: 2 }}>或探索其他觀察：</div>
                )}
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                  {available.map((h) => (
                    <button key={h.id} onClick={() => tapHook(h)} style={{
                      padding: "8px 14px", borderRadius: 20,
                      border: "1px solid #5B7FFF", background: "rgba(91,127,255,0.1)",
                      color: "#7BA4FF", fontSize: 13, fontWeight: 500,
                      cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {h.q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div style={{ padding: "8px 16px 10px", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendFree(); }}
            placeholder="或直接問我任何消費問題..."
            style={{ flex: 1, padding: "10px 16px", borderRadius: 22, border: "1px solid #3A3A3C", background: "#1C1C1E", color: "#fff", fontSize: 14, outline: "none" }}
          />
          <button onClick={sendFree} style={{
            width: 36, height: 36, borderRadius: 18,
            background: input.trim() ? "#007AFF" : "#3A3A3C",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 16, flexShrink: 0,
          }}>↑</button>
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
    </div>
  );
}
