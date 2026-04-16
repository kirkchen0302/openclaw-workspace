import { useState, useRef, useEffect, useMemo } from "react";
import { fetchUserData } from "./firebase";
import AiButler0408v1, { AiButler0408v1Embedded } from "./prototypes/aiButler0408v1";
import InvoicePrototypeV3 from "./prototypes/invoicePrototypeV3";

// ─── 訂閱資料 ─────────────────────────────────────────────────────────────────
const SUBSCRIPTIONS = [
  {
    id: "ubereats",
    name: "UberEats+",
    icon: "🛵",
    fee: 178,
    type: "roi",
    renewDay: 15,
    months: [
      { m: "12月", orders: 8, feeWaived: 392 },
      { m: "1月",  orders: 5, feeWaived: 245 },
      { m: "2月",  orders: 2, feeWaived:  98 },
    ],
    roiStatus: "danger",
    roiLabel: "本月虧損 $80",
    roiTip: "本月叫了 2 次外送，免運費共 $98，但訂閱費 $178，虧損 $80。至少需叫 4 次才能回本。",
    actionLabel: "考慮暫停訂閱",
    actionColor: "#A32D2D",
    actionBg: "#FCEBEB",
  },
  {
    id: "foodpanda",
    name: "foodpanda Pro",
    icon: "🐼",
    fee: 149,
    type: "roi",
    renewDay: 22,
    months: [
      { m: "12月", orders: 6, feeWaived: 270 },
      { m: "1月",  orders: 7, feeWaived: 315 },
      { m: "2月",  orders: 5, feeWaived: 225 },
    ],
    roiStatus: "green",
    roiLabel: "本月划算 +$76",
    roiTip: "本月叫了 5 次，免運費 $225，扣掉訂閱費 $149，還省了 $76。繼續保留划算！",
    actionLabel: "繼續保留",
    actionColor: "#3B6D11",
    actionBg: "#EAF3DE",
  },
];

// 定額訂閱：僅保留會開立發票的項目
const FLAT_SUBS = [
  { id: "apple", name: "Apple iCloud", icon: "☁️", fee: 90, renewDay: 24, trend: "stable", months: [90, 90, 90] },
];

// ─── 帳單提醒資料（根據發票週期推估，無確定金額與日期） ──────────────────────
const BILLS = [
  { id: "b1", name: "台電電費",     icon: "⚡",  cycle: "約每 2 個月",  lastSeen: "1月底",  daysEstimate: 2,  status: "urgent",   tip: "過去紀錄約 60 天一期，距上次發票約 58 天"  },
  { id: "b2", name: "台灣大哥大",   icon: "📶",  cycle: "約每個月",     lastSeen: "2月底",  daysEstimate: 8,  status: "normal",   tip: "過去紀錄每月固定出現，距上次約 22 天"       },
  { id: "b3", name: "國泰人壽保費", icon: "🛡️", cycle: "約每個月",     lastSeen: "2月中",  daysEstimate: 13, status: "upcoming", tip: "過去紀錄每月固定出現，距上次約 17 天"       },
  { id: "b4", name: "台灣自來水",   icon: "💧",  cycle: "約每 2 個月",  lastSeen: "1月底",  daysEstimate: 18, status: "upcoming", tip: "過去紀錄約 60 天一期，距上次發票約 42 天"  },
];

// 帳單歷史趨勢資料（近3個月）
const BILL_HISTORY = {
  b1: { name: "台電電費",     icon: "⚡",  data: [980, 1100, 1240],  color: "#378ADD" },
  b2: { name: "台灣大哥大",   icon: "📶",  data: [599, 599, 599],    color: "#639922" },
  b3: { name: "國泰人壽保費", icon: "🛡️", data: [3200, 3200, 3200], color: "#7F77DD" },
  b4: { name: "台灣自來水",   icon: "💧",  data: [280, 300, 320],    color: "#378ADD" },
};

// 基準日設定為 2026/3/25
const TODAY = new Date("2026-03-25T00:00:00");

// ─── 任務更換資料 ──────────────────────────────────────────────────────────────
const TASK_SWAP_CHANNELS = ["全聯", "麥當勞", "7-11", "全家", "UberEats", "foodpanda"];
const TASK_SWAP_CATEGORIES = ["飲料", "咖啡", "早餐", "日用品"];
const TASK_SWAP_MOCK = {
  "全聯":     { title: "全聯消費滿額",   desc: "至全聯消費滿 $200，拿 $80 禮券", reward: 80, daysLeft: 8  },
  "麥當勞":   { title: "麥當勞早餐任務", desc: "購買任一早餐組合，享 $30 折扣",   reward: 30, daysLeft: 10 },
  "7-11":     { title: "7-11 咖啡任務",  desc: "購買任一杯咖啡，集點 2 點",       reward: 20, daysLeft: 14 },
  "全家":     { title: "全家集點挑戰",   desc: "消費集點達標可兌換禮品",           reward: 25, daysLeft: 7  },
  "UberEats": { title: "UberEats 訂餐",  desc: "完成一筆外送訂單，折抵 $50",      reward: 50, daysLeft: 5  },
  "foodpanda":{ title: "foodpanda 挑戰", desc: "完成一筆外送，享 $40 回饋",        reward: 40, daysLeft: 6  },
  "飲料":     { title: "飲料購買任務",   desc: "購買任一瓶裝飲料，集點 1 點",     reward: 10, daysLeft: 30 },
  "咖啡":     { title: "咖啡愛好者",     desc: "購買任一杯咖啡，享早鳥優惠",      reward: 20, daysLeft: 14 },
  "早餐":     { title: "早餐達人",       desc: "購買早餐組合，省 $15",             reward: 15, daysLeft: 10 },
  "日用品":   { title: "日用品補貨",     desc: "購買任一日用品，享 5% 回饋",      reward: 30, daysLeft: 8  },
};

// ─── 其他頁面資料 ─────────────────────────────────────────────────────────────
const AUTO_TASKS = [
  { id: "t1", shop: "UberEats 台灣", icon: "🛵", title: "外送達人挑戰",   desc: "上月叫了 21 次，本月再叫 3 次即可達標",    progress: 2,   target: 3,   unit: "次", reward: 50, daysLeft: 8, urgency: "high", basis: "根據你過去 3 個月的外送頻率自動生成" },
  { id: "t2", shop: "全聯實業",       icon: "🛒", title: "全聯本月衝標",   desc: "已消費 $489，距門檻 $500 還差 $11",         progress: 489, target: 500, unit: "$", reward: 80, daysLeft: 3, urgency: "high", basis: "你每月在全聯穩定消費，自動計算距門檻差額" },
  { id: "t3", shop: "麥當勞",         icon: "🍔", title: "麥當勞集點任務", desc: "本月已去 8 次，再去 2 次解鎖集點獎勵",      progress: 8,   target: 10,  unit: "次", reward: 30, daysLeft: 8, urgency: "med",  basis: "你是麥當勞常客，任務對你來說難度很低" },
];

const INVOICES = [
  { day: "28", week: "週六", shop: "全國電子",     type: "載具", amount: 45799, highlight: true },
  { day: "28", week: "週六", shop: "UberEats 台灣", type: "載具", amount: 180 },
  { day: "27", week: "週五", shop: "麥當勞",        type: "載具", amount: 210 },
  { day: "27", week: "週五", shop: "全聯實業",      type: "載具", amount: 489 },
  { day: "26", week: "週四", shop: "路易莎咖啡",    type: "載具", amount: 125 },
  { day: "25", week: "週三", shop: "大苑子",        type: "載具", amount: 75  },
  { day: "25", week: "週三", shop: "7-11統一超商",  type: "載具", amount: 85  },
  { day: "24", week: "週二", shop: "Apple",         type: "載具", amount: 90  },
  { day: "23", week: "週一", shop: "麥當勞",        type: "載具", amount: 189 },
];

const PIE_DATA = [
  { label: "外食", pct: 32, color: "#378ADD" },
  { label: "購物", pct: 28, color: "#639922" },
  { label: "訂閱", pct: 18, color: "#7F77DD" },
  { label: "交通", pct: 12, color: "#BA7517" },
  { label: "其他", pct: 10, color: "#D85A30" },
];

const QUICK_QUESTIONS = {
  invoices: ["這筆花費值得嗎？", "幫我分析這個月", "哪家我最常去？"],
};

const AI_ANSWERS = {
  "這筆花費值得嗎？": { text: "全國電子 $45,799 這筆，算是大型電器消費。記得對獎，金額大的發票中獎機率也更高 🎯" },
  "幫我分析這個月":   { text: "2月共 63 張發票，總金額 $75,737。外食 32%、購物 28%、訂閱 18%。本月訂閱費 $936 略高，加上 UberEats+ 虧損，建議進行訂閱健康檢查。" },
  "哪家我最常去？":   { text: "UberEats（21次）、麥當勞（8次）、全聯（7次）、7-11（6次）、路易莎（5次）。這 3 家都已自動生成任務！" },
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root:       { width: 375, minHeight: "100vh", background: "#F2F2F7", fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Noto Sans TC', sans-serif", position: "relative", margin: "0 auto", display: "flex", flexDirection: "column" },
  screen:     { flex: 1, overflowY: "auto", paddingBottom: 160 },
  header:     { background: "#fff", padding: "12px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #F0F0F0" },
  headerTitle:{ fontSize: 22, fontWeight: 700, color: "#1C1C1E" },
  iconBtn:    { width: 34, height: 34, borderRadius: 17, background: "#F2F2F7", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 },
  card:       { background: "#fff", borderRadius: 14, padding: 14, margin: "0 16px 10px" },
  tabBar:     { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 375, background: "#fff", borderTop: "1px solid #E8E8E8", display: "flex", alignItems: "flex-end", zIndex: 100, paddingBottom: 4 },
  tabItem:    { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0 4px", cursor: "pointer", border: "none", background: "transparent", gap: 2 },
  tabScan:    { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", border: "none", background: "transparent", position: "relative", paddingBottom: 4 },
  scanBubble: { width: 50, height: 50, borderRadius: 13, background: "#378ADD", display: "flex", alignItems: "center", justifyContent: "center", marginTop: -16, boxShadow: "0 4px 12px rgba(55,138,221,0.35)", fontSize: 22 },
  segment:    { display: "flex", background: "#F2F2F7", borderRadius: 10, padding: 2, margin: "0 16px 10px" },
  segItem:    (a) => ({ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: a ? "#fff" : "transparent", color: a ? "#1C1C1E" : "#8E8E93", boxShadow: a ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.2s" }),
};

function Logo() {
  return (
    <div style={{ width: 30, height: 30, background: "#378ADD", borderRadius: 7, transform: "rotate(45deg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ transform: "rotate(-45deg)", fontSize: 13 }}>💳</span>
    </div>
  );
}

function DonutChart({ pieData }) {
  const data = pieData || PIE_DATA;
  const stops = []; let acc = 0;
  data.forEach(d => { stops.push(`${d.color} ${acc}% ${acc + d.pct}%`); acc += d.pct; });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ position: "relative", width: 68, height: 68, flexShrink: 0 }}>
        <div style={{ width: 68, height: 68, borderRadius: "50%", background: `conic-gradient(${stops.join(", ")})` }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 42, height: 42, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#1C1C1E" }}>$75.7k</span>
        </div>
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
        {data.map(d => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: d.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#8E8E93" }}>{d.label} {d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 訂閱健康頁 ───────────────────────────────────────────────────────────────
function MiniTrend({ vals, color }) {
  const max = Math.max(...vals);
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 24 }}>
      {vals.map((v, i) => (
        <div key={i} style={{ flex: 1, borderRadius: "2px 2px 0 0", background: i === vals.length - 1 ? color : "#E8E8E8", height: `${(v / max) * 24}px` }} />
      ))}
    </div>
  );
}

function RoiCard({ sub, expanded, onToggle }) {
  const latest = sub.months[sub.months.length - 1];
  const roi = latest.feeWaived - sub.fee;
  const statusColor = sub.roiStatus === "green" ? "#3B6D11" : sub.roiStatus === "warn" ? "#854F0B" : "#A32D2D";
  const statusBg   = sub.roiStatus === "green" ? "#EAF3DE" : sub.roiStatus === "warn" ? "#FAEEDA" : "#FCEBEB";

  return (
    <div style={{ background: "#fff", borderRadius: 13, marginBottom: 8, overflow: "hidden", border: sub.roiStatus === "danger" ? "1.5px solid #F09595" : "1px solid #EBEBEB" }}>
      <div onClick={onToggle} style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: "#F2F2F7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{sub.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#1C1C1E" }}>{sub.name}</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 7px", borderRadius: 6, background: statusBg, color: statusColor }}>{sub.roiLabel}</span>
          </div>
          <div style={{ fontSize: 12, color: "#8E8E93" }}>月費 ${sub.fee} · {sub.renewDay}日續訂 · 本月平台總花費 ${latest.totalSpend ?? (sub.fee + (latest.extraSpend || 0))}</div>
        </div>
        <span style={{ color: "#C7C7CC", fontSize: 13 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #F5F5F5" }}>
          <div style={{ marginTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 8 }}>近幾個月消費明細</div>
            <div style={{ display: "flex", gap: 8 }}>
              {sub.months.map((m, i) => {
                const r = m.feeWaived - sub.fee;
                const extra = m.extraSpend ?? 0;
                const total = m.totalSpend ?? (sub.fee + extra);
                return (
                  <div key={i} style={{ flex: 1, background: "#F8F8F8", borderRadius: 8, padding: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>{m.m}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1C1C1E" }}>月費 ${sub.fee}</div>
                    {extra > 0 && <div style={{ fontSize: 11, color: "#636366" }}>額外 +${extra}</div>}
                    <div style={{ fontSize: 11, color: "#378ADD", fontWeight: 600 }}>總花費 ${total}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: r >= 0 ? "#3B6D11" : "#A32D2D", marginTop: 2 }}>省運費 {r >= 0 ? "+" : ""}{r}</div>
                    <div style={{ fontSize: 11, color: "#8E8E93" }}>{m.orders}次外送</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ background: statusBg, borderRadius: 9, padding: "9px 11px" }}>
            <div style={{ fontSize: 13, color: statusColor, lineHeight: 1.6 }}>
              {sub.roiStatus === "danger" ? "⚠️ " : "✅ "}{sub.roiTip}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FlatSubCard({ sub, expanded, onToggle }) {
  const trendUp = sub.trend === "up";
  const latestFee = sub.months[sub.months.length - 1];
  const prevFee   = sub.months[sub.months.length - 2];
  const diff = latestFee - prevFee;

  return (
    <div style={{ background: "#fff", borderRadius: 13, marginBottom: 8, overflow: "hidden", border: trendUp ? "1.5px solid #FAC775" : "1px solid #EBEBEB" }}>
      <div onClick={onToggle} style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: "#F2F2F7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{sub.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#1C1C1E" }}>{sub.name}</span>
            {trendUp && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 7px", borderRadius: 6, background: "#FAEEDA", color: "#854F0B" }}>費用調漲</span>}
          </div>
          <div style={{ fontSize: 12, color: "#8E8E93" }}>月費 ${latestFee} · 下次續訂：{typeof sub.renewDay === "number" ? `每月${sub.renewDay}日` : sub.renewDay}{diff > 0 ? ` · 比上月多 $${diff}` : ""}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <MiniTrend vals={sub.months} color={trendUp ? "#EF9F27" : "#378ADD"} />
        </div>
        <span style={{ color: "#C7C7CC", fontSize: 13, marginLeft: 6 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #F5F5F5" }}>
          <div style={{ marginTop: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 6 }}>近3個月費用</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["12月", "1月", "2月"].map((m, i) => (
                <div key={i} style={{ flex: 1, background: "#F8F8F8", borderRadius: 8, padding: "7px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 3 }}>{m}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1C1C1E" }}>${sub.months[i]}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "#F8F8F8", borderRadius: 9, padding: "9px 11px", marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: "#636366", lineHeight: 1.6 }}>
              💡 此訂閱為定額方案，AI 僅追蹤費用變化。是否續訂請依個人使用習慣決定。
              {trendUp && <span style={{ color: "#854F0B", fontWeight: 600 }}> 本月費用已調漲，建議重新評估使用需求。</span>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#E6F1FB", borderRadius: 9, padding: "9px 11px", marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>📅</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#185FA5" }}>預計下次續訂：{typeof sub.renewDay === "number" ? `每月${sub.renewDay}日` : sub.renewDay}</div>
              <div style={{ fontSize: 12, color: "#378ADD" }}>如需取消，請在續訂日前操作</div>
            </div>
          </div>
          {/* 僅保留設定提醒，移除「前往管理訂閱」 */}
          <button style={{ width: "100%", padding: "8px", borderRadius: 9, background: "#F2F2F7", color: "#3C3C43", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>設定提醒</button>
        </div>
      )}
    </div>
  );
}

function SubscriptionsPage({ deliverySubs = [], flatSubs = [], invoices = [] }) {
  const [seg, setSeg] = useState("sub");
  const [expSub, setExpSub] = useState(deliverySubs[0]?.id || "");
  const [expFlat, setExpFlat] = useState(flatSubs[0]?.id || "");
  const [subConfig, setSubConfig] = useState(null);

  // 從 RTDB 讀訂閱設定
  useEffect(() => {
    fetch("https://pm-prototype-a75ce-default-rtdb.asia-southeast1.firebasedatabase.app/subscriptionConfig.json")
      .then(r => r.json())
      .then(d => { if (d) setSubConfig(d); })
      .catch(() => {});
  }, []);

  // 計算下次續訂日：從最近一張發票日期往後推一個月
  function calcNextRenew(shopKeywords) {
    const matched = invoices
      .filter(inv => shopKeywords.some(k => inv.shop.includes(k)))
      .sort((a, b) => (b.yearMonth || "").localeCompare(a.yearMonth || ""));
    if (matched.length === 0) return null;
    // 取最近一筆的 yearMonth，取其日期推算下次續訂
    const ym = matched[0].yearMonth; // e.g. "2026-02"
    if (!ym) return null;
    const [y, m] = ym.split("-").map(Number);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    return `${nextY}/${nextM}月`;
  }

  // 從 invoices 找某訂閱最後一筆的日期，取「日」作為每月續訂日
  function calcRenewDay(shopKeywords) {
    const matched = invoices
      .filter(inv => shopKeywords.some(k => inv.shop.includes(k)) && inv.issuedDate)
      .sort((a, b) => (b.issuedDate || "").localeCompare(a.issuedDate || ""));
    if (matched.length > 0 && matched[0].issuedDate) {
      const day = parseInt(matched[0].issuedDate.split("-")[2], 10);
      if (day > 0 && day <= 31) return day;
    }
    // fallback：用 yearMonth 的月底前幾天估算（不返回固定值）
    return null;
  }

  // 定額訂閱：只用 RTDB 傳進來的 flatSubs，沒資料就空陣列（不從 invoices 重算）
  const computedFlatSubs = useMemo(() => {
    if (!flatSubs || flatSubs.length === 0) return [];
    return flatSubs.map(sub => ({
      ...sub,
      renewDay: sub.renewDay ?? "—",
      icon: sub.icon || (sub.name === "Apple" ? "☁️" : sub.name === "Nintendo" ? "🎮" : sub.name === "Netflix" ? "🎬" : sub.name === "Disney+" ? "🏰" : sub.name === "YouTube" ? "▶️" : "📱"),
    }));
  }, [flatSubs]);

  // 計算近3個月訂閱總支出
  // deliverySubs.months 格式：[{m, orders, feeWaived}]，取 fee（月費固定）
  // flatSubs.months 格式：[number, number, number]
  // 取 deliverySubs months 的月份標籤（各訂閱取聯集，有幾個顯示幾個）
  const subMonthLabels = (() => {
    const allLabels = deliverySubs.flatMap(s => (s.months || []).map(m => m.m));
    const unique = [...new Set(allLabels)];
    return unique.length > 0 ? unique : computedFlatSubs.length > 0 ? [""] : [];
  })();
  const monthCount = Math.max(subMonthLabels.length, 1);

  const getFlatFee = (sub, idx) => {
    const m = sub.months?.[idx];
    return typeof m === "number" ? m : sub.fee || 0;
  };
  // delivery fee 固定月費；flat fee 按月份索引取
  const monthTotals = Array.from({ length: monthCount }, (_, idx) =>
    deliverySubs.reduce((s, sub) => s + (sub.fee || 0), 0) +
    computedFlatSubs.reduce((s, sub) => s + getFlatFee(sub, idx), 0)
  );
  const maxT = Math.max(...monthTotals, 1);
  const dangerCount = deliverySubs.filter(x => x.roiStatus === "danger").length;
  const totalSubCount = deliverySubs.length + computedFlatSubs.length;

  return (
    <div>
      <div style={S.header}>
        <span style={S.headerTitle}>訂閱管理</span>
        <div style={{ display: "flex", gap: 6 }}><button style={S.iconBtn}>🔔</button></div>
      </div>

      <div style={{ margin: "10px 16px 10px", borderRadius: 14, background: "#1C1C1E", padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>本月訂閱總支出</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>${monthTotals[2]}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>較上月</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: monthTotals[2] > monthTotals[1] ? "#F09595" : "#9FE1CB" }}>
              {monthTotals[2] > monthTotals[1] ? "+" : ""}{monthTotals[2] - monthTotals[1]}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 36, marginBottom: 8 }}>
          {subMonthLabels.map((m, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ width: "100%", borderRadius: "3px 3px 0 0", background: i === 2 ? (monthTotals[2] > monthTotals[1] ? "#F09595" : "#5DCAA5") : "rgba(255,255,255,0.2)", height: `${(monthTotals[i] / maxT) * 32}px` }} />
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{m}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 0, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10 }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{totalSubCount}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>訂閱項目</div>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,0.12)" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: dangerCount > 0 ? "#F09595" : "#9FE1CB" }}>{dangerCount} 個</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>效益偏低</div>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,0.12)" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>1 個</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>本週續訂</div>
          </div>
        </div>
      </div>

      <div style={S.segment}>
        <button style={S.segItem(seg === "sub")} onClick={() => setSeg("sub")}>外送訂閱（效益分析）</button>
        <button style={S.segItem(seg === "flat")} onClick={() => setSeg("flat")}>定額訂閱（費用追蹤）</button>
      </div>

      <div style={{ padding: "0 16px" }}>
        {seg === "sub" && (
          <>
            <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 8, lineHeight: 1.6 }}>
              外送訂閱費用可從你的發票計算實際效益，幫助你判斷是否值得繼續訂閱。
            </div>
            {deliverySubs.length === 0 && <div style={{ fontSize: 13, color: "#8E8E93", textAlign: "center", padding: 20 }}>近期無外送訂閱紀錄</div>}
            {deliverySubs.map(sub => (
              <RoiCard key={sub.id} sub={sub} expanded={expSub === sub.id}
                onToggle={() => setExpSub(expSub === sub.id ? null : sub.id)} />
            ))}
          </>
        )}
        {seg === "flat" && (
          <>
            <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 8, lineHeight: 1.6 }}>
              定額訂閱無法計算使用效益，AI 幫你追蹤費用變化、提醒續訂時間，讓你自主決定是否繼續。
            </div>
            {computedFlatSubs.length === 0 && <div style={{ fontSize: 13, color: "#8E8E93", textAlign: "center", padding: 20 }}>近期無定額訂閱紀錄</div>}
            {computedFlatSubs.map(sub => (
              <FlatSubCard key={sub.id} sub={sub} expanded={expFlat === sub.id}
                onToggle={() => setExpFlat(expFlat === sub.id ? null : sub.id)} />
            ))}
          </>
        )}
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

// ─── 帳單提醒頁 ───────────────────────────────────────────────────────────────

function BillCard({ bill }) {
  const urgencyColor = bill.status === "urgent" ? "#A32D2D" : bill.status === "normal" ? "#185FA5" : "#5F5E5A";
  const urgencyBg    = bill.status === "urgent" ? "#FCEBEB" : bill.status === "normal" ? "#E6F1FB" : "#F2F2F7";
  const urgencyLabel = bill.status === "urgent" ? "⚠️ 可能快到了" : `約 ${bill.daysEstimate} 天後`;

  return (
    <div style={{ background: "#fff", borderRadius: 13, padding: "12px 14px", marginBottom: 8, border: bill.status === "urgent" ? "1.5px solid #F09595" : "1px solid #EBEBEB" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: urgencyBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{bill.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1C1C1E", marginBottom: 2 }}>{bill.name}</div>
          <div style={{ fontSize: 12, color: "#8E8E93" }}>{bill.cycle} · 上次：{bill.lastSeen}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: urgencyBg, color: urgencyColor }}>{urgencyLabel}</div>
        </div>
      </div>
      {/* AI 推估說明 */}
      <div style={{ marginTop: 8, padding: "7px 10px", background: "#F8F8F8", borderRadius: 8, fontSize: 12, color: "#8E8E93", lineHeight: 1.5 }}>
        🤖 {bill.tip}
      </div>
    </div>
  );
}

// 帳單趨勢圖表
function BillTrendChart() {
  const months = ["12月", "1月", "2月"];
  const bills = Object.values(BILL_HISTORY);

  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "16px", margin: "0 16px 10px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1C1C1E", marginBottom: 4 }}>帳單趨勢分析</div>
      <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 16 }}>近 3 個月各項帳單金額變化</div>

      {bills.map((bill) => {
        const max = Math.max(...bill.data);
        const min = Math.min(...bill.data);
        const isRising = bill.data[2] > bill.data[1];
        const diff = bill.data[2] - bill.data[1];

        return (
          <div key={bill.name} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 15 }}>{bill.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1C1C1E" }}>{bill.name}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {diff !== 0 && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: isRising ? "#A32D2D" : "#3B6D11", background: isRising ? "#FCEBEB" : "#EAF3DE", borderRadius: 5, padding: "2px 6px" }}>
                    {isRising ? `↑ +$${diff}` : `↓ -$${Math.abs(diff)}`}
                  </span>
                )}
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1C1C1E" }}>${bill.data[2].toLocaleString()}</span>
              </div>
            </div>

            {/* 柱狀圖 */}
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 56 }}>
              {bill.data.map((val, i) => {
                const heightPct = max > 0 ? (val / max) * 48 : 0;
                const isLatest = i === bill.data.length - 1;
                const barColor = isLatest
                  ? (isRising && diff !== 0 ? "#E05C5C" : bill.color)
                  : "#E0E8F0";
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: isLatest ? 700 : 400, color: isLatest ? "#1C1C1E" : "#AEAEB2" }}>${val >= 1000 ? (val / 1000).toFixed(1) + "k" : val}</span>
                    <div style={{ width: "100%", height: `${heightPct}px`, borderRadius: "4px 4px 0 0", background: barColor, minHeight: 4 }} />
                    <span style={{ fontSize: 11, color: "#8E8E93" }}>{months[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* 總覽摘要 */}
      <div style={{ marginTop: 8, padding: "10px 12px", background: "#F2F2F7", borderRadius: 10 }}>
        <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 4 }}>本月帳單合計</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#1C1C1E" }}>
            ${BILLS.reduce((s, b) => s + b.amount, 0).toLocaleString()}
          </span>
          <span style={{ fontSize: 12, color: "#A32D2D", fontWeight: 600 }}>
            較上月 +${BILLS.reduce((s, b) => s + (b.amount - b.lastMonth), 0).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function BillsPage({ invoices = [] }) {
  // 帳單偵測規則
  const BILL_PATTERNS = [
    {
      key: "power", name: "台電電費", icon: "⚡", color: "#378ADD",
      keywords: ["台電", "電力"],
      // 奇數月繳（1,3,5,7,9,11月）
      nextDueMonths: [1, 3, 5, 7, 9, 11],
      cycleLabel: "每 2 個月",
    },
    {
      key: "water", name: "台灣自來水", icon: "💧", color: "#54A8E0",
      keywords: ["自來水"],
      // 偶數月繳（2,4,6,8,10,12月）
      nextDueMonths: [2, 4, 6, 8, 10, 12],
      cycleLabel: "每 2 個月",
    },
    {
      key: "mobile", name: "電信費", icon: "📶", color: "#639922",
      keywords: ["大哥大", "遠傳", "中華電信", "台灣之星", "威達", "亞太"],
      nextDueMonths: [1,2,3,4,5,6,7,8,9,10,11,12],
      cycleLabel: "每個月",
    },
    {
      key: "insurance", name: "保險費", icon: "🛡️", color: "#7F77DD",
      keywords: ["人壽", "保險", "國泰", "新光", "富邦保", "南山"],
      nextDueMonths: [1,2,3,4,5,6,7,8,9,10,11,12],
      cycleLabel: "每個月",
    },
  ];

  const detectedBills = useMemo(() => {
    if (!invoices || invoices.length === 0) return [];

    // 從發票找出每筆帳單的歷史金額（依月份）
    const todayM = TODAY.getMonth() + 1; // 3
    const todayY = TODAY.getFullYear();  // 2026

    const found = [];
    for (const pattern of BILL_PATTERNS) {
      // 撈出符合關鍵字的發票
      const matched = invoices.filter(inv =>
        pattern.keywords.some(k => inv.shop.includes(k))
      );
      if (matched.length === 0) continue;

      // 依月份統計金額（取各月第一筆）
      const byMonth = {};
      for (const inv of matched) {
        const key = `${inv.yearMonth || ""}`;
        if (!byMonth[key] || inv.amount > byMonth[key]) {
          byMonth[key] = inv.amount;
        }
      }
      const sortedMonths = Object.keys(byMonth).sort();
      const recentMonths = sortedMonths.slice(-6);
      const trendData = recentMonths.map(ym => ({
        label: ym.split("-")[1] + "月",
        amount: byMonth[ym],
      }));

      // 推算下次繳費月份
      const dueMths = pattern.nextDueMonths;
      // 找下一個到期月（從今天 3/25 往後）
      let nextDueMonth = null, nextDueYear = todayY;
      for (let offset = 0; offset <= 12; offset++) {
        const m = ((todayM - 1 + offset) % 12) + 1;
        const y = todayY + Math.floor((todayM - 1 + offset) / 12);
        if (dueMths.includes(m)) {
          // 電費/水費：月底前繳，設定為當月最後一天
          const dueDay = new Date(y, m, 0); // 當月最後一天
          if (dueDay >= TODAY) {
            nextDueMonth = m;
            nextDueYear = y;
            break;
          }
        }
      }

      // 計算距離繳費日天數
      let daysLeft = null;
      let dueLabel = "";
      if (nextDueMonth) {
        const dueDate = new Date(nextDueYear, nextDueMonth, 0); // 月底
        const diff = Math.ceil((dueDate - TODAY) / (1000 * 60 * 60 * 24));
        daysLeft = diff;
        dueLabel = `${nextDueYear}/${nextDueMonth}月底`;
      }

      const status = daysLeft !== null
        ? (daysLeft <= 7 ? "urgent" : daysLeft <= 20 ? "normal" : "upcoming")
        : "upcoming";

      // 最近一期金額
      const lastAmt = trendData.length > 0 ? trendData[trendData.length - 1].amount : null;
      const prevAmt = trendData.length > 1 ? trendData[trendData.length - 2].amount : null;

      found.push({
        id: pattern.key,
        name: matched[0]?.shop || pattern.name,
        displayName: pattern.name,
        icon: pattern.icon,
        color: pattern.color,
        cycleLabel: pattern.cycleLabel,
        dueLabel,
        daysLeft,
        status,
        lastAmount: lastAmt,
        prevAmount: prevAmt,
        trendData,
        tip: `AI 偵測到此費用，${pattern.cycleLabel}繳一次，預計 ${dueLabel} 到期`,
      });
    }
    return found;
  }, [invoices]);

  const urgent = detectedBills.filter(b => b.status === "urgent");

  // 本月帳單合計（本月有出現的帳單，用最後一期金額）
  const monthlyTotal = detectedBills
    .filter(b => b.lastAmount)
    .reduce((s, b) => s + b.lastAmount, 0);

  return (
    <div>
      <div style={S.header}>
        <span style={S.headerTitle}>帳單提醒</span>
        <div style={{ display: "flex", gap: 6 }}><button style={S.iconBtn}>🔔</button></div>
      </div>

      {/* 緊急橫幅 */}
      {urgent.length > 0 && (
        <div style={{ margin: "10px 16px 10px", borderRadius: 13, background: "#FCEBEB", border: "1.5px solid #F7C1C1", padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#A32D2D" }}>
                {urgent.map(b => b.displayName).join("、")} 繳費週期快到了！
              </div>
              <div style={{ fontSize: 13, color: "#D85A30", lineHeight: 1.5 }}>
                AI 推估距繳費日剩 {urgent[0].daysLeft} 天，請確認繳費狀態
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 總覽 */}
      <div style={{ margin: "0 16px 10px", borderRadius: 13, background: "#fff", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 4 }}>AI 從發票偵測到的固定帳單</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1C1C1E" }}>{detectedBills.length} 項帳單週期追蹤中</div>
          <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 4 }}>依歷史發票頻率推估，實際金額以收到帳單為準</div>
        </div>
        <button style={{ flexShrink: 0, padding: "10px 16px", borderRadius: 12, border: "none", background: "#378ADD", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 3px 10px rgba(55,138,221,0.35)" }}>
          立即繳費
        </button>
      </div>

      {/* 帳單列表 */}
      <div style={{ padding: "0 16px 4px" }}>
        <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 8 }}>
          AI 根據你的發票推估繳費週期（基準日：2026/3/25）
        </div>
        {detectedBills.length === 0
          ? <div style={{ fontSize: 13, color: "#8E8E93", textAlign: "center", padding: 24 }}>尚未偵測到固定帳單</div>
          : detectedBills.map(bill => <DynamicBillCard key={bill.id} bill={bill} />)
        }
      </div>

      {/* 趨勢圖 */}
      {detectedBills.length > 0 && <DynamicBillTrendChart bills={detectedBills} />}

      <div style={{ ...S.card, background: "#F2F2F7", textAlign: "center", padding: "12px" }}>
        <div style={{ fontSize: 13, color: "#8E8E93", lineHeight: 1.7 }}>
          📌 帳單資料由 AI 從發票自動偵測，若有漏偵或已不再使用，可手動管理
        </div>
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

function DynamicBillCard({ bill }) {
  const urgencyColor = bill.status === "urgent" ? "#A32D2D" : bill.status === "normal" ? "#185FA5" : "#5F5E5A";
  const urgencyBg    = bill.status === "urgent" ? "#FCEBEB" : bill.status === "normal" ? "#E6F1FB" : "#F2F2F7";
  const urgencyLabel = bill.daysLeft !== null
    ? (bill.status === "urgent" ? `⚠️ 剩 ${bill.daysLeft} 天` : `約 ${bill.daysLeft} 天後`)
    : "週期未到";
  const diff = bill.lastAmount && bill.prevAmount ? bill.lastAmount - bill.prevAmount : null;

  return (
    <div style={{ background: "#fff", borderRadius: 13, padding: "12px 14px", marginBottom: 8, border: bill.status === "urgent" ? "1.5px solid #F09595" : "1px solid #EBEBEB" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: urgencyBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{bill.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#1C1C1E" }}>{bill.displayName}</span>
            {diff !== null && diff !== 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 6px", borderRadius: 5, background: diff > 0 ? "#FCEBEB" : "#EAF3DE", color: diff > 0 ? "#A32D2D" : "#3B6D11" }}>
                {diff > 0 ? `↑ +$${diff}` : `↓ -$${Math.abs(diff)}`}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#8E8E93" }}>
            {bill.cycleLabel}繳一次 · 上次：{bill.trendData.length > 0 ? `$${bill.lastAmount?.toLocaleString()}` : "無紀錄"}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, minWidth: 80 }}>
          <div style={{ fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: urgencyBg, color: urgencyColor, whiteSpace: "nowrap" }}>{urgencyLabel}</div>
          <div style={{ fontSize: 12, color: "#8E8E93", marginTop: 4, whiteSpace: "nowrap" }}>預計 {bill.dueLabel}</div>
        </div>
      </div>
      <div style={{ marginTop: 8, padding: "7px 10px", background: "#F8F8F8", borderRadius: 8, fontSize: 12, color: "#8E8E93", lineHeight: 1.5 }}>
        🤖 {bill.tip}
      </div>
    </div>
  );
}

function DynamicBillTrendChart({ bills }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "16px", margin: "0 16px 10px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1C1C1E", marginBottom: 4 }}>帳單趨勢分析</div>
      <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 16 }}>近6個月各項帳單金額變化</div>

      {bills.filter(b => b.trendData.length > 0).map(bill => {
        const vals = bill.trendData.map(t => t.amount);
        const max = Math.max(...vals, 1);
        const isRising = vals.length >= 2 && vals[vals.length-1] > vals[vals.length-2];
        const diff = vals.length >= 2 ? vals[vals.length-1] - vals[vals.length-2] : 0;

        return (
          <div key={bill.id} style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid #F2F2F7" }}>
            {/* 標題列 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 15 }}>{bill.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1C1C1E" }}>{bill.displayName}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {diff !== 0 && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: isRising ? "#A32D2D" : "#3B6D11", background: isRising ? "#FCEBEB" : "#EAF3DE", borderRadius: 5, padding: "2px 6px" }}>
                    {isRising ? `↑ +$${diff}` : `↓ -$${Math.abs(diff)}`}
                  </span>
                )}
                <span style={{ fontSize: 15, fontWeight: 700, color: "#1C1C1E" }}>
                  ${vals[vals.length-1].toLocaleString()}
                </span>
              </div>
            </div>
            {/* 柱狀圖：底部對齊，金額標籤在上，月份標籤在下 */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              {bill.trendData.map((t, i) => {
                const h = Math.max((t.amount / max) * 80, 4);
                const isLast = i === bill.trendData.length - 1;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    {/* 金額標籤固定在柱子上方 */}
                    <span style={{ fontSize: 11, fontWeight: isLast ? 700 : 400, color: isLast ? "#1C1C1E" : "#AEAEB2", marginBottom: 5, whiteSpace: "nowrap" }}>
                      {t.amount >= 1000 ? `$${(t.amount/1000).toFixed(1)}k` : `$${t.amount}`}
                    </span>
                    {/* 柱子：高度由下往上長，底部自然對齊 */}
                    <div style={{ width: "100%", height: `${h}px`, borderRadius: "4px 4px 0 0", background: isLast ? (isRising && diff !== 0 ? "#E05C5C" : bill.color) : "#E0E8F0" }} />
                    {/* 月份標籤在柱子下方 */}
                    <span style={{ fontSize: 11, color: "#8E8E93", marginTop: 6 }}>{t.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── AI Panel（僅限發票頁使用） ────────────────────────────────────────────────
function AIPanel({ tabKey, userData }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const [rtdbQA, setRtdbQA] = useState({});
  const endRef = useRef(null);

  // 從 RTDB 讀問題集
  useEffect(() => {
    import("./firebase").then(({ fetchUserData: fetchData }) => {
      fetch("https://pm-prototype-a75ce-default-rtdb.asia-southeast1.firebasedatabase.app/qa.json")
        .then(r => r.json())
        .then(d => { if (d) setRtdbQA(d); })
        .catch(() => {});
    });
  }, []);

  // 依用戶消費行為動態生成問題
  const dynamicQuestions = useMemo(() => {
    const base = [];
    const topShops = (userData?.autoTasks || []).map(t => t.shop);
    const hasFoodpanda = (userData?.deliverySubs || []).some(s => s.id === "foodpandapro");
    const hasUber = (userData?.deliverySubs || []).some(s => s.id === "ubereats+");
    if (topShops[0]) base.push(`我在 ${topShops[0]} 花了多少？`);
    if (topShops[1]) base.push(`${topShops[1]} 值得繼續去嗎？`);
    if (hasFoodpanda || hasUber) base.push("我的外送訂閱划算嗎？");
    base.push("幫我分析這個月消費");
    base.push("哪家我最常去？");
    return base.slice(0, 4);
  }, [userData]);

  const questions = dynamicQuestions;

  const sendQ = (q) => {
    const question = q || input.trim();
    if (!question) return;
    setMessages(p => [...p, { role: "user", text: question }]);
    setInput(""); setTyping(true); setDisplayText("");
    // 先查 RTDB 問題集，再查本地，最後 fallback
    const ans = rtdbQA[question] || AI_ANSWERS[question] || { text: "根據你的發票資料分析中...😊 目前 AI 正在學習你的消費習慣，即將提供個人化建議。" };
    const text = typeof ans === "string" ? ans : ans.text || "";
    let i = 0;
    const iv = setInterval(() => {
      i++; setDisplayText(text.slice(0, i));
      if (i >= text.length) { clearInterval(iv); setTyping(false); setMessages(p => [...p, { role: "ai", text }]); setDisplayText(""); }
    }, 18);
  };

  return (
    <div style={{ position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)", width: 375, zIndex: 98 }}>
      {!open ? (
        <div style={{ padding: "6px 16px" }}>
          <button onClick={() => setOpen(true)} style={{ width: "100%", padding: "10px 14px", borderRadius: 22, border: "1px solid #E0E0E0", background: "#fff", fontSize: 13, color: "#8E8E93", cursor: "pointer", textAlign: "left", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>💬</span><span>問 AI 管家...</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#378ADD", fontWeight: 600 }}>省錢找我</span>
          </button>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: "18px 18px 0 0", boxShadow: "0 -4px 24px rgba(0,0,0,0.10)", padding: "12px 14px 14px", maxHeight: 380, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>🤖 AI 管家</span>
              <span style={{ fontSize: 11, background: "#E6F1FB", color: "#185FA5", padding: "3px 7px", borderRadius: 5, fontWeight: 600 }}>省錢顧問</span>
            </div>
            <button onClick={() => { setOpen(false); setMessages([]); }} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#8E8E93" }}>×</button>
          </div>
          <div style={{ overflowY: "auto", flex: 1, marginBottom: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>💡</div>
                <div style={{ fontSize: 13, color: "#8E8E93", lineHeight: 1.6 }}>問我發票相關的省錢問題！</div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", padding: "8px 12px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: m.role === "user" ? "#378ADD" : "#F2F2F7", color: m.role === "user" ? "#fff" : "#1C1C1E", fontSize: 13, lineHeight: 1.5 }}>{m.text}</div>
            ))}
            {typing && displayText && (
              <div style={{ alignSelf: "flex-start", maxWidth: "85%", padding: "8px 12px", borderRadius: "16px 16px 16px 4px", background: "#F2F2F7", fontSize: 13, lineHeight: 1.5 }}>
                {displayText}<span>|</span>
              </div>
            )}
            <div ref={endRef} />
          </div>
          {!typing && questions.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
              {questions.map(q => <button key={q} onClick={() => sendQ(q)} style={{ padding: "5px 8px", borderRadius: 11, border: "1px solid #378ADD", background: "#E6F1FB", color: "#185FA5", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>{q}</button>)}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendQ()}
              placeholder="輸入問題..." style={{ flex: 1, padding: "8px 12px", borderRadius: 18, border: "1px solid #E0E0E0", fontSize: 13, outline: "none" }} />
            <button onClick={() => sendQ()} style={{ width: 36, height: 36, borderRadius: 18, background: "#378ADD", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>➤</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 任務更換 Modal ────────────────────────────────────────────────────────────
function TaskSwapModal({ task, onConfirm, onClose, userData }) {
  const [mode, setMode] = useState("channel");
  const [selected, setSelected] = useState(null);

  const options = mode === "channel" ? TASK_SWAP_CHANNELS : TASK_SWAP_CATEGORIES;

  // 依用戶消費能力動態調整任務條件
  const preview = useMemo(() => {
    if (!selected) return null;
    const base = TASK_SWAP_MOCK[selected];
    if (!base) return null;
    // 從用戶發票統計選定通路的消費
    const invoices = userData?.invoices || [];
    const shopInvs = invoices.filter(inv => inv.shop === selected || inv.shop.includes(selected.split(" ")[0]));
    const avgAmt = shopInvs.length > 0
      ? Math.round(shopInvs.reduce((s, i) => s + i.amount, 0) / shopInvs.length)
      : 0;
    const monthlyCount = Math.round(shopInvs.length / 6); // 6個月平均月次

    // 挑戰目標：比平均月次多 30%
    const challengeCount = Math.max(monthlyCount + 2, 3);
    const challengeAmt = avgAmt > 0 ? Math.round(avgAmt * challengeCount * 1.1 / 100) * 100 : base.reward + 20;

    return {
      ...base,
      desc: shopInvs.length > 0
        ? `你每月平均去 ${monthlyCount} 次，本月再去 ${Math.max(1, challengeCount - monthlyCount)} 次就達標`
        : base.desc,
      reward: Math.min(Math.max(base.reward, avgAmt > 500 ? 80 : 30), 150),
      daysLeft: base.daysLeft,
    };
  }, [selected, userData]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: 375, padding: "20px 16px 32px", maxHeight: "80vh", overflowY: "auto" }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "#E0E0E0" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1C1C1E" }}>更換任務</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "#8E8E93", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 16 }}>選擇通路或商品類型，AI 幫你找對應任務</div>

        {/* 切換 mode */}
        <div style={{ display: "flex", background: "#F2F2F7", borderRadius: 10, padding: 2, marginBottom: 16 }}>
          <button style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: mode === "channel" ? "#fff" : "transparent", color: mode === "channel" ? "#1C1C1E" : "#8E8E93", transition: "all 0.2s" }} onClick={() => { setMode("channel"); setSelected(null); }}>選擇通路</button>
          <button style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: mode === "category" ? "#fff" : "transparent", color: mode === "category" ? "#1C1C1E" : "#8E8E93", transition: "all 0.2s" }} onClick={() => { setMode("category"); setSelected(null); }}>選擇商品類型</button>
        </div>

        {/* 選項列表 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {options.map(opt => (
            <button key={opt} onClick={() => setSelected(opt)}
              style={{ padding: "8px 16px", borderRadius: 20, border: `1.5px solid ${selected === opt ? "#378ADD" : "#E0E0E0"}`, background: selected === opt ? "#E6F1FB" : "#fff", color: selected === opt ? "#185FA5" : "#1C1C1E", fontSize: 13, fontWeight: selected === opt ? 700 : 400, cursor: "pointer", transition: "all 0.15s" }}>
              {opt}
            </button>
          ))}
        </div>

        {/* 預覽任務 */}
        {preview && (
          <div style={{ background: "#E6F1FB", borderRadius: 12, padding: "12px 14px", marginBottom: 16, border: "1px solid #B5D4F4" }}>
            <div style={{ fontSize: 12, color: "#185FA5", fontWeight: 600, marginBottom: 6 }}>替換任務預覽</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1C1C1E", marginBottom: 4 }}>{preview.title}</div>
            <div style={{ fontSize: 13, color: "#636366", marginBottom: 8 }}>{preview.desc}</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 13, background: "#EAF3DE", color: "#3B6D11", padding: "3px 8px", borderRadius: 6, fontWeight: 600 }}>獎勵 ${preview.reward}</span>
              <span style={{ fontSize: 12, color: "#8E8E93" }}>期限 {preview.daysLeft} 天</span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1px solid #E0E0E0", background: "#fff", color: "#636366", fontSize: 14, cursor: "pointer", fontWeight: 500 }}>取消</button>
          <button onClick={() => preview && onConfirm(preview)} disabled={!preview}
            style={{ flex: 2, padding: "11px", borderRadius: 12, border: "none", background: preview ? "#378ADD" : "#E0E0E0", color: "#fff", fontSize: 14, cursor: preview ? "pointer" : "not-allowed", fontWeight: 700 }}>
            確認更換
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 任務頁 ───────────────────────────────────────────────────────────────────
function TaskCard({ task, joined, onJoin, onSwap }) {
  const pct = Math.min((task.progress / task.target) * 100, 100);
  const rem = task.unit === "$" ? `差 $${task.target - task.progress}` : `差 ${task.target - task.progress} 次`;
  return (
    <div style={{ background: "#fff", borderRadius: 13, padding: 14, marginBottom: 8, border: task.urgency === "high" ? "1.5px solid #F7C1C1" : "1px solid #EBEBEB" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: "#F2F2F7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{task.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#1C1C1E" }}>{task.title}</span>
            {task.urgency === "high" && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 6px", borderRadius: 5, background: "#FCEBEB", color: "#A32D2D" }}>限{task.daysLeft}天</span>}
          </div>
          <div style={{ fontSize: 13, color: "#8E8E93" }}>{task.desc}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#378ADD" }}>${task.reward}</div>
          <div style={{ fontSize: 11, color: "#8E8E93" }}>獎勵</div>
        </div>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "#F2F2F7", overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", borderRadius: 3, background: pct >= 100 ? "#639922" : "#378ADD", width: `${pct}%`, transition: "width 0.6s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8E8E93", marginBottom: 8 }}>
        <span>{rem}</span><span>{Math.round(pct)}% 完成</span>
      </div>
      <div style={{ fontSize: 12, color: "#8E8E93", background: "#F8F8F8", borderRadius: 6, padding: "5px 8px", marginBottom: 8 }}>🤖 {task.basis}</div>
      {/* 操作按鈕：加入任務 + 更換任務 */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onJoin(task.id)}
          style={{ flex: 2, padding: "8px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: joined ? "#EAF3DE" : "#378ADD", color: joined ? "#3B6D11" : "#fff" }}>
          {joined ? "✅ 已加入任務" : "加入任務，開始省錢"}
        </button>
        <button onClick={() => onSwap(task)}
          style={{ flex: 1, padding: "8px", borderRadius: 9, border: "1.5px solid #E0E0E0", cursor: "pointer", fontSize: 13, fontWeight: 600, background: "#fff", color: "#636366" }}>
          🔄 更換任務
        </button>
      </div>
    </div>
  );
}

function RewardsPage({ autoTasks = AUTO_TASKS, user }) {
  const [joined, setJoined] = useState({});
  const [swapTarget, setSwapTarget] = useState(null);
  const [tasks, setTasks] = useState(autoTasks);
  const total = tasks.reduce((s, t) => s + t.reward, 0);

  useEffect(() => { setTasks(autoTasks); }, [autoTasks]);

  function handleSwapConfirm(preview) {
    setTasks(prev => prev.map(t =>
      t.id === swapTarget.id
        ? { ...t, title: preview.title, desc: preview.desc, reward: preview.reward, daysLeft: preview.daysLeft }
        : t
    ));
    setSwapTarget(null);
  }

  return (
    <div>
      <div style={S.header}><span style={S.headerTitle}>AI 自動任務</span></div>
      <div style={{ margin: "10px 16px 10px", borderRadius: 13, background: "#E6F1FB", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0C447C", marginBottom: 2 }}>🤖 AI 根據你的發票自動生成任務</div>
          <div style={{ fontSize: 13, color: "#185FA5" }}>全部完成可得 <strong>${total}</strong> 獎勵</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#185FA5" }}>${total}</div>
      </div>
      <div style={{ padding: "0 16px 4px" }}>
        <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 8 }}>以下任務都是你本來就會去的店家，加入後順手省錢。不適合可以更換。</div>
        {tasks.map(t => (
          <TaskCard
            key={t.id}
            task={t}
            joined={!!joined[t.id]}
            onJoin={id => setJoined(j => ({ ...j, [id]: true }))}
            onSwap={task => setSwapTarget(task)}
          />
        ))}
      </div>
      {swapTarget && (
        <TaskSwapModal
          task={swapTarget}
          onConfirm={handleSwapConfirm}
          onClose={() => setSwapTarget(null)}
          userData={user?.data}
        />
      )}
    </div>
  );
}

// ─── 發票頁 ───────────────────────────────────────────────────────────────────
function InvoicesPage({ invoices = INVOICES, totalAmount = 75737, invoiceCount = 63, userData }) {
  return (
    <div>
      <div style={S.header}>
        <span style={S.headerTitle}>我的發票</span>
        <div style={{ display: "flex", gap: 6 }}><button style={S.iconBtn}>🔍</button><button style={S.iconBtn}>⋯</button></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "10px 0", background: "#fff", marginBottom: 8 }}>
        <button style={{ border: "none", background: "none", fontSize: 18, color: "#378ADD", cursor: "pointer" }}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 600 }}>115年 1-2月</span>
        <button style={{ border: "none", background: "none", fontSize: 18, color: "#378ADD", cursor: "pointer" }}>›</button>
      </div>
      <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: "#E6F1FB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📅</div>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>開獎倒數 <span style={{ color: "#378ADD" }}>21天</span></div><div style={{ fontSize: 12, color: "#8E8E93" }}>共 {invoiceCount} 張發票參與對獎</div></div>
        <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 7, background: "#E6F1FB", color: "#185FA5" }}>即將開獎</span>
      </div>
      <div style={{ padding: "0 16px 6px" }}>
        <span style={{ fontSize: 13, color: "#8E8E93" }}>近2個月 總計 </span>
        <span style={{ fontSize: 16, fontWeight: 800 }}>${totalAmount.toLocaleString()}</span>
      </div>
      <div style={{ background: "#fff", borderRadius: 13, margin: "0 16px", overflow: "hidden" }}>
        {invoices.map((inv, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", padding: "11px 14px", borderBottom: i < invoices.length - 1 ? "1px solid #F5F5F5" : "none" }}>
            <div style={{ width: 34, textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{inv.day}</div>
              <div style={{ fontSize: 11, color: "#8E8E93" }}>{inv.week}</div>
            </div>
            <div style={{ flex: 1, paddingLeft: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{inv.shop}</div>
              <div style={{ fontSize: 12, color: "#8E8E93" }}>{inv.type}</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: inv.highlight ? "#E24B4A" : "#1C1C1E" }}>${inv.amount.toLocaleString()}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 80 }} />
    </div>
  );
}

// ─── 掃描頁（移除 AI 管家） ────────────────────────────────────────────────────
function ScanPage() {
  const [done] = useState(true);
  return (
    <div>
      <div style={S.header}>
        <span style={S.headerTitle}>掃描對獎</span>
        <div style={{ display: "flex", gap: 6 }}><button style={S.iconBtn}>❓</button></div>
      </div>
      <div style={{ ...S.card, textAlign: "center" }}>
        <div style={{ width: "100%", aspectRatio: "1", background: "#1C1C1E", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, position: "relative" }}>
          <div style={{ width: "60%", height: "60%", border: "2px solid #fff", borderRadius: 10, position: "relative" }}>
            {[["0%","0%"],["0%","auto"],["auto","0%"],["auto","auto"]].map(([t,b],i) => (
              <div key={i} style={{ position:"absolute", width:16, height:16, top:t==="0%"?-2:"auto", bottom:b==="0%"?-2:"auto", left:i%2===0?-2:"auto", right:i%2===1?-2:"auto", borderTop:t==="0%"?"3px solid #378ADD":"none", borderBottom:b==="0%"?"3px solid #378ADD":"none", borderLeft:i%2===0?"3px solid #378ADD":"none", borderRight:i%2===1?"3px solid #378ADD":"none" }} />
            ))}
          </div>
          <div style={{ position:"absolute", bottom:10, color:"#fff", fontSize:13 }}>請對準發票QRCode</div>
        </div>
        <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
          {["電子發票","傳統發票"].map((t,i) => <button key={t} style={{ padding:"7px 16px", borderRadius:18, border:i===0?"2px solid #378ADD":"1px solid #E0E0E0", background:i===0?"#E6F1FB":"#fff", color:i===0?"#185FA5":"#8E8E93", fontSize:13, fontWeight:600, cursor:"pointer" }}>{t}</button>)}
        </div>
      </div>
      {done && (
        <div style={{ ...S.card, background: "#EAF3DE" }}>
          <div style={{ fontWeight:700, fontSize:14, color:"#3B6D11", marginBottom:8 }}>✅ 掃描成功！</div>
          <div style={{ fontSize:14, color:"#1C1C1E", lineHeight:1.6, marginBottom:8 }}>🎉 <strong>1 張發票中獎 $200</strong>，可在全家超商兌換，截止 2026/04/30</div>
          <div style={{ display:"flex", gap:8 }}>
            <button style={{ flex:1, padding:"8px", borderRadius:9, background:"#639922", color:"#fff", border:"none", cursor:"pointer", fontSize:13, fontWeight:700 }}>兌獎提醒</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 首頁 ─────────────────────────────────────────────────────────────────────
function HomePage({ setTab, user, invoiceCount, totalAmount, monthlyTrend, detectedBillCount, autoTasks }) {
  const [idx, setIdx] = useState(0);

  // 從用戶數據動態產生 AI 洞察
  const data = user?.data;
  const topShop = data?.autoTasks?.[0]?.shop || "";
  const topTask = data?.autoTasks?.[0];
  const deliverySub = data?.deliverySubs?.[0];
  const totalFmt = totalAmount ? `$${totalAmount.toLocaleString()}` : "";

  const INSIGHTS = [
    ...(detectedBillCount > 0 ? [{ text: `AI 偵測到 ${detectedBillCount} 筆固定帳單本月週期將到 📋`, action: "查看帳單", tab: "bills" }] : []),
    ...(deliverySub ? [{ text: `${deliverySub.name} ${deliverySub.roiLabel}，${deliverySub.roiStatus === "danger" ? "評估是否調整使用頻率 😬" : "繼續保持划算 ✅"}`, action: "查看訂閱分析", tab: "subscriptions" }] : []),
    ...(topTask ? [{ text: `${topTask.shop} 消費達標任務等你！完成可得 $${topTask.reward} 獎勵 🎯`, action: "加入任務", tab: "rewards" }] : []),
    ...(totalFmt ? [{ text: `近6個月累積消費 ${totalFmt}，AI 幫你找出省錢機會 💡`, action: "查看發票分析", tab: "invoices" }] : []),
    { text: "發票存摺幫你掌握每一筆消費，讓數據說話 📊", action: "查看我的發票", tab: "invoices" },
  ].filter(Boolean);

  const prev = () => setIdx(i => (i - 1 + INSIGHTS.length) % INSIGHTS.length);
  const next = () => setIdx(i => (i + 1) % INSIGHTS.length);

  return (
    <div>
      <div style={{ background:"#fff", padding:"12px 16px 12px", borderBottom:"1px solid #F0F0F0" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <Logo />
          <div style={{ display:"flex", gap:8 }}><button style={S.iconBtn}>🐥</button><button style={S.iconBtn}>⚙️</button></div>
        </div>
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:14, color:"#1D9E75", fontWeight:500 }}>Hello！{user?.phone || ""}</div>
          <div style={{ fontSize:13, color:"#8E8E93" }}>你的發票是最好的理財顧問 — AI 幫你掌握一切</div>
        </div>
        <div style={{ display:"flex", background:"#F2F2F7", borderRadius:10, padding:"8px 0" }}>
          {[
            {label:"發票數",value:`${invoiceCount || 0}張`},
            {label:"帳單項目",value:`${detectedBillCount || 0}筆`,red:detectedBillCount>0},
            {label:"任務獎勵",value:`$${(autoTasks||[]).reduce((s,t)=>s+t.reward,0)||0}`,blue:true}
          ].map((s,i)=>(
            <div key={i} style={{ flex:1, textAlign:"center", borderRight:i<2?"1px solid #E8E8E8":"none" }}>
              <div style={{ fontSize:17, fontWeight:800, color:s.red?"#A32D2D":s.blue?"#185FA5":"#1C1C1E" }}>{s.value}</div>
              <div style={{ fontSize:11, color:"#8E8E93" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 快速入口 2x2 */}
      <div style={{ margin:"10px 16px 0", display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        <button onClick={()=>setTab("subscriptions")} style={{ background:"#fff", border:"1.5px solid #FAC775", borderRadius:13, padding:"12px", cursor:"pointer", textAlign:"left" }}>
          <div style={{ fontSize:16, marginBottom:3 }}>📱</div>
          <div style={{ fontSize:13, fontWeight:700, color:"#1C1C1E" }}>訂閱管理</div>
          <div style={{ fontSize:11, color:"#854F0B", marginTop:1 }}>{(data?.deliverySubs||[]).length + (data?.flatSubs||[]).length} 個訂閱追蹤中</div>
          <div style={{ fontSize:14, fontWeight:800, color: (data?.deliverySubs||[]).some(s=>s.roiStatus==="danger")?"#A32D2D":"#3B6D11", marginTop:4 }}>
            {(data?.deliverySubs||[]).some(s=>s.roiStatus==="danger") ? "有訂閱效益偏低" : "訂閱狀態良好"}
          </div>
        </button>
        <button onClick={()=>setTab("bills")} style={{ background:"#fff", border: detectedBillCount>0?"1.5px solid #F09595":"1px solid #EBEBEB", borderRadius:13, padding:"12px", cursor:"pointer", textAlign:"left" }}>
          <div style={{ fontSize:16, marginBottom:3 }}>📋</div>
          <div style={{ fontSize:13, fontWeight:700, color:"#1C1C1E" }}>帳單提醒</div>
          <div style={{ fontSize:11, color: detectedBillCount>0?"#A32D2D":"#8E8E93", marginTop:1 }}>偵測到 {detectedBillCount||0} 筆帳單</div>
          <div style={{ fontSize:14, fontWeight:800, color: detectedBillCount>0?"#A32D2D":"#8E8E93", marginTop:4 }}>
            {detectedBillCount>0 ? "週期即將到來" : "暫無偵測"}
          </div>
        </button>
        <button onClick={()=>setTab("rewards")} style={{ background:"#fff", border:"1px solid #B5D4F4", borderRadius:13, padding:"12px", cursor:"pointer", textAlign:"left" }}>
          <div style={{ fontSize:16, marginBottom:3 }}>🎯</div>
          <div style={{ fontSize:13, fontWeight:700, color:"#1C1C1E" }}>AI 任務</div>
          <div style={{ fontSize:11, color:"#378ADD", marginTop:1 }}>{(autoTasks||[]).length} 個任務等你</div>
          <div style={{ fontSize:14, fontWeight:800, color:"#185FA5", marginTop:4 }}>最高 ${Math.max(...(autoTasks||[{reward:0}]).map(t=>t.reward))} 獎勵</div>
        </button>
        <button onClick={()=>setTab("invoices")} style={{ background:"#fff", border:"1px solid #EBEBEB", borderRadius:13, padding:"12px", cursor:"pointer", textAlign:"left" }}>
          <div style={{ fontSize:16, marginBottom:3 }}>🧾</div>
          <div style={{ fontSize:13, fontWeight:700, color:"#1C1C1E" }}>我的發票</div>
          <div style={{ fontSize:11, color:"#8E8E93", marginTop:1 }}>{invoiceCount||0} 張已收錄</div>
          <div style={{ fontSize:14, fontWeight:800, color:"#8E8E93", marginTop:4 }}>近6個月紀錄</div>
        </button>
      </div>

      {/* AI 洞察 */}
      <div style={{ padding:"10px 16px 0" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <span style={{ fontSize:14, fontWeight:700 }}>🤖 AI 洞察</span>
          <span style={{ fontSize:12, color:"#8E8E93" }}>{idx+1} / {INSIGHTS.length}</span>
        </div>
        <div style={{ borderRadius:13, background:"#1C1C1E", padding:14, userSelect:"none", minHeight:88 }}>
          <p style={{ color:"#fff", fontSize:13, lineHeight:1.6, margin:"0 0 10px" }}>{INSIGHTS[idx].text}</p>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={()=>setTab(INSIGHTS[idx].tab)} style={{ padding:"5px 11px", borderRadius:7, border:"none", background:"rgba(255,255,255,0.15)", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>⚡ {INSIGHTS[idx].action}</button>
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
              <button onClick={prev} style={{ width:28, height:28, borderRadius:99, background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
              <button onClick={next} style={{ width:28, height:28, borderRadius:99, background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
            </div>
          </div>
        </div>
      </div>

      {/* 消費分析 */}
      <div style={{ ...S.card, marginTop:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <span style={{ fontSize:14, fontWeight:700 }}>消費分析</span>
          <button style={{ border:"none", background:"none", color:"#378ADD", fontSize:13, cursor:"pointer" }}>詳細 →</button>
        </div>
        {/* 月趨勢柱狀圖 */}
        {monthlyTrend && monthlyTrend.length > 0 && (() => {
          const maxAmt = Math.max(...monthlyTrend.map(t=>t.amount), 1);
          const latest = monthlyTrend[monthlyTrend.length-1];
          return (
            <div style={{ marginBottom:12 }}>
              <div style={{ display:"flex", gap:5, alignItems:"flex-end", height:52, marginBottom:6 }}>
                {monthlyTrend.map((t,i)=>(
                  <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                    <div style={{ width:"100%", background:i===monthlyTrend.length-1?"#378ADD":"#E0E8F0", borderRadius:"3px 3px 0 0", height:`${(t.amount/maxAmt)*44}px`, minHeight:2, transition:"height .6s ease"}}/>
                    <div style={{ fontSize:9, color:"#AEAEB2"}}>{t.month}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:12, color:"#6C6C70" }}>{latest.month} 消費 <strong style={{ color:"#1C1C1E"}}>${latest.amount.toLocaleString()}</strong>・共 {invoiceCount} 張發票</div>
            </div>
          );
        })()}
        <DonutChart pieData={user?.data?.pieData} />
      </div>
    </div>
  );
}

// ─── 登入頁 ───────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
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
    } else {
      setError(result.error);
    }
  }

  return (
    <div style={{ width: 375, minHeight: "100vh", background: "linear-gradient(160deg, #EEF5FF 0%, #F8FAFF 60%, #F2F2F7 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Noto Sans TC', sans-serif", padding: "40px 24px" }}>
      {/* Logo */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ width: 64, height: 64, background: "#378ADD", borderRadius: 16, transform: "rotate(45deg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <span style={{ transform: "rotate(-45deg)", fontSize: 28 }}>💳</span>
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#1C1C1E" }}>發票存摺</div>
        <div style={{ fontSize: 13, color: "#8E8E93", marginTop: 4 }}>你的發票是最好的理財顧問</div>
      </div>

      {/* 輸入卡片 */}
      <div style={{ background: "#fff", borderRadius: 20, padding: "28px 24px", width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1C1C1E", marginBottom: 6 }}>手機號碼登入</div>
        <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 20 }}>輸入你的手機號碼，查看個人發票分析</div>

        <div style={{ position: "relative", marginBottom: 16 }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#8E8E93", pointerEvents: "none", zIndex: 1 }}>📱</div>
          <input
            type="tel"
            value={phone}
            onChange={e => { setPhone(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="09xx-xxx-xxx"
            style={{ boxSizing: "border-box", width: "100%", padding: "14px 14px 14px 44px", borderRadius: 12, border: `1.5px solid ${error ? "#FF3B30" : "#E0E0E0"}`, fontSize: 16, outline: "none", color: "#1C1C1E", background: "#F8F8F8", letterSpacing: 1, display: "block" }}
          />
        </div>

        {error && (
          <div style={{ fontSize: 13, color: "#FF3B30", marginBottom: 12, padding: "8px 12px", background: "#FFF2F1", borderRadius: 8 }}>
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: loading ? "#B0C8F0" : "#378ADD", color: "#fff", fontSize: 16, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 4px 14px rgba(55,138,221,0.35)", transition: "all 0.2s" }}>
          {loading ? "查詢中..." : "進入我的發票 →"}
        </button>
      </div>

      <div style={{ marginTop: 24, fontSize: 12, color: "#AEAEB2", textAlign: "center", lineHeight: 1.6 }}>
        此為內部測試版本<br />© 麻布數據科技股份有限公司
      </div>
    </div>
  );
}

// ─── URL Router（query param 分流） ──────────────────────────────────────────
// ?type=product              → 發票存摺 App（預設）
// ?type=dashboard&cate=hyvs-mavs → HYVS vs MAVs Dashboard
// ?type=dashboard&cate=audience  → 受眾回訪分析 Dashboard（GitHub Pages）
function QueryRouter({ children }) {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const cate = params.get("cate");

  if (type === "dashboard") {
    if (cate === "hyvs-mavs") {
      window.location.replace("/hyvs-mavs-dashboard.html");
      return null;
    }
    if (cate === "audience") {
      window.location.replace("/audience-dashboard.html");
      return null;
    }
    // 未知 cate：顯示索引頁
    return (
      <div style={{ fontFamily: "system-ui", padding: 32, background: "#0F172A", minHeight: "100vh", color: "#E2E8F0" }}>
        <h2 style={{ marginBottom: 16 }}>📊 Dashboard 索引</h2>
        <ul style={{ lineHeight: 2.2 }}>
          <li><a href="?type=dashboard&cate=audience" style={{ color: "#60A5FA" }}>受眾回訪分析</a></li>
          <li><a href="?type=dashboard&cate=hyvs-mavs" style={{ color: "#60A5FA" }}>HYVS vs MAVs 分析</a></li>
        </ul>
      </div>
    );
  }

  const version = params.get("v");
  if (version === "20260401v1") {
    return <InvoiceAppV2 />;
  }

  // type=product 或無 type → 顯示 React App
  return children;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
const TABS = [
  { key:"invoices",      icon:"🧾", label:"發票" },
  { key:"rewards",       icon:"🎯", label:"任務" },
  { key:"scan",          icon:null, label:"掃描" },
  { key:"subscriptions", icon:"📱", label:"訂閱" },
  { key:"bills",         icon:"⚡", label:"帳單" },
];

function InvoiceApp() {
  const [tab, setTab] = useState("home");
  const [user, setUser] = useState(null); // { phone, data }
  const [loading, setLoading] = useState(false);

  // 動態替換所有頁面資料
  const liveInvoices     = user?.data?.invoices      || INVOICES;
  const livePieData      = user?.data?.pieData        || PIE_DATA;
  const liveTotalAmt     = user?.data?.totalAmount    || 75737;
  const liveInvCount     = user?.data?.invoiceCount   || 63;
  const liveDeliverySubs  = Array.isArray(user?.data?.deliverySubs) ? user.data.deliverySubs : [];
  const liveFlatSubs      = Array.isArray(user?.data?.flatSubs)      ? user.data.flatSubs      : [];
  const liveAutoTasks     = user?.data?.autoTasks      ?? AUTO_TASKS;
  const liveMonthlyTrend  = user?.data?.monthlyTrend  || null;

  // 計算帳單偵測數（給 HomePage 用）
  const liveDetectedBillCount = useMemo(() => {
    if (!liveInvoices || liveInvoices.length === 0) return 0;
    const BILL_KEYWORDS = [["台電","電力"],["自來水"],["大哥大","遠傳","中華電信"],["人壽","保險","國泰","新光"]];
    return BILL_KEYWORDS.filter(kws => liveInvoices.some(inv => kws.some(k => inv.shop.includes(k)))).length;
  }, [liveInvoices]);

  function handleLogin(phone, data) {
    setUser({ phone, data });
    setTab("home");
  }

  function handleLogout() {
    setUser(null);
    setTab("home");
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const pages = {
    home:          <HomePage setTab={setTab} user={user} invoiceCount={liveInvCount} totalAmount={liveTotalAmt} monthlyTrend={liveMonthlyTrend} detectedBillCount={liveDetectedBillCount} autoTasks={liveAutoTasks}/>,
    invoices:      <InvoicesPage invoices={liveInvoices} totalAmount={liveTotalAmt} invoiceCount={liveInvCount} userData={user?.data}/>,
    rewards:       <RewardsPage autoTasks={liveAutoTasks} user={user}/>,
    scan:          <ScanPage/>,
    subscriptions: <SubscriptionsPage deliverySubs={liveDeliverySubs} flatSubs={liveFlatSubs} invoices={liveInvoices}/>,
    bills:         <BillsPage invoices={liveInvoices}/>,
  };

  return (
    <>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}::-webkit-scrollbar{display:none}`}</style>
      <div style={S.root}>
        <div style={S.screen}>{pages[tab] || <HomePage setTab={setTab}/>}</div>

        {/* AI 管家僅在發票頁顯示 */}
        {tab === "invoices" && <AIPanel tabKey={tab} userData={user?.data} />}

        <div style={S.tabBar}>
          {TABS.map(t => {
            if (t.key === "scan") return (
              <button key={t.key} style={S.tabScan} onClick={()=>setTab(t.key)}>
                <div style={S.scanBubble}>📷</div>
                <span style={{ fontSize:9, marginTop:2, color:tab===t.key?"#378ADD":"#8E8E93", fontWeight:tab===t.key?700:400 }}>{t.label}</span>
              </button>
            );
            const active = tab === t.key;
            return (
              <button key={t.key} style={S.tabItem} onClick={()=>setTab(t.key)}>
                <span style={{ fontSize:19 }}>{t.icon}</span>
                <span style={{ fontSize:9, color:active?"#378ADD":"#8E8E93", fontWeight:active?700:400 }}>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* 首頁按鈕 */}
        {tab !== "home" && (
          <button onClick={()=>setTab("home")} style={{ position:"fixed", bottom:70, right:"calc(50% - 187px + 12px)", width:36, height:36, borderRadius:18, background:"#fff", border:"1px solid #E0E0E0", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", zIndex:99, boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>🏠</button>
        )}

        {/* 登出按鈕 */}
        <button onClick={handleLogout} style={{ position:"fixed", bottom:70, left:"calc(50% - 187px + 12px)", width:36, height:36, borderRadius:18, background:"#fff", border:"1px solid #E0E0E0", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", zIndex:99, boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>🚪</button>
      </div>
    </>
  );
}

// ─── V2 Prototype (20260401v1) ──────────────────────────────────────────────

const AI_ANSWERS_V2 = {
  "我的訂閱值得嗎？": { text: "你目前有 2 個訂閱：UberEats+（月費 $178，本月省 $98，虧損 $80）、foodpanda Pro（月費 $149，本月省 $225，划算 +$76）。建議暫停 UberEats+，每月可多省 $178。" },
  "這個月哪裡花最多？": { text: "外食 $2,312（佔 31%）、購物 $1,890（佔 25%）、訂閱 $936（佔 12%）。訂閱支出比同類用戶高 23%，有優化空間。" },
  "UberEats 有更省的替代嗎？": { text: "根據你的外送頻率（平均每月 8 次），建議考慮：1. foodpanda 月訂單 $329，比 UberEats 便宜約 15%；2. 不訂閱改用折扣碼，月省約 $40。" },
  "幫我分析帳單": { text: "本月固定支出：台電 $1,240（↑$260）、電信費 $599、Apple iCloud $90。台電本月異常偏高，比上月多 $260，建議確認是否有大型電器持續使用。" },
};

const TABS_V2 = [
  { key: "invoices",      icon: "🧾", label: "發票" },
  { key: "rewards",       icon: "🎯", label: "任務" },
  { key: "scan",          icon: null,  label: "掃描" },
  { key: "subscriptions", icon: "📱", label: "訂閱" },
  { key: "list",          icon: "📝", label: "清單" },
  { key: "ai",            icon: "🤖", label: "AI管家" },
];

const QUICK_QUESTIONS_V2 = [
  "我的訂閱值得嗎？",
  "這個月哪裡花最多？",
  "UberEats 有更省的替代嗎？",
  "幫我分析帳單",
];

function ListPageV2() {
  const [bought, setBought] = useState({});
  const [items, setItems] = useState([
    { id: 1, title: "買電風扇", note: "夏天快到了", ai: "Honeywell 靜音扇，Yahoo 現售 $1,290，比上月便宜 $200" },
    { id: 2, title: "訂串流影音平台", note: "考慮中", ai: "Disney+ 月費 $270 vs Netflix $390，依你的觀看習慣建議 Disney+" },
    { id: 3, title: "換手機殼", note: "", ai: "蝦皮有同款 $89，比實體店便宜 60%" },
  ]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const nextIdRef = useRef(4);
  const inputRef = useRef(null);

  const doSearch = () => {
    const q = searchText.trim();
    if (!q) return;
    setSearching(true);
    setSearchResult(null);
    setTimeout(() => {
      const base = q.length * 37 + 580;
      const p2 = base + 50;
      const p3 = base + 80;
      const low = base - 30;
      const high = base + 60;
      setSearchResult({
        name: q,
        base, p2, p3, low, high,
      });
      setSearching(false);
    }, 1500);
  };

  const addToList = () => {
    if (!searchResult) return;
    const { name, base, p2 } = searchResult;
    const newItem = {
      id: nextIdRef.current++,
      title: name,
      note: "",
      ai: `蝦皮 $${base} 最低，momo $${p2}`,
    };
    setItems(prev => [...prev, newItem]);
    setSearchOpen(false);
    setSearchText("");
    setSearchResult(null);
  };

  const cancelSearch = () => {
    setSearchOpen(false);
    setSearchText("");
    setSearchResult(null);
    setSearching(false);
  };

  return (
    <div>
      <div style={S.header}>
        <span style={S.headerTitle}>我的清單</span>
        <div style={{ display: "flex", gap: 6 }}><button style={S.iconBtn}>🔔</button></div>
      </div>
      <div style={{ padding: "10px 16px" }}>
        {items.map(item => (
          <div key={item.id} style={{ background: "#fff", borderRadius: 13, padding: "12px 14px", marginBottom: 8, border: "1px solid #EBEBEB" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1C1C1E", textDecoration: bought[item.id] ? "line-through" : "none", opacity: bought[item.id] ? 0.5 : 1 }}>
                  {item.title}{item.note ? ` — ${item.note}` : ""}
                </div>
              </div>
              <button onClick={() => setBought(b => ({ ...b, [item.id]: !b[item.id] }))}
                style={{ padding: "5px 10px", borderRadius: 8, border: bought[item.id] ? "1px solid #3B6D11" : "1px solid #E0E0E0", background: bought[item.id] ? "#EAF3DE" : "#fff", color: bought[item.id] ? "#3B6D11" : "#636366", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                {bought[item.id] ? "✅ 已買到" : "已買到！"}
              </button>
            </div>
            <div style={{ background: "#F8F8F8", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#636366", lineHeight: 1.5 }}>
              🤖 AI 建議：{item.ai}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "0 16px" }}>
        {!searchOpen ? (
          <>
            <div onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid #E0E0E0", fontSize: 13, color: "#8E8E93", boxSizing: "border-box", cursor: "pointer", background: "#fff" }}>
              加入清單...
            </div>
            <div style={{ fontSize: 11, color: "#8E8E93", textAlign: "center", marginTop: 8 }}>AI 會根據你的消費紀錄給出購買建議</div>
          </>
        ) : (
          <div style={{ background: "#fff", borderRadius: 13, border: "1px solid #EBEBEB", padding: "14px", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input ref={inputRef} value={searchText} onChange={e => setSearchText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
                placeholder="輸入商品名稱..."
                style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid #E0E0E0", fontSize: 13, outline: "none" }}
                disabled={searching}
              />
              <button onClick={doSearch} disabled={searching || !searchText.trim()}
                style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: "#378ADD", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", opacity: (searching || !searchText.trim()) ? 0.5 : 1 }}>
                搜尋比價
              </button>
            </div>

            {searching && (
              <div style={{ textAlign: "center", padding: "20px 0", color: "#636366", fontSize: 13 }}>
                <div style={{ fontSize: 22, marginBottom: 8, animation: "spin 1s linear infinite" }}>🔍</div>
                AI 比價中...
              </div>
            )}

            {searchResult && !searching && (
              <div style={{ background: "#F8F8FA", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1C1C1E", marginBottom: 10 }}>
                  商品：{searchResult.name}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1C1C1E", marginBottom: 6 }}>推薦購買：</div>
                <div style={{ fontSize: 13, color: "#1C1C1E", lineHeight: 1.8 }}>
                  <div>🥇 蝦皮購物 <b>${searchResult.base}</b>（最便宜）· ⭐ 4.8 · 近期購買 2,341 人</div>
                  <div>🥈 momo 購物 <b>${searchResult.p2}</b>（+$50）· ⭐ 4.9 · 官方正品</div>
                  <div>🥉 Yahoo 購物 <b>${searchResult.p3}</b>（+$80）· ⭐ 4.7</div>
                </div>
                <div style={{ fontSize: 12, color: "#636366", marginTop: 10, lineHeight: 1.6 }}>
                  近期用戶購買價格：${searchResult.low} ~ ${searchResult.high}（最近 30 天）
                </div>
                <div style={{ fontSize: 12, color: "#636366", marginTop: 4, lineHeight: 1.6 }}>
                  🤖 AI 建議：蝦皮最便宜，momo 最有保障（官方正品），建議依預算選擇。
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={addToList}
                    style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", background: "#378ADD", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    加入清單
                  </button>
                  <button onClick={cancelSearch}
                    style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid #E0E0E0", background: "#fff", color: "#636366", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    取消
                  </button>
                </div>
              </div>
            )}

            {!searching && !searchResult && (
              <div style={{ textAlign: "right" }}>
                <button onClick={cancelSearch}
                  style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E0E0E0", background: "#fff", color: "#636366", fontSize: 12, cursor: "pointer" }}>
                  取消
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SubscriptionsPageV2({ deliverySubs = [], flatSubs = [], invoices = [] }) {
  const [expSub, setExpSub] = useState(deliverySubs[0]?.id || "ubereats");

  const subs = deliverySubs.length > 0 ? deliverySubs : SUBSCRIPTIONS;

  return (
    <div>
      <div style={S.header}>
        <span style={S.headerTitle}>訂閱診斷</span>
        <div style={{ display: "flex", gap: 6 }}><button style={S.iconBtn}>🔔</button></div>
      </div>
      <div style={{ padding: "10px 16px" }}>
        <div style={{ fontSize: 13, color: "#8E8E93", marginBottom: 8, lineHeight: 1.6 }}>
          AI 根據你的發票分析每個訂閱是否划算。
        </div>
        {subs.map(sub => {
          const isUber = sub.id === "ubereats";
          const expanded = expSub === sub.id;
          const statusColor = isUber ? "#A32D2D" : "#3B6D11";
          const statusBg = isUber ? "#FCEBEB" : "#EAF3DE";
          const label = isUber ? "❌ 不划算 −$80" : "✅ 划算 +$76";
          const latest = sub.months[sub.months.length - 1];

          return (
            <div key={sub.id} style={{ background: "#fff", borderRadius: 13, marginBottom: 8, overflow: "hidden", border: isUber ? "1.5px solid #F09595" : "1px solid #EBEBEB" }}>
              <div onClick={() => setExpSub(expanded ? null : sub.id)} style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: "#F2F2F7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{sub.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#1C1C1E" }}>{sub.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 7px", borderRadius: 6, background: statusBg, color: statusColor }}>{label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#8E8E93" }}>月費 ${sub.fee} · {sub.renewDay}日續訂</div>
                </div>
                <span style={{ color: "#C7C7CC", fontSize: 13 }}>{expanded ? "▲" : "▼"}</span>
              </div>
              {expanded && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #F5F5F5" }}>
                  <div style={{ marginTop: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 8 }}>近幾個月消費明細</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {sub.months.map((m, i) => {
                        const r = m.feeWaived - sub.fee;
                        return (
                          <div key={i} style={{ flex: 1, background: "#F8F8F8", borderRadius: 8, padding: "8px", textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>{m.m}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#1C1C1E" }}>月費 ${sub.fee}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: r >= 0 ? "#3B6D11" : "#A32D2D", marginTop: 2 }}>省運費 {r >= 0 ? "+" : ""}{r}</div>
                            <div style={{ fontSize: 11, color: "#8E8E93" }}>{m.orders}次外送</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {isUber && (
                    <div style={{ background: "#FCEBEB", borderRadius: 9, padding: "9px 11px", marginBottom: 8 }}>
                      <div style={{ fontSize: 13, color: "#A32D2D", lineHeight: 1.6 }}>
                        ⚠️ {sub.roiTip}
                      </div>
                    </div>
                  )}
                  {isUber && (
                    <div style={{ background: "#FFF3CD", borderRadius: 9, padding: "9px 11px" }}>
                      <div style={{ fontSize: 13, color: "#854F0B", lineHeight: 1.6 }}>
                        💡 建議：考慮暫停，每月可省 $178
                      </div>
                    </div>
                  )}
                  {!isUber && (
                    <div style={{ background: "#EAF3DE", borderRadius: 9, padding: "9px 11px" }}>
                      <div style={{ fontSize: 13, color: "#3B6D11", lineHeight: 1.6 }}>
                        ✅ {sub.roiTip}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AIPanelV2() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const endRef = useRef(null);

  const sendQ = (q) => {
    const question = q || input.trim();
    if (!question) return;
    setMessages(p => [...p, { role: "user", text: question }]);
    setInput(""); setTyping(true); setDisplayText("");
    const ans = AI_ANSWERS_V2[question] || { text: "根據你的發票資料分析中...😊 目前 AI 正在學習你的消費習慣，即將提供個人化建議。" };
    const text = typeof ans === "string" ? ans : ans.text || "";
    let i = 0;
    const iv = setInterval(() => {
      i++; setDisplayText(text.slice(0, i));
      if (i >= text.length) { clearInterval(iv); setTyping(false); setMessages(p => [...p, { role: "ai", text }]); setDisplayText(""); }
    }, 18);
  };

  return (
    <div style={{ position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)", width: 375, zIndex: 98 }}>
      {!open ? (
        <div style={{ padding: "6px 16px" }}>
          <button onClick={() => setOpen(true)} style={{ width: "100%", padding: "10px 14px", borderRadius: 22, border: "1px solid #E0E0E0", background: "#fff", fontSize: 13, color: "#8E8E93", cursor: "pointer", textAlign: "left", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>💬</span><span>問 AI 管家...</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#378ADD", fontWeight: 600 }}>省錢找我</span>
          </button>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: "18px 18px 0 0", boxShadow: "0 -4px 24px rgba(0,0,0,0.10)", padding: "12px 14px 14px", maxHeight: 380, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>🤖 AI 管家</span>
              <span style={{ fontSize: 11, background: "#E6F1FB", color: "#185FA5", padding: "3px 7px", borderRadius: 5, fontWeight: 600 }}>省錢顧問</span>
            </div>
            <button onClick={() => { setOpen(false); setMessages([]); }} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#8E8E93" }}>×</button>
          </div>
          <div style={{ overflowY: "auto", flex: 1, marginBottom: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>💡</div>
                <div style={{ fontSize: 13, color: "#8E8E93", lineHeight: 1.6 }}>問我發票相關的省錢問題！</div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", padding: "8px 12px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: m.role === "user" ? "#378ADD" : "#F2F2F7", color: m.role === "user" ? "#fff" : "#1C1C1E", fontSize: 13, lineHeight: 1.5 }}>{m.text}</div>
            ))}
            {typing && displayText && (
              <div style={{ alignSelf: "flex-start", maxWidth: "85%", padding: "8px 12px", borderRadius: "16px 16px 16px 4px", background: "#F2F2F7", fontSize: 13, lineHeight: 1.5 }}>
                {displayText}<span>|</span>
              </div>
            )}
            <div ref={endRef} />
          </div>
          {!typing && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
              {QUICK_QUESTIONS_V2.map(q => <button key={q} onClick={() => sendQ(q)} style={{ padding: "5px 8px", borderRadius: 11, border: "1px solid #378ADD", background: "#E6F1FB", color: "#185FA5", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>{q}</button>)}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendQ()}
              placeholder="輸入問題..." style={{ flex: 1, padding: "8px 12px", borderRadius: 18, border: "1px solid #E0E0E0", fontSize: 13, outline: "none" }} />
            <button onClick={() => sendQ()} style={{ width: 36, height: 36, borderRadius: 18, background: "#378ADD", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>➤</button>
          </div>
        </div>
      )}
    </div>
  );
}

function HomePageV2({ setTab, user, invoiceCount, totalAmount, monthlyTrend, detectedBillCount, autoTasks }) {
  const [idx, setIdx] = useState(0);

  const data = user?.data;
  const deliverySub = data?.deliverySubs?.[0];
  const topTask = data?.autoTasks?.[0];
  const totalFmt = totalAmount ? `$${totalAmount.toLocaleString()}` : "";

  const INSIGHTS = [
    ...(deliverySub ? [{ text: `${deliverySub.name} ${deliverySub.roiLabel}，${deliverySub.roiStatus === "danger" ? "評估是否調整使用頻率 😬" : "繼續保持划算 ✅"}`, action: "查看訂閱分析", tab: "subscriptions" }] : []),
    ...(topTask ? [{ text: `${topTask.shop} 消費達標任務等你！完成可得 $${topTask.reward} 獎勵 🎯`, action: "加入任務", tab: "rewards" }] : []),
    ...(totalFmt ? [{ text: `近6個月累積消費 ${totalFmt}，AI 幫你找出省錢機會 💡`, action: "查看發票分析", tab: "invoices" }] : []),
    { text: "發票存摺幫你掌握每一筆消費，讓數據說話 📊", action: "查看我的發票", tab: "invoices" },
  ].filter(Boolean);

  const prev = () => setIdx(i => (i - 1 + INSIGHTS.length) % INSIGHTS.length);
  const next = () => setIdx(i => (i + 1) % INSIGHTS.length);

  return (
    <div>
      <div style={{ background: "#fff", padding: "12px 16px 12px", borderBottom: "1px solid #F0F0F0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Logo />
            <span style={{ fontSize: 11, color: "#8E8E93", fontWeight: 400 }}>v2 · 2026.04</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}><button style={S.iconBtn}>🐥</button><button style={S.iconBtn}>⚙️</button></div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, color: "#1D9E75", fontWeight: 500 }}>Hello！{user?.phone || ""}</div>
          <div style={{ fontSize: 13, color: "#8E8E93" }}>你的發票是最好的理財顧問 — AI 幫你掌握一切</div>
        </div>
        <div style={{ display: "flex", background: "#F2F2F7", borderRadius: 10, padding: "8px 0" }}>
          {[
            { label: "發票數", value: `${invoiceCount || 0}張` },
            { label: "帳單項目", value: `${detectedBillCount || 0}筆`, red: detectedBillCount > 0 },
            { label: "任務獎勵", value: `$${(autoTasks || []).reduce((s, t) => s + t.reward, 0) || 0}`, blue: true }
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", borderRight: i < 2 ? "1px solid #E8E8E8" : "none" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: s.red ? "#A32D2D" : s.blue ? "#185FA5" : "#1C1C1E" }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#8E8E93" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 正在漏的錢 */}
      <div style={{ margin: "10px 16px 0", borderRadius: 14, background: "#1C1C1E", padding: "16px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 8 }}>🔍 AI 幫你找到的漏財</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>訂閱浪費</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#F09595" }}>$328/月</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>2 個低效訂閱</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>可節省</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#5DCAA5" }}>$156/月</div>
          </div>
        </div>
        <button onClick={() => setTab("subscriptions")} style={{ width: "100%", padding: "8px", borderRadius: 9, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>立即診斷</button>
      </div>

      {/* 帳單提醒小卡 */}
      <div style={{ ...S.card, marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📋 帳單提醒</div>
            <div style={{ fontSize: 13, color: "#636366" }}>台電費用週期將到，預估 $1,240</div>
          </div>
          <button style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #E0E0E0", background: "#fff", color: "#378ADD", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>查看詳情</button>
        </div>
      </div>

      {/* 快速入口 2x2 */}
      <div style={{ margin: "10px 16px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button onClick={() => setTab("subscriptions")} style={{ background: "#fff", border: "1.5px solid #FAC775", borderRadius: 13, padding: "12px", cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: 16, marginBottom: 3 }}>📱</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1C1C1E" }}>訂閱診斷</div>
          <div style={{ fontSize: 11, color: "#854F0B", marginTop: 1 }}>{(data?.deliverySubs || []).length + (data?.flatSubs || []).length} 個訂閱追蹤中</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: (data?.deliverySubs || []).some(s => s.roiStatus === "danger") ? "#A32D2D" : "#3B6D11", marginTop: 4 }}>
            {(data?.deliverySubs || []).some(s => s.roiStatus === "danger") ? "有訂閱效益偏低" : "訂閱狀態良好"}
          </div>
        </button>
        <button onClick={() => setTab("list")} style={{ background: "#fff", border: "1px solid #B5D4F4", borderRadius: 13, padding: "12px", cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: 16, marginBottom: 3 }}>📝</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1C1C1E" }}>我的清單</div>
          <div style={{ fontSize: 11, color: "#378ADD", marginTop: 1 }}>3 個待辦項目</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#185FA5", marginTop: 4 }}>AI 購買建議</div>
        </button>
        <button onClick={() => setTab("rewards")} style={{ background: "#fff", border: "1px solid #B5D4F4", borderRadius: 13, padding: "12px", cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: 16, marginBottom: 3 }}>🎯</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1C1C1E" }}>AI 任務</div>
          <div style={{ fontSize: 11, color: "#378ADD", marginTop: 1 }}>{(autoTasks || []).length} 個任務等你</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#185FA5", marginTop: 4 }}>最高 ${Math.max(...(autoTasks || [{ reward: 0 }]).map(t => t.reward))} 獎勵</div>
        </button>
        <button onClick={() => setTab("invoices")} style={{ background: "#fff", border: "1px solid #EBEBEB", borderRadius: 13, padding: "12px", cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: 16, marginBottom: 3 }}>🧾</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1C1C1E" }}>我的發票</div>
          <div style={{ fontSize: 11, color: "#8E8E93", marginTop: 1 }}>{invoiceCount || 0} 張已收錄</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#8E8E93", marginTop: 4 }}>近6個月紀錄</div>
        </button>
      </div>

      {/* AI 洞察 */}
      <div style={{ padding: "10px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>🤖 AI 洞察</span>
          <span style={{ fontSize: 12, color: "#8E8E93" }}>{idx + 1} / {INSIGHTS.length}</span>
        </div>
        <div style={{ borderRadius: 13, background: "#1C1C1E", padding: 14, userSelect: "none", minHeight: 88 }}>
          <p style={{ color: "#fff", fontSize: 13, lineHeight: 1.6, margin: "0 0 10px" }}>{INSIGHTS[idx].text}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setTab(INSIGHTS[idx].tab)} style={{ padding: "5px 11px", borderRadius: 7, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>⚡ {INSIGHTS[idx].action}</button>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={prev} style={{ width: 28, height: 28, borderRadius: 99, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
              <button onClick={next} style={{ width: 28, height: 28, borderRadius: 99, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
            </div>
          </div>
        </div>
      </div>

      {/* 消費分析 */}
      <div style={{ ...S.card, marginTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>消費分析</span>
          <button style={{ border: "none", background: "none", color: "#378ADD", fontSize: 13, cursor: "pointer" }}>詳細 →</button>
        </div>
        {monthlyTrend && monthlyTrend.length > 0 && (() => {
          const maxAmt = Math.max(...monthlyTrend.map(t => t.amount), 1);
          const latest = monthlyTrend[monthlyTrend.length - 1];
          return (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 5, alignItems: "flex-end", height: 52, marginBottom: 6 }}>
                {monthlyTrend.map((t, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ width: "100%", background: i === monthlyTrend.length - 1 ? "#378ADD" : "#E0E8F0", borderRadius: "3px 3px 0 0", height: `${(t.amount / maxAmt) * 44}px`, minHeight: 2, transition: "height .6s ease" }} />
                    <div style={{ fontSize: 9, color: "#AEAEB2" }}>{t.month}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#6C6C70" }}>{latest.month} 消費 <strong style={{ color: "#1C1C1E" }}>${latest.amount.toLocaleString()}</strong>・共 {invoiceCount} 張發票</div>
            </div>
          );
        })()}
        <DonutChart pieData={user?.data?.pieData} />
      </div>
    </div>
  );
}

function InvoiceAppV2({ initialTab = "home" } = {}) {
  const [tab, setTab] = useState(initialTab);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const liveInvoices = user?.data?.invoices || INVOICES;
  const livePieData = user?.data?.pieData || PIE_DATA;
  const liveTotalAmt = user?.data?.totalAmount || 75737;
  const liveInvCount = user?.data?.invoiceCount || 63;
  const liveDeliverySubs = Array.isArray(user?.data?.deliverySubs) ? user.data.deliverySubs : [];
  const liveFlatSubs = Array.isArray(user?.data?.flatSubs) ? user.data.flatSubs : [];
  const liveAutoTasks = user?.data?.autoTasks ?? AUTO_TASKS;
  const liveMonthlyTrend = user?.data?.monthlyTrend || null;

  const liveDetectedBillCount = useMemo(() => {
    if (!liveInvoices || liveInvoices.length === 0) return 0;
    const BILL_KEYWORDS = [["台電", "電力"], ["自來水"], ["大哥大", "遠傳", "中華電信"], ["人壽", "保險", "國泰", "新光"]];
    return BILL_KEYWORDS.filter(kws => liveInvoices.some(inv => kws.some(k => inv.shop.includes(k)))).length;
  }, [liveInvoices]);

  function handleLogin(phone, data) {
    setUser({ phone, data });
    setTab(initialTab);
  }

  function handleLogout() {
    setUser(null);
    setTab(initialTab);
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const pages = {
    home: <HomePageV2 setTab={setTab} user={user} invoiceCount={liveInvCount} totalAmount={liveTotalAmt} monthlyTrend={liveMonthlyTrend} detectedBillCount={liveDetectedBillCount} autoTasks={liveAutoTasks} />,
    invoices: <InvoicesPage invoices={liveInvoices} totalAmount={liveTotalAmt} invoiceCount={liveInvCount} userData={user?.data} />,
    rewards: <RewardsPage autoTasks={liveAutoTasks} user={user} />,
    scan: <ScanPage />,
    subscriptions: <SubscriptionsPageV2 deliverySubs={liveDeliverySubs} flatSubs={liveFlatSubs} invoices={liveInvoices} />,
    list: <ListPageV2 />,
    ai: <AiButler0408v1Embedded phone={user?.phone} userData={user?.data} onReset={handleLogout} />,
  };

  return (
    <>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}::-webkit-scrollbar{display:none}`}</style>
      <div style={S.root}>
        <div style={S.screen}>{pages[tab] || <HomePageV2 setTab={setTab} />}</div>

        {tab === "invoices" && <AIPanelV2 />}

        <div style={S.tabBar}>
          {TABS_V2.map(t => {
            if (t.key === "scan") return (
              <button key={t.key} style={S.tabScan} onClick={() => setTab(t.key)}>
                <div style={S.scanBubble}>📷</div>
                <span style={{ fontSize: 9, marginTop: 2, color: tab === t.key ? "#378ADD" : "#8E8E93", fontWeight: tab === t.key ? 700 : 400 }}>{t.label}</span>
              </button>
            );
            const active = tab === t.key;
            return (
              <button key={t.key} style={S.tabItem} onClick={() => setTab(t.key)}>
                <span style={{ fontSize: 19 }}>{t.icon}</span>
                <span style={{ fontSize: 9, color: active ? "#378ADD" : "#8E8E93", fontWeight: active ? 700 : 400 }}>{t.label}</span>
              </button>
            );
          })}
        </div>

        {tab !== "home" && (
          <button onClick={() => setTab("home")} style={{ position: "fixed", bottom: 70, right: "calc(50% - 187px + 12px)", width: 36, height: 36, borderRadius: 18, background: "#fff", border: "1px solid #E0E0E0", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>🏠</button>
        )}

        <button onClick={handleLogout} style={{ position: "fixed", bottom: 70, left: "calc(50% - 187px + 12px)", width: 36, height: 36, borderRadius: 18, background: "#fff", border: "1px solid #E0E0E0", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>🚪</button>
      </div>
    </>
  );
}

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "");
  const isAiButlerV1 = path === "/prototype/ai_agent/0408_v1";
  const isAiButlerV2 = path === "/prototype/ai_agent/0409_v2";
  const isAiButlerV3 = path === "/prototype/ai_agent/0409_v3";
  const isAiButlerV4 = path === "/prototype/ai_agent/0410_v4";
  const isAiButlerV5 = path === "/prototype/ai_agent/0410_v5";
  const isAiButlerV6 = path === "/prototype/ai_agent/0411_v1";
  const isAiButlerV7 = path === "/prototype/ai_agent/0411_v3";
  const isAiButlerV8 = path === "/prototype/ai_agent/0414_v1";
  const isAiButlerV9 = path === "/prototype/ai_agent/0414_v2";
  const isAiButlerV10 = path === "/prototype/ai_agent/0415_v1";
  const isAiButlerV11 = path === "/prototype/ai_agent/0415_v3";
  const isAiButlerV12 = path === "/prototype/ai_agent/0415_v4";
  const isAiButlerV13 = path === "/prototype/ai_agent/0416_v1";
  const isAiButlerV14 = path === "/prototype/ai_agent/0416_v2";

  if (isAiButlerV1 || isAiButlerV2 || isAiButlerV3 || isAiButlerV4 || isAiButlerV5 || isAiButlerV6 || isAiButlerV7 || isAiButlerV8 || isAiButlerV9 || isAiButlerV10 || isAiButlerV11 || isAiButlerV12 || isAiButlerV13 || isAiButlerV14) {
    return <InvoicePrototypeV3 />;
  }

  return (
    <QueryRouter>
      <InvoiceApp />
    </QueryRouter>
  );
}
