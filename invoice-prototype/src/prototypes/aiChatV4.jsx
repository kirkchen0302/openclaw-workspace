import { useState, useEffect, useRef, useMemo } from "react";
import { computeInsightData } from "./insightEngineV2";

// ── Formatting helpers ──────────────────────────────────────────────────
const fmt = (n) => Number(n).toLocaleString();

// ── Design tokens (white theme) ─────────────────────────────────────────
const T = {
  brand: "#3560FF",
  brandLight: "#82A8FF",
  bg: "#FFFFFF",
  bgSunken: "#F7F8F9",
  textBold: "#101119",
  textDefault: "#3B3C43",
  textSubtle: "#737380",
  border: "#EDEFF3",
  success: "#00BD64",
  danger: "#F4252D",
  font: "-apple-system,BlinkMacSystemFont,'SF Pro Text','PingFang TC',sans-serif",
};

// ── Sub-components ──────────────────────────────────────────────────────

function DataCard({ title, rows, children }) {
  return (
    <div
      style={{
        background: T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        marginTop: 10,
        marginBottom: 6,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: T.textBold,
            marginBottom: 10,
          }}
        >
          {title}
        </div>
      )}
      {rows &&
        rows.map((row, i) => (
          <div key={i} style={{ marginBottom: i < rows.length - 1 ? 8 : 0 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: row.bar != null ? 4 : 0,
              }}
            >
              <span style={{ fontSize: 13, color: T.textDefault }}>
                {row.label}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: row.valueColor || T.textBold,
                }}
              >
                {row.value}
              </span>
            </div>
            {row.bar != null && (
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: T.bgSunken,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: Math.min(row.bar, 100) + "%",
                    borderRadius: 3,
                    background: row.barColor || T.brand,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            )}
            {row.sub && (
              <div
                style={{ fontSize: 12, color: T.textSubtle, marginTop: 2 }}
              >
                {row.sub}
              </div>
            )}
          </div>
        ))}
      {children}
    </div>
  );
}

function AlertCard({ icon, title, children }) {
  return (
    <div
      style={{
        background: "#FFF5F5",
        border: "1px solid #FED7D7",
        borderRadius: 12,
        padding: "12px 14px",
        marginTop: 10,
        marginBottom: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: children ? 6 : 0,
        }}
      >
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        <span style={{ fontSize: 13, fontWeight: 700, color: T.danger }}>
          {title}
        </span>
      </div>
      {children && (
        <div style={{ fontSize: 13, color: T.textDefault, lineHeight: 1.6 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function CtaButton({ primary, label, done, onClick, flex }) {
  if (done) {
    return (
      <button
        disabled
        style={{
          flex: flex ? 1 : undefined,
          padding: "10px 14px",
          borderRadius: 20,
          border: `1px solid ${T.border}`,
          background: T.bgSunken,
          color: T.textSubtle,
          fontSize: 13,
          fontWeight: 600,
          cursor: "default",
          marginTop: flex ? 0 : 6,
        }}
      >
        {label}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      style={{
        flex: flex ? 1 : undefined,
        padding: "10px 14px",
        borderRadius: 20,
        border: primary ? "none" : `1.5px solid ${T.brand}`,
        background: primary ? T.brand : T.bg,
        color: primary ? "#FFFFFF" : T.brand,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        marginTop: flex ? 0 : 6,
      }}
    >
      {label}
    </button>
  );
}

function TypingIndicator() {
  return (
    <div
      style={{
        alignSelf: "flex-start",
        background: T.bgSunken,
        borderRadius: "18px 18px 18px 4px",
        padding: "12px 18px",
        display: "flex",
        gap: 5,
      }}
    >
      {[0, 1, 2].map((d) => (
        <div
          key={d}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: T.textSubtle,
            animation: `aichat4-bounce 1.2s infinite ${d * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Quick reply chip set ────────────────────────────────────────────────
function QuickReplies({ chips, onTap }) {
  if (!chips || chips.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        padding: "8px 16px",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          onClick={() => onTap(chip)}
          style={{
            flexShrink: 0,
            padding: "8px 16px",
            borderRadius: 20,
            border: `1.5px solid ${T.brand}`,
            background: T.bg,
            color: T.brand,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────
export default function AIChatV4({
  invoices,
  invoiceCount,
  totalAmount,
  monthlyTrend,
}) {
  // ── Compute insight data ──────────────────────────────────────────────
  const D = useMemo(
    () => computeInsightData(invoices || [], invoiceCount || 0, totalAmount || 0),
    [invoices, invoiceCount, totalAmount]
  );

  // ── State ─────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [answeredKeys, setAnsweredKeys] = useState([]);
  const [todos, setTodos] = useState([]);
  const [phase, setPhase] = useState("auth"); // "auth" | "ready" | "done"
  const scrollRef = useRef(null);
  const typingTimerRef = useRef(null);

  // ── Scroll to bottom on any state change ──────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
    return () => clearTimeout(t);
  }, [messages, typing]);

  // ── Opening: auth phase shows bottom dialog, not a chat message ───────
  // No chat messages on mount — the dialog handles authorization.

  // ── No-data guard ─────────────────────────────────────────────────────
  if (!invoiceCount || !invoices || invoices.length === 0 || !D) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          background: T.bg,
          fontFamily: T.font,
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: T.textBold,
            marginBottom: 8,
          }}
        >
          尚未有發票資料
        </div>
        <div
          style={{
            fontSize: 14,
            color: T.textSubtle,
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          請先歸戶你的載具，讓我們能幫你分析消費。
        </div>
      </div>
    );
  }

  // ── Build auth message (Step 1) ───────────────────────────────────────
  function buildAuthMessage() {
    return [
      {
        type: "text",
        content: "嗨！我是你的消費小幫手 👋",
      },
      {
        type: "text",
        content: "接下來我會分析你過去 12 個月的發票資料，幫你找出隱藏的消費模式和省錢機會。",
      },
      {
        type: "text",
        content: "是否要開始分析？",
      },
    ];
  }

  // ── Build analysis summary (Step 2) ───────────────────────────────────
  function buildSummaryMessage(data) {
    const topShop = (data.storeCategoryMatrix && data.storeCategoryMatrix[0]) || null;
    const topTier1 = (data.tier1 && data.tier1[0]) || null;
    const parts = [];
    parts.push({
      type: "text",
      content: `嗨！我分析了你 ${fmt(data.invoices)} 張發票的消費數據 📊`,
    });
    parts.push({
      type: "text",
      content: `你過去一年消費 $${fmt(data.total)}（月均 $${fmt(data.monthly)}），我發現了一些有趣的事...`,
    });
    if (topShop && topTier1) {
      parts.push({
        type: "text",
        content: `你最常消費的通路是「${topShop.shop}」，花最多的品項是「${topTier1.name}」。`,
      });
    }
    parts.push({
      type: "text",
      content: "選一個你感興趣的問題，我來幫你深入分析 👇",
    });
    return parts;
  }

  // ── Auth chips ────────────────────────────────────────────────────────
  const AUTH_CHIPS = [
    { key: "auth-yes", label: "好，開始分析 🚀" },
    { key: "auth-no", label: "先不用了" },
  ];

  // ── Hook chip definitions ─────────────────────────────────────────────
  const ALL_CHIPS = [
    { key: "hidden", label: "我最大的隱藏花費是什麼？" },
    { key: "save", label: "我一年可以省多少？" },
    { key: "time", label: "我的錢都在什麼時候不見的？" },
  ];

  function remainingChips() {
    return ALL_CHIPS.filter((c) => !answeredKeys.includes(c.key));
  }

  // ── Add a todo confirmation ───────────────────────────────────────────
  function addTodo(todoText) {
    setTodos((prev) => [...prev, todoText]);
    simulateBotReply([
      { type: "text", content: `已加入待辦事項：「${todoText}」` },
    ]);
  }

  // ── Simulate bot reply with typing indicator ──────────────────────────
  // parts can be a flat array (single bubble) or array of arrays (multiple bubbles)
  function simulateBotReply(parts) {
    setTyping(true);
    const delay = 600 + Math.random() * 800;
    typingTimerRef.current = setTimeout(() => {
      setTyping(false);
      // Multiple bubbles: [[parts1], [parts2], ...]
      if (Array.isArray(parts[0]) && Array.isArray(parts[0])) {
        setMessages((prev) => [...prev, ...parts.map((p) => ({ role: "bot", parts: p }))]);
      } else {
        setMessages((prev) => [...prev, { role: "bot", parts }]);
      }
    }, delay);
  }

  // ── Handle auth chip tap ──────────────────────────────────────────────
  function handleAuthChipTap(chip) {
    setMessages((prev) => [...prev, { role: "user", text: chip.label }]);

    if (chip.key === "auth-yes") {
      // Show typing, then summary
      setTyping(true);
      const delay = 1000 + Math.random() * 1000; // 1-2 seconds
      typingTimerRef.current = setTimeout(() => {
        setTyping(false);
        setPhase("ready");
        setMessages((prev) => [...prev, { role: "bot", parts: buildSummaryMessage(D) }]);
      }, delay);
    } else {
      // "先不用了" — goodbye
      setPhase("done");
      simulateBotReply([
        { type: "text", content: "好的，需要的時候隨時點我！" },
      ]);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Hook 1: "hidden" — 我最大的隱藏花費是什麼？
  // ══════════════════════════════════════════════════════════════════════
  function buildHiddenResponse(data) {
    const parts = [];
    const tier1 = data.tier1 || [];
    const tier2 = data.tier2 || [];

    if (tier1.length === 0) {
      parts.push({ type: "text", content: "目前資料不足，無法分析隱藏花費。" });
      return parts;
    }

    const top = tier1[0];
    const avg = Math.round(top.amount / top.count);

    // Lead text
    parts.push({
      type: "text",
      content: `你花最多的是「${top.name}」，一年 $${fmt(top.amount)}（${top.count} 次，每次平均 $${fmt(avg)}）`,
    });

    // DataCard: top 5 from tier1
    const tier1Rows = tier1.slice(0, 5).map((item) => {
      const itemAvg = Math.round(item.amount / item.count);
      return {
        label: item.name,
        value: `$${fmt(item.amount)}（${item.pct}%）`,
        sub: `${item.count} 次，每次 $${fmt(itemAvg)}`,
        bar: item.pct,
      };
    });
    parts.push({
      type: "datacard",
      title: "前 5 大花費項目",
      rows: tier1Rows,
    });

    // Transition text
    const tier2Total = data.tier2Total || 0;
    parts.push({
      type: "text",
      content: `剩下的 $${fmt(tier2Total)} 分散在各通路：`,
    });

    // DataCard: top 5 from tier2
    const tier2Rows = tier2.slice(0, 5).map((s) => ({
      label: s.store,
      value: `$${fmt(s.amount)}`,
      sub: s.items,
    }));
    if (tier2Rows.length > 0) {
      parts.push({
        type: "datacard",
        title: "零散消費",
        rows: tier2Rows,
      });
    }

    // ── 重複購買行為 ──────────────────────────────────────────────────
    const repeatItems = (data.repeatItems || []).slice(0, 6);
    if (repeatItems.length > 0) {
      const spanMonths = Math.max(data.total / (data.monthly || 1), 1);
      const repeatTotal = repeatItems.reduce((s, it) => s + (it.total || 0), 0);
      const annualRepeat = Math.round((repeatTotal / spanMonths) * 12);

      parts.push({
        type: "text",
        content: `另外，你有 ${repeatItems.length} 個品項一直在重複購買：`,
      });
      parts.push({
        type: "datacard",
        title: "🔄 重複購買行為",
        rows: repeatItems.map((item) => {
          const displayName = item.name.length > 15 ? item.name.slice(0, 15) + "…" : item.name;
          const monthly = Math.round(item.total / Math.max(spanMonths, 1));
          return {
            label: displayName,
            value: `${item.count} 次`,
            sub: `共 $${fmt(item.total)}，月均 $${fmt(monthly)}（${item.shop}）`,
          };
        }),
      });
      parts.push({
        type: "text",
        content: `重複消費合計：$${fmt(annualRepeat)}/年`,
      });

      // Per-item savings tips
      const tipLines = [];
      for (const item of repeatItems) {
        const cat = item.cat || "";
        const monthly = Math.round(item.total / Math.max(spanMonths, 1));
        const yearly = monthly * 12;
        if (cat === "咖啡" && yearly > 1000) {
          tipLines.push("☕ " + item.name.slice(0, 12) + "：自備杯折 $3-5 + 考慮平價品牌");
        } else if (["零食/餅乾", "瓶裝飲料"].includes(cat) && yearly > 800) {
          tipLines.push("🏪 " + item.name.slice(0, 12) + "：超商同款在超市省 20-30%");
        } else if (["乳製品"].includes(cat) && yearly > 1000) {
          tipLines.push("🥛 " + item.name.slice(0, 12) + "：固定在超市採購，比超商便宜 15-25%");
        } else if (cat === "餐飲" && item.count >= 8) {
          tipLines.push("🍔 " + item.name.slice(0, 12) + "：善用 App 優惠券和集點");
        }
      }
      if (data.smartBuy && data.smartBuy.length > 0 && data.smartBuy[0].currentPrice > 0 && data.smartBuy[0].betterPrice > 0) {
        const sb = data.smartBuy[0];
        tipLines.push("📦 " + (sb.item.length > 12 ? sb.item.slice(0, 12) + "…" : sb.item) + "：改買大包裝 $" + fmt(sb.currentPrice) + " → $" + fmt(sb.betterPrice));
      }
      if (tipLines.length > 0) {
        parts.push({ type: "text", content: tipLines.join("\n") });
      }

      // Side-by-side CTAs
      parts.push({
        type: "cta-row",
        buttons: [
          { label: "📋 建立購買清單", primary: true, todoText: "建立購買清單：" + repeatItems.slice(0, 5).map((it) => it.name.slice(0, 10)).join("、") + "（設定購買週期提醒）" },
          { label: "🔔 有便宜通知我", primary: false, todoText: "開啟比價通知：當重複購買品項有更便宜的選擇時推播提醒" },
        ],
      });
    }

    return parts;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Hook 2: "save" — 我一年可以省多少？
  // ══════════════════════════════════════════════════════════════════════
  function buildSaveResponse(data) {
    const spanMonths = Math.max(data.total / (data.monthly || 1), 1);
    const bubbles = [];

    // ── Bubble 1: 訂閱服務 ─────────────────────────────────────────────
    const subBubble = [];
    if (data.subscriptions && data.subscriptions.length > 0) {
      const annualSub = data.subscriptions.reduce((s, sub) => s + (sub.monthlyAmount || 0) * 12, 0);
      subBubble.push({
        type: "datacard",
        title: "📱 訂閱服務",
        rows: [
          ...data.subscriptions.map((sub) => ({
            label: sub.name,
            value: `$${fmt(sub.monthlyAmount)}/月`,
            sub: sub.note || undefined,
          })),
          { label: "年度合計", value: `$${fmt(annualSub)}/年`, valueColor: T.danger },
        ],
      });
      subBubble.push({
        type: "cta",
        label: "📋 歸戶更多訂閱發票",
        primary: false,
        todoText: "到 App 載具歸戶頁面，確認所有訂閱服務都已歸戶（Netflix / Spotify / iCloud 等）",
      });
    } else {
      subBubble.push({
        type: "text",
        content: "📱 目前沒有偵測到訂閱服務的發票。但你可能有 Netflix、Spotify、YouTube Premium、iCloud、外送平台會員等服務正在扣款。\n\n這些服務如果沒有歸戶到載具，就不會出現在發票裡。",
      });
      subBubble.push({
        type: "cta",
        label: "📋 歸戶更多訂閱發票",
        primary: true,
        todoText: "到 App 載具歸戶頁面，把 Netflix / Spotify / iCloud 等訂閱服務歸戶",
      });
    }
    bubbles.push(subBubble);

    // ── Bubble 2: 公共事業費 ───────────────────────────────────────────
    const utilBubble = [];
    const utils = data.utilities || {};
    const bills = utils.bills || [];
    if (bills.length > 0) {
      const annualUtil = bills.reduce((s, b) => s + (b.amount || 0) * 12, 0);
      utilBubble.push({
        type: "datacard",
        title: "🏠 公共事業費",
        rows: [
          ...bills.map((b) => ({
            label: b.name,
            value: `$${fmt(b.amount)}/月均`,
            sub: `年度 $${fmt(b.amount * 12)}`,
          })),
          { label: "年度合計", value: `$${fmt(annualUtil)}/年` },
        ],
      });
      if (utils.penalties && utils.penalties.length > 0) {
        utilBubble.push({
          type: "alert",
          icon: "⚠️",
          title: `發現 $${fmt(utils.penalties.reduce((s, p) => s + p.amount, 0))} 滯納金`,
          body: "逾期繳費被收了違約金。建議開啟繳費到期推播提醒，或設定自動扣繳。",
        });
      }
      utilBubble.push({
        type: "cta-row",
        buttons: [
          { label: "📋 歸戶更多公共事業發票", primary: false, todoText: "到 App 載具歸戶頁面，確認台電、自來水、瓦斯公司都已歸戶" },
          { label: "🔔 設定繳費提醒", primary: false, todoText: "設定公共事業費繳費提醒（電費、水費、瓦斯費到期前通知）" },
        ],
      });
    } else {
      utilBubble.push({
        type: "text",
        content: "🏠 你的發票中沒有出現電費、水費、瓦斯費。這些帳單可能還沒歸戶到載具。",
      });
      utilBubble.push({
        type: "cta-row",
        buttons: [
          { label: "📋 歸戶更多公共事業發票", primary: true, todoText: "到 App 載具歸戶頁面，把台電、自來水、瓦斯公司歸到載具" },
          { label: "🔔 設定繳費提醒", primary: false, todoText: "設定公共事業費繳費提醒（電費、水費、瓦斯費到期前通知）" },
        ],
      });
    }
    bubbles.push(utilBubble);

    // ── Bubble 3: 聰明消費 ─────────────────────────────────────────────
    const saveBubble = [];
    const tipLines = [];
    let totalSaveable = 0;

    // Smart buy DataCard
    if (data.smartBuy && data.smartBuy.length > 0 && data.smartBuy[0].currentPrice > 0 && data.smartBuy[0].betterPrice > 0) {
      saveBubble.push({
        type: "datacard",
        title: "💡 買更省的方式",
        rows: data.smartBuy.map((s) => ({
          label: s.item.length > 15 ? s.item.slice(0, 15) + "…" : s.item,
          value: `$${fmt(s.currentPrice)} → $${fmt(s.betterPrice)}`,
          sub: s.tip,
          valueColor: T.success,
        })),
      });
    }

    // Per-item tips for repeat items
    const repeatItems = (data.repeatItems || []).slice(0, 8);
    for (const item of repeatItems) {
      const cat = item.cat || "";
      const monthly = Math.round(item.total / Math.max(spanMonths, 1));
      const yearly = monthly * 12;
      if (cat === "咖啡" && yearly > 1000) {
        const save = Math.round(yearly * 0.3);
        tipLines.push("☕ " + item.name.slice(0, 12) + "：自備杯折 $3-5 + 考慮平價品牌，年省 ~$" + fmt(save));
        totalSaveable += save;
      } else if (["零食/餅乾", "瓶裝飲料"].includes(cat) && yearly > 800) {
        const save = Math.round(yearly * 0.25);
        tipLines.push("🏪 " + item.name.slice(0, 12) + "：超商同款在超市省 20-30%，年省 ~$" + fmt(save));
        totalSaveable += save;
      } else if (["乳製品"].includes(cat) && yearly > 1000) {
        const save = Math.round(yearly * 0.2);
        tipLines.push("🥛 " + item.name.slice(0, 12) + "：固定在超市採購，比超商便宜 15-25%，年省 ~$" + fmt(save));
        totalSaveable += save;
      } else if (cat === "餐飲" && item.count >= 8) {
        tipLines.push("🍔 " + item.name.slice(0, 12) + "：善用 App 優惠券和集點，每次省 10-15%");
        totalSaveable += Math.round(yearly * 0.12);
      }
    }

    // Generic saves from engine
    const saves = data.saves || [];
    for (const s of saves) {
      if (!tipLines.some((t) => t.includes(s.item.slice(0, 8)))) {
        tipLines.push(s.icon + " " + s.item + "：" + s.action + "，可省 $" + fmt(s.save) + "/年");
        totalSaveable += s.save || 0;
      }
    }

    if (tipLines.length > 0) {
      saveBubble.push({ type: "text", content: tipLines.join("\n") });
    }
    if (totalSaveable > 0) {
      saveBubble.push({ type: "text", content: "合計可省 $" + fmt(totalSaveable) + "/年" });
      if (data.fmtComparisons) {
        const ct = data.fmtComparisons(totalSaveable);
        if (ct) saveBubble.push({ type: "text", content: ct });
      }
    }

    if (saveBubble.length === 0) {
      saveBubble.push({ type: "text", content: "💡 你的消費整體看起來還算合理。持續留意重複性支出，有意識地消費就是最好的省錢方式。" });
    }
    bubbles.push(saveBubble);

    return bubbles;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Hook 3: "time" — 我的錢都在什麼時候不見的？
  // ══════════════════════════════════════════════════════════════════════
  function buildTimeResponse(data) {
    const bubbles = [];
    const tp = data.timePatterns || {};
    const lateNight = data.lateNight || {};
    const weekendPremium = data.weekendPremium || {};
    const peakHour = tp.peakHour;
    const peakMonth = tp.peakMonth;
    const timeBuckets = tp.timeBuckets || [];
    const totalBucketAmt = timeBuckets.reduce((s, b) => s + b.amount, 0);

    // ── Bubble 1: 破題 — 用最驚訝的數字開場 ──────────────────────────
    // 優先級：深夜佔比 ≥10% → 週末溢價 ≥20% → 月份版
    const leadBubble = [];
    if (lateNight.pct >= 10 && peakHour && peakHour.hour >= 22) {
      leadBubble.push({
        type: "text",
        content: `你過去一年有 $${fmt(lateNight.total)} 是在深夜花掉的，佔了你總消費的 ${lateNight.pct}%。\n\n深夜的消費決策力比白天低很多，這些錢很多是「滑手機滑出來的」。`,
      });
    } else if (weekendPremium.pct >= 20) {
      leadBubble.push({
        type: "text",
        content: `你週末每筆消費比平日貴 ${weekendPremium.pct}%——平日均 $${fmt(weekendPremium.weekdayAvg)}，但到了週末變成 $${fmt(weekendPremium.weekendAvg)}。\n\n週末容易「犒賞自己」，不知不覺花更多。`,
      });
    } else if (peakMonth) {
      leadBubble.push({
        type: "text",
        content: `你 ${peakMonth.month} 花了全年最多的 $${fmt(peakMonth.amount)}。\n\n可能有大筆消費或季節性支出，值得回頭看看那個月發生了什麼。`,
      });
    } else if (peakHour) {
      leadBubble.push({
        type: "text",
        content: `你的消費高峰在 ${peakHour.hour} 點，光這個時段就花了 $${fmt(peakHour.amount)}。`,
      });
    }
    if (leadBubble.length > 0) bubbles.push(leadBubble);

    // ── Bubble 2: 時段分析 ─────────────────────────────────────────────
    const timeBubble = [];
    if (peakHour) {
      timeBubble.push({
        type: "text",
        content: `你花最多錢的時段是 ${peakHour.hour} 點（$${fmt(peakHour.amount)}）。看看你的錢在一天中怎麼分布的：`,
      });
    }
    if (timeBuckets.length > 0) {
      timeBubble.push({
        type: "datacard",
        title: "⏰ 消費時段分布",
        rows: timeBuckets.slice(0, 5).map((b) => {
          const pct = totalBucketAmt > 0 ? Math.round((b.amount / totalBucketAmt) * 100) : 0;
          return { label: b.name, value: `$${fmt(b.amount)}（${pct}%）`, bar: pct };
        }),
      });
    }
    if (timeBubble.length > 0) bubbles.push(timeBubble);

    // ── Bubble 3: 星期分析 ─────────────────────────────────────────────
    const dayBubble = [];
    const dayOfWeek = tp.dayOfWeek || [];
    const maxDay = tp.maxDay;
    const minDay = tp.minDay;
    const dayRatio = tp.dayRatio || 0;
    const maxDayAvg = dayOfWeek.length > 0 ? Math.max(...dayOfWeek.map((d) => d.avg)) : 1;

    if (maxDay && minDay && dayRatio >= 1.5) {
      dayBubble.push({
        type: "text",
        content: `${maxDay.wk}是你的「破財日」——日均消費 $${fmt(maxDay.avg)}，是${minDay.wk}（$${fmt(minDay.avg)}）的 ${dayRatio} 倍。\n\n${maxDay.wk === "週六" || maxDay.wk === "週日" ? "週末通常是採購日和外出日，花費自然偏高。但知道差距有多大，就能有意識地控制。" : "這天可能是你固定的採購或外食日，注意一下是否有衝動消費。"}`,
      });
    }
    if (dayOfWeek.length > 0) {
      dayBubble.push({
        type: "datacard",
        title: "📅 星期消費分布",
        rows: dayOfWeek.map((d) => ({
          label: d.wk,
          value: `日均 $${fmt(d.avg)}`,
          bar: maxDayAvg > 0 ? Math.round((d.avg / maxDayAvg) * 100) : 0,
        })),
      });
    }
    if (dayBubble.length > 0) bubbles.push(dayBubble);

    // ── Bubble 4: 深夜消費 + 週末溢價 + 建議 ──────────────────────────
    const insightBubble = [];
    if (lateNight.pct >= 10) {
      insightBubble.push({
        type: "alert",
        icon: "🌙",
        title: `深夜消費佔 ${lateNight.pct}%（$${fmt(lateNight.total)}）`,
        body: `深夜（22:00-06:00）的消費通常衝動性更高。減少 30% 就能年省 $${fmt(lateNight.saveable)}。`,
      });
    }
    if (weekendPremium.pct >= 20) {
      insightBubble.push({
        type: "text",
        content: `📆 你週末每筆消費比平日貴 ${weekendPremium.pct}%\n平日均 $${fmt(weekendPremium.weekdayAvg)} → 週末 $${fmt(weekendPremium.weekendAvg)}`,
      });
    }
    if (peakMonth) {
      insightBubble.push({
        type: "text",
        content: `📊 消費最高的月份：${peakMonth.month}（$${fmt(peakMonth.amount)}）`,
      });
    }
    // Actionable tips
    const tips = [];
    if (lateNight.pct >= 10) tips.push("🌙 設定「深夜冷靜期」——22 點後超過 $200 的消費，先加購物車明天再決定");
    if (weekendPremium.pct >= 20) tips.push("📝 週末出門前列好清單和預算，減少衝動消費");
    if (peakMonth) tips.push("📆 留意消費高峰月份，提前規劃大筆支出");
    if (tips.length === 0) tips.push("📝 出門前列清單，避免衝動消費");
    insightBubble.push({ type: "text", content: tips.join("\n") });

    if (insightBubble.length > 0) bubbles.push(insightBubble);

    return bubbles;
  }

  // ── Handle hook chip tap ──────────────────────────────────────────────
  function handleChipTap(chip) {
    // Add user message
    setMessages((prev) => [...prev, { role: "user", text: chip.label }]);
    setAnsweredKeys((prev) => [...prev, chip.key]);

    // Build response
    let parts = [];
    switch (chip.key) {
      case "hidden":
        parts = buildHiddenResponse(D);
        break;
      case "save":
        parts = buildSaveResponse(D);
        break;
      case "time":
        parts = buildTimeResponse(D);
        break;
      default:
        parts = [{ type: "text", content: "抱歉，我不太理解這個問題。" }];
    }
    simulateBotReply(parts);
  }

  // ── Free text input handling ──────────────────────────────────────────
  function handleSend() {
    const q = input.trim();
    if (!q || typing) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);

    // If phase is "loading" or "auth", ignore free text
    if (phase === "auth" || phase === "loading") {
      setTyping(true);
      const delay = 1000 + Math.random() * 1000;
      typingTimerRef.current = setTimeout(() => {
        setTyping(false);
        setPhase("ready");
        setMessages((prev) => [...prev, { role: "bot", parts: buildSummaryMessage(D) }]);
      }, delay);
      return;
    }

    // Keyword matching
    const lower = q.toLowerCase();
    let matchedKey = null;
    if (/花|隱藏|最多/.test(lower)) matchedKey = "hidden";
    if (/省|訂閱|帳單/.test(lower)) matchedKey = "save";
    if (/時間|什麼時候|深夜|週末/.test(lower)) matchedKey = "time";

    if (matchedKey && !answeredKeys.includes(matchedKey)) {
      setAnsweredKeys((prev) => [...prev, matchedKey]);
      let parts = [];
      switch (matchedKey) {
        case "hidden":
          parts = buildHiddenResponse(D);
          break;
        case "save":
          parts = buildSaveResponse(D);
          break;
        case "time":
          parts = buildTimeResponse(D);
          break;
      }
      simulateBotReply(parts);
      return;
    }

    // Search tier1 by name
    if (D.tier1) {
      const found = D.tier1.find(
        (t) => lower.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(lower)
      );
      if (found) {
        simulateBotReply([
          {
            type: "text",
            content: `「${found.name}」：你一年在這裡消費了 $${fmt(found.amount)}，共 ${found.count} 次，佔總消費 ${Math.round(found.pct)}%。`,
          },
        ]);
        return;
      }
    }

    // Search tier2 by store name or item text
    if (D.tier2) {
      const found = D.tier2.find(
        (t) =>
          lower.includes(t.store.toLowerCase()) ||
          t.store.toLowerCase().includes(lower) ||
          (t.items && typeof t.items === "string" && t.items.toLowerCase().includes(lower))
      );
      if (found) {
        simulateBotReply([
          {
            type: "text",
            content: `「${found.store}」：消費 $${fmt(found.amount)}。${
              found.items ? "\n常買：" + found.items : ""
            }`,
          },
        ]);
        return;
      }
    }

    // Fallback
    const topShop = D.storeCategoryMatrix && D.storeCategoryMatrix[0] ? D.storeCategoryMatrix[0] : null;
    simulateBotReply([
      {
        type: "text",
        content: `你這一年總共消費 $${fmt(totalAmount)}${
          topShop ? `，最依賴的通路是「${topShop.shop}」（$${fmt(topShop.total)}）` : ""
        }。\n\n你可以問我更具體的問題，例如某個店名、某個品類、或是點選下方的快速問題。`,
      },
    ]);
  }

  // ── Render a single message part ──────────────────────────────────────
  function renderPart(part, idx) {
    switch (part.type) {
      case "text":
        return (
          <div
            key={idx}
            style={{
              fontSize: 14,
              color: T.textDefault,
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
              marginBottom: 4,
            }}
          >
            {part.content}
          </div>
        );
      case "datacard":
        return <DataCard key={idx} title={part.title} rows={part.rows} />;
      case "alert":
        return (
          <AlertCard key={idx} icon={part.icon} title={part.title}>
            {part.body}
          </AlertCard>
        );
      case "cta": {
        const isDone = todos.includes(part.todoText);
        return (
          <CtaButton
            key={idx}
            primary={part.primary}
            label={isDone ? `${part.label}` : part.label}
            done={isDone}
            onClick={() => {
              if (!isDone) addTodo(part.todoText);
            }}
          />
        );
      }
      case "cta-row":
        return (
          <div key={idx} style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {(part.buttons || []).map((btn, bi) => {
              const isDone = todos.includes(btn.todoText);
              return (
                <CtaButton
                  key={bi}
                  primary={btn.primary}
                  label={btn.label}
                  done={isDone}
                  flex
                  onClick={() => { if (!isDone) addTodo(btn.todoText); }}
                />
              );
            })}
          </div>
        );
      default:
        return null;
    }
  }

  // ── Determine which chips to show ─────────────────────────────────────
  let chips = [];
  if (phase === "ready") {
    chips = remainingChips();
  }
  // auth/loading/done → no chips shown (auth uses dialog)

  // ── Chip tap dispatcher ───────────────────────────────────────────────
  function handleAnyChipTap(chip) {
    handleChipTap(chip);
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        background: T.bg,
        fontFamily: T.font,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* ── Bottom Sheet Dialog (auth phase) ─────────────────────────── */}
      {phase === "auth" && (
        <>
          <div
            onClick={() => {}}
            style={{
              position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)",
              zIndex: 50, transition: "opacity 0.3s",
            }}
          />
          <div
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 51,
              background: T.bg, borderRadius: "20px 20px 0 0",
              padding: "28px 20px 36px",
              boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
              animation: "aichat4-slideUp 0.3s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 22,
                background: "linear-gradient(135deg, #3560FF, #00D4FF)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, color: "#fff",
              }}>✨</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.textBold }}>消費小幫手</div>
                <div style={{ fontSize: 13, color: T.textSubtle }}>AI 發票分析助手</div>
              </div>
            </div>
            <div style={{ fontSize: 15, color: T.textDefault, lineHeight: 1.7, marginBottom: 20 }}>
              嗨！我是你的消費小幫手 👋
              <br /><br />
              接下來我會分析你過去 12 個月的 <strong>{fmt(invoiceCount)}</strong> 張發票資料，幫你找出隱藏的消費模式和省錢機會。
            </div>
            <button
              onClick={() => {
                setPhase("loading");
                setTyping(true);
                setTimeout(() => {
                  setTyping(false);
                  setMessages([{ role: "bot", parts: buildSummaryMessage(D) }]);
                  setPhase("ready");
                }, 1500);
              }}
              style={{
                width: "100%", padding: "14px", borderRadius: 14, border: "none",
                background: T.brand, color: "#fff", fontSize: 16, fontWeight: 600,
                cursor: "pointer", marginBottom: 10,
              }}
            >
              好，開始分析 🚀
            </button>
            <button
              onClick={() => {
                setPhase("done");
                setMessages([{ role: "bot", parts: [{ type: "text", content: "好的，需要的時候隨時點我！👋" }] }]);
              }}
              style={{
                width: "100%", padding: "14px", borderRadius: 14,
                border: "1.5px solid " + T.border, background: T.bg,
                color: T.textSubtle, fontSize: 15, fontWeight: 500, cursor: "pointer",
              }}
            >
              先不用了
            </button>
          </div>
        </>
      )}
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
          background: T.bg,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            background: "linear-gradient(135deg, #3560FF, #00D4FF)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          ✨
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: T.textBold,
            }}
          >
            消費小幫手
          </div>
          <div style={{ fontSize: 12, color: T.textSubtle }}>
            已分析你過去 12 個月的發票
          </div>
        </div>
      </div>

      {/* ── Messages area ───────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 16px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div
                key={i}
                style={{
                  alignSelf: "flex-end",
                  maxWidth: "78%",
                  background: T.brand,
                  borderRadius: "18px 18px 4px 18px",
                  padding: "10px 16px",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    color: "#FFFFFF",
                    lineHeight: 1.5,
                  }}
                >
                  {msg.text}
                </div>
              </div>
            );
          }
          // Bot message with parts
          return (
            <div
              key={i}
              style={{
                alignSelf: "flex-start",
                maxWidth: "88%",
                background: T.bgSunken,
                borderRadius: "18px 18px 18px 4px",
                padding: "12px 16px",
              }}
            >
              {msg.parts && msg.parts.map((part, j) => renderPart(part, j))}
            </div>
          );
        })}

        {/* Typing indicator */}
        {typing && <TypingIndicator />}
      </div>

      {/* ── Quick replies ───────────────────────────────────────────── */}
      {!typing && chips.length > 0 && (
        <QuickReplies chips={chips} onTap={handleAnyChipTap} />
      )}

      {/* ── Input bar ───────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${T.border}`,
          padding: "10px 16px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          background: T.bg,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="直接問我任何消費問題..."
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: 22,
            border: `1px solid ${T.border}`,
            background: T.bgSunken,
            color: T.textBold,
            fontSize: 14,
            outline: "none",
            fontFamily: T.font,
          }}
        />
        <button
          onClick={handleSend}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            background: input.trim() ? T.brand : T.border,
            border: "none",
            cursor: input.trim() ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 18,
            flexShrink: 0,
            transition: "background 0.2s",
          }}
        >
          ↑
        </button>
      </div>

      {/* ── Keyframe animation for typing dots ───────────────────────── */}
      <style>{`
        @keyframes aichat4-slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes aichat4-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
