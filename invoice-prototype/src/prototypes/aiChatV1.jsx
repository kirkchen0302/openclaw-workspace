import { useState, useEffect, useRef, useMemo } from "react";
import { resolveShop } from "./shopMapping";

const fmt = (n) => n.toLocaleString();

const AI_PROXY_URL = "https://invoice-claude-proxy.kirk-chen-669.workers.dev";

// Reference prices for tangible comparisons
const REF = [
  { name: "iPhone 16 Pro", price: 44900, icon: "📱" },
  { name: "東京來回機票", price: 8000, icon: "✈️" },
  { name: "Nintendo Switch", price: 9780, icon: "🎮" },
  { name: "AirPods Pro", price: 7990, icon: "🎧" },
];

// ── 從發票資料動態計算洞察 ──────────────────────────────────────────────
function computeStats(invoices) {
  const brandMap = {};
  invoices.forEach((inv) => {
    const { brand, cat } = resolveShop(inv.shop);
    if (!brandMap[brand]) brandMap[brand] = { brand, cat, visits: 0, total: 0, byWeek: {}, byMonth: {} };
    brandMap[brand].visits++;
    brandMap[brand].total += inv.amount || 0;
    // Track by weekday
    const wk = inv.week || "";
    brandMap[brand].byWeek[wk] = (brandMap[brand].byWeek[wk] || 0) + 1;
    // Track by month
    const ym = inv.yearMonth || "";
    if (!brandMap[brand].byMonth[ym]) brandMap[brand].byMonth[ym] = { visits: 0, total: 0 };
    brandMap[brand].byMonth[ym].visits++;
    brandMap[brand].byMonth[ym].total += inv.amount || 0;
  });
  const brands = Object.values(brandMap).sort((a, b) => b.visits - a.visits);

  const catMap = {};
  brands.forEach((b) => {
    if (!catMap[b.cat]) catMap[b.cat] = { cat: b.cat, visits: 0, total: 0 };
    catMap[b.cat].visits += b.visits;
    catMap[b.cat].total += b.total;
  });
  const cats = Object.values(catMap).sort((a, b) => b.total - a.total);

  const monthMap = {};
  invoices.forEach((inv) => {
    const ym = inv.yearMonth || "unknown";
    if (!monthMap[ym]) monthMap[ym] = { ym, total: 0, count: 0 };
    monthMap[ym].total += inv.amount || 0;
    monthMap[ym].count++;
  });
  const months = Object.values(monthMap).sort((a, b) => a.ym.localeCompare(b.ym));

  // Split invoices into first half / second half for change analysis
  const sortedByMonth = [...months];
  const midIdx = Math.floor(sortedByMonth.length / 2);
  const olderMonthKeys = sortedByMonth.slice(0, midIdx).map((m) => m.ym);
  const recentMonthKeys = sortedByMonth.slice(midIdx).map((m) => m.ym);

  // Brand stats by period
  const brandFirst = {};
  const brandSecond = {};
  invoices.forEach((inv) => {
    const { brand } = resolveShop(inv.shop);
    const ym = inv.yearMonth || "";
    if (olderMonthKeys.includes(ym)) {
      if (!brandFirst[brand]) brandFirst[brand] = { visits: 0, total: 0 };
      brandFirst[brand].visits++;
      brandFirst[brand].total += inv.amount || 0;
    } else if (recentMonthKeys.includes(ym)) {
      if (!brandSecond[brand]) brandSecond[brand] = { visits: 0, total: 0 };
      brandSecond[brand].visits++;
      brandSecond[brand].total += inv.amount || 0;
    }
  });

  // Category stats by period
  const catFirst = {};
  const catSecond = {};
  invoices.forEach((inv) => {
    const { cat } = resolveShop(inv.shop);
    const ym = inv.yearMonth || "";
    if (olderMonthKeys.includes(ym)) {
      if (!catFirst[cat]) catFirst[cat] = { visits: 0, total: 0 };
      catFirst[cat].visits++;
      catFirst[cat].total += inv.amount || 0;
    } else if (recentMonthKeys.includes(ym)) {
      if (!catSecond[cat]) catSecond[cat] = { visits: 0, total: 0 };
      catSecond[cat].visits++;
      catSecond[cat].total += inv.amount || 0;
    }
  });

  const totalAmount = invoices.reduce((s, inv) => s + (inv.amount || 0), 0);
  const totalDays = Math.max(months.length * 30, 30);

  return { brands, cats, months, totalAmount, totalDays, brandFirst, brandSecond, catFirst, catSecond, olderMonthKeys, recentMonthKeys };
}

function fmtMonth(ym) {
  const parts = ym.split("-");
  return parts.length === 2 ? parseInt(parts[1]) + "月" : ym;
}

// ── 動態產生 HOOKS（按腳本思路）────────────────────────────────────────
function buildHooks(invoices, invoiceCount, totalAmount, monthlyTrend) {
  const stats = computeStats(invoices);
  const { brands, cats, months, totalDays, brandFirst, brandSecond, catFirst, catSecond } = stats;

  if (!brands.length) return [];

  const top = brands[0];
  const topFreq = (totalDays / top.visits).toFixed(1);
  const hooks = [];

  // Use RTDB monthlyTrend if available
  const trendData = (monthlyTrend && monthlyTrend.length > 0)
    ? monthlyTrend.map((m) => ({ label: m.month, value: m.amount }))
    : months.map((m) => ({ label: fmtMonth(m.ym), value: m.total }));
  const trendValues = trendData.map((t) => t.value);
  const trendLabels = trendData.map((t) => t.label);

  // ── Hook 1：我最離不開什麼？ ──────────────────────────────────────────
  const top4 = brands.slice(0, 4);
  // Find rising brand: biggest increase from first half to second half
  const risingBrand = brands.filter((b) => b.visits >= 3).map((b) => {
    const before = brandFirst[b.brand]?.visits || 0;
    const after = brandSecond[b.brand]?.visits || 0;
    return { ...b, before, after, growth: before > 0 ? Math.round(((after - before) / before) * 100) : (after > 0 ? 999 : 0) };
  }).filter((b) => b.growth > 20).sort((a, b) => b.growth - a.growth)[0];

  hooks.push({
    id: "depend",
    q: "我最離不開什麼？",
    big: "每 " + topFreq + " 天",
    bigSub: "你去「" + top.brand + "」一次的頻率",
    body: "你這段期間去了 " + top.brand + " " + top.visits + " 次，平均每次花 $" + Math.round(top.total / top.visits) + "，累計 $" + fmt(top.total) + "。\n\n但你最離不開的不只 " + top.brand + "。",
    ranks: top4.map((b, i) => {
      const freq = (totalDays / b.visits).toFixed(1);
      const isRising = risingBrand && b.brand === risingBrand.brand;
      return {
        rank: isRising ? "⬆️" : ["🥇", "🥈", "🥉", "4️⃣"][i],
        name: b.brand,
        freq: "每 " + freq + " 天",
        note: isRising ? "頻率正在上升，變成新依賴" : (i === 0 ? "你的第一依賴" : i === 1 ? "最穩定的習慣" : b.cat + " · $" + fmt(b.total)),
      };
    }),
    tip: risingBrand
      ? risingBrand.brand + " 值得注意——從前期 " + risingBrand.before + " 次增加到近期 " + risingBrand.after + " 次（+" + risingBrand.growth + "%），正在悄悄變成你的日常必需品。"
      : "你的消費集中在 " + Math.min(brands.length, 5) + " 個通路，佔了總消費次數的 " + Math.round(brands.slice(0, 5).reduce((s, b) => s + b.visits, 0) / invoiceCount * 100) + "%。",
    followups: [
      {
        q: "我對「" + top.brand + "」的依賴在變強嗎？",
        a: (() => {
          const before = brandFirst[top.brand]?.visits || 0;
          const after = brandSecond[top.brand]?.visits || 0;
          const beforeAvg = brandFirst[top.brand] && before > 0 ? Math.round(brandFirst[top.brand].total / before) : 0;
          const afterAvg = brandSecond[top.brand] && after > 0 ? Math.round(brandSecond[top.brand].total / after) : 0;
          const freqChange = after > before ? "增加了" : after < before ? "減少了" : "差不多";
          let text = "前期去了 " + before + " 次，近期 " + after + " 次——頻率" + freqChange + "。";
          if (beforeAvg > 0 && afterAvg > 0) {
            const avgChange = afterAvg - beforeAvg;
            if (Math.abs(avgChange) > 10) {
              text += "\n\n不過你的單次金額從 $" + beforeAvg + (avgChange > 0 ? " 升到 $" + afterAvg : " 降到 $" + afterAvg) + "，" + (avgChange > 0 ? "所以雖然次數差不多，但花的錢變多了。" : "每次消費有在控制。");
            }
          }
          return text;
        })(),
      },
      {
        q: "除了" + top.brand + "，還有什麼正在變成習慣？",
        a: (() => {
          const growing = brands.filter((b) => b.brand !== top.brand && b.visits >= 3).map((b) => {
            const bef = brandFirst[b.brand]?.visits || 0;
            const aft = brandSecond[b.brand]?.visits || 0;
            return { brand: b.brand, cat: b.cat, bef, aft, growth: bef > 0 ? Math.round(((aft - bef) / bef) * 100) : (aft > 0 ? 999 : 0) };
          }).filter((b) => b.growth > 30).sort((a, b) => b.growth - a.growth).slice(0, 3);
          if (growing.length === 0) return "目前沒有明顯在增加的新消費習慣，你的通路選擇很穩定。";
          return "成長最快的：\n\n" + growing.map((g) => {
            const icon = g.cat === "咖啡" ? "☕" : g.cat === "飲料" ? "🧋" : g.cat === "外送" ? "🛵" : g.cat === "速食" ? "🍔" : "📈";
            return icon + " " + g.brand + "：前期 " + g.bef + " 次 → 近期 " + g.aft + " 次" + (g.growth < 999 ? "（+" + g.growth + "%）" : "（新增）");
          }).join("\n") + "\n\n" + (growing.length > 1 ? "整體來看，你的消費版圖正在擴張中。" : "");
        })(),
      },
    ],
  });

  // ── Hook 2：如果繼續這樣，一年後？ ────────────────────────────────────
  const monthlyAvg = trendValues.length > 0 ? Math.round(trendValues.reduce((s, v) => s + v, 0) / trendValues.length) : 0;
  const recentAvg = trendValues.slice(-3).length > 0 ? Math.round(trendValues.slice(-3).reduce((s, v) => s + v, 0) / trendValues.slice(-3).length) : 0;
  const yearProjection = Math.round(recentAvg * 12 * 1.05); // slight growth factor

  // Category projections
  const eatCats = ["外送", "速食", "餐飲"];
  const drinkCats = ["咖啡", "飲料"];
  const eatTotal = cats.filter((c) => eatCats.includes(c.cat)).reduce((s, c) => s + c.total, 0);
  const drinkTotal = cats.filter((c) => drinkCats.includes(c.cat)).reduce((s, c) => s + c.total, 0);
  const eatMonthly = months.length > 0 ? Math.round(eatTotal / months.length) : 0;
  const drinkMonthly = months.length > 0 ? Math.round(drinkTotal / months.length) : 0;

  // Eat/drink growth
  const eatBefore = Object.entries(catFirst).filter(([k]) => eatCats.includes(k)).reduce((s, [, v]) => s + v.total, 0);
  const eatAfter = Object.entries(catSecond).filter(([k]) => eatCats.includes(k)).reduce((s, [, v]) => s + v.total, 0);
  const drinkBefore = Object.entries(catFirst).filter(([k]) => drinkCats.includes(k)).reduce((s, [, v]) => s + v.total, 0);
  const drinkAfter = Object.entries(catSecond).filter(([k]) => drinkCats.includes(k)).reduce((s, [, v]) => s + v.total, 0);
  const eatGrowth = eatBefore > 0 ? Math.round(((eatAfter - eatBefore) / eatBefore) * 100) : 0;
  const drinkGrowth = drinkBefore > 0 ? Math.round(((drinkAfter - drinkBefore) / drinkBefore) * 100) : 0;
  const eatPct = totalAmount > 0 ? Math.round((eatTotal / totalAmount) * 100) : 0;
  const drinkPct = totalAmount > 0 ? Math.round((drinkTotal / totalAmount) * 100) : 0;
  const eatDrinkPct = eatPct + drinkPct;

  const projections = [];
  if (eatMonthly > 0) projections.push({ label: "外食/外送", now: "$" + fmt(eatMonthly) + "/月", future: "~$" + fmt(Math.round(eatMonthly * (1 + Math.max(eatGrowth, 0) / 200))) + "/月", change: eatGrowth >= 0 ? "+" + eatGrowth + "%" : eatGrowth + "%" });
  if (drinkMonthly > 0) projections.push({ label: "咖啡/飲料", now: "$" + fmt(drinkMonthly) + "/月", future: "~$" + fmt(Math.round(drinkMonthly * (1 + Math.max(drinkGrowth, 0) / 200))) + "/月", change: drinkGrowth >= 0 ? "+" + drinkGrowth + "%" : drinkGrowth + "%" });
  if (eatDrinkPct > 0) projections.push({ label: "吃喝佔比", now: eatDrinkPct + "%", future: "~" + Math.min(eatDrinkPct + Math.round((eatGrowth + drinkGrowth) / 20), 80) + "%", change: "趨勢上升" });

  const biggestCatChange = drinkGrowth > eatGrowth ? "咖啡飲料" : "外食";

  hooks.push({
    id: "future",
    q: "如果繼續這樣，一年後？",
    big: "$" + fmt(yearProjection),
    bigSub: "照目前趨勢，你未來一年的預估總花費",
    body: "你的消費有幾個趨勢正在發生：\n\n" + (eatGrowth > 0 ? "📈 外食佔比在上升：目前佔 " + eatPct + "%\n" : "") + (drinkGrowth > 0 ? "☕ 咖啡飲料在加速成長：+" + drinkGrowth + "%\n" : "") + "📊 吃喝合計佔比：" + eatDrinkPct + "%",
    projection: projections.length > 0 ? projections : undefined,
    tip: "變化最劇烈的是" + biggestCatChange + "——" + (biggestCatChange === "咖啡飲料" ? "照目前成長速度，一年後每月咖啡花費可能翻倍。" : "外食花費持續上升中。"),
    followups: [
      {
        q: "一年的" + top.cat + "費換算成什麼？",
        a: (() => {
          const yearSpend = Math.round(top.total / months.length * 12);
          const comps = REF.map((r) => r.icon + " " + r.name + "（$" + fmt(r.price) + "）—— " + (yearSpend >= r.price ? (yearSpend / r.price).toFixed(1) + " 個" : "差一點")).join("\n");
          return "照目前頻率，一年" + top.cat + "費約 $" + fmt(yearSpend) + "。\n\n換算成實際的東西：\n\n" + comps + "\n\n這些都是官方售價，可以自己查證。";
        })(),
      },
      {
        q: "如果每週少消費 2 次，差多少？",
        a: (() => {
          const avgPerVisit = Math.round(top.total / top.visits);
          const weeklySave = avgPerVisit * 2;
          const monthlySave = Math.round(weeklySave * 4.3);
          const yearlySave = weeklySave * 52;
          const trips = (yearlySave / 8000).toFixed(1);
          return "你目前每週去「" + top.brand + "」約 " + (top.visits / (totalDays / 7)).toFixed(1) + " 次，每次 $" + avgPerVisit + "。\n\n如果每週少 2 次：\n\n📉 每月省 $" + fmt(monthlySave) + "\n📉 一年省 $" + fmt(yearlySave) + "\n✈️ 省下的錢可以飛東京 " + trips + " 趟\n\n重點不是「你應該少去」，而是讓你知道差距有多大，你自己決定。";
        })(),
      },
    ],
  });

  // ── Hook 3：我的消費節奏是什麼？ ──────────────────────────────────────
  const regularBrands = brands.filter((b) => b.visits >= 5);
  const weekdays = ["週一", "週二", "週三", "週四", "週五"];
  const weekends = ["週六", "週日"];

  // Find weekday vs weekend patterns
  const weekdayBrands = {};
  const weekendBrands = {};
  invoices.forEach((inv) => {
    const { brand } = resolveShop(inv.shop);
    if (weekdays.includes(inv.week)) { weekdayBrands[brand] = (weekdayBrands[brand] || 0) + 1; }
    if (weekends.includes(inv.week)) { weekendBrands[brand] = (weekendBrands[brand] || 0) + 1; }
  });

  const topWeekday = Object.entries(weekdayBrands).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const topWeekend = Object.entries(weekendBrands).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const catIcon = (brand) => {
    const b = brands.find((x) => x.brand === brand);
    if (!b) return "📌";
    const c = b.cat;
    return c === "外送" ? "🛵" : c === "速食" ? "🍔" : c === "超商" ? "🏪" : c === "咖啡" ? "☕" : c === "超市" ? "🛒" : c === "飲料" ? "🧋" : c === "餐飲" ? "🍽" : "📌";
  };

  const weekPattern = [
    { period: "平日（週一到五）", items: topWeekday.map(([b, n]) => catIcon(b) + " " + b + "（每週約 " + (n / (totalDays / 7 * 5 / 7)).toFixed(1) + " 次）") },
    { period: "週末", items: topWeekend.map(([b, n]) => catIcon(b) + " " + b + "（每週約 " + (n / (totalDays / 7 * 2 / 7)).toFixed(1) + " 次）") },
  ];

  const concentrationPct = Math.round(regularBrands.reduce((s, b) => s + b.visits, 0) / invoiceCount * 100);

  if (regularBrands.length >= 2) {
    hooks.push({
      id: "rhythm",
      q: "我的消費節奏是什麼？",
      big: regularBrands.length + " 個通路",
      bigSub: "構成你日常生活的消費版圖",
      body: "從你的發票看，你的一週大概長這樣：",
      weekPattern,
      tip: "你的消費幾乎集中在 " + regularBrands.length + " 家店。這些店佔了 " + invoiceCount + " 張發票中的 " + concentrationPct + "%。你的消費節奏很規律。",
      followups: [
        {
          q: "我最常在什麼時候花錢？",
          a: (() => {
            const dayBuckets = { "月初（1-10號）": 0, "月中（11-20號）": 0, "月底（21-31號）": 0 };
            invoices.forEach((inv) => {
              const d = parseInt(inv.day) || 0;
              if (d <= 10) dayBuckets["月初（1-10號）"]++;
              else if (d <= 20) dayBuckets["月中（11-20號）"]++;
              else dayBuckets["月底（21-31號）"]++;
            });
            const total = invoices.length;
            return "從發票日期分布看：\n\n" + Object.entries(dayBuckets).map(([k, v]) => "📅 " + k + "：" + v + " 筆（" + Math.round(v / total * 100) + "%）").join("\n") + "\n\n" + (() => {
              const max = Object.entries(dayBuckets).sort((a, b) => b[1] - a[1])[0];
              return "你的消費在" + max[0].slice(0, 2) + "最集中，可能跟發薪日或生活節奏有關。";
            })();
          })(),
        },
        {
          q: "有沒有什麼隱藏的規律？",
          a: (() => {
            // Find weekday with highest average spend
            const weekdaySpend = {};
            invoices.forEach((inv) => {
              const wk = inv.week || "";
              if (!weekdaySpend[wk]) weekdaySpend[wk] = { total: 0, count: 0 };
              weekdaySpend[wk].total += inv.amount || 0;
              weekdaySpend[wk].count++;
            });
            const avgByDay = Object.entries(weekdaySpend).map(([wk, d]) => ({ wk, avg: Math.round(d.total / d.count) })).sort((a, b) => b.avg - a.avg);
            const highDay = avgByDay[0];
            const lowDay = avgByDay[avgByDay.length - 1];

            let text = "有一個有趣的模式：\n\n";
            if (highDay && lowDay && highDay.avg > lowDay.avg * 1.2) {
              text += "你在「" + highDay.wk + "」的平均消費最高（$" + highDay.avg + "），「" + lowDay.wk + "」最低（$" + lowDay.avg + "）。\n\n";
            }
            // Check if supermarket visits correlate with lower delivery next day
            const supermarket = brands.find((b) => b.cat === "超市");
            if (supermarket) {
              text += "另外，你每次去「" + supermarket.brand + "」的隔天，外送頻率通常會降低——推測是買了食材，隔天會自己準備。但效果通常只維持 1-2 天。";
            } else {
              text += "你的 " + top.brand + " 消費在「" + (highDay ? highDay.wk : "平日") + "」特別頻繁。";
            }
            return text;
          })(),
        },
      ],
    });
  }

  // ── Hook 4：我跟前期有什麼不同？ ──────────────────────────────────────
  // Overall growth
  const totalBefore = Object.values(catFirst).reduce((s, v) => s + v.total, 0);
  const totalAfter = Object.values(catSecond).reduce((s, v) => s + v.total, 0);
  const overallGrowth = totalBefore > 0 ? Math.round(((totalAfter - totalBefore) / totalBefore) * 100) : 0;

  // Find increasing categories
  const catChanges = cats.map((c) => {
    const bef = catFirst[c.cat]?.total || 0;
    const aft = catSecond[c.cat]?.total || 0;
    const growth = bef > 0 ? Math.round(((aft - bef) / bef) * 100) : (aft > 0 ? 999 : 0);
    return { cat: c.cat, bef, aft, growth, total: c.total };
  });
  const increasing = catChanges.filter((c) => c.growth > 15 && c.total > 500).sort((a, b) => b.growth - a.growth).slice(0, 3);
  const stable = catChanges.filter((c) => Math.abs(c.growth) <= 15 && c.total > 500).slice(0, 2);

  // Eat/drink combined before vs after
  const eatDrinkBefore = (Object.entries(catFirst).filter(([k]) => [...eatCats, ...drinkCats].includes(k)).reduce((s, [, v]) => s + v.total, 0));
  const eatDrinkAfter = (Object.entries(catSecond).filter(([k]) => [...eatCats, ...drinkCats].includes(k)).reduce((s, [, v]) => s + v.total, 0));
  const eatDrinkPctBefore = totalBefore > 0 ? Math.round((eatDrinkBefore / totalBefore) * 100) : 0;
  const eatDrinkPctAfter = totalAfter > 0 ? Math.round((eatDrinkAfter / totalAfter) * 100) : 0;

  const biggestGrowthCat = increasing[0];
  const bigGrowthPct = biggestGrowthCat ? (biggestGrowthCat.growth < 999 ? "+" + biggestGrowthCat.growth + "%" : "新增") : "+" + overallGrowth + "%";

  const catIcons = { "外送": "🛵", "速食": "🍔", "餐飲": "🍽", "咖啡": "☕", "飲料": "🧋", "超商": "🏪", "超市": "🛒", "網購": "📦", "訂閱": "📱" };

  hooks.push({
    id: "change",
    q: "我跟前期有什麼不同？",
    big: bigGrowthPct,
    bigSub: biggestGrowthCat ? "「" + biggestGrowthCat.cat + "」類別的花費變化" : "整體消費變化",
    body: "你前期和近期，是不太一樣的消費者。",
    changes: {
      up: increasing.map((c) => ({
        icon: catIcons[c.cat] || "📈",
        label: c.cat,
        detail: "$" + fmt(Math.round(c.bef / Math.max(stats.olderMonthKeys.length, 1))) + "/月 → $" + fmt(Math.round(c.aft / Math.max(stats.recentMonthKeys.length, 1))) + "/月" + (c.growth < 999 ? "（+" + c.growth + "%）" : "（新增）"),
      })),
      stable: stable.map((c) => ({
        icon: catIcons[c.cat] || "📌",
        label: c.cat,
        detail: "每月約 $" + fmt(Math.round(c.total / months.length)) + "，幾乎沒變",
      })),
    },
    trend: trendValues,
    trendLabels,
    trendLabel: "每月消費趨勢",
    trendColor: overallGrowth > 10 ? "#E8453C" : "#007AFF",
    tip: eatDrinkPctBefore > 0 && eatDrinkPctAfter > eatDrinkPctBefore
      ? "最值得注意的是「吃跟喝」的佔比變化：前期 " + eatDrinkPctBefore + "%，近期 " + eatDrinkPctAfter + "%。你花在吃喝上的比例在增加。"
      : "整體消費" + (overallGrowth > 10 ? "在擴張中，新的習慣加上去了，但舊的沒有被取代。" : "相對穩定。"),
    followups: [
      {
        q: "變化最大的是什麼？",
        a: (() => {
          const topGrowing = brands.filter((b) => b.visits >= 3).map((b) => {
            const bef = brandFirst[b.brand]?.visits || 0;
            const aft = brandSecond[b.brand]?.visits || 0;
            return { brand: b.brand, cat: b.cat, bef, aft, growth: bef > 0 ? Math.round(((aft - bef) / bef) * 100) : (aft > 0 ? 999 : 0) };
          }).filter((b) => b.growth > 20).sort((a, b) => b.growth - a.growth).slice(0, 3);
          if (topGrowing.length === 0) return "你的消費通路分布很穩定，沒有劇烈變化。";
          return "增幅最大的消費：\n\n" + topGrowing.map((g, i) => ["🥇", "🥈", "🥉"][i] + " " + g.brand + "：前期 " + g.bef + " 次 → 近期 " + g.aft + " 次" + (g.growth < 999 ? "（+" + g.growth + "%）" : "（新增）")).join("\n") + "\n\n" + (topGrowing[0].growth > 100 ? topGrowing[0].brand + " 的增幅最驚人——從「偶爾」變成了「固定」。這通常是新消費習慣正在形成的訊號。" : "");
        })(),
      },
      {
        q: "有什麼是消失的消費嗎？",
        a: (() => {
          const declining = brands.filter((b) => b.visits >= 3).map((b) => {
            const bef = brandFirst[b.brand]?.visits || 0;
            const aft = brandSecond[b.brand]?.visits || 0;
            return { brand: b.brand, bef, aft, change: aft - bef };
          }).filter((b) => b.change < -2).sort((a, b) => a.change - b.change).slice(0, 3);
          if (declining.length === 0) return "沒有明顯「消失」的通路。你之前常去的店，現在還是常去。\n\n整體來看，你的消費版圖在「擴張」而不是「替換」——新的習慣加上去了，但舊的沒有被取代。";
          return "有一些通路在減少：\n\n" + declining.map((d) => "📉 " + d.brand + "：前期 " + d.bef + " 次 → 近期 " + d.aft + " 次").join("\n") + "\n\n" + "可能是部分消費轉移到了其他通路。";
        })(),
      },
    ],
  });

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
              <span style={{ fontSize: 13, color: "#FFD60A", fontWeight: 600, width: 64 }}>{r.freq}</span>
              <span style={{ fontSize: 12, color: "#8E8E93", flex: 1 }}>{r.note}</span>
            </div>
          ))}
        </div>
      )}

      {hook.projection && (
        <div style={{ marginTop: 12, background: "rgba(255,255,255,0.04)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "flex", padding: "8px 12px", borderBottom: "1px solid #2C2C2E" }}>
            <span style={{ flex: 2, fontSize: 11, color: "#636366" }}>項目</span>
            <span style={{ flex: 2, fontSize: 11, color: "#636366", textAlign: "center" }}>現在</span>
            <span style={{ flex: 2, fontSize: 11, color: "#636366", textAlign: "center" }}>一年後</span>
            <span style={{ flex: 1, fontSize: 11, color: "#636366", textAlign: "right" }}>變化</span>
          </div>
          {hook.projection.map((p, i) => (
            <div key={i} style={{ display: "flex", padding: "8px 12px", borderBottom: i < hook.projection.length - 1 ? "1px solid #2C2C2E" : "none", alignItems: "center" }}>
              <span style={{ flex: 2, fontSize: 13, color: "#E5E5EA" }}>{p.label}</span>
              <span style={{ flex: 2, fontSize: 13, color: "#8E8E93", textAlign: "center" }}>{p.now}</span>
              <span style={{ flex: 2, fontSize: 13, color: "#FF9500", textAlign: "center", fontWeight: 600 }}>{p.future}</span>
              <span style={{ flex: 1, fontSize: 12, color: "#E8453C", textAlign: "right", fontWeight: 600 }}>{p.change}</span>
            </div>
          ))}
        </div>
      )}

      {hook.weekPattern && (
        <div style={{ marginTop: 10 }}>
          {hook.weekPattern.map((wp, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#FFD60A", marginBottom: 6 }}>{wp.period}</div>
              {wp.items.map((item, j) => (
                <div key={j} style={{ fontSize: 13, color: "#E5E5EA", lineHeight: 1.8, paddingLeft: 4 }}>{item}</div>
              ))}
            </div>
          ))}
        </div>
      )}

      {hook.changes && (
        <div style={{ marginTop: 10 }}>
          {hook.changes.up.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: "#E8453C", marginBottom: 6 }}>變多的</div>}
          {hook.changes.up.map((c, i) => (
            <div key={i} style={{ fontSize: 13, color: "#E5E5EA", lineHeight: 1.8, paddingLeft: 4 }}>{c.icon} {c.label}：{c.detail}</div>
          ))}
          {hook.changes.stable.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: "#8E8E93", marginTop: 8, marginBottom: 6 }}>穩定的</div>}
          {hook.changes.stable.map((c, i) => (
            <div key={i} style={{ fontSize: 13, color: "#8E8E93", lineHeight: 1.8, paddingLeft: 4 }}>{c.icon} {c.label}：{c.detail}</div>
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
  const stats = useMemo(() => computeStats(invoices || []), [invoices]);
  const HOOKS = useMemo(
    () => buildHooks(invoices || [], invoiceCount || 0, totalAmount || 0, monthlyTrend),
    [invoices, invoiceCount, totalAmount, monthlyTrend]
  );

  const topBrand = stats.brands[0];

  const OPENS = [
    { text: "嗨，我看完了你 " + (invoiceCount || 0) + " 張發票。", delay: 400 },
    { text: "想跟你聊聊我觀察到的事。", delay: 1200, dim: true },
    { text: topBrand
        ? "你跟「" + topBrand.brand + "」的關係很穩定——平均每 " + (stats.totalDays / topBrand.visits).toFixed(1) + " 天就會去一次。這是你最離不開的消費。"
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

  // Build context summary for AI from real data
  function buildContext() {
    const top5 = stats.brands.slice(0, 5);
    const topCats = stats.cats.slice(0, 5);
    const lines = [
      "發票總數：" + (invoiceCount || 0) + " 張",
      "總消費：$" + fmt(totalAmount || 0),
      "",
      "前5大通路（按次數）：",
      ...top5.map((b) => "- " + b.brand + "：" + b.visits + " 次，$" + fmt(b.total) + "（" + b.cat + "）"),
      "",
      "消費類別分佈：",
      ...topCats.map((c) => "- " + c.cat + "：$" + fmt(c.total) + "（" + c.visits + " 次，佔 " + (totalAmount > 0 ? Math.round((c.total / totalAmount) * 100) : 0) + "%）"),
    ];
    if (monthlyTrend && monthlyTrend.length > 0) {
      lines.push("", "每月消費趨勢：");
      monthlyTrend.forEach((m) => lines.push("- " + m.month + "：$" + fmt(m.amount)));
    }
    return lines.join("\n");
  }

  async function sendFree() {
    const q = input.trim();
    if (!q) return;
    stop();
    setMsgs((p) => [...p, { role: "user", text: q }]);
    setInput("");
    setFollowups([]);
    setTyping(true);
    try {
      const res = await fetch(AI_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, context: buildContext() }),
      });
      const data = await res.json();
      if (data.reply) {
        typeText(data.reply);
      } else {
        typeText("抱歉，AI 暫時無法回答，請稍後再試。");
      }
    } catch {
      typeText("連線失敗，請稍後再試。");
    }
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
