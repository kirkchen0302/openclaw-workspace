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
            animation: `aichat3-bounce 1.2s infinite ${d * 0.2}s`,
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
export default function AIChatV3({
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
    const topCat = (data.categoryStoreMatrix && data.categoryStoreMatrix[0]) || null;
    const topShop = (data.storeCategoryMatrix && data.storeCategoryMatrix[0]) || null;
    const parts = [];
    parts.push({
      type: "text",
      content: `嗨！我分析了你 ${fmt(data.invoices)} 張發票的消費數據 📊`,
    });
    parts.push({
      type: "text",
      content: `你過去一年消費 $${fmt(data.total)}（月均 $${fmt(data.monthly)}），我發現了一些有趣的事...`,
    });
    if (topCat && topShop) {
      parts.push({
        type: "text",
        content: `你最常消費的品類是「${topCat.cat}」，最依賴的通路是「${topShop.shop}」。`,
      });
    }
    parts.push({
      type: "text",
      content: "選一個你感興趣的問題，我來幫你深入分析 👇",
    });
    return parts;
  }

  // ── Quick reply definitions ───────────────────────────────────────────
  const ALL_CHIPS = [
    { key: "where", label: "我的錢都花在哪裡了？" },
    { key: "thief", label: "我有沒有什麼隱藏的花費小偷？" },
    { key: "repeat", label: "我的重複消費行為有哪些？" },
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

  // ── Build response for "where" key ────────────────────────────────────
  function buildWhereResponse(data) {
    const parts = [];
    const storeCount = (data.storeCategoryMatrix || []).length;

    // Summary text
    parts.push({
      type: "text",
      content: `你過去一年消費 $${fmt(data.total)}，分布在 ${storeCount} 個通路。來看看錢都花在哪些地方：`,
    });

    // DataCard: store x category analysis
    const storeRows = (data.storeCategoryMatrix || []).slice(0, 5).map((s) => {
      const catSummary = (s.topCats || [])
        .map((c) => `${c.cat} ${c.pct}%`)
        .join("、");
      return {
        label: s.shop,
        value: `$${fmt(s.total)}`,
        sub: catSummary || undefined,
      };
    });
    if (storeRows.length > 0) {
      parts.push({
        type: "datacard",
        title: "通路 × 品類分析",
        rows: storeRows,
      });
    }

    // Transition text
    parts.push({
      type: "text",
      content: "從品類角度來看：",
    });

    // DataCard: category spend distribution
    const catRows = (data.categoryStoreMatrix || []).slice(0, 5).map((c) => {
      const storeSummary = (c.stores || [])
        .map((st) => `${st.shop} $${fmt(st.amount)}`)
        .join("、");
      return {
        label: c.cat,
        value: `$${fmt(c.total)}`,
        sub: storeSummary || undefined,
      };
    });
    if (catRows.length > 0) {
      parts.push({
        type: "datacard",
        title: "品類消費分布",
        rows: catRows,
      });
    }

    return parts;
  }

  // ── Build response for "thief" key ────────────────────────────────────
  function buildThiefResponse(data) {
    const parts = [];
    const thieves = (data.hiddenThieves || []).slice(0, 6);

    // Summary
    parts.push({
      type: "text",
      content: `我找到了 ${thieves.length} 個可能在偷偷吃掉你預算的消費行為：`,
    });

    // Separate high-severity (AlertCards) vs medium/low (DataCard rows)
    const highItems = thieves.filter((t) => t.severity === "high");
    const otherItems = thieves.filter((t) => t.severity !== "high");

    // High severity: render as AlertCards
    for (const item of highItems) {
      parts.push({
        type: "alert",
        icon: item.icon,
        title: item.title,
        body: item.detail,
      });
    }

    // Medium/low severity: render as DataCard
    if (otherItems.length > 0) {
      parts.push({
        type: "datacard",
        title: "其他花費小偷",
        rows: otherItems.map((item) => ({
          label: `${item.icon} ${item.label}`,
          value: item.title,
          sub: item.detail,
        })),
      });
    }

    // Savings potential from late night
    const lateNight = data.lateNight || {};
    if (lateNight.saveable > 0) {
      parts.push({
        type: "text",
        content: `深夜消費設冷靜期，可年省 $${fmt(lateNight.saveable)}`,
      });
    }

    // Total saveable estimate
    const totalSaveable = (lateNight.saveable || 0);
    if (totalSaveable > 0 && data.fmtComparisons) {
      const comparisonText = data.fmtComparisons(totalSaveable);
      if (comparisonText) {
        parts.push({
          type: "text",
          content: comparisonText,
        });
      }
    }

    // Closing tip
    parts.push({
      type: "text",
      content: "意識到這些花費小偷的存在，就是省錢的第一步。試著在下次消費前多想三秒鐘，效果會比你想像的更好。",
    });

    return parts;
  }

  // ── Build response for "repeat" key ───────────────────────────────────
  function buildRepeatResponse(data) {
    const parts = [];
    const spanMonths = Math.max(data.total / (data.monthly || 1), 1);

    parts.push({
      type: "text",
      content: "我幫你整理了所有重複性支出，分成三個部分來看：",
    });

    // ══════════════════════════════════════════════════════════════════
    // Section 1: 訂閱服務
    // ══════════════════════════════════════════════════════════════════
    if (data.subscriptions && data.subscriptions.length > 0) {
      const annualSub = data.subscriptions.reduce((s, sub) => s + (sub.monthlyAmount || 0) * 12, 0);
      parts.push({
        type: "datacard",
        title: "📱 訂閱服務",
        rows: [
          ...data.subscriptions.map((sub) => ({
            label: sub.name,
            value: `$${fmt(sub.monthlyAmount)}/月`,
            sub: sub.note || undefined,
          })),
          {
            label: "年度合計",
            value: `$${fmt(annualSub)}/年`,
            valueColor: T.danger,
          },
        ],
      });
      parts.push({
        type: "text",
        content: "每個訂閱問自己：「上個月我用了幾次？」想不出來的，先暫停一個月試試。",
      });
    } else {
      parts.push({
        type: "text",
        content: "📱 目前沒有偵測到訂閱服務的發票。但你可能有以下服務正在扣款：Netflix、Spotify、YouTube Premium、iCloud、外送平台會員等。",
      });
      parts.push({
        type: "text",
        content: "這些服務如果沒有歸戶到載具，就不會出現在發票裡。",
      });
      parts.push({
        type: "cta",
        label: "📋 加入待辦：歸戶訂閱服務載具",
        primary: true,
        todoText: "到 App 載具歸戶頁面，把 Netflix / Spotify / iCloud 等訂閱服務歸戶",
      });
      parts.push({
        type: "cta",
        label: "📱 加入待辦：檢查手機訂閱項目",
        primary: false,
        todoText: "打開手機設定 → 訂閱，檢查有哪些正在扣款",
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // Section 2: 公共事業費
    // ══════════════════════════════════════════════════════════════════
    const utils = data.utilities || {};
    const bills = utils.bills || [];
    if (bills.length > 0) {
      const annualUtil = bills.reduce((s, b) => s + (b.amount || 0) * 12, 0);
      parts.push({
        type: "datacard",
        title: "🏠 公共事業費",
        rows: [
          ...bills.map((b) => ({
            label: b.name,
            value: `$${fmt(b.amount)}/月均`,
            sub: `年度 $${fmt(b.amount * 12)}`,
          })),
          {
            label: "年度合計",
            value: `$${fmt(annualUtil)}/年`,
          },
        ],
      });
      // Penalties
      if (utils.penalties && utils.penalties.length > 0) {
        parts.push({
          type: "alert",
          icon: "⚠️",
          title: `發現 $${fmt(utils.penalties.reduce((s, p) => s + p.amount, 0))} 滯納金`,
          body: "逾期繳費被收了違約金。建議開啟繳費到期推播提醒，或設定自動扣繳。",
        });
        parts.push({
          type: "cta",
          label: "🔔 加入待辦：開啟繳費提醒",
          primary: true,
          todoText: "開啟繳費到期推播提醒（電費、水費、瓦斯費到期前 3 天通知）",
        });
      }
      // Tips
      if (utils.tips && utils.tips.length > 0) {
        parts.push({
          type: "text",
          content: "💡 " + utils.tips.join("\n💡 "),
        });
      }
    } else {
      const commonBills = ["電費", "水費", "瓦斯費"];
      parts.push({
        type: "text",
        content: `🏠 你的發票中沒有出現${commonBills.join("、")}。這些帳單可能還沒歸戶到載具。`,
      });
      parts.push({
        type: "cta",
        label: "📋 加入待辦：歸戶電費、水費、瓦斯費",
        primary: true,
        todoText: "到 App 載具歸戶頁面，把台電、自來水、瓦斯公司歸到載具",
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // Section 3: 重複購買品項
    // ══════════════════════════════════════════════════════════════════
    const repeatItems = (data.repeatItems || []).slice(0, 8);
    if (repeatItems.length > 0) {
      const repeatTotal = repeatItems.reduce((s, it) => s + (it.total || 0), 0);
      const annualRepeat = Math.round((repeatTotal / spanMonths) * 12);
      parts.push({
        type: "datacard",
        title: "🔄 重複購買品項",
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
      // Action CTAs for repeat items
      parts.push({
        type: "cta",
        label: "📋 建立下次購買清單",
        primary: true,
        todoText: "建立購買清單：" + repeatItems.slice(0, 5).map((it) => it.name.slice(0, 10)).join("、") + "（設定購買週期提醒）",
      });
      parts.push({
        type: "cta",
        label: "🔔 有更便宜的通知我",
        primary: false,
        todoText: "開啟比價通知：當重複購買品項有更便宜的選擇時推播提醒",
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // Section 4: 省錢建議
    // ══════════════════════════════════════════════════════════════════
    const saves = data.saves || [];
    let totalSaveable = 0;

    // Smart buy (package size — already filtered out restaurant food in engine)
    if (data.smartBuy && data.smartBuy.length > 0 && data.smartBuy[0].currentPrice > 0) {
      parts.push({
        type: "datacard",
        title: "💡 聰明採購",
        rows: data.smartBuy.map((s) => ({
          label: s.item.length > 15 ? s.item.slice(0, 15) + "…" : s.item,
          value: `$${fmt(s.currentPrice)} → $${fmt(s.betterPrice)}`,
          sub: s.tip,
          valueColor: T.success,
        })),
      });
    }

    // Category-specific tips
    if (saves.length > 0) {
      const tipLines = saves.map((s) => {
        totalSaveable += s.save || 0;
        return `${s.icon} ${s.item}：${s.action}，可省 $${fmt(s.save)}/年`;
      });
      parts.push({
        type: "text",
        content: tipLines.join("\n"),
      });
    }

    // Total saveable with psychology comparisons
    if (totalSaveable > 0) {
      parts.push({
        type: "text",
        content: `合計可省 $${fmt(totalSaveable)}/年`,
      });
      if (data.fmtComparisons) {
        const comparisonText = data.fmtComparisons(totalSaveable);
        if (comparisonText) {
          parts.push({ type: "text", content: comparisonText });
        }
      }
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
      case "where":
        parts = buildWhereResponse(D);
        break;
      case "thief":
        parts = buildThiefResponse(D);
        break;
      case "repeat":
        parts = buildRepeatResponse(D);
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
    if (/花|哪|去哪|通路/.test(lower)) matchedKey = "where";
    if (/隱藏|小偷|偷|暴增|深夜/.test(lower)) matchedKey = "thief";
    if (/重複|訂閱|省|月費/.test(lower)) matchedKey = "repeat";

    if (matchedKey && !answeredKeys.includes(matchedKey)) {
      setAnsweredKeys((prev) => [...prev, matchedKey]);
      let parts = [];
      switch (matchedKey) {
        case "where":
          parts = buildWhereResponse(D);
          break;
        case "thief":
          parts = buildThiefResponse(D);
          break;
        case "repeat":
          parts = buildRepeatResponse(D);
          break;
      }
      simulateBotReply(parts);
      return;
    }

    // Search storeCategoryMatrix by store name
    if (D.storeCategoryMatrix) {
      const found = D.storeCategoryMatrix.find(
        (s) => lower.includes(s.shop.toLowerCase()) || s.shop.toLowerCase().includes(lower)
      );
      if (found) {
        const catSummary = (found.topCats || [])
          .map((c) => `${c.cat} $${fmt(c.amount)}（${c.pct}%）`)
          .join("、");
        simulateBotReply([
          {
            type: "text",
            content: `「${found.shop}」：你一年在這裡消費了 $${fmt(found.total)}。\n品類分布：${catSummary}`,
          },
        ]);
        return;
      }
    }

    // Search categoryStoreMatrix by category name
    if (D.categoryStoreMatrix) {
      const found = D.categoryStoreMatrix.find(
        (c) => lower.includes(c.cat.toLowerCase()) || c.cat.toLowerCase().includes(lower)
      );
      if (found) {
        const storeSummary = (found.stores || [])
          .map((st) => `${st.shop} $${fmt(st.amount)}`)
          .join("、");
        simulateBotReply([
          {
            type: "text",
            content: `「${found.cat}」品類：一年消費 $${fmt(found.total)}。\n分布通路：${storeSummary}`,
          },
        ]);
        return;
      }
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
        @keyframes aichat3-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
