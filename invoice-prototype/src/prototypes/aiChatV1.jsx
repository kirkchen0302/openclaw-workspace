import { useState, useEffect, useRef, useMemo } from "react";
import { computeStats, detectInsights, fmtComparisons } from "./insightEngine";
import { isNewUser, buildOnboardingContent } from "./onboardingEngine";

const fmt = (n) => n.toLocaleString();
const AI_PROXY_URL = "https://invoice-claude-proxy.kirk-chen-669.workers.dev";

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
            <div style={{ fontSize: 10, fontWeight: last ? 700 : 400, color: last ? color : "#636366" }}>{v >= 1000 ? (v / 1000).toFixed(1) + "k" : "$" + v}</div>
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
      {hook.ranks && (<div style={{ marginTop: 12 }}>{hook.ranks.map((r, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: i === 0 ? "rgba(255,255,255,0.06)" : "transparent", borderRadius: 8, marginBottom: 2 }}><span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{r.rank}</span><span style={{ fontSize: 14, fontWeight: 600, color: "#fff", minWidth: 60 }}>{r.name}</span><span style={{ fontSize: 13, color: "#FFD60A", fontWeight: 600, width: 64 }}>{r.freq}</span><span style={{ fontSize: 12, color: "#8E8E93", flex: 1 }}>{r.note}</span></div>))}</div>)}
      {hook.trend && hook.trendLabels && (<div style={{ marginTop: 14 }}><div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 8 }}>{hook.trendLabel}</div><TrendChart values={hook.trend} labels={hook.trendLabels} color={hook.trendColor} /></div>)}
      {hook.tip && (<div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(255,255,255,0.06)", borderRadius: 10, borderLeft: "3px solid #FF9500" }}><div style={{ fontSize: 13, color: "#FFD60A", lineHeight: 1.6, fontWeight: 500 }}>💡 {hook.tip}</div></div>)}
    </div>
  );
}

// ── AI Chat 主元件（動態洞察 + 樹狀敘事鏈）──────────────────────────────
export default function AIChat({ invoices, invoiceCount, totalAmount, monthlyTrend }) {
  const newUser = isNewUser(invoiceCount);
  const stats = useMemo(() => newUser ? null : computeStats(invoices || []), [invoices, newUser]);

  const { hooks: HOOKS, bridges: BRIDGES, summary: SUMMARY, opener: OPENER } = useMemo(() => {
    if (newUser) return buildOnboardingContent(invoiceCount || 0);
    return detectInsights(stats, invoiceCount || 0, totalAmount || 0, monthlyTrend, invoices);
  }, [newUser, stats, invoiceCount, totalAmount, monthlyTrend]);

  const OPENS = useMemo(() => {
    if (newUser) {
      return [
        { text: "嗨！歡迎來到 AI 管家 👋", delay: 400 },
        { text: "我是你的發票智慧助手，幫你管理發票、分析消費、自動對獎。", delay: 1200, dim: true },
        { text: OPENER, delay: 2200, hook: true },
      ];
    }
    return [
      { text: "嗨，我看完了你 " + (invoiceCount || 0) + " 張發票。", delay: 400 },
      { text: "想跟你聊聊我觀察到的事。", delay: 1200, dim: true },
      { text: OPENER, delay: 2200, hook: true },
    ];
  }, [newUser, invoiceCount, OPENER]);

  const [msgs, setMsgs] = useState([]);
  const [phase, setPhase] = useState("opening");
  const [step, setStep] = useState(0);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [dispText, setDispText] = useState("");
  const [usedIds, setUsedIds] = useState([]);
  const [qState, setQState] = useState({
    followups: [], deepFollowups: [], unlocked: [0], bridgeSent: {},
  });
  const scrollRef = useRef(null);
  const typingRef = useRef(false);
  const ivRef = useRef(null);

  useEffect(() => {
    const timers = OPENS.map((o, i) => setTimeout(() => setStep(i + 1), o.delay));
    const end = setTimeout(() => setPhase("hooks"), OPENS[OPENS.length - 1].delay + 800);
    return () => { timers.forEach(clearTimeout); clearTimeout(end); };
  }, []);

  useEffect(() => {
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 60);
  }, [msgs, dispText, step, typing, qState]);

  function stop() {
    typingRef.current = false;
    setTyping(false);
    setDispText("");
    if (ivRef.current) { clearInterval(ivRef.current); ivRef.current = null; }
  }

  function typeText(text, onDone) {
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
        if (onDone) onDone();
      }
    }, 12);
  }

  function showInsight(hook) {
    stop();
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs((p) => [...p, { role: "ai", hook }]);
      setQState((prev) => ({ ...prev, followups: hook.followups || [], deepFollowups: [] }));
    }, 800);
  }

  function tapHook(hook) {
    stop();
    setMsgs((p) => [...p, { role: "user", text: hook.q }]);
    setUsedIds((p) => [...p, hook.id]);
    setQState((prev) => ({ ...prev, followups: [], deepFollowups: [] }));
    setTimeout(() => showInsight(hook), 400);
  }

  function tapFollowup(fq) {
    stop();
    setMsgs((p) => [...p, { role: "user", text: fq.q }]);
    setQState((prev) => ({ ...prev, followups: prev.followups.filter((f) => f.q !== fq.q), deepFollowups: [] }));
    setTimeout(() => {
      typeText(fq.a, () => {
        if (fq.followups && fq.followups.length > 0) {
          setQState((prev) => ({ ...prev, deepFollowups: fq.followups }));
        } else {
          doUnlockNext();
        }
      });
    }, 400);
  }

  function tapDeepFollowup(dfq) {
    stop();
    setMsgs((p) => [...p, { role: "user", text: dfq.q }]);
    setQState((prev) => ({ ...prev, deepFollowups: prev.deepFollowups.filter((d) => d.q !== dfq.q) }));
    setTimeout(() => {
      typeText(dfq.a, () => { doUnlockNext(); });
    }, 400);
  }

  function doUnlockNext() {
    setQState((prev) => {
      const lastUsedIdx = HOOKS.reduce((max, h, i) => usedIds.includes(h.id) ? i : max, -1);
      const currentMax = Math.max(lastUsedIdx, ...usedIds.map((id) => HOOKS.findIndex((h) => h.id === id)));
      const nextIdx = currentMax + 1;
      if (nextIdx < HOOKS.length && !prev.unlocked.includes(nextIdx) && !prev.bridgeSent[currentMax]) {
        setTimeout(() => {
          const bridgeText = BRIDGES[currentMax] || "";
          if (bridgeText) setMsgs((p) => [...p, { role: "bridge", text: bridgeText }]);
        }, 800);
        return { ...prev, unlocked: [...prev.unlocked, nextIdx], bridgeSent: { ...prev.bridgeSent, [currentMax]: true } };
      } else if (nextIdx >= HOOKS.length && !prev.bridgeSent["final"]) {
        setTimeout(() => { setMsgs((p) => [...p, { role: "ai", text: SUMMARY }]); }, 800);
        return { ...prev, bridgeSent: { ...prev.bridgeSent, final: true } };
      }
      return prev;
    });
  }

  function buildContext() {
    if (newUser) {
      return "這是一個新用戶，還沒有或只有很少發票。請回答關於電子發票載具、歸戶、使用方式、對獎兌獎、桌面小工具等問題。用繁體中文，語氣友善，像在教朋友。";
    }
    const allBrands = stats.brands.filter((b) => b.visits >= 2).slice(0, 15);
    const topCats = stats.cats.slice(0, 8);
    const lines = [
      "用戶發票：" + (invoiceCount || 0) + " 張，總消費 $" + fmt(totalAmount || 0),
      "",
      "重要：每個通路都是獨立品牌，不可混淆。",
      "",
      "通路（每個都是獨立品牌）：",
      ...allBrands.map((b) => "- 【" + b.brand + "】" + b.cat + " | " + b.visits + "次 $" + fmt(b.total) + " 均$" + Math.round(b.total / b.visits)),
      "",
      "類別：",
      ...topCats.map((c) => "- " + c.cat + "：$" + fmt(c.total) + "（" + Math.round((c.total / totalAmount) * 100) + "%）"),
    ];
    // Add item-level details per store (top items for top 8 stores)
    const hasItems = invoices.some((inv) => inv.items && inv.items.length > 0);
    if (hasItems) {
      lines.push("", "各通路常買品項明細（實際品名）：");
      allBrands.slice(0, 8).forEach((b) => {
        const shopInvs = invoices.filter((inv) => {
          const raw = inv.shop || "";
          return raw === b.brand || b.brand.includes(raw) || raw.includes(b.brand);
        });
        const items = {};
        shopInvs.forEach((inv) => {
          (inv.items || []).forEach((it) => {
            if (!items[it.name]) items[it.name] = { count: 0, total: 0 };
            items[it.name].count += it.qty || 1;
            items[it.name].total += it.price || 0;
          });
        });
        const topItems = Object.entries(items).sort((a, b) => b[1].count - a[1].count).slice(0, 6);
        if (topItems.length > 0) {
          lines.push("【" + b.brand + "】" + topItems.map(([name, d]) => name + "(" + d.count + "次$" + Math.round(d.total) + ")").join("、"));
        }
      });
    }
    if (monthlyTrend?.length) { lines.push("", "月趨勢："); monthlyTrend.forEach((m) => lines.push("- " + m.month + "：$" + fmt(m.amount))); }
    lines.push("", "回答規則：用戶問某個通路時，只回答該通路的數據，不要混入其他。用戶問品項時，要列出實際品項名稱和次數。");
    return lines.join("\n");
  }

  async function sendFree() {
    const q = input.trim();
    if (!q) return;
    stop();
    setMsgs((p) => [...p, { role: "user", text: q }]);
    setInput("");
    setQState((prev) => ({ ...prev, followups: [], deepFollowups: [] }));
    setTyping(true);
    try {
      const res = await fetch(AI_PROXY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, context: buildContext() }) });
      const data = await res.json();
      typeText(data.reply || "抱歉，AI 暫時無法回答。");
    } catch { typeText("連線失敗，請稍後再試。"); }
  }

  const { followups, deepFollowups, unlocked: unlockedHooks } = qState;
  const available = HOOKS.filter((h, i) => unlockedHooks.includes(i) && !usedIds.includes(h.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#000" }}>
      <div style={{ padding: "14px 16px 12px", borderBottom: "0.5px solid #2C2C2E", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: "linear-gradient(135deg,#5B7FFF,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff" }}>✦</div>
        <div style={{ flex: 1 }}><div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>AI 管家</div><div style={{ fontSize: 12, color: "#636366" }}>{newUser ? "新手引導模式" : "已分析 " + (invoiceCount || 0) + " 張發票"}</div></div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {OPENS.map((o, i) => {
          if (step <= i) return null;
          return (<div key={"o" + i} style={{ alignSelf: "flex-start", maxWidth: o.hook ? "88%" : "80%", background: "#1C1C1E", borderRadius: "20px 20px 20px 4px", padding: o.hook ? "14px 16px" : "12px 16px", borderLeft: o.hook ? "3px solid #FF9500" : "none" }}><div style={{ fontSize: o.hook ? 15 : 14, color: o.dim ? "#8E8E93" : "#E5E5EA", lineHeight: 1.6, fontWeight: o.hook ? 500 : 400 }}>{o.text}</div></div>);
        })}
        {msgs.map((m, i) => {
          if (m.role === "user") return (<div key={"m" + i} style={{ alignSelf: "flex-end", maxWidth: "75%", background: "#007AFF", borderRadius: "20px 20px 4px 20px", padding: "10px 16px" }}><div style={{ fontSize: 14, color: "#fff", lineHeight: 1.5 }}>{m.text}</div></div>);
          if (m.role === "bridge") return (<div key={"m" + i} style={{ alignSelf: "flex-start", maxWidth: "88%", background: "#1C1C1E", borderRadius: "20px 20px 20px 4px", padding: "14px 16px", borderLeft: "3px solid #FF9500" }}><div style={{ fontSize: 15, color: "#E5E5EA", lineHeight: 1.6, fontWeight: 500 }}>{m.text}</div></div>);
          if (m.hook) return <InsightBubble key={"m" + i} hook={m.hook} />;
          return (<div key={"m" + i} style={{ alignSelf: "flex-start", maxWidth: "85%", background: "#1C1C1E", borderRadius: "20px 20px 20px 4px", padding: "12px 16px" }}><div style={{ fontSize: 14, color: "#E5E5EA", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{m.text}</div></div>);
        })}
        {typing && !dispText && (<div style={{ alignSelf: "flex-start", background: "#1C1C1E", borderRadius: "20px 20px 20px 4px", padding: "12px 16px" }}><div style={{ display: "flex", gap: 4 }}>{[0, 1, 2].map((d) => (<div key={d} style={{ width: 8, height: 8, borderRadius: 4, background: "#636366", animation: "pulse 1s infinite " + (d * 0.2) + "s" }} />))}</div></div>)}
        {typing && dispText && (<div style={{ alignSelf: "flex-start", maxWidth: "85%", background: "#1C1C1E", borderRadius: "20px 20px 20px 4px", padding: "12px 16px" }}><div style={{ fontSize: 14, color: "#E5E5EA", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{dispText}<span style={{ opacity: 0.4 }}>|</span></div></div>)}
      </div>

      <div style={{ flexShrink: 0, borderTop: "0.5px solid #2C2C2E", marginBottom: 56 }}>
        {!typing && (deepFollowups.length > 0 || followups.length > 0 || (available.length > 0 && phase === "hooks")) && (
          <div style={{ maxHeight: 180, overflowY: "auto", padding: "8px 16px 0" }}>
            {deepFollowups.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                {deepFollowups.some((d) => d.q.startsWith("✅") || d.q.startsWith("⏰"))
                  ? <div style={{ fontSize: 11, color: "#636366", marginBottom: 6 }}>設定好了嗎？</div>
                  : <div style={{ fontSize: 11, color: "#636366", marginBottom: 6 }}>深入了解：</div>
                }
                {deepFollowups.map((dfq, i) => {
                  const isAction = dfq.q.startsWith("✅");
                  const isDefer = dfq.q.startsWith("⏰");
                  const isCheckpoint = isAction || isDefer;
                  return (<button key={"d" + i} onClick={() => tapDeepFollowup(dfq)} style={{
                    display: isCheckpoint ? "inline-block" : "block",
                    width: isCheckpoint ? "auto" : "100%",
                    padding: isCheckpoint ? "10px 20px" : "10px 14px",
                    borderRadius: isCheckpoint ? 20 : 12,
                    border: isAction ? "1.5px solid #34C759" : isDefer ? "1.5px solid #636366" : "1px solid #5B4A9E",
                    background: isAction ? "rgba(52,199,89,0.1)" : isDefer ? "rgba(99,99,102,0.1)" : "rgba(91,127,255,0.05)",
                    color: isAction ? "#34C759" : isDefer ? "#8E8E93" : "#B4A0FF",
                    fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "center",
                    marginBottom: 6, marginRight: isCheckpoint ? 8 : 0,
                  }}>{dfq.q}</button>);
                })}
              </div>
            )}
            {followups.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                {followups[0] && (followups[0].q.startsWith("💳") || followups[0].q.startsWith("🚇") || followups[0].q.startsWith("📱") || followups[0].q.startsWith("💵"))
                  ? <div style={{ fontSize: 11, color: "#636366", marginBottom: 6 }}>選擇你的付款方式：</div>
                  : <div style={{ fontSize: 11, color: "#636366", marginBottom: 6 }}>{deepFollowups.length > 0 ? "或回到其他追問：" : "追問更多："}</div>
                }
                {followups.map((fq, i) => (<button key={"f" + i} onClick={() => tapFollowup(fq)} style={{ display: "block", width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid #3A3A3C", background: "#1C1C1E", color: "#E5E5EA", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left", marginBottom: 6 }}>{fq.q}</button>))}
              </div>
            )}
            {available.length > 0 && phase === "hooks" && (
              <div style={{ marginBottom: 6 }}>
                {(followups.length > 0 || deepFollowups.length > 0) && <div style={{ fontSize: 11, color: "#636366", marginBottom: 6, marginTop: 2 }}>或探索其他觀察：</div>}
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                  {available.map((h) => (<button key={h.id} onClick={() => tapHook(h)} style={{ padding: "8px 14px", borderRadius: 20, border: "1px solid #5B7FFF", background: "rgba(91,127,255,0.1)", color: "#7BA4FF", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{h.q}</button>))}
                </div>
              </div>
            )}
          </div>
        )}
        <div style={{ padding: "8px 16px 10px", display: "flex", gap: 8, alignItems: "center" }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendFree(); }} placeholder="或直接問我任何消費問題..." style={{ flex: 1, padding: "10px 16px", borderRadius: 22, border: "1px solid #3A3A3C", background: "#1C1C1E", color: "#fff", fontSize: 14, outline: "none" }} />
          <button onClick={sendFree} style={{ width: 36, height: 36, borderRadius: 18, background: input.trim() ? "#007AFF" : "#3A3A3C", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, flexShrink: 0 }}>↑</button>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
    </div>
  );
}
