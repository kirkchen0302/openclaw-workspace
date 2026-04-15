/**
 * Insight Engine V2 — Computes structured insight data from real invoice data
 * for the static HTML prototype dashboard.
 *
 * Each invoice: { shop, amount, yearMonth, week, issued_at, items: [{ name, price, qty }] }
 * Returns a data object D matching the dashboard's expected shape.
 */
import { resolveShop } from "./shopMapping";
import { classifyItem } from "./itemClassifier";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) => Math.round(n).toLocaleString();

/** Flatten all items across invoices with shop info attached. */
function flattenItems(invoices) {
  const result = [];
  for (const inv of invoices) {
    for (const it of inv.items || []) {
      result.push({ ...it, shop: inv.shop, yearMonth: inv.yearMonth });
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

// ── Signal Detection ─────────────────────────────────────────────────────────

const SIGNAL_RULES = [
  {
    key: "嬰幼兒",
    emoji: "👶",
    label: "有嬰幼兒用品支出",
    itemKw: ["尿布", "奶粉", "奶瓶", "嬰兒", "寶寶", "副食品", "幫寶適", "pampers", "哺乳"],
    shopKw: [],
  },
  {
    key: "寵物",
    emoji: "🐾",
    label: "有寵物相關支出",
    itemKw: ["飼料", "貓砂", "寵物", "倉鼠"],
    shopKw: [],
  },
  {
    key: "咖啡",
    emoji: "☕",
    label: "有咖啡消費",
    itemKw: ["咖啡", "美式", "拿鐵"],
    shopKw: [],
  },
  {
    key: "酒類",
    emoji: "🍺",
    label: "有酒類消費",
    itemKw: ["啤酒", "紅酒", "白酒", "威士忌", "清酒", "酒"],
    shopKw: [],
    // Exclude false positives
    itemExclude: ["酒精燈", "酒精棉"],
  },
  {
    key: "服飾",
    emoji: "👗",
    label: "有服飾消費",
    itemKw: ["服飾", "童裝", "褲", "衣", "洋裝"],
    shopKw: ["uniqlo", "zara", "h&m", "gu", "net"],
  },
  {
    key: "開車族",
    emoji: "🚗",
    label: "有加油/車輛支出",
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

      // Check exclusions first
      if (rule.itemExclude && rule.itemExclude.some((ex) => nameLower.includes(ex.toLowerCase()))) {
        continue;
      }

      const itemMatch = rule.itemKw.some((kw) => nameLower.includes(kw.toLowerCase()));
      const shopMatch = rule.shopKw.some((kw) => shopLower.includes(kw.toLowerCase()));

      if (itemMatch || shopMatch) {
        sum += (it.price || 0) * (it.qty || 1);
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

// ── Fixed Cost Detection ─────────────────────────────────────────────────────

const FIXED_RULES = [
  { name: "電費", shopKw: ["台灣電力", "台電"], itemKw: ["電費"] },
  { name: "水費", shopKw: ["自來水"], itemKw: ["水費"] },
  { name: "瓦斯", shopKw: [], itemKw: ["瓦斯"] },
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

      // Also check item names
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

// ── Penalties Detection ──────────────────────────────────────────────────────

function detectPenalties(allItems) {
  const PENALTY_KW = ["滯納金", "違約金", "逾期"];
  let sum = 0;
  for (const it of allItems) {
    const nameLower = (it.name || "").toLowerCase();
    if (PENALTY_KW.some((kw) => nameLower.includes(kw))) {
      sum += (it.price || 0) * (it.qty || 1);
    }
  }
  return Math.round(sum);
}

// ── Tier 1: Top Repeat / High-Amount Items ───────────────────────────────────

/**
 * Normalise an item name for fuzzy grouping.
 * Strips trailing quantity suffixes (e.g. "啟賦奶粉 6罐" → "啟賦奶粉")
 * and collapses whitespace.
 */
function normaliseItemName(name) {
  if (!name) return "";
  return name
    .replace(/\s*\d+\s*(罐|入|組|盒|包|袋|瓶|片|個)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function computeTier1(allItems, totalAmount, span) {
  // Group items by normalised name
  const groups = {};
  for (const it of allItems) {
    const norm = normaliseItemName(it.name);
    if (!norm || norm.length < 2) continue;
    if (!groups[norm]) groups[norm] = { name: norm, amount: 0, count: 0, shops: new Set() };
    groups[norm].amount += (it.price || 0) * (it.qty || 1);
    groups[norm].count += it.qty || 1;
    if (it.shop) groups[norm].shops.add(it.shop);
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

// ── Tier 2: Remaining Spend by Store ─────────────────────────────────────────

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
      const price = (it.price || 0) * (it.qty || 1);
      if (!storeMap[shop].itemMap[name]) {
        storeMap[shop].itemMap[name] = { name, price: 0 };
      }
      storeMap[shop].itemMap[name].price += price;
    }
  }

  // Filter out stores already covered by tier1's main stores — only if they
  // are heavily dominated by tier1 items. We keep the store if it has significant
  // other spend beyond tier1 items.
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

// ── Saves: Actionable Savings from Tier1 Items ───────────────────────────────

const SAVE_RULES = [
  {
    match: ["尿布", "奶粉", "奶瓶", "嬰兒", "寶寶", "副食品", "幫寶適", "哺乳"],
    icon: "🍼",
    action: "改買大包裝",
    savePct: 0.4,
  },
  {
    match: ["咖啡", "美式", "拿鐵"],
    icon: "☕",
    action: "自備杯折扣 + 量販包",
    savePct: 0.35,
  },
  {
    match: ["飯糰", "三明治", "便當", "涼麵", "鮮食"],
    icon: "🍱",
    action: "超商品改超市/自帶",
    savePct: 0.3,
  },
  {
    match: ["餅乾", "洋芋片", "零食", "巧克力", "糖果"],
    icon: "🍪",
    action: "量販店囤貨替代超商",
    savePct: 0.3,
  },
  {
    match: ["飲料", "可樂", "氣泡水", "礦泉水", "茶"],
    icon: "🥤",
    action: "改買箱裝或自備水壺",
    savePct: 0.35,
  },
  {
    match: ["衛生紙", "面紙", "濕紙巾"],
    icon: "🧻",
    action: "網購量販價更低",
    savePct: 0.3,
  },
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
        break; // Only one rule per item
      }
    }
  }

  // If no category-specific rules matched but we have tier1 items,
  // add a generic savings suggestion for the top item
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

// ── Smart Buy: Package Size Optimisation ─────────────────────────────────────

function computeSmartBuy(invoices, span) {
  const storeItemVariants = {};

  for (const inv of invoices) {
    for (const it of inv.items || []) {
      if (!it.name || !it.price || it.price <= 0) continue;
      const normalized = normaliseItemName(it.name);
      if (normalized.length < 2) continue;

      const shop = inv.shop || "";
      const key = shop + "::" + normalized;
      if (!storeItemVariants[key]) {
        storeItemVariants[key] = { shop, baseName: normalized, variants: {} };
      }
      const priceKey = Math.round(it.price);
      if (!storeItemVariants[key].variants[priceKey]) {
        storeItemVariants[key].variants[priceKey] = {
          price: it.price,
          count: 0,
          name: it.name,
        };
      }
      storeItemVariants[key].variants[priceKey].count += it.qty || 1;
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

    // Require at least 30% price difference
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

// ── Benchmark ────────────────────────────────────────────────────────────────

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

  // Position within tier based on distance from median
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

// ── Comparisons ──────────────────────────────────────────────────────────────

const MEDIAN_PRICES = {
  咖啡: { median: 55, unit: "杯" },
  瓶裝飲料: { median: 29, unit: "" },
  乳製品: { median: 52, unit: "" },
  零食: { median: 46, unit: "" },
  "鮮食/便當": { median: 48, unit: "" },
};

// Map category keywords to the benchmark keys above
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

    // Find which benchmark category this item belongs to
    for (const catMap of COMPARISON_CATEGORY_MAP) {
      if (catMap.kw.some((kw) => nameLower.includes(kw.toLowerCase()))) {
        const bm = MEDIAN_PRICES[catMap.benchmarkKey];
        if (!bm) break;

        // Calculate user's average price per unit
        const avgPrice = item.count > 0 ? Math.round(item.amount / item.count) : 0;
        const pctAbove =
          bm.median > 0
            ? Math.round(((avgPrice - bm.median) / bm.median) * 100)
            : 0;

        // Only include if user is >=30% above median
        if (pctAbove >= 30) {
          comparisons.push({
            item: item.name,
            yours: avgPrice,
            median: bm.median,
            pct: pctAbove,
          });
        }
        break; // One benchmark per item
      }
    }
  }

  return comparisons;
}

// ── Main Export ───────────────────────────────────────────────────────────────

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
    };
  }

  const span = monthSpan(invoices);
  const total = totalAmount || invoices.reduce((s, inv) => s + (inv.amount || 0), 0);
  const count = invoiceCount || invoices.length;
  const monthly = Math.round(total / span);

  // Flatten all items for item-level analysis
  const allItems = flattenItems(invoices);

  // Compute each section
  const signals = detectSignals(invoices, allItems, span);
  const tier1Raw = computeTier1(allItems, total, span);
  const tier1 = tier1Raw.map(({ _shops, ...rest }) => rest);
  const tier1Total = tier1.reduce((s, t) => s + t.amount, 0);

  const tier2 = computeTier2(invoices, tier1Raw, total);
  const tier2Total = Math.round(total - tier1Total);

  const fixed = detectFixed(invoices, span);
  const penaltiesRaw = detectPenalties(allItems);
  const saves = computeSaves(tier1Raw, span);
  const smartBuyRaw = computeSmartBuy(invoices, span);
  const benchmark = computeBenchmark(monthly);
  const comparisonsRaw = computeComparisons(tier1Raw, allItems);

  // ── Shape output for aiChatV2 UI ──────────────────────────────────────

  // Subscriptions: detect from fixed costs that look like subscriptions
  // (For now, none detected from invoices — this matches the HTML's "no subscriptions" branch)
  const subscriptions = [];

  // Utilities: bills + penalties + tips
  const utilBills = fixed.map((f) => ({ name: f.name, amount: Math.round(f.amount / (span > 6 ? 12 : span)) }));
  const utilPenalties = penaltiesRaw > 0 ? [{ name: "滯納金/違約金", amount: penaltiesRaw }] : [];
  const utilTips = [];
  const elec = fixed.find((f) => f.name === "電費");
  if (elec && elec.amount > 15000) utilTips.push(`電費偏高（$${fmt(elec.amount)}/年），可到台電網站試算時間電價是否划算`);
  utilTips.push("建議設定自動扣繳，避免逾期產生滯納金");

  const utilities = { bills: utilBills, penalties: utilPenalties, tips: utilTips };

  // Smart buy: convert from single object to array for UI
  const smartBuy = smartBuyRaw
    ? [{ item: smartBuyRaw.name, currentPrice: smartBuyRaw.yours_price, betterPrice: smartBuyRaw.smart_price, tip: smartBuyRaw.tip }]
    : saves.slice(0, 2).map((s) => ({ item: s.item, currentPrice: 0, betterPrice: 0, tip: `${s.action}，預估年省 $${fmt(s.save)}` }));

  // Comparison: reshape for UI
  const comparison = {
    monthlyAvg: monthly,
    tierMedian: benchmark.tier_median,
    position: benchmark.position,
    comparisons: comparisonsRaw.map((c) => ({ item: c.item, yourPrice: c.yours, medianPrice: c.median })),
    conclusion: comparisonsRaw.length > 0
      ? "這些項目不用改變消費習慣，只要換個買法就能省。"
      : "你的各項消費單價跟其他人差不多，沒有明顯買貴的項目 👍",
  };

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
  };
}
