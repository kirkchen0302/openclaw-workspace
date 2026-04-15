import { useState } from "react";
import { fetchUserData } from "../firebase";
import { resolveShop } from "./shopMapping";
import { classifyItem } from "./itemClassifier";
import AIChat from "./aiChatV1";
import AIChatV2 from "./aiChatV2";

const fmt = (n) => n.toLocaleString();

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

// ── 登入頁 ────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 9) { setError("請輸入有效的手機號碼"); return; }
    setLoading(true);
    setError("");
    const result = await fetchUserData(clean);
    setLoading(false);
    if (result.success) {
      onLogin(clean, result.data);
    } else {
      // New user: allow login with empty data for onboarding
      onLogin(clean, { invoices: [], totalAmount: 0, invoiceCount: 0 });
    }
  }

  return (
    <div style={{ ...S.root, justifyContent: "center", alignItems: "center", padding: "0 32px", background: "linear-gradient(180deg,#E3F0F9 0%,#F2F2F7 100%)" }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: "linear-gradient(135deg,#5B7FFF,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "#fff", marginBottom: 20 }}>✦</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>發票 AI 管家</div>
      <div style={{ fontSize: 14, color: "#8E8E93", marginBottom: 32 }}>輸入手機號碼查看你的消費分析</div>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
        placeholder="09xx-xxx-xxx"
        style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #D1D1D6", fontSize: 17, textAlign: "center", letterSpacing: 1, outline: "none", marginBottom: 12, background: "#fff" }}
      />
      {error && <div style={{ fontSize: 13, color: "#E8453C", marginBottom: 8 }}>{error}</div>}
      <button
        onClick={handleLogin}
        disabled={loading}
        style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "#007AFF", color: "#fff", fontSize: 16, fontWeight: 700, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}
      >
        {loading ? "查詢中..." : "進入我的發票 →"}
      </button>
    </div>
  );
}

// ── 發票頁（真實資料）─────────────────────────────────────────────────────
function InvoicesPage({ invoices, totalAmount, invoiceCount }) {
  if (!invoices || invoices.length === 0) {
    return <div style={{ padding: 40, textAlign: "center", color: "#8E8E93" }}>尚無發票資料</div>;
  }

  // Group by yearMonth
  const groups = {};
  invoices.forEach((inv) => {
    const ym = inv.yearMonth || "unknown";
    if (!groups[ym]) groups[ym] = { invoices: [], total: 0 };
    groups[ym].invoices.push(inv);
    groups[ym].total += inv.amount || 0;
  });
  const sortedMonths = Object.keys(groups).sort().reverse();

  // Format yearMonth "2026-02" → "2月"
  function fmtMonth(ym) {
    const parts = ym.split("-");
    if (parts.length === 2) return parseInt(parts[1]) + "月";
    return ym;
  }

  return (
    <div>
      <div style={{ background: "#fff", padding: "12px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "0.5px solid #C6C6C8" }}>
        <span style={{ fontSize: 22, fontWeight: 700 }}>我的發票</span>
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ fontSize: 18, color: "#8E8E93" }}>🔍</span>
          <span style={{ fontSize: 18, color: "#8E8E93" }}>⋯</span>
        </div>
      </div>
      <div style={{ margin: "8px 16px 10px", background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #E5E5EA" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>📋</span>
          <div>
            <div style={{ fontSize: 12, color: "#8E8E93" }}>共</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{invoiceCount} 張 · ${fmt(totalAmount)}</div>
          </div>
        </div>
      </div>

      {sortedMonths.map((ym) => {
        const group = groups[ym];
        const sorted = [...group.invoices].sort((a, b) => parseInt(b.day) - parseInt(a.day));
        return (
          <div key={ym}>
            <div style={{ padding: "4px 16px 8px", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{fmtMonth(ym)}</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>${fmt(group.total)}</span>
            </div>
            <div style={{ background: "#fff", margin: "0 16px 12px", borderRadius: 12, overflow: "hidden" }}>
              {sorted.map((inv, i) => {
                const resolved = resolveShop(inv.shop);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderBottom: i < sorted.length - 1 ? "0.5px solid #E5E5EA" : "none" }}>
                    <div style={{ width: 36, flexShrink: 0, textAlign: "center" }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{inv.day}</div>
                      <div style={{ fontSize: 11, color: "#8E8E93" }}>{inv.week}</div>
                    </div>
                    <div style={{ flex: 1, paddingLeft: 12, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.shop || resolved.brand}</div>
                      <div style={{ fontSize: 12, color: "#8E8E93", display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <span style={{ background: "#F2F2F7", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>{resolved.cat}</span>
                        {inv.hour !== undefined && <span style={{ fontSize: 11, color: "#AEAEB2" }}>{inv.hour}:{String(new Date(inv.issued_at || 0).getMinutes()).padStart(2, "0")}</span>}
                      </div>
                      {inv.items && inv.items.length > 0 && (
                        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {inv.items.slice(0, 3).map((item, j) => (
                            <span key={j} style={{ fontSize: 10, color: "#636366", background: "#F8F8FA", padding: "1px 5px", borderRadius: 3 }}>
                              {item.name} ${item.price}
                            </span>
                          ))}
                          {inv.items.length > 3 && <span style={{ fontSize: 10, color: "#AEAEB2" }}>+{inv.items.length - 3}</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>${fmt(inv.amount)}</div>
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

// ── 首頁 ──────────────────────────────────────────────────────────────────
function NativeHomePage({ phone, totalAmount, invoiceCount, onLogout }) {
  return (
    <div>
      <div style={{ background: "linear-gradient(180deg,#E3F0F9 0%,#EFF7FB 50%,#F2F2F7 100%)", padding: "16px 16px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ position: "relative", width: 36, height: 36 }}>
            <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#5B9BD5,#2E75B6)", borderRadius: 7, transform: "rotate(20deg)", position: "absolute", top: 3, left: 0 }} />
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <button onClick={onLogout} style={{ fontSize: 14, color: "#8E8E93", border: "none", background: "none", cursor: "pointer" }}>登出</button>
            <span style={{ fontSize: 18, color: "#8E8E93" }}>⚙️</span>
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 26, fontWeight: 300 }}>Hello！</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{phone}</div>
        </div>
        <div style={{ display: "flex", padding: "14px 0" }}>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 4 }}>發票總數</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{invoiceCount}</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #C7D4DE", paddingLeft: 16 }}>
            <div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 4 }}>總消費</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>${fmt(totalAmount)}</div>
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
            <button key={tab.k} onClick={() => setActiveTab(tab.k)} style={{
              flex: 1, paddingBottom: 10, border: "none", background: "none", cursor: "pointer",
              fontSize: 14, fontWeight: activeTab === tab.k ? 600 : 400,
              color: activeTab === tab.k ? "#1C1C1E" : "#8E8E93",
              borderBottom: activeTab === tab.k ? "2px solid #1C1C1E" : "2px solid transparent",
            }}>{tab.l}</button>
          ))}
        </div>
      </div>
      {activeTab === "scan" && (
        <div>
          <div style={{ background: "#1A1A1A", height: 300, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <div style={{ width: 180, height: 120, border: "2px solid rgba(255,255,255,0.3)", borderRadius: 8 }} />
          </div>
          <div style={{ background: "#fff", padding: "20px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>請將鏡頭對準發票 QRCode</div>
            <div style={{ fontSize: 13, color: "#8E8E93" }}>適度調整掃描距離以便相機對焦</div>
          </div>
        </div>
      )}
      {activeTab === "manual" && <div style={{ padding: 40, textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 12 }}>🔢</div><div style={{ fontSize: 16, fontWeight: 600 }}>手動對獎</div></div>}
      {activeTab === "win" && <div style={{ padding: 40, textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div><div style={{ fontSize: 16, fontWeight: 600 }}>中獎號碼</div></div>}
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
        </div>
        <div style={{ display: "flex" }}>
          <button onClick={() => setMainTab("tasks")} style={{ flex: 1, paddingBottom: 10, border: "none", background: "none", cursor: "pointer", fontSize: 15, fontWeight: mainTab === "tasks" ? 600 : 400, color: mainTab === "tasks" ? "#1C1C1E" : "#8E8E93", borderBottom: mainTab === "tasks" ? "2px solid #1C1C1E" : "2px solid transparent" }}>任務</button>
          <button onClick={() => setMainTab("shop")} style={{ flex: 1, paddingBottom: 10, border: "none", background: "none", cursor: "pointer", fontSize: 15, fontWeight: mainTab === "shop" ? 600 : 400, color: mainTab === "shop" ? "#1C1C1E" : "#8E8E93", borderBottom: mainTab === "shop" ? "2px solid #1C1C1E" : "2px solid transparent" }}>商城</button>
        </div>
      </div>
      {mainTab === "tasks" && (
        <div>
          <div style={{ display: "flex", gap: 8, padding: "12px 16px", overflowX: "auto" }}>
            {filters.map((f) => (<button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 16px", borderRadius: 20, border: "none", background: filter === f ? "#1C1C1E" : "#F2F2F7", color: filter === f ? "#fff" : "#1C1C1E", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{f}</button>))}
          </div>
          <div style={{ padding: "0 16px" }}>
            {tasks.map((tk, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 14, marginBottom: 12, overflow: "hidden", border: "1px solid #E5E5EA" }}>
                <div style={{ background: tk.bg, padding: "20px 16px", position: "relative" }}>
                  {tk.emoji && <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", fontSize: 48, opacity: 0.3 }}>{tk.emoji}</div>}
                  <div style={{ fontSize: i === 0 ? 22 : 16, fontWeight: i === 0 ? 800 : 700 }}>{tk.label}</div>
                </div>
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div><div style={{ fontSize: 14, fontWeight: 600 }}>{tk.title}</div><div style={{ fontSize: 12, color: "#8E8E93", marginTop: 4 }}>⏰ {tk.deadline}</div></div>
                  {tk.cta && <button style={{ padding: "8px 16px", borderRadius: 20, border: "none", background: "#2E75B6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{tk.cta}</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {mainTab === "shop" && <div style={{ padding: 40, textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 12 }}>🛍️</div><div style={{ fontSize: 16, fontWeight: 600 }}>商城</div></div>}
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
            <button key={tab.k} onClick={() => setActiveTab(tab.k)} style={{
              flex: 1, paddingBottom: 10, border: "none", background: "none", cursor: "pointer",
              fontSize: 14, fontWeight: activeTab === tab.k ? 600 : 400,
              color: activeTab === tab.k ? "#1C1C1E" : "#8E8E93",
              borderBottom: activeTab === tab.k ? "2px solid #1C1C1E" : "2px solid transparent",
            }}>{tab.l}</button>
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
              <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: 1 }}>手機條碼</span>
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E5EA", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "0.5px solid #E5E5EA" }}>
              <span style={{ fontSize: 15 }}>自動調整螢幕亮度</span>
              <div onClick={() => setAutoBright(!autoBright)} style={{ width: 48, height: 28, borderRadius: 14, background: autoBright ? "#34C759" : "#E5E5EA", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                <div style={{ width: 24, height: 24, borderRadius: 12, background: "#fff", position: "absolute", top: 2, left: autoBright ? 22 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === "bind" && <div style={{ padding: 40, textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div><div style={{ fontSize: 16, fontWeight: 600 }}>載具歸戶</div></div>}
      {activeTab === "member" && <div style={{ padding: 40, textAlign: "center" }}><div style={{ fontSize: 40, marginBottom: 12 }}>💳</div><div style={{ fontSize: 16, fontWeight: 600 }}>會員卡管理</div></div>}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function InvoicePrototypeV3() {
  const [user, setUser] = useState(null); // { phone, data }
  const [tab, setTab] = useState("ai");

  function handleLogin(phone, data) {
    setUser({ phone, data });
    setTab("ai");
  }
  function handleLogout() {
    setUser(null);
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const { data } = user;
  // Prefer v2 data (with item details) when available, fallback to v1
  const hasV2 = data.invoices_v2 && data.invoices_v2.length > 0;
  const invoices = hasV2 ? data.invoices_v2 : (data.invoices || []);
  const totalAmount = hasV2 ? (data.totalAmount_v2 || 0) : (data.totalAmount || 0);
  const invoiceCount = hasV2 ? (data.invoiceCount_v2 || 0) : (data.invoiceCount || 0);

  let content = null;
  if (tab === "invoices") content = <InvoicesPage invoices={invoices} totalAmount={totalAmount} invoiceCount={invoiceCount} />;
  else if (tab === "points") content = <PointsPage />;
  else if (tab === "scan") content = <ScanPage />;
  else if (tab === "carrier") content = <CarrierPage />;
  else if (tab === "home") content = <NativeHomePage phone={user.phone} totalAmount={totalAmount} invoiceCount={invoiceCount} onLogout={handleLogout} />;

  return (
    <div>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}::-webkit-scrollbar{display:none}`}</style>
      <div style={S.root}>
        {tab === "ai" ? (
          window.location.pathname.includes("0415_v3")
            ? <AIChatV2 invoices={invoices} totalAmount={totalAmount} invoiceCount={invoiceCount} monthlyTrend={data.monthlyTrend} />
            : <AIChat invoices={invoices} totalAmount={totalAmount} invoiceCount={invoiceCount} monthlyTrend={data.monthlyTrend} deliverySubs={data.deliverySubs} flatSubs={data.flatSubs} />
        ) : (
          <div style={S.screen}>{content}</div>
        )}
        <TabBar tab={tab} setTab={setTab} />
      </div>
    </div>
  );
}
