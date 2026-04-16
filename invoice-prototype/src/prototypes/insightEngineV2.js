/**
 * Insight Engine V2 — Computes structured insight data from real invoice data
 * for the static HTML prototype dashboard.
 *
 * Each invoice: { shop, amount, yearMonth, week, issued_at, items: [{ name, price, qty }] }
 * Returns a data object D matching the dashboard's expected shape.
 *
 * Ported from insightEngine.js (v1): subscription detection, per-visit store logic,
 * delivery/online-bulk exclusions, fmtComparisons, audience segmentation,
 * late-night/weekend/frequency-surge detection, repeat items, enhanced fixed costs.
 */
import { resolveShop } from "./shopMapping";
import { classifyItem } from "./itemClassifier";

// ══════════════════════════════════════════════════════════════════════════════
// ── Helpers ──────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const fmt = (n) => Math.round(n).toLocaleString();

/** Flatten all items across invoices with shop/time info attached. */
function flattenItems(invoices) {
  const result = [];
  for (const inv of invoices) {
    for (const it of inv.items || []) {
      result.push({
        ...it,
        shop: inv.shop,
        yearMonth: inv.yearMonth,
        issued_at: inv.issued_at,
      });
    }
  }
  return result;
}

/** Count distinct yearMonths in the data to derive a month span. */
function monthSpan(invoices) {
  const months = new Set();
  for (const inv of invoices) {
    if (inv.yearMonth) months.add(inv.yearMonth);
  }
  return Math.max(months.size, 1);
}

/** Annualise a value observed over `span` months. */
function annualise(value, span) {
  return Math.round((value / span) * 12);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Store / Platform Classification ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Delivery platforms — invoices are service fees, not actual food purchases. */
const DELIVERY_PLATFORMS = ["ubereats", "uber eats", "foodpanda", "uber", "外送"];
function isDeliveryPlatform(shopName) {
  if (!shopName) return false;
  const lower = shopName.toLowerCase();
  return DELIVERY_PLATFORMS.some((p) => lower.includes(p));
}

/** Online / bulk stores — box-purchase unit prices are not comparable. */
const ONLINE_BULK = [
  "momo", "蝦皮", "shopee", "酷澎", "coupang",
  "好市多", "costco", "pchome", "yahoo",
];
function isOnlineBulk(shop) {
  return ONLINE_BULK.some((k) => (shop || "").toLowerCase().includes(k));
}

/**
 * Per-visit stores: fast food and sushi restaurants should be counted by VISIT
 * (one invoice = one consumption), not by individual items.
 * e.g. McDonald's "餐-十塊雞 + 配-大薯 + 可樂" = one visit, not 3 items.
 * e.g. 藏壽司 "30元盤 x 8" = one visit.
 */
const PER_VISIT_STORES = [
  "爭鮮", "藏壽司", "壽司郎", "くら寿司", "スシロー",
  "麥當勞", "肯德基", "摩斯漢堡", "漢堡王", "Subway",
];
function isPerVisitStore(shop) {
  return PER_VISIT_STORES.some((s) => (shop || "").includes(s));
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Signal Detection ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const SIGNAL_RULES = [
  {
    key: "嬰幼兒", emoji: "👶", label: "有嬰幼兒用品支出",
    itemKw: ["尿布", "奶粉", "奶瓶", "嬰兒", "寶寶", "副食品", "幫寶適", "pampers", "哺乳"],
    shopKw: [],
  },
  {
    key: "寵物", emoji: "🐾", label: "有寵物相關支出",
    itemKw: ["飼料", "貓砂", "寵物", "倉鼠"],
    shopKw: [],
  },
  {
    key: "咖啡", emoji: "☕", label: "有咖啡消費",
    itemKw: ["咖啡", "美式", "拿鐵"],
    shopKw: [],
  },
  {
    key: "酒類", emoji: "🍺", label: "有酒類消費",
    itemKw: ["啤酒", "紅酒", "白酒", "威士忌", "清酒", "酒"],
    shopKw: [],
    itemExclude: ["酒精燈", "酒精棉"],
  },
  {
    key: "服飾", emoji: "👗", label: "有服飾消費",
    itemKw: ["服飾", "童裝", "褲", "衣", "洋裝"],
    shopKw: ["uniqlo", "zara", "h&m", "gu", "net"],
  },
  {
    key: "開車族", emoji: "🚗", label: "有加油/車輛支出",
    itemKw: ["無鉛汽油", "柴油", "95無鉛", "92無鉛"],
    shopKw: ["中油", "加油站"],
  },
];

function detectSignals(invoices, allItems, span) {
  const signals = [];

  for (const rule of SIGNAL_RULES) {
    let sum = 0;
    for (const it of allItems) {
      const nameLower = (it.name || "").toLowerCase();
      const shopLower = (it.shop || "").toLowerCase();

      if (rule.itemExclude && rule.itemExclude.some((ex) => nameLower.includes(ex.toLowerCase()))) {
        continue;
      }

      const itemMatch = rule.itemKw.some((kw) => nameLower.includes(kw.toLowerCase()));
      const shopMatch = rule.shopKw.some((kw) => shopLower.includes(kw.toLowerCase()));

      if (itemMatch || shopMatch) {
        sum += (it.price || 0);
      }
    }
    if (sum > 0) {
      const annual = annualise(sum, span);
      signals.push(`${rule.emoji} ${rule.label}：$${fmt(annual)}/年`);
    }
  }

  // Special signal: 電費偏高 — check fixed costs
  const fixedCosts = detectFixed(invoices, span);
  const totalFixed = fixedCosts.reduce((s, f) => s + f.amount, 0);
  if (totalFixed > 15000) {
    signals.push(`⚡ 電費偏高：$${fmt(totalFixed)}/年`);
  }

  return signals;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Fixed Cost / Bill Detection (Enhanced) ──────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const FIXED_RULES = [
  { name: "電費", shopKw: ["台灣電力", "台電"], itemKw: ["電費"] },
  { name: "水費", shopKw: ["自來水"], itemKw: ["水費"] },
  { name: "瓦斯", shopKw: [], itemKw: ["瓦斯"] },
  { name: "電信費", shopKw: ["台灣大哥大", "中華電信", "遠傳"], itemKw: ["電信", "月租"] },
  { name: "保險費", shopKw: ["國泰人壽", "南山人壽", "富邦人壽"], itemKw: ["保費", "保險"] },
];

function detectFixed(invoices, span) {
  const results = [];

  for (const rule of FIXED_RULES) {
    let sum = 0;
    let count = 0;

    for (const inv of invoices) {
      const shopLower = (inv.shop || "").toLowerCase();
      const shopMatch = rule.shopKw.some((kw) => shopLower.includes(kw.toLowerCase()));

      let invMatch = shopMatch;

      if (!invMatch) {
        for (const it of inv.items || []) {
          const nameLower = (it.name || "").toLowerCase();
          if (rule.itemKw.some((kw) => nameLower.includes(kw.toLowerCase()))) {
            invMatch = true;
            break;
          }
        }
      }

      if (invMatch) {
        sum += inv.amount || 0;
        count++;
      }
    }

    if (sum > 0) {
      const annual = annualise(sum, span);
      const perPeriod = count > 0 ? Math.round(sum / count) : 0;
      results.push({
        name: rule.name,
        amount: annual,
        period: `每期 $${fmt(perPeriod)}`,
      });
    }
  }

  return results;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Penalties Detection ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function detectPenalties(allItems) {
  const PENALTY_KW = ["滯納金", "違約金", "逾期"];
  let sum = 0;
  for (const it of allItems) {
    const nameLower = (it.name || "").toLowerCase();
    if (PENALTY_KW.some((kw) => nameLower.includes(kw))) {
      sum += (it.price || 0);
    }
  }
  return Math.round(sum);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Subscription Detection (Full 3-Method from v1) ──────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// Method 1a: Item keywords
const SUB_ITEM_KEYWORDS = [
  "月費", "年費", "月訂閱", "季訂閱", "年訂閱", "訂閱費",
  "訂閱制", "訂閱方案", "訂閱服務", "訂閱月費", "訂閱年費",
  "uber one", "pandapro", "panda pro", "蝦皮vip", "wow 會員",
];

// Method 1b: Regex
const SUB_ITEM_REGEX = [
  /(youtube|spotify).*premium/i,
  /^youtube$/i,
];

// Method 2: Store x item keyword pairs
const SUB_STORE_ITEMS = [
  { store: ["ubereats", "uber eats", "優食台灣", "uber"], items: ["uber one", "訂閱"] },
  { store: ["foodpanda", "富胖達"], items: ["pandapro", "panda pro", "訂閱"] },
  { store: ["酷澎", "coupang"], items: ["wow", "會員", "訂閱"] },
  { store: ["spotify"], items: ["premium", "訂閱", "月費"] },
  { store: ["netflix"], items: ["訂閱", "月費", "netflix"] },
  { store: ["disney", "迪士尼"], items: ["訂閱", "月費"] },
  { store: ["apple", "itunes"], items: ["icloud", "訂閱", "月費"] },
  { store: ["google"], items: ["訂閱", "月費", "youtube", "premium"] },
  { store: ["kkbox"], items: ["訂閱", "月費"] },
  { store: ["蝦皮", "shopee"], items: ["vip", "訂閱"] },
  { store: ["line"], items: ["訂閱", "月費", "premium"] },
];

// Exclude: Apple Store / momo購物 hardware (unless item explicitly says 訂閱/月費)
const SUB_EXCLUDE = ["apple store", "momo購物"];

function detectSubscriptions(invoices) {
  const subs = {};

  for (const inv of invoices) {
    for (const it of inv.items || []) {
      const itemLower = (it.name || "").toLowerCase();
      const itemRaw = it.name || "";
      const shopLower = (inv.shop || "").toLowerCase();

      // Check excluded shops — unless item explicitly says 訂閱/月費
      const isExcludedShop = SUB_EXCLUDE.some((ex) => shopLower.includes(ex));
      if (isExcludedShop && !itemLower.includes("訂閱") && !itemLower.includes("月費")) continue;

      let matched = false;

      // Method 1a: Keyword match
      if (SUB_ITEM_KEYWORDS.some((kw) => itemLower.includes(kw))) matched = true;

      // Method 1b: Regex match
      if (!matched && SUB_ITEM_REGEX.some((rx) => rx.test(itemRaw))) matched = true;

      // Method 2: Store + item keyword match
      if (!matched) {
        for (const rule of SUB_STORE_ITEMS) {
          const storeMatch = rule.store.some((s) => shopLower.includes(s));
          const itemMatch = rule.items.some((kw) => itemLower.includes(kw));
          if (storeMatch && itemMatch) { matched = true; break; }
        }
      }

      if (!matched) continue;

      // Deduplicate by store + rounded price
      const key = inv.shop + "_" + Math.round(it.price);
      if (!subs[key]) {
        subs[key] = { shop: inv.shop, item: it.name, price: it.price, count: 0, dates: [] };
      }
      subs[key].count++;
      subs[key].dates.push(inv.issued_at || inv.yearMonth || "");
    }
  }

  return Object.values(subs).sort((a, b) => b.price - a.price);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Tier 1: Top Repeat / High-Amount Items ──────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Normalise an item name for fuzzy grouping.
 * Strips trailing quantity suffixes (e.g. "啟賦奶粉 6罐" -> "啟賦奶粉")
 * and collapses whitespace.
 */
function normaliseItemName(name) {
  if (!name) return "";
  return name
    .replace(/\s*\d+\s*(罐|入|組|盒|包|袋|瓶|片|個)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compute Tier 1 items with per-visit store logic and delivery platform exclusion.
 * - Delivery platforms are excluded (invoices are just service fees).
 * - Per-visit stores (fast food, sushi) are counted by visit, not individual items.
 */
function computeTier1(invoices, allItems, totalAmount, span) {
  const groups = {};

  // 1. Handle per-visit stores: one invoice = one consumption entry
  for (const inv of invoices) {
    if (isDeliveryPlatform(inv.shop)) continue; // exclude delivery platforms

    if (isPerVisitStore(inv.shop)) {
      const norm = inv.shop;
      if (!groups[norm]) groups[norm] = { name: norm, amount: 0, count: 0, shops: new Set() };
      groups[norm].amount += inv.amount || 0;
      groups[norm].count += 1; // one visit = one count
      groups[norm].shops.add(inv.shop);
      continue;
    }

    // 2. Regular items: group by normalised name
    for (const it of inv.items || []) {
      const norm = normaliseItemName(it.name);
      if (!norm || norm.length < 2) continue;
      if (!groups[norm]) groups[norm] = { name: norm, amount: 0, count: 0, shops: new Set() };
      groups[norm].amount += (it.price || 0);
      groups[norm].count += 1;
      if (inv.shop) groups[norm].shops.add(inv.shop);
    }
  }

  // Filter: high amount (>$3000) OR high frequency (>=5)
  const candidates = Object.values(groups).filter(
    (g) => g.amount > 3000 || g.count >= 5
  );

  // Sort by amount descending, take top 6
  candidates.sort((a, b) => b.amount - a.amount);
  const top6 = candidates.slice(0, 6);

  return top6.map((g) => ({
    name: g.name,
    amount: Math.round(g.amount),
    count: g.count,
    pct: totalAmount > 0 ? Math.round((g.amount / totalAmount) * 1000) / 10 : 0,
    _shops: g.shops, // internal, used for tier2 filtering
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Tier 2: Remaining Spend by Store ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function computeTier2(invoices, tier1, totalAmount) {
  // Collect shops that are primary stores for tier1 items
  const tier1Shops = new Set();
  for (const t of tier1) {
    if (t._shops) {
      for (const s of t._shops) tier1Shops.add(s);
    }
  }

  // Group remaining invoices by store
  const storeMap = {};
  for (const inv of invoices) {
    const shop = inv.shop || "其他";
    if (!storeMap[shop]) storeMap[shop] = { store: shop, amount: 0, itemMap: {} };
    storeMap[shop].amount += inv.amount || 0;

    for (const it of inv.items || []) {
      const name = it.name || "品項";
      const price = (it.price || 0);
      if (!storeMap[shop].itemMap[name]) {
        storeMap[shop].itemMap[name] = { name, price: 0 };
      }
      storeMap[shop].itemMap[name].price += price;
    }
  }

  const stores = Object.values(storeMap);

  // Sort by amount descending, take top 6
  stores.sort((a, b) => b.amount - a.amount);
  const top6 = stores.slice(0, 6);

  return top6.map((s) => {
    // Build top-4 items string
    const sortedItems = Object.values(s.itemMap).sort((a, b) => b.price - a.price);
    const topItems = sortedItems
      .slice(0, 4)
      .map((it) => `${it.name}$${fmt(it.price)}`)
      .join("、");

    return {
      store: s.store,
      amount: Math.round(s.amount),
      items: topItems || "",
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Saves: Actionable Savings from Tier1 Items ──────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const SAVE_RULES = [
  { match: ["尿布", "奶粉", "奶瓶", "嬰兒", "寶寶", "副食品", "幫寶適", "哺乳"], icon: "🍼", action: "改買大包裝", savePct: 0.4 },
  { match: ["咖啡", "美式", "拿鐵"], icon: "☕", action: "自備杯折扣 + 量販包", savePct: 0.35 },
  { match: ["飯糰", "三明治", "便當", "涼麵", "鮮食"], icon: "🍱", action: "超商品改超市/自帶", savePct: 0.3 },
  { match: ["餅乾", "洋芋片", "零食", "巧克力", "糖果"], icon: "🍪", action: "量販店囤貨替代超商", savePct: 0.3 },
  { match: ["飲料", "可樂", "氣泡水", "礦泉水", "茶"], icon: "🥤", action: "改買箱裝或自備水壺", savePct: 0.35 },
  { match: ["衛生紙", "面紙", "濕紙巾"], icon: "🧻", action: "網購量販價更低", savePct: 0.3 },
];

function computeSaves(tier1, span) {
  const saves = [];

  for (const item of tier1) {
    const nameLower = (item.name || "").toLowerCase();
    for (const rule of SAVE_RULES) {
      if (rule.match.some((kw) => nameLower.includes(kw.toLowerCase()))) {
        const annual = annualise(item.amount, span);
        const save = Math.round(annual * rule.savePct);
        saves.push({
          icon: rule.icon,
          item: item.name,
          detail: `${item.count}次 = $${fmt(annual)}/年`,
          action: rule.action,
          save,
        });
        break;
      }
    }
  }

  if (saves.length === 0 && tier1.length > 0) {
    const top = tier1[0];
    const annual = annualise(top.amount, span);
    saves.push({
      icon: "💡",
      item: top.name,
      detail: `${top.count}次 = $${fmt(annual)}/年`,
      action: "比價 + 等特價囤貨",
      save: Math.round(annual * 0.3),
    });
  }

  return saves;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Smart Buy: Package Size Optimisation ────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// Categories where "buy in bulk" makes no sense (restaurant meals, prepared food)
const NO_BULK_CATS = ["速食餐點", "便當/正餐", "餐飲消費", "壽司/迴轉", "滷味/小食", "麵包/烘焙", "手搖飲"];

function computeSmartBuy(invoices, span) {
  const storeItemVariants = {};

  for (const inv of invoices) {
    // Skip per-visit stores entirely (sushi/fast food — no package concept)
    if (isPerVisitStore(inv.shop)) continue;
    for (const it of inv.items || []) {
      if (!it.name || !it.price || it.price <= 0) continue;
      // Skip restaurant/prepared food categories
      const cat = classifyItem(it.name);
      if (NO_BULK_CATS.includes(cat)) continue;
      const normalized = normaliseItemName(it.name);
      if (normalized.length < 2) continue;

      const shop = inv.shop || "";
      const key = shop + "::" + normalized;
      if (!storeItemVariants[key]) {
        storeItemVariants[key] = { shop, baseName: normalized, variants: {} };
      }
      const priceKey = Math.round(it.price);
      if (!storeItemVariants[key].variants[priceKey]) {
        storeItemVariants[key].variants[priceKey] = { price: it.price, count: 0, name: it.name };
      }
      storeItemVariants[key].variants[priceKey].count += 1;
    }
  }

  let best = null;
  let bestSave = 0;

  for (const group of Object.values(storeItemVariants)) {
    const variants = Object.values(group.variants).filter((v) => v.count >= 1);
    if (variants.length < 2) continue;

    variants.sort((a, b) => a.price - b.price);
    const cheapest = variants[0];
    const most = variants[variants.length - 1];

    if (most.price <= cheapest.price * 1.3) continue;
    if (most.price < 100) continue;

    const totalBought = variants.reduce((s, v) => s + v.count, 0);
    const currentSpend = variants.reduce((s, v) => s + v.price * v.count, 0);
    const ifCheapest = totalBought * cheapest.price;
    const saveable = currentSpend - ifCheapest;
    if (saveable < 500) continue;

    const yearlySave = annualise(saveable, span);
    if (yearlySave > bestSave) {
      bestSave = yearlySave;
      const avgPrice = Math.round(currentSpend / totalBought);
      best = {
        name: group.baseName,
        amount: Math.round(currentSpend),
        count: totalBought,
        yours_price: avgPrice,
        smart_price: Math.round(cheapest.price),
        tip: `同商品「${cheapest.name}」每次便宜 $${fmt(avgPrice - cheapest.price)}，改買大包裝年省 $${fmt(yearlySave)}`,
        annual_save: yearlySave,
      };
    }
  }

  return best;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Benchmark ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const TIER_BENCHMARKS = [
  { max: 10000, tier_range: "5-10K", tier_median: 7500, tier_users: 892341 },
  { max: 20000, tier_range: "10-20K", tier_median: 14200, tier_users: 723156 },
  { max: 40000, tier_range: "20-40K", tier_median: 26004, tier_users: 506814 },
  { max: 60000, tier_range: "40-60K", tier_median: 48500, tier_users: 198432 },
  { max: Infinity, tier_range: "60K+", tier_median: 72000, tier_users: 85210 },
];

function computeBenchmark(monthly) {
  const tier =
    TIER_BENCHMARKS.find((t) => monthly < t.max) ||
    TIER_BENCHMARKS[TIER_BENCHMARKS.length - 1];

  const pct_diff = tier.tier_median > 0
    ? Math.round(((monthly - tier.tier_median) / tier.tier_median) * 100)
    : 0;

  let position;
  if (pct_diff <= -20) position = "偏低";
  else if (pct_diff <= -5) position = "中下";
  else if (pct_diff <= 5) position = "中等";
  else if (pct_diff <= 20) position = "中上";
  else position = "偏高";

  return {
    tier_range: tier.tier_range,
    tier_median: tier.tier_median,
    tier_users: tier.tier_users,
    pct_diff,
    position,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Comparisons ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const MEDIAN_PRICES = {
  咖啡: { median: 55, unit: "杯" },
  瓶裝飲料: { median: 29, unit: "" },
  乳製品: { median: 52, unit: "" },
  零食: { median: 46, unit: "" },
  "鮮食/便當": { median: 48, unit: "" },
};

const COMPARISON_CATEGORY_MAP = [
  { benchmarkKey: "咖啡", kw: ["咖啡", "美式", "拿鐵", "摩卡", "卡布"] },
  { benchmarkKey: "瓶裝飲料", kw: ["氣泡水", "礦泉水", "可樂", "雪碧", "多喝水", "PET"] },
  { benchmarkKey: "乳製品", kw: ["鮮乳", "鮮奶", "牛奶", "豆漿", "優格", "優酪"] },
  { benchmarkKey: "零食", kw: ["餅乾", "洋芋片", "巧克力", "糖果", "零食"] },
  { benchmarkKey: "鮮食/便當", kw: ["便當", "飯糰", "三明治", "餐盒", "涼麵", "鮮食"] },
];

function computeComparisons(tier1, allItems) {
  const comparisons = [];

  for (const item of tier1) {
    const nameLower = (item.name || "").toLowerCase();

    for (const catMap of COMPARISON_CATEGORY_MAP) {
      if (catMap.kw.some((kw) => nameLower.includes(kw.toLowerCase()))) {
        const bm = MEDIAN_PRICES[catMap.benchmarkKey];
        if (!bm) break;

        const avgPrice = item.count > 0 ? Math.round(item.amount / item.count) : 0;
        const pctAbove =
          bm.median > 0
            ? Math.round(((avgPrice - bm.median) / bm.median) * 100)
            : 0;

        if (pctAbove >= 30) {
          comparisons.push({
            item: item.name,
            yours: avgPrice,
            median: bm.median,
            pct: pctAbove,
          });
        }
        break;
      }
    }
  }

  return comparisons;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Consumer Psychology Comparison Framework (fmtComparisons) ────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 3-layer comparison framework from v1.
 *
 * Layer 1: Self-anchoring — use user's own frequent stores as anchor
 * Layer 2: Experiential alternative — travel, dining, gym
 * Layer 3: Daily loss frame — Loss Aversion
 *
 * @param {number} amount - The dollar amount to compare
 * @param {Array} invoices - Invoice array (used to find anchor brands)
 * @param {string} [excludeCat] - Category to exclude from self-anchoring
 *        (e.g., when saving on 速食, don't say "= X 次麥當勞")
 * @returns {string} Multi-line comparison text
 */
function buildFmtComparisons(invoices) {
  // Pre-compute brand stats for Layer 1 anchoring
  const brandMap = {};
  for (const inv of invoices) {
    const brand = inv.shop || "";
    if (!brand) continue;
    if (!brandMap[brand]) brandMap[brand] = { brand, visits: 0, total: 0 };
    brandMap[brand].visits++;
    brandMap[brand].total += inv.amount || 0;
  }
  const brands = Object.values(brandMap);

  // Return the actual formatter function
  return function fmtComparisons(amount, excludeCat) {
    const lines = [];

    // ── Layer 1: Self-anchoring ─────────────────────────────────────
    const BILL_CATS_LOCAL = ["電費", "水費", "瓦斯費", "電信費", "網路"];
    const anchors = brands
      .filter((b) => b.visits >= 5)
      .filter((b) => {
        const resolved = resolveShop(b.brand);
        if (BILL_CATS_LOCAL.includes(resolved.cat) || resolved.cat === "其他") return false;
        if (excludeCat && resolved.cat === excludeCat) return false;
        return true;
      })
      .map((b) => {
        const resolved = resolveShop(b.brand);
        return { brand: b.brand, cat: resolved.cat, avg: Math.round(b.total / b.visits) };
      })
      .filter((b) => b.avg > 30);

    if (anchors.length > 0) {
      const anchor = anchors.sort((a, b) => Math.abs(a.avg - 200) - Math.abs(b.avg - 200))[0];
      const times = Math.round(amount / anchor.avg);
      if (times >= 2) {
        lines.push(`等於你去「${anchor.brand}」${times} 次（均 $${anchor.avg}）`);
      }
    }

    // ── Layer 2: Experiential alternative ───────────────────────────
    const experiences = [];
    if (amount >= 20000) {
      experiences.push("✈️ 一趟東京 5 天自由行（傳統航空來回 $14,000 + 住宿餐飲）");
    } else if (amount >= 10000) {
      experiences.push("✈️ 一趟東京 3 天快閃（廉航來回 $5,000 + 住宿）");
    } else if (amount >= 5000) {
      experiences.push("🏖️ 一趟國內兩天一夜小旅行（住宿 + 交通 + 吃喝）");
    }
    const meals = Math.round(amount / 600);
    if (meals >= 2) {
      experiences.push(`🍽️ 跟朋友吃 ${meals} 次好餐廳（人均 $600）`);
    }
    if (amount >= 3000) {
      experiences.push(`💪 ${Math.round(amount / 988)} 個月的健身房會員`);
    }
    lines.push(...experiences.slice(0, 2));

    // ── Layer 3: Daily loss frame ───────────────────────────────────
    const daily = Math.round(amount / 365);
    if (daily > 0) {
      let dailyRef = "";
      if (daily >= 155) {
        dailyRef = "一杯星巴克拿鐵（$155）";
      } else if (daily >= 100) {
        dailyRef = "一杯路易莎拿鐵（$100）";
      } else if (daily >= 55) {
        dailyRef = "一杯路易莎美式（$55）";
      } else {
        dailyRef = "一瓶超商飲料";
      }
      if (daily >= 30) {
        lines.push(`💸 每天 $${daily} 正在溜走——等於每天丟掉${dailyRef}`);
      } else if (daily >= 10) {
        lines.push(`💸 每天 $${daily} 不知不覺流出去`);
      }
    }

    if (lines.length === 0) {
      return `這筆 $${fmt(amount)} 積少成多，值得注意。`;
    }
    return lines.slice(0, 4).join("\n");
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Audience Segmentation (12 rules from v1) ────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const AUDIENCE_RULES = [
  { name: "外食族", storeKw: ["ubereats","uber eats","foodpanda","麥當勞","肯德基","摩斯漢堡","爭鮮","藏壽司"], itemKw: [], type: "store_pct", threshold: 20 },
  { name: "超商族", storeKw: ["7-11","全家","萊爾富"], itemKw: [], type: "store_pct", threshold: 25 },
  { name: "超市採購族", storeKw: ["全聯","家樂福","美廉社"], itemKw: [], type: "store_pct", threshold: 15 },
  { name: "咖啡族", storeKw: [], itemKw: ["咖啡","美式","拿鐵","摩卡","卡布","冷萃"], type: "item_pct", threshold: 5 },
  { name: "健身/健康族", storeKw: ["健身工廠"], itemKw: ["雞胸","蛋白","優格","沙拉","燕麥","豆漿","LP33","益生菌"], type: "item_count", threshold: 15 },
  { name: "飲料族", storeKw: [], itemKw: ["氣泡水","可樂","雪碧","奶茶","果汁","紅茶","綠茶"], type: "item_pct", threshold: 8 },
  { name: "零食控", storeKw: [], itemKw: ["餅乾","洋芋片","巧克力","糖果","軟糖"], type: "item_pct", threshold: 4 },
  { name: "新手爸媽", storeKw: [], itemKw: ["尿布","奶粉","副食品","嬰兒","寶寶","奶瓶","紙尿褲","pampers","幫寶適","妙而舒","哺乳"], type: "item_count", threshold: 3 },
  { name: "美妝保養族", storeKw: ["寶雅","屈臣氏","康是美"], itemKw: ["面膜","卸妝","防曬","乳液","保濕","精華","粉底"], type: "item_count", threshold: 5 },
  { name: "網購族", storeKw: ["momo","蝦皮","shopee","酷澎","coupang","pchome"], itemKw: [], type: "store_pct", threshold: 10 },
  { name: "開車族", storeKw: ["台灣中油","北基加油站","停車場"], itemKw: ["無鉛汽油","柴油","95無鉛","92無鉛"], type: "item_count", threshold: 5 },
  // IMPORTANT: "熱狗" must NOT trigger "毛小孩家長" — "狗" was removed from keywords
  { name: "毛小孩家長", storeKw: [], itemKw: ["飼料","貓砂","寵物","倉鼠"], type: "item_count", threshold: 3 },
];

function detectAudience(invoices) {
  const total = invoices.length || 1;
  const tags = [];

  for (const rule of AUDIENCE_RULES) {
    let storeHits = 0;
    let itemHits = 0;

    for (const inv of invoices) {
      const shopLower = (inv.shop || "").toLowerCase();
      if (rule.storeKw.some((kw) => shopLower.includes(kw.toLowerCase()))) storeHits++;
      for (const it of inv.items || []) {
        const itemLower = (it.name || "").toLowerCase();
        if (rule.itemKw.some((kw) => itemLower.includes(kw.toLowerCase()))) {
          itemHits += 1;
        }
      }
    }

    let hit = false;
    let score = 0;

    if (rule.type === "store_pct") {
      const pct = (storeHits / total) * 100;
      if (pct >= rule.threshold) { hit = true; score = pct; }
    } else if (rule.type === "item_pct") {
      const pct = (itemHits / total) * 100;
      if (pct >= rule.threshold) { hit = true; score = pct; }
    } else if (rule.type === "item_count") {
      if (storeHits + itemHits >= rule.threshold) { hit = true; score = storeHits + itemHits; }
    }

    if (hit) tags.push({ name: rule.name, score });
  }

  tags.sort((a, b) => b.score - a.score);
  const primary = tags[0] || { name: "一般消費者", score: 0 };

  return {
    tags: tags.map((t) => t.name),
    primary: primary.name,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Late Night / Weekend Premium / Frequency Surge Detection ────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Detect late-night spending (22:00 - 06:00).
 * Returns { pct, total, saveable }.
 */
function detectLateNight(invoices) {
  let lateNightTotal = 0;
  let allTimedTotal = 0;

  for (const inv of invoices) {
    if (!inv.issued_at || isDeliveryPlatform(inv.shop)) continue;
    const h = parseInt((inv.issued_at || "").slice(11, 13));
    if (isNaN(h)) continue;

    const amt = inv.amount || 0;
    allTimedTotal += amt;
    if (h >= 22 || h < 6) lateNightTotal += amt;
  }

  const pct = allTimedTotal > 0 ? Math.round((lateNightTotal / allTimedTotal) * 100) : 0;
  const saveable = Math.round(lateNightTotal * 0.3); // 30% reduction potential

  return { pct, total: Math.round(lateNightTotal), saveable };
}

/**
 * Time-based spending analysis: peak hour, day-of-week, peak month.
 */
function detectTimePatterns(invoices) {
  const hourMap = {};
  const wkNames = ["週日","週一","週二","週三","週四","週五","週六"];
  const wkMap = {};
  const monthMap = {};

  for (const inv of invoices) {
    if (!inv.issued_at) continue;
    const dt = new Date(inv.issued_at);
    if (isNaN(dt)) continue;
    const amt = inv.amount || 0;

    // Hour
    const h = dt.getHours();
    hourMap[h] = (hourMap[h] || 0) + amt;

    // Day of week
    const wk = wkNames[dt.getDay()];
    if (!wkMap[wk]) wkMap[wk] = { total: 0, count: 0, days: new Set() };
    wkMap[wk].total += amt;
    wkMap[wk].count++;
    wkMap[wk].days.add(inv.issued_at.slice(0, 10));

    // Month
    const ym = inv.yearMonth || inv.issued_at.slice(0, 7);
    if (!monthMap[ym]) monthMap[ym] = 0;
    monthMap[ym] += amt;
  }

  // Peak hour
  const peakHour = Object.entries(hourMap).sort((a, b) => b[1] - a[1])[0];

  // Day of week with daily averages
  const wkAvgs = ["週一","週二","週三","週四","週五","週六","週日"].map((wk) => {
    const s = wkMap[wk];
    return s && s.days.size > 0 ? { wk, avg: Math.round(s.total / s.days.size), total: Math.round(s.total) } : { wk, avg: 0, total: 0 };
  }).filter((w) => w.avg > 0);
  const maxWk = wkAvgs.length > 0 ? wkAvgs.reduce((a, b) => a.avg > b.avg ? a : b) : null;
  const minWk = wkAvgs.length > 0 ? wkAvgs.reduce((a, b) => a.avg < b.avg ? a : b) : null;

  // Peak month
  const peakMonth = Object.entries(monthMap).sort((a, b) => b[1] - a[1])[0];

  // Hour buckets for display
  const buckets = { "早上(6-11)": 0, "中午(12-14)": 0, "下午(15-17)": 0, "晚上(18-21)": 0, "深夜(22-5)": 0 };
  for (const [h, amt] of Object.entries(hourMap)) {
    const hr = parseInt(h);
    if (hr >= 6 && hr < 12) buckets["早上(6-11)"] += amt;
    else if (hr >= 12 && hr < 15) buckets["中午(12-14)"] += amt;
    else if (hr >= 15 && hr < 18) buckets["下午(15-17)"] += amt;
    else if (hr >= 18 && hr < 22) buckets["晚上(18-21)"] += amt;
    else buckets["深夜(22-5)"] += amt;
  }
  const sortedBuckets = Object.entries(buckets).sort((a, b) => b[1] - a[1]).map(([name, amt]) => ({ name, amount: Math.round(amt) }));

  return {
    peakHour: peakHour ? { hour: parseInt(peakHour[0]), amount: Math.round(peakHour[1]) } : null,
    peakMonth: peakMonth ? { month: peakMonth[0], amount: Math.round(peakMonth[1]) } : null,
    dayOfWeek: wkAvgs,
    maxDay: maxWk,
    minDay: minWk,
    dayRatio: maxWk && minWk && minWk.avg > 0 ? Math.round(maxWk.avg / minWk.avg * 10) / 10 : 0,
    timeBuckets: sortedBuckets,
  };
}

/**
 * Detect weekend premium: weekday vs weekend per-invoice average spend.
 * Returns { pct, weekdayAvg, weekendAvg }.
 */
function detectWeekendPremium(invoices) {
  let weekdayTotal = 0, weekdayCount = 0;
  let weekendTotal = 0, weekendCount = 0;

  for (const inv of invoices) {
    if (!inv.issued_at) continue;
    const dt = new Date(inv.issued_at);
    if (isNaN(dt)) continue;
    const dow = dt.getDay(); // 0=Sun, 6=Sat
    if (dow === 0 || dow === 6) {
      weekendTotal += inv.amount || 0;
      weekendCount++;
    } else {
      weekdayTotal += inv.amount || 0;
      weekdayCount++;
    }
  }

  const weekdayAvg = weekdayCount > 0 ? Math.round(weekdayTotal / weekdayCount) : 0;
  const weekendAvg = weekendCount > 0 ? Math.round(weekendTotal / weekendCount) : 0;
  const pct = weekdayAvg > 0 ? Math.round(((weekendAvg - weekdayAvg) / weekdayAvg) * 100) : 0;

  return { pct, weekdayAvg, weekendAvg };
}

/**
 * Detect frequency surges: stores with >= 2x monthly frequency increase
 * between first half and second half of the data period.
 * Returns [{ brand, before, after, ratio }].
 */
function detectFrequencySurges(invoices) {
  // Split months into first half and second half
  const monthSet = new Set();
  for (const inv of invoices) {
    if (inv.yearMonth) monthSet.add(inv.yearMonth);
  }
  const sortedMonths = [...monthSet].sort();
  const mid = Math.floor(sortedMonths.length / 2);
  const firstKeys = new Set(sortedMonths.slice(0, mid));
  const secondKeys = new Set(sortedMonths.slice(mid));

  if (firstKeys.size === 0 || secondKeys.size === 0) return [];

  // Count visits per brand in each half
  const brandFirst = {};
  const brandSecond = {};

  for (const inv of invoices) {
    const brand = inv.shop || "";
    if (!brand) continue;
    const ym = inv.yearMonth || "";

    if (firstKeys.has(ym)) {
      brandFirst[brand] = (brandFirst[brand] || 0) + 1;
    } else if (secondKeys.has(ym)) {
      brandSecond[brand] = (brandSecond[brand] || 0) + 1;
    }
  }

  const BILL_CATS = ["電費", "水費", "瓦斯費", "電信費", "網路"];
  const surges = [];

  for (const brand of new Set([...Object.keys(brandFirst), ...Object.keys(brandSecond)])) {
    const resolved = resolveShop(brand);
    if (BILL_CATS.includes(resolved.cat) || resolved.cat === "其他") continue;

    const befVisits = brandFirst[brand] || 0;
    const aftVisits = brandSecond[brand] || 0;

    const befMonthly = befVisits / Math.max(firstKeys.size, 1);
    const aftMonthly = aftVisits / Math.max(secondKeys.size, 1);

    const ratio = befMonthly > 0
      ? Math.round((aftMonthly / befMonthly) * 10) / 10
      : (aftMonthly > 1 ? 99 : 0);

    if (ratio >= 2 && aftVisits >= 5) {
      surges.push({
        brand,
        before: Math.round(befMonthly * 10) / 10,
        after: Math.round(aftMonthly * 10) / 10,
        ratio,
      });
    }
  }

  surges.sort((a, b) => b.ratio - a.ratio);
  return surges;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Repeat Items with Per-Visit Logic ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Compute repeat items (>=5 occurrences) with per-visit store logic.
 * - Regular items: group by item name, >=5 occurrences
 * - Per-visit stores: group by store visit (one invoice = one visit), >=5 visits
 * - Exclude delivery platforms and "其他"/"外送服務費" categories
 *
 * Returns [{ name, count, total, cat, shop }]
 */
function computeRepeatItems(invoices) {
  const repeatItems = {};
  const perVisitShops = {};

  for (const inv of invoices) {
    // Exclude delivery platforms and online/bulk stores
    if (isDeliveryPlatform(inv.shop)) continue;

    // Per-visit stores: count as one visit, not individual items
    if (isPerVisitStore(inv.shop)) {
      const key = "_store_" + inv.shop;
      if (!perVisitShops[key]) {
        perVisitShops[key] = { name: inv.shop, count: 0, total: 0, cat: "餐飲", shop: inv.shop };
      }
      perVisitShops[key].count++;
      perVisitShops[key].total += inv.amount || 0;
      continue;
    }

    // Regular items
    for (const it of inv.items || []) {
      const cat = classifyItem(it.name);
      if (cat === "其他" || cat === "外送服務費" || cat === "餐飲消費" || cat === "訂閱服務") continue;

      if (!repeatItems[it.name]) {
        repeatItems[it.name] = { name: it.name, count: 0, total: 0, cat, shop: inv.shop };
      }
      repeatItems[it.name].count += 1;
      repeatItems[it.name].total += it.price || 0;
    }
  }

  // Merge: regular repeat items (>=5) + per-visit stores (>=5 visits)
  const allRepeat = Object.values(repeatItems).filter((it) => it.count >= 5);
  const perVisitRepeat = Object.values(perVisitShops).filter((it) => it.count >= 5);

  return [...allRepeat, ...perVisitRepeat].sort((a, b) => b.total - a.total);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main Export ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Compute the full insight data object from real invoice data.
 *
 * @param {Array} invoices - Array of invoice objects
 * @param {number} invoiceCount - Total number of invoices (may differ from invoices.length if pre-filtered)
 * @param {number} totalAmount - Total spend amount (may be pre-computed)
 * @returns {Object} D - The dashboard data object
 */
export function computeInsightData(invoices, invoiceCount, totalAmount) {
  // Handle edge cases
  if (!invoices || invoices.length === 0) {
    return {
      total: totalAmount || 0,
      invoices: invoiceCount || 0,
      monthly: 0,
      signals: [],
      tier1: [],
      tier1Total: 0,
      tier2: [],
      tier2Total: 0,
      subscriptions: [],
      utilities: null,
      smartBuy: [],
      comparison: null,
      repeatItems: [],
      audience: { tags: [], primary: "一般消費者" },
      lateNight: { pct: 0, total: 0, saveable: 0 },
      weekendPremium: { pct: 0, weekdayAvg: 0, weekendAvg: 0 },
      frequencySurges: [],
      fmtComparisons: () => "",
    };
  }

  const span = monthSpan(invoices);
  const total = totalAmount || invoices.reduce((s, inv) => s + (inv.amount || 0), 0);
  const count = invoiceCount || invoices.length;
  const monthly = Math.round(total / span);

  // Flatten all items for item-level analysis
  const allItems = flattenItems(invoices);

  // ── Core sections ────────────────────────────────────────────────────

  const signals = detectSignals(invoices, allItems, span);

  // Tier1: with per-visit store logic and delivery platform exclusion
  const tier1Raw = computeTier1(invoices, allItems, total, span);
  const tier1 = tier1Raw.map(({ _shops, ...rest }) => rest);
  const tier1Total = tier1.reduce((s, t) => s + t.amount, 0);

  // Tier2: all stores (including delivery/bulk, for total spend visibility)
  const tier2 = computeTier2(invoices, tier1Raw, total);
  const tier2Total = Math.round(total - tier1Total);

  // Fixed costs / bills (enhanced with telecom + insurance)
  const fixed = detectFixed(invoices, span);
  const penaltiesRaw = detectPenalties(allItems);
  const saves = computeSaves(tier1Raw, span);
  const smartBuyRaw = computeSmartBuy(invoices, span);
  const benchmark = computeBenchmark(monthly);
  const comparisonsRaw = computeComparisons(tier1Raw, allItems);

  // ── Subscription detection (full 3-method from v1) ───────────────────

  const subsRaw = detectSubscriptions(invoices);
  const subscriptions = subsRaw.map((sub) => ({
    name: sub.shop,
    monthlyAmount: Math.round(sub.price),
    note: sub.item + (sub.count > 1 ? `（已扣 ${sub.count} 次）` : ""),
  }));

  // ── Audience segmentation (12 rules) ─────────────────────────────────

  const audience = detectAudience(invoices);

  // ── Late night / Weekend premium / Frequency surges ──────────────────

  const lateNight = detectLateNight(invoices);
  const weekendPremium = detectWeekendPremium(invoices);
  const frequencySurges = detectFrequencySurges(invoices);
  const timePatterns = detectTimePatterns(invoices);

  // ── Repeat items (with per-visit logic) ──────────────────────────────

  const repeatItems = computeRepeatItems(invoices);

  // ── fmtComparisons helper function ───────────────────────────────────

  const fmtComparisons = buildFmtComparisons(invoices);

  // ── Shape output for aiChatV2 UI ─────────────────────────────────────

  // Utilities: bills + penalties + tips
  const utilBills = fixed.map((f) => ({
    name: f.name,
    amount: Math.round(f.amount / (span > 6 ? 12 : span)),
  }));
  const utilPenalties = penaltiesRaw > 0
    ? [{ name: "滯納金/違約金", amount: penaltiesRaw }]
    : [];
  const utilTips = [];
  const elec = fixed.find((f) => f.name === "電費");
  if (elec && elec.amount > 15000) {
    utilTips.push(`電費偏高（$${fmt(elec.amount)}/年），可到台電網站試算時間電價是否划算`);
  }
  utilTips.push("建議設定自動扣繳，避免逾期產生滯納金");

  const utilities = { bills: utilBills, penalties: utilPenalties, tips: utilTips };

  // Smart buy: convert from single object to array for UI
  const smartBuy = smartBuyRaw
    ? [{
        item: smartBuyRaw.name,
        currentPrice: smartBuyRaw.yours_price,
        betterPrice: smartBuyRaw.smart_price,
        tip: smartBuyRaw.tip,
      }]
    : saves.slice(0, 2).map((s) => ({
        item: s.item,
        currentPrice: 0,
        betterPrice: 0,
        tip: `${s.action}，預估年省 $${fmt(s.save)}`,
      }));

  // Comparison: reshape for UI
  const comparison = {
    monthlyAvg: monthly,
    tierMedian: benchmark.tier_median,
    position: benchmark.position,
    comparisons: comparisonsRaw.map((c) => ({
      item: c.item,
      yourPrice: c.yours,
      medianPrice: c.median,
    })),
    conclusion: comparisonsRaw.length > 0
      ? "這些項目不用改變消費習慣，只要換個買法就能省。"
      : "你的各項消費單價跟其他人差不多，沒有明顯買貴的項目 👍",
  };

  // ── Store × Category Cross-Analysis (for v4 Hook 1) ──────────────────

  const storeCatMap = {};
  for (const inv of invoices) {
    const shop = inv.shop || "其他";
    if (isDeliveryPlatform(shop)) continue;
    for (const it of inv.items || []) {
      const cat = classifyItem(it.name);
      if (cat === "其他" || cat === "外送服務費" || cat === "餐飲消費") continue;
      if (!storeCatMap[shop]) storeCatMap[shop] = { shop, total: 0, cats: {} };
      storeCatMap[shop].total += (it.price || 0);
      if (!storeCatMap[shop].cats[cat]) storeCatMap[shop].cats[cat] = 0;
      storeCatMap[shop].cats[cat] += (it.price || 0);
    }
  }
  const storeCategoryMatrix = Object.values(storeCatMap)
    .filter((s) => s.total > 500)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((s) => {
      const topCats = Object.entries(s.cats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([cat, amt]) => ({ cat, amount: Math.round(amt), pct: Math.round(amt / s.total * 100) }));
      return { shop: s.shop, total: Math.round(s.total), topCats };
    });

  // Category → stores (reverse view)
  const catStoreMap = {};
  for (const s of storeCategoryMatrix) {
    for (const c of s.topCats) {
      if (!catStoreMap[c.cat]) catStoreMap[c.cat] = { cat: c.cat, total: 0, stores: [] };
      catStoreMap[c.cat].total += c.amount;
      catStoreMap[c.cat].stores.push({ shop: s.shop, amount: c.amount });
    }
  }
  const categoryStoreMatrix = Object.values(catStoreMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
    .map((c) => ({ ...c, stores: c.stores.sort((a, b) => b.amount - a.amount).slice(0, 4) }));

  // ── Hidden Spending Thieves (for v4 Hook 2) ─────────────────────────

  const hiddenThieves = [];

  // 1. Frequency surges — spending expanding without awareness
  for (const surge of frequencySurges.slice(0, 3)) {
    hiddenThieves.push({
      type: "surge", icon: "🚀", label: "頻率暴增",
      title: `「${surge.brand}」頻率暴增 ${surge.ratio} 倍`,
      detail: `從每月 ${surge.before} 次 → ${surge.after} 次`,
      severity: surge.ratio >= 3 ? "high" : "medium",
    });
  }

  // 2. Late night impulse
  if (lateNight.pct >= 10) {
    hiddenThieves.push({
      type: "latenight", icon: "🌙", label: "深夜消費",
      title: `${lateNight.pct}% 消費在深夜（22:00-06:00）`,
      detail: `共 $${fmt(lateNight.total)}，減少 30% 可年省 $${fmt(lateNight.saveable)}`,
      severity: lateNight.pct >= 20 ? "high" : "medium",
    });
  }

  // 3. Weekend premium
  if (weekendPremium.pct >= 20) {
    hiddenThieves.push({
      type: "weekend", icon: "📆", label: "週末溢價",
      title: `週末每筆消費比平日貴 ${weekendPremium.pct}%`,
      detail: `平日均 $${fmt(weekendPremium.weekdayAvg)} vs 週末 $${fmt(weekendPremium.weekendAvg)}`,
      severity: weekendPremium.pct >= 40 ? "high" : "medium",
    });
  }

  // 4. Small-but-frequent items (convenience store habit)
  const smallFrequent = repeatItems
    .filter((it) => it.count >= 8 && it.total / it.count < 100)
    .slice(0, 3);
  for (const sf of smallFrequent) {
    const yearly = annualise(sf.total, span);
    hiddenThieves.push({
      type: "smallfreq", icon: "🏪", label: "小額高頻",
      title: `「${sf.name}」${sf.count} 次，每次 $${Math.round(sf.total / sf.count)}`,
      detail: `看似不多但年化 $${fmt(yearly)}`,
      severity: yearly >= 3000 ? "medium" : "low",
    });
  }

  // 5. Growing categories — items whose spend is increasing
  const monthSetArr = [...new Set(invoices.map((i) => i.yearMonth).filter(Boolean))].sort();
  const midIdx = Math.floor(monthSetArr.length / 2);
  const firstHalf = new Set(monthSetArr.slice(0, midIdx));
  const secondHalf = new Set(monthSetArr.slice(midIdx));
  const catGrowth = {};
  for (const inv of invoices) {
    if (isDeliveryPlatform(inv.shop)) continue;
    for (const it of inv.items || []) {
      const cat = classifyItem(it.name);
      if (cat === "其他" || cat === "外送服務費") continue;
      if (!catGrowth[cat]) catGrowth[cat] = { first: 0, second: 0 };
      const amt = (it.price || 0);
      if (firstHalf.has(inv.yearMonth)) catGrowth[cat].first += amt;
      else if (secondHalf.has(inv.yearMonth)) catGrowth[cat].second += amt;
    }
  }
  for (const [cat, g] of Object.entries(catGrowth)) {
    if (g.first < 500) continue;
    const growthPct = Math.round(((g.second - g.first) / g.first) * 100);
    if (growthPct >= 50) {
      hiddenThieves.push({
        type: "catgrowth", icon: "📈", label: "品類膨脹",
        title: `「${cat}」消費成長 ${growthPct}%`,
        detail: `前期 $${fmt(Math.round(g.first))} → 近期 $${fmt(Math.round(g.second))}`,
        severity: growthPct >= 100 ? "high" : "medium",
      });
    }
  }
  hiddenThieves.sort((a, b) => (a.severity === "high" ? 0 : a.severity === "medium" ? 1 : 2) - (b.severity === "high" ? 0 : b.severity === "medium" ? 1 : 2));

  // ── Return full data object ──────────────────────────────────────────

  return {
    total: Math.round(total),
    invoices: count,
    monthly,
    signals,

    tier1,
    tier1Total: Math.round(tier1Total),
    tier2,
    tier2Total,

    subscriptions,
    utilities,
    smartBuy,
    comparison,

    // NEW additive fields
    repeatItems,
    audience,
    lateNight,
    weekendPremium,
    frequencySurges,
    fmtComparisons,
    saves,

    // v4 Hook data
    storeCategoryMatrix,
    categoryStoreMatrix,
    hiddenThieves,
    timePatterns,
  };
}
