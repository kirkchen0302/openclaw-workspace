import { useState, useEffect, useRef, useMemo } from "react";
import { resolveShop } from "./shopMapping";

const fmt = (n) => n.toLocaleString();

// ── 從發票資料動態計算洞察 ──────────────────────────────────────────────
function computeStats(invoices) {
  // Brand aggregation
  const brandMap = {};
  invoices.forEach((inv) => {
    const { brand, cat } = resolveShop(inv.shop);
    if (!brandMap[brand]) brandMap[brand] = { brand, cat, visits: 0, total: 0 };
    brandMap[brand].visits++;
    brandMap[brand].total += inv.amount || 0;
  });
  const brands = Object.values(brandMap).sort((a, b) => b.visits - a.visits);

  // Category aggregation
  const catMap = {};
  brands.forEach((b) => {
    if (!catMap[b.cat]) catMap[b.cat] = { cat: b.cat, visits: 0, total: 0 };
    catMap[b.cat].visits += b.visits;
    catMap[b.cat].total += b.total;
  });
  const cats = Object.values(catMap).sort((a, b) => b.total - a.total);

  // Monthly aggregation from invoices
  const monthMap = {};
  invoices.forEach((inv) => {
    const ym = inv.yearMonth || "unknown";
    if (!monthMap[ym]) monthMap[ym] = { ym, total: 0, count: 0 };
    monthMap[ym].total += inv.amount || 0;
    monthMap[ym].count++;
  });
  const months = Object.values(monthMap).sort((a, b) => a.ym.localeCompare(b.ym));

  const totalAmount = invoices.reduce((s, inv) => s + (inv.amount || 0), 0);
  const totalDays = months.length > 0 ? Math.max(months.length * 30, 30) : 30;

  return { brands, cats, months, totalAmount, totalDays };
}

function fmtMonth(ym) {
  const parts = ym.split("-");
  return parts.length === 2 ? parseInt(parts[1]) + "月" : ym;
}

// ── 動態產生 HOOKS ──────────────────────────────────────────────────────
function buildHooks(invoices, invoiceCount, totalAmount, monthlyTrend) {
  const stats = computeStats(invoices);
  const { brands, cats, months } = stats;

  const top5 = brands.slice(0, 5);
  const topBrand = top5[0];
  if (!topBrand) return [];

  const days = months.length > 0 ? months.length * 30 : 30;
  const topFreq = (days / topBrand.visits).toFixed(1);

  // Use RTDB monthlyTrend if available, otherwise computed
  const trendData = (monthlyTrend && monthlyTrend.length > 0)
    ? monthlyTrend.map((m) => ({ label: m.month, value: m.amount }))
    : months.map((m) => ({ label: fmtMonth(m.ym), value: m.total }));

  const trendValues = trendData.map((t) => t.value);
  const trendLabels = trendData.map((t) => t.label);

  // Monthly average
  const monthlyAvg = trendValues.length > 0
    ? Math.round(trendValues.reduce((s, v) => s + v, 0) / trendValues.length)
    : 0;

  // Recent vs older growth
  const recentMonths = trendValues.slice(-3);
  const olderMonths = trendValues.slice(0, Math.max(trendValues.length - 3, 1));
  const recentAvg = recentMonths.length > 0 ? Math.round(recentMonths.reduce((s, v) => s + v, 0) / recentMonths.length) : 0;
  const olderAvg = olderMonths.length > 0 ? Math.round(olderMonths.reduce((s, v) => s + v, 0) / olderMonths.length) : 0;
  const growthPct = olderAvg > 0 ? Math.round(((recentAvg - olderAvg) / olderAvg) * 100) : 0;

  // Top category
  const topCat = cats[0];
  const topCatPct = totalAmount > 0 ? Math.round((topCat.total / totalAmount) * 100) : 0;

  const hooks = [];

  // ── Hook 1: 最常消費的通路 ────────────────────────────────────────────
  hooks.push({
    id: "top",
    q: "我最常消費的通路？",
    big: "每 " + topFreq + " 天",
    bigSub: "你去「" + topBrand.brand + "」的頻率",
    body: "你在這段期間共消費 " + invoiceCount + " 筆，去了 " + brands.length + " 個不同通路。以下是你最常去的地方：",
    ranks: top5.map((b, i) => ({
      rank: ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i],
      name: b.brand,
      freq: b.visits + " 次",
      note: "$" + fmt(b.total) + "（均 $" + Math.round(b.total / b.visits) + "）",
    })),
    tip: topBrand.brand + " 是你最常消費的通路，佔了你所有消費次數的 " + Math.round((topBrand.visits / invoiceCount) * 100) + "%。",
    followups: [
      {
        q: "哪個通路花最多錢？",
        a: (() => {
          const byTotal = [...brands].sort((a, b) => b.total - a.total).slice(0, 5);
          return "按金額排名：\n\n" + byTotal.map((b, i) => ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i] + " " + b.brand + "：$" + fmt(b.total) + "（" + b.visits + " 次）").join("\n");
        })(),
      },
      {
        q: "我的消費集中在幾個通路？",
        a: (() => {
          const top5Total = top5.reduce((s, b) => s + b.visits, 0);
          const pct = Math.round((top5Total / invoiceCount) * 100);
          return "你的前 5 大通路（" + top5.map((b) => b.brand).join("、") + "）合計 " + top5Total + " 次，佔了 " + pct + "%。\n\n" + (pct > 60 ? "消費相當集中，日常生活習慣很規律。" : "消費相對分散，去的地方比較多元。");
        })(),
      },
    ],
  });

  // ── Hook 2: 消費類別分佈 ──────────────────────────────────────────────
  hooks.push({
    id: "category",
    q: "我的錢花在哪些類別？",
    big: topCatPct + "%",
    bigSub: "花在「" + topCat.cat + "」類別的比例",
    body: "你的消費分布在 " + cats.length + " 個類別：",
    ranks: cats.filter((c) => c.total > 0).slice(0, 6).map((c, i) => ({
      rank: (i + 1) + "",
      name: c.cat,
      freq: Math.round((c.total / totalAmount) * 100) + "%",
      note: "$" + fmt(c.total) + "（" + c.visits + " 次）",
    })),
    tip: "「" + topCat.cat + "」佔你最大的消費比例。" + (cats.length > 1 ? "第二大是「" + cats[1].cat + "」（" + Math.round((cats[1].total / totalAmount) * 100) + "%）。" : ""),
    followups: [
      {
        q: "哪個類別消費次數最多？",
        a: (() => {
          const byVisits = [...cats].sort((a, b) => b.visits - a.visits).slice(0, 5);
          return "按次數排名：\n\n" + byVisits.map((c, i) => (i + 1) + ". " + c.cat + "：" + c.visits + " 次（$" + fmt(c.total) + "）").join("\n");
        })(),
      },
      {
        q: "各類別的平均單次消費？",
        a: (() => {
          const withAvg = cats.filter((c) => c.visits > 0).map((c) => ({ ...c, avg: Math.round(c.total / c.visits) })).sort((a, b) => b.avg - a.avg).slice(0, 6);
          return "各類別平均單次消費：\n\n" + withAvg.map((c) => c.cat + "：平均 $" + fmt(c.avg) + "/次（共 " + c.visits + " 次）").join("\n");
        })(),
      },
    ],
  });

  // ── Hook 3: 消費趨勢 ──────────────────────────────────────────────────
  if (trendValues.length >= 2) {
    const maxMonth = trendData.reduce((a, b) => a.value > b.value ? a : b);
    const minMonth = trendData.reduce((a, b) => a.value < b.value ? a : b);
    hooks.push({
      id: "trend",
      q: "我的消費趨勢？",
      big: (growthPct >= 0 ? "+" : "") + growthPct + "%",
      bigSub: "近期 vs 前期的消費變化",
      body: "每月平均消費 $" + fmt(monthlyAvg) + "，最高 " + maxMonth.label + "（$" + fmt(maxMonth.value) + "），最低 " + minMonth.label + "（$" + fmt(minMonth.value) + "）。",
      trend: trendValues,
      trendLabels: trendLabels,
      trendLabel: "每月消費趨勢",
      trendColor: growthPct > 10 ? "#E8453C" : growthPct < -10 ? "#34C759" : "#007AFF",
      tip: growthPct > 10
        ? "消費有上升趨勢（+" + growthPct + "%），近幾個月花費明顯增加。"
        : growthPct < -10
        ? "消費有下降趨勢（" + growthPct + "%），近期控制得不錯。"
        : "消費趨勢大致穩定，沒有明顯的上升或下降。",
      followups: [
        {
          q: "如果繼續這樣，一年會花多少？",
          a: (() => {
            const yearEst = monthlyAvg * 12;
            return "照目前的月均 $" + fmt(monthlyAvg) + " 推算：\n\n📊 一年預估消費：$" + fmt(yearEst) + "\n\n" + (growthPct > 0 ? "但你的消費在增加，實際可能比這更高。" : "你的消費趨勢平穩或下降，實際可能更低。");
          })(),
        },
        {
          q: "哪個月花最多？為什麼？",
          a: (() => {
            // Find top brands in the max month
            const maxYm = months.find((m) => m.total === Math.max(...months.map((x) => x.total)));
            if (!maxYm) return "資料不足。";
            const monthInvs = invoices.filter((inv) => inv.yearMonth === maxYm.ym);
            const monthBrands = {};
            monthInvs.forEach((inv) => {
              const { brand } = resolveShop(inv.shop);
              if (!monthBrands[brand]) monthBrands[brand] = { brand, total: 0 };
              monthBrands[brand].total += inv.amount || 0;
            });
            const topInMonth = Object.values(monthBrands).sort((a, b) => b.total - a.total).slice(0, 3);
            return fmtMonth(maxYm.ym) + " 花了 $" + fmt(maxYm.total) + "，是最高的一個月。\n\n該月前三大消費：\n" + topInMonth.map((b) => "• " + b.brand + "：$" + fmt(b.total)).join("\n");
          })(),
        },
      ],
    });
  }

  // ── Hook 4: 消費習慣 ──────────────────────────────────────────────────
  const regularBrands = brands.filter((b) => b.visits >= 5).slice(0, 7);
  if (regularBrands.length >= 2) {
    hooks.push({
      id: "habit",
      q: "我有什麼消費習慣？",
      big: regularBrands.length + " 個固定通路",
      bigSub: "你經常光顧的通路數量",
      body: "以下是你的「固定班底」— 至少去過 5 次的通路：",
      ranks: regularBrands.map((b, i) => ({
        rank: (i + 1) + "",
        name: b.brand,
        freq: b.visits + " 次",
        note: b.cat + " · 均 $" + Math.round(b.total / b.visits),
      })),
      tip: "你的日常消費主要圍繞這 " + regularBrands.length + " 個通路。" + (regularBrands[0].cat === "外送" || regularBrands[0].cat === "速食" || regularBrands[0].cat === "餐飲" ? "吃的佔了最核心的位置。" : ""),
      followups: [
        {
          q: "我最依賴哪個通路？",
          a: (() => {
            const top = regularBrands[0];
            const freq = (days / top.visits).toFixed(1);
            return "你最依賴的是 " + top.brand + "——平均每 " + freq + " 天消費一次，共去了 " + top.visits + " 次、花了 $" + fmt(top.total) + "。\n\n" + (top.visits > 20 ? "這已經是非常高頻的消費，幾乎是日常必需。" : "頻率不低，是你的穩定消費來源。");
          })(),
        },
        {
          q: "有什麼消費在增加中？",
          a: (() => {
            // Compare first half vs second half of invoices
            const mid = Math.floor(invoices.length / 2);
            const first = invoices.slice(0, mid);
            const second = invoices.slice(mid);
            const firstBrands = {};
            const secondBrands = {};
            first.forEach((inv) => { const { brand } = resolveShop(inv.shop); firstBrands[brand] = (firstBrands[brand] || 0) + 1; });
            second.forEach((inv) => { const { brand } = resolveShop(inv.shop); secondBrands[brand] = (secondBrands[brand] || 0) + 1; });
            const growing = Object.keys(secondBrands).filter((b) => (secondBrands[b] || 0) > (firstBrands[b] || 0) * 1.3).map((b) => ({
              brand: b,
              before: firstBrands[b] || 0,
              after: secondBrands[b] || 0,
            })).sort((a, b) => (b.after - b.before) - (a.after - a.before)).slice(0, 4);
            if (growing.length === 0) return "你的消費通路分布相對穩定，沒有明顯增加中的通路。";
            return "以下通路消費有增加趨勢：\n\n" + growing.map((g) => "📈 " + g.brand + "：" + g.before + " 次 → " + g.after + " 次").join("\n");
          })(),
        },
      ],
    });
  }

  return hooks;
}

// ── UI 元件 ──────────────────────────────────────────────────────────────
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
      <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
        <div style={{ fontSize: 38, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{hook.big}</div>
        <div style={{ fontSize: 13, color: "#8E8E93", marginTop: 6 }}>{hook.bigSub}</div>
      </div>
      <div style={{ fontSize: 14, color: "#E5E5EA", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{hook.body}</div>

      {hook.ranks && (
        <div style={{ marginTop: 12 }}>
          {hook.ranks.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: i === 0 ? "rgba(255,255,255,0.06)" : "transparent", borderRadius: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{r.rank}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", minWidth: 60 }}>{r.name}</span>
              <span style={{ fontSize: 13, color: "#FFD60A", fontWeight: 600, width: 52 }}>{r.freq}</span>
              <span style={{ fontSize: 12, color: "#8E8E93", flex: 1 }}>{r.note}</span>
            </div>
          ))}
        </div>
      )}

      {hook.trend && hook.trendLabels && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 8 }}>{hook.trendLabel}</div>
          <TrendChart values={hook.trend} labels={hook.trendLabels} color={hook.trendColor} />
        </div>
      )}

      {hook.tip && (
        <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(255,255,255,0.06)", borderRadius: 10, borderLeft: "3px solid #FF9500" }}>
          <div style={{ fontSize: 13, color: "#FFD60A", lineHeight: 1.6, fontWeight: 500 }}>💡 {hook.tip}</div>
        </div>
      )}
    </div>
  );
}

// ── AI Chat 主元件 ───────────────────────────────────────────────────────
export default function AIChat({ invoices, invoiceCount, totalAmount, monthlyTrend, deliverySubs, flatSubs }) {
  const HOOKS = useMemo(
    () => buildHooks(invoices || [], invoiceCount || 0, totalAmount || 0, monthlyTrend),
    [invoices, invoiceCount, totalAmount, monthlyTrend]
  );

  const DEFAULT_REPLY = "根據你的 " + (invoiceCount || 0) + " 張發票，我可以分析你的消費通路、類別分佈和趨勢變化。\n\n試試上面的問題，每一個都是從你的真實發票計算出來的。";

  const stats = useMemo(() => computeStats(invoices || []), [invoices]);
  const topBrand = stats.brands[0];

  const OPENS = [
    { text: "嗨，我看完了你 " + (invoiceCount || 0) + " 張發票。", delay: 400 },
    { text: "想跟你聊聊我觀察到的事。", delay: 1200, dim: true },
    { text: topBrand
        ? "你去「" + topBrand.brand + "」最頻繁——共 " + topBrand.visits + " 次，花了 $" + fmt(topBrand.total) + "。"
        : "讓我幫你分析一下消費狀況。",
      delay: 2200, hook: true },
  ];

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
      <div style={{ padding: "14px 16px 12px", borderBottom: "0.5px solid #2C2C2E", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: "linear-gradient(135deg,#5B7FFF,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff" }}>✦</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>AI 管家</div>
          <div style={{ fontSize: 12, color: "#636366" }}>已分析 {invoiceCount || 0} 張發票</div>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {OPENS.map((o, i) => {
          if (step <= i) return null;
          return (
            <div key={"o" + i} style={{
              alignSelf: "flex-start", maxWidth: o.hook ? "88%" : "80%",
              background: "#1C1C1E", borderRadius: "20px 20px 20px 4px",
              padding: o.hook ? "14px 16px" : "12px 16px",
              borderLeft: o.hook ? "3px solid #FF9500" : "none",
            }}>
              <div style={{ fontSize: o.hook ? 15 : 14, color: o.dim ? "#8E8E93" : "#E5E5EA", lineHeight: 1.6, fontWeight: o.hook ? 500 : 400 }}>{o.text}</div>
            </div>
          );
        })}

        {msgs.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={"m" + i} style={{ alignSelf: "flex-end", maxWidth: "75%", background: "#007AFF", borderRadius: "20px 20px 4px 20px", padding: "10px 16px" }}>
                <div style={{ fontSize: 14, color: "#fff", lineHeight: 1.5 }}>{m.text}</div>
              </div>
            );
          }
          if (m.hook) return <InsightBubble key={"m" + i} hook={m.hook} />;
          return (
            <div key={"m" + i} style={{ alignSelf: "flex-start", maxWidth: "85%", background: "#1C1C1E", borderRadius: "20px 20px 20px 4px", padding: "12px 16px" }}>
              <div style={{ fontSize: 14, color: "#E5E5EA", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{m.text}</div>
            </div>
          );
        })}

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
            <div style={{ fontSize: 14, color: "#E5E5EA", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{dispText}<span style={{ opacity: 0.4 }}>|</span></div>
          </div>
        )}
      </div>

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
                  }}>{fq.q}</button>
                ))}
              </div>
            )}
            {available.length > 0 && phase === "hooks" && (
              <div style={{ marginBottom: 6 }}>
                {followups.length > 0 && <div style={{ fontSize: 11, color: "#636366", marginBottom: 6, marginTop: 2 }}>或探索其他觀察：</div>}
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                  {available.map((h) => (
                    <button key={h.id} onClick={() => tapHook(h)} style={{
                      padding: "8px 14px", borderRadius: 20,
                      border: "1px solid #5B7FFF", background: "rgba(91,127,255,0.1)",
                      color: "#7BA4FF", fontSize: 13, fontWeight: 500,
                      cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                    }}>{h.q}</button>
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
