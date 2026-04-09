import { useState } from "react";
import AIChat from "./aiChatV1";

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

  return (
    <div>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}::-webkit-scrollbar{display:none}`}</style>
      <div style={S.root}>
        {tab === "ai" ? (
          <AIChat />
        ) : (
          <div style={S.screen}>{content}</div>
        )}
        <TabBar tab={tab} setTab={setTab} />
      </div>
    </div>
  );
}
