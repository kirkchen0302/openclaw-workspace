import { useState, useEffect, useRef, useMemo } from "react";
import { computeInsightData } from "./insightEngineV2";

// ── Formatting helpers ──────────────────────────────────────────────────
const fmt = (n) => Number(n).toLocaleString();
const pct = (n) => Math.round(n) + "%";

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

function CtaButton({ primary, label, done, onClick }) {
  if (done) {
    return (
      <button
        disabled
        style={{
          display: "inline-block",
          padding: "10px 20px",
          borderRadius: 20,
          border: `1px solid ${T.border}`,
          background: T.bgSunken,
          color: T.textSubtle,
          fontSize: 13,
          fontWeight: 600,
          cursor: "default",
          marginTop: 6,
          marginRight: 8,
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
        display: "inline-block",
        padding: "10px 20px",
        borderRadius: 20,
        border: primary ? "none" : `1.5px solid ${T.brand}`,
        background: primary ? T.brand : T.bg,
        color: primary ? "#FFFFFF" : T.brand,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        marginTop: 6,
        marginRight: 8,
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
            animation: `aichat2-bounce 1.2s infinite ${d * 0.2}s`,
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
export default function AIChatV2({
  invoices,
  invoiceCount,
  totalAmount,
  monthlyTrend,
}) {
  // ── Compute insight data ──────────────────────────────────────────────
  const D = useMemo(
    () => computeInsightData(invoices || [], invoiceCount || 0, totalAmount || 0, monthlyTrend || []),
    [invoices, invoiceCount, totalAmount, monthlyTrend]
  );

  // ── State ─────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [answeredKeys, setAnsweredKeys] = useState([]);
  const [todos, setTodos] = useState([]);
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

  // ── Opening message on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!D) return;
    setTyping(true);
    const delay = 600 + Math.random() * 800;
    typingTimerRef.current = setTimeout(() => {
      setTyping(false);
      setMessages([{ role: "bot", parts: buildOpening(D) }]);
    }, delay);
    return () => clearTimeout(typingTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [D]);

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

  // ── Build opening message parts ───────────────────────────────────────
  function buildOpening(data) {
    const { tier1, tier2, tier2Total } = data;
    const top = tier1[0] || { name: "未知", amount: 0, pct: 0 };
    const tier2Pct = totalAmount > 0 ? Math.round((tier2Total / totalAmount) * 100) : 0;
    const parts = [];
    parts.push({
      type: "text",
      content: `嗨！我幫你看了過去一年的 ${fmt(invoiceCount)} 張發票，有個發現想跟你分享 👀`,
    });
    parts.push({
      type: "text",
      content: `你花最多錢的是${top.name}，一年 $${fmt(top.amount)}（佔 ${pct(top.pct)}）。`,
    });
    parts.push({
      type: "text",
      content: `但更有趣的是：你有 $${fmt(tier2Total)} 分散在各個通路的零散消費，佔了 ${tier2Pct}%。`,
    });
    parts.push({
      type: "text",
      content: "想知道更多嗎？你也可以直接問我任何問題。",
    });
    return parts;
  }

  // ── Quick reply definitions ───────────────────────────────────────────
  const ALL_CHIPS = [
    { key: "top", label: "錢都花哪裡去？" },
    { key: "cut", label: "哪些錢可以不用花？" },
    { key: "compare", label: "跟別人比我花得多嗎？" },
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
  function simulateBotReply(parts) {
    setTyping(true);
    const delay = 600 + Math.random() * 800;
    typingTimerRef.current = setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { role: "bot", parts }]);
    }, delay);
  }

  // ── Build response for "top" key ──────────────────────────────────────
  function buildTopResponse(data) {
    const { tier1, tier2, tier2Total, signals } = data;
    const parts = [];

    // Signals intro
    if (signals && signals.length > 0) {
      parts.push({
        type: "text",
        content: "先看幾個有趣的數字：\n" + signals.map((s) => `  ${s}`).join("\n"),
      });
    }

    // Tier 1 DataCard
    parts.push({
      type: "datacard",
      title: "花費最多的通路",
      rows: tier1.map((t) => ({
        label: t.name,
        value: `$${fmt(t.amount)}（${pct(t.pct)}）`,
        sub: `${t.count} 次消費`,
        bar: t.pct,
        barColor: T.brand,
      })),
    });

    // Tier 2 summary
    parts.push({
      type: "text",
      content: `此外，你有 $${fmt(tier2Total)} 分散在以下零散通路：`,
    });

    // Tier 2 DataCard
    if (tier2 && tier2.length > 0) {
      parts.push({
        type: "datacard",
        title: "零散消費明細",
        rows: tier2.map((t) => ({
          label: t.store,
          value: `$${fmt(t.amount)}`,
          sub: Array.isArray(t.items) ? t.items.join("、") : t.items || undefined,
        })),
      });
    }

    return parts;
  }

  // ── Build response for "cut" key ──────────────────────────────────────
  function buildCutResponse(data) {
    const { subscriptions, utilities, smartBuy } = data;
    const parts = [];

    // Section 1: Subscriptions
    if (subscriptions && subscriptions.length > 0) {
      parts.push({
        type: "text",
        content: `你有 ${subscriptions.length} 個訂閱服務被偵測到：`,
      });
      parts.push({
        type: "datacard",
        title: "訂閱服務",
        rows: subscriptions.map((s) => ({
          label: `📱 ${s.name}`,
          value: `$${fmt(s.monthlyAmount)}/月`,
          sub: s.note || undefined,
        })),
      });
    } else {
      parts.push({
        type: "text",
        content: "目前沒有偵測到訂閱服務。如果你有用串流、外送等月費服務但沒出現，可能是還沒歸戶該載具。",
      });
      parts.push({
        type: "cta",
        label: "去歸戶載具",
        primary: true,
        todoText: "歸戶載具以偵測訂閱服務",
      });
    }

    // Section 2: Utility bills
    if (utilities) {
      if (utilities.bills && utilities.bills.length > 0) {
        parts.push({
          type: "datacard",
          title: "帳單類支出",
          rows: utilities.bills.map((b) => ({
            label: b.name,
            value: `$${fmt(b.amount)}/月均`,
          })),
        });
      }
      if (utilities.penalties && utilities.penalties.length > 0) {
        parts.push({
          type: "alert",
          icon: "⚠️",
          title: "發現逾期罰款紀錄",
          body: utilities.penalties
            .map((p) => `${p.name}：$${fmt(p.amount)} 罰款`)
            .join("、"),
        });
        parts.push({
          type: "text",
          content: "建議設定自動扣繳，避免不必要的罰款支出。",
        });
        parts.push({
          type: "cta",
          label: "設定自動扣繳提醒",
          primary: false,
          todoText: "設定帳單自動扣繳提醒",
        });
      }
      if (utilities.tips && utilities.tips.length > 0) {
        parts.push({
          type: "text",
          content: utilities.tips.join("\n"),
        });
      }
    }

    // Section 3: Smart buy — package size
    if (smartBuy && smartBuy.length > 0) {
      parts.push({
        type: "text",
        content: "另外，有些常買的東西可以換個方式買更划算：",
      });
      parts.push({
        type: "datacard",
        title: "聰明採購建議",
        rows: smartBuy.map((s) => ({
          label: s.item,
          value: `$${fmt(s.currentPrice)} → $${fmt(s.betterPrice)}`,
          sub: s.tip,
          valueColor: T.success,
        })),
      });
    }

    return parts;
  }

  // ── Build response for "compare" key ──────────────────────────────────
  function buildCompareResponse(data) {
    const { comparison } = data;
    if (!comparison) {
      return [{ type: "text", content: "資料不足，無法進行比較分析。" }];
    }
    const parts = [];
    const { monthlyAvg, tierMedian, position, comparisons, conclusion } = comparison;

    // Monthly avg DataCard
    parts.push({
      type: "datacard",
      title: "你的消費水平",
      rows: [
        {
          label: "你的月均消費",
          value: `$${fmt(monthlyAvg)}`,
        },
        {
          label: "同族群月均",
          value: `$${fmt(tierMedian)}`,
        },
        {
          label: "你的位置",
          value: position,
          valueColor:
            position === "偏高"
              ? T.danger
              : position === "偏低"
              ? T.success
              : T.textBold,
        },
      ],
    });

    // Per-item comparisons
    if (comparisons && comparisons.length > 0) {
      parts.push({
        type: "datacard",
        title: "品項均價 vs 同族群",
        rows: comparisons.map((c) => ({
          label: c.item,
          value: `$${fmt(c.yourPrice)} vs $${fmt(c.medianPrice)}`,
          valueColor: c.yourPrice > c.medianPrice ? T.danger : T.success,
          sub: c.yourPrice > c.medianPrice
            ? `高出 ${pct(((c.yourPrice - c.medianPrice) / c.medianPrice) * 100)}`
            : `低於平均`,
        })),
      });
    }

    // Conclusion
    if (conclusion) {
      parts.push({ type: "text", content: conclusion });
    }

    return parts;
  }

  // ── Handle quick reply tap ────────────────────────────────────────────
  function handleChipTap(chip) {
    // Add user message
    setMessages((prev) => [...prev, { role: "user", text: chip.label }]);
    setAnsweredKeys((prev) => [...prev, chip.key]);

    // Build response
    let parts = [];
    switch (chip.key) {
      case "top":
        parts = buildTopResponse(D);
        break;
      case "cut":
        parts = buildCutResponse(D);
        break;
      case "compare":
        parts = buildCompareResponse(D);
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

    // Keyword matching
    const lower = q.toLowerCase();
    let matchedKey = null;
    if (/花|哪|去哪|多少/.test(lower)) matchedKey = "top";
    if (/省|不用花|訂閱/.test(lower)) matchedKey = "cut";
    if (/別人|比較|平均/.test(lower)) matchedKey = "compare";

    if (matchedKey && !answeredKeys.includes(matchedKey)) {
      setAnsweredKeys((prev) => [...prev, matchedKey]);
      let parts = [];
      switch (matchedKey) {
        case "top":
          parts = buildTopResponse(D);
          break;
        case "cut":
          parts = buildCutResponse(D);
          break;
        case "compare":
          parts = buildCompareResponse(D);
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
            content: `「${found.name}」：你一年在這裡消費了 $${fmt(found.amount)}，共 ${found.count} 次，佔總消費 ${pct(found.pct)}。`,
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
          (t.items && t.items.some((item) => item.toLowerCase().includes(lower)))
      );
      if (found) {
        simulateBotReply([
          {
            type: "text",
            content: `「${found.store}」：消費 $${fmt(found.amount)}。${
              found.items ? "\n常買：" + found.items.join("、") : ""
            }`,
          },
        ]);
        return;
      }
    }

    // Fallback
    const top = D.tier1 && D.tier1[0] ? D.tier1[0] : null;
    simulateBotReply([
      {
        type: "text",
        content: `你這一年總共消費 $${fmt(totalAmount)}${
          top ? `，花最多的是「${top.name}」（$${fmt(top.amount)}）` : ""
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
      default:
        return null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  const chips = remainingChips();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        background: T.bg,
        fontFamily: T.font,
        overflow: "hidden",
      }}
    >
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
        <QuickReplies chips={chips} onTap={handleChipTap} />
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
        @keyframes aichat2-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
