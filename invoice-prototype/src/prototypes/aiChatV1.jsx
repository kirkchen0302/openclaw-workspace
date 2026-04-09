import { useState, useEffect, useRef, useMemo } from "react";
import { resolveShop } from "./shopMapping";

const fmt = (n) => n.toLocaleString();

const AI_PROXY_URL = "https://invoice-claude-proxy.kirk-chen-669.workers.dev";

// Personalized savings comparisons based on user's actual spending
function buildComparisons(amount, stats) {
  const comps = [];
  const { brands, cats, months, totalAmount, totalDays } = stats;

  // 1. Top brand equivalence: "= 免費去 X 次 {brand}"
  const top3 = brands.slice(0, 3);
  top3.forEach((b) => {
    const avg = Math.round(b.total / b.visits);
    if (avg > 0) {
      const times = Math.round(amount / avg);
      if (times >= 2) {
        comps.push({ icon: catIcon(b.cat), text: "免費去 " + times + " 次「" + b.brand + "」（均 $" + avg + "/次）", impact: times });
      }
    }
  });

  // 2. Category months: "= X 個月的 {category} 消費"
  cats.filter((c) => c.cat !== "其他" && c.total > 0).slice(0, 3).forEach((c) => {
    const monthly = Math.round(c.total / Math.max(months.length, 1));
    if (monthly > 0) {
      const mo = (amount / monthly).toFixed(1);
      if (parseFloat(mo) >= 1) {
        comps.push({ icon: catIcon(c.cat), text: mo + " 個月的「" + c.cat + "」消費（$" + fmt(monthly) + "/月）", impact: parseFloat(mo) });
      }
    }
  });

  // 3. Daily average: "= X 天的平均消費"
  const dailyAvg = Math.round(totalAmount / totalDays);
  if (dailyAvg > 0) {
    const days = Math.round(amount / dailyAvg);
    comps.push({ icon: "📅", text: days + " 天的日均消費（$" + fmt(dailyAvg) + "/天）", impact: days });
  }

  // 4. One aspirational: travel based on amount
  if (amount >= 3000) {
    const trips = (amount / 8000).toFixed(1);
    comps.push({ icon: "✈️", text: (parseFloat(trips) >= 1 ? trips + " 趟東京來回" : "攢 " + Math.round((1 - amount / 8000) * 100) + "% 就能飛東京"), impact: parseFloat(trips) });
  }

  // Pick top 4 most impactful, deduplicate by type
  const seen = new Set();
  return comps.filter((c) => {
    const key = c.text.slice(0, 10);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.impact - a.impact).slice(0, 4);
}

function fmtComparisons(amount, stats) {
  const comps = buildComparisons(amount, stats);
  if (!comps.length) return "每年省 $" + fmt(amount) + "，積少成多。";
  return comps.map((c) => c.icon + " " + c.text).join("\n");
}

// ── 計算統計 ─────────────────────────────────────────────────────────────
function computeStats(invoices) {
  const brandMap = {};
  invoices.forEach((inv) => {
    const { brand, cat } = resolveShop(inv.shop);
    if (!brandMap[brand]) brandMap[brand] = { brand, cat, visits: 0, total: 0, byWeek: {}, byMonth: {} };
    brandMap[brand].visits++;
    brandMap[brand].total += inv.amount || 0;
    const wk = inv.week || "";
    brandMap[brand].byWeek[wk] = (brandMap[brand].byWeek[wk] || 0) + 1;
    const ym = inv.yearMonth || "";
    if (!brandMap[brand].byMonth[ym]) brandMap[brand].byMonth[ym] = { visits: 0, total: 0 };
    brandMap[brand].byMonth[ym].visits++;
    brandMap[brand].byMonth[ym].total += inv.amount || 0;
  });
  const brands = Object.values(brandMap).sort((a, b) => b.visits - a.visits);
  const brandsByTotal = [...brands].sort((a, b) => b.total - a.total);

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

  const sortedMonthKeys = months.map((m) => m.ym);
  const mid = Math.floor(sortedMonthKeys.length / 2);
  const firstKeys = sortedMonthKeys.slice(0, mid);
  const secondKeys = sortedMonthKeys.slice(mid);

  const brandFirst = {};
  const brandSecond = {};
  invoices.forEach((inv) => {
    const { brand } = resolveShop(inv.shop);
    const ym = inv.yearMonth || "";
    if (firstKeys.includes(ym)) {
      if (!brandFirst[brand]) brandFirst[brand] = { visits: 0, total: 0 };
      brandFirst[brand].visits++;
      brandFirst[brand].total += inv.amount || 0;
    } else if (secondKeys.includes(ym)) {
      if (!brandSecond[brand]) brandSecond[brand] = { visits: 0, total: 0 };
      brandSecond[brand].visits++;
      brandSecond[brand].total += inv.amount || 0;
    }
  });

  const catFirst = {};
  const catSecond = {};
  invoices.forEach((inv) => {
    const { cat } = resolveShop(inv.shop);
    const ym = inv.yearMonth || "";
    if (firstKeys.includes(ym)) {
      if (!catFirst[cat]) catFirst[cat] = { visits: 0, total: 0 };
      catFirst[cat].visits++;
      catFirst[cat].total += inv.amount || 0;
    } else if (secondKeys.includes(ym)) {
      if (!catSecond[cat]) catSecond[cat] = { visits: 0, total: 0 };
      catSecond[cat].visits++;
      catSecond[cat].total += inv.amount || 0;
    }
  });

  const totalAmount = invoices.reduce((s, inv) => s + (inv.amount || 0), 0);
  const totalDays = Math.max(months.length * 30, 30);

  return { brands, brandsByTotal, cats, months, totalAmount, totalDays, brandFirst, brandSecond, catFirst, catSecond, firstKeys, secondKeys };
}

function fmtMonth(ym) {
  const parts = ym.split("-");
  return parts.length === 2 ? parseInt(parts[1]) + "月" : ym;
}

const catIcon = (cat) => ({ "外送": "🛵", "速食": "🍔", "超商": "🏪", "超市": "🛒", "咖啡": "☕", "飲料": "🧋", "餐飲": "🍽", "網購": "📦", "美妝": "💄", "訂閱": "📱", "加油": "⛽" }[cat] || "📌");

// ── 建立 4 個 Hook（樹狀 + 敘事鏈）────────────────────────────────────
function buildHooks(invoices, invoiceCount, totalAmount, monthlyTrend) {
  const s = computeStats(invoices);
  const { brands, brandsByTotal, cats, months, totalDays, brandFirst, brandSecond, catFirst, catSecond, firstKeys, secondKeys } = s;
  if (!brands.length) return { hooks: [], bridges: [], summary: "" };

  const top = brands[0];
  const topFreq = (totalDays / top.visits).toFixed(1);
  const trendData = (monthlyTrend && monthlyTrend.length > 0)
    ? monthlyTrend.map((m) => ({ label: m.month, value: m.amount }))
    : months.map((m) => ({ label: fmtMonth(m.ym), value: m.total }));
  const trendValues = trendData.map((t) => t.value);
  const trendLabels = trendData.map((t) => t.label);
  const monthlyAvg = trendValues.length > 0 ? Math.round(trendValues.reduce((a, b) => a + b, 0) / trendValues.length) : 0;
  const recentAvg = trendValues.slice(-3).length > 0 ? Math.round(trendValues.slice(-3).reduce((a, b) => a + b, 0) / trendValues.slice(-3).length) : 0;

  // Rising brand
  const rising = brands.filter((b) => b.visits >= 3).map((b) => {
    const bef = brandFirst[b.brand]?.visits || 0;
    const aft = brandSecond[b.brand]?.visits || 0;
    return { ...b, bef, aft, growth: bef > 0 ? Math.round(((aft - bef) / bef) * 100) : (aft > 0 ? 999 : 0) };
  }).filter((b) => b.growth > 30).sort((a, b) => b.growth - a.growth);

  // ── Hook 1：我最離不開什麼？ ──────────────────────────────────────────
  const top4 = brands.slice(0, 4);
  const risingBrand = rising[0];

  const hook1 = {
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
        name: b.brand, freq: "每 " + freq + " 天",
        note: isRising ? "+" + risingBrand.growth + "% 正在變成新依賴" : (i === 0 ? "你的第一依賴" : i === 1 ? "最穩定的日常" : b.cat + " · $" + fmt(b.total)),
      };
    }),
    tip: risingBrand
      ? risingBrand.brand + " 值得注意——前期 " + risingBrand.bef + " 次，近期 " + risingBrand.aft + " 次（+" + (risingBrand.growth < 999 ? risingBrand.growth + "%" : "新增") + "），正在悄悄變成你的日常必需品。"
      : "你的前 4 大通路佔了消費次數的 " + Math.round(top4.reduce((a, b) => a + b.visits, 0) / invoiceCount * 100) + "%。",
    followups: [
      {
        q: "我對「" + top.brand + "」的依賴在變強嗎？",
        a: (() => {
          const bef = brandFirst[top.brand]?.visits || 0;
          const aft = brandSecond[top.brand]?.visits || 0;
          const befAvg = bef > 0 ? Math.round((brandFirst[top.brand]?.total || 0) / bef) : 0;
          const aftAvg = aft > 0 ? Math.round((brandSecond[top.brand]?.total || 0) / aft) : 0;
          let t = "前期 " + bef + " 次，近期 " + aft + " 次——" + (aft > bef ? "頻率在增加（+" + (bef > 0 ? Math.round(((aft - bef) / bef) * 100) : 999) + "%）。" : aft < bef ? "頻率有下降。" : "頻率差不多。");
          if (befAvg > 0 && aftAvg > 0 && Math.abs(aftAvg - befAvg) > 10) {
            t += "\n\n單次金額從 $" + befAvg + (aftAvg > befAvg ? " 升到 $" + aftAvg + "，花的錢變多了。" : " 降到 $" + aftAvg + "，每次消費有在控制。");
          }
          return t;
        })(),
        followups: [
          {
            q: "如果每週少去 2 次，一年差多少？",
            a: (() => {
              const avg = Math.round(top.total / top.visits);
              const yearly = avg * 2 * 52;
              const trips = (yearly / 8000).toFixed(1);
              return "你每週去「" + top.brand + "」約 " + (top.visits / (totalDays / 7)).toFixed(1) + " 次，每次 $" + avg + "。\n\n每週少 2 次：\n📉 每月省 $" + fmt(Math.round(avg * 2 * 4.3)) + "\n📉 一年省 $" + fmt(yearly) + "\n\n換算你的消費：\n" + fmtComparisons(yearly, s) + "\n\n重點不是「你應該少去」，而是讓你知道差距有多大。";
            })(),
          },
          {
            q: "有沒有更划算的替代方案？",
            a: (() => {
              const supermarket = brands.find((b) => b.cat === "超市");
              if (supermarket) {
                return "你已經每 " + (totalDays / supermarket.visits).toFixed(0) + " 天去一次「" + supermarket.brand + "」（均 $" + Math.round(supermarket.total / supermarket.visits) + "）。如果把部分「" + top.brand + "」的消費改到" + supermarket.brand + "買，同品項通常便宜 20-30%。\n\n你的" + supermarket.brand + "消費很穩定，擴大採購量很自然。";
              }
              return "可以觀察你目前的消費中，是否有重複購買的品項能在其他通路找到更低價的選擇。";
            })(),
          },
        ],
      },
      {
        q: "除了「" + top.brand + "」，還有什麼正在變成習慣？",
        a: (() => {
          const grow = rising.filter((b) => b.brand !== top.brand).slice(0, 3);
          if (!grow.length) return "目前沒有明顯在增加的新消費習慣，你的通路選擇很穩定。";
          return "成長最快的：\n\n" + grow.map((g) => catIcon(g.cat) + " " + g.brand + "：前期 " + g.bef + " 次 → 近期 " + g.aft + " 次" + (g.growth < 999 ? "（+" + g.growth + "%）" : "（新增！）")).join("\n");
        })(),
        followups: [
          {
            q: "哪個通路成長最快？",
            a: (() => {
              const fastest = rising[0];
              if (!fastest) return "目前沒有明顯快速成長的通路。";
              return fastest.brand + " 的增幅最驚人——" + (fastest.growth < 999 ? "從前期 " + fastest.bef + " 次到近期 " + fastest.aft + " 次（+" + fastest.growth + "%）" : "從零開始，近期已經去了 " + fastest.aft + " 次") + "。從「偶爾去」直接變成「固定消費」。這通常是新消費習慣正在形成的訊號。";
            })(),
          },
          {
            q: "這些新習慣一年要花多少？",
            a: (() => {
              const grow = rising.filter((b) => b.brand !== top.brand).slice(0, 3);
              if (!grow.length) return "沒有明顯的新增通路。";
              const items = grow.map((g) => {
                const yearly = Math.round(g.total / months.length * 12);
                return g.brand + " ~$" + fmt(yearly) + "/年";
              });
              const total = grow.reduce((a, g) => a + Math.round(g.total / months.length * 12), 0);
              return "照近期頻率推算：\n" + items.join("、") + "\n\n合計約 $" + fmt(total) + "/年" + (total > 8000 ? "——相當於一趟東京來回。" : "。");
            })(),
          },
        ],
      },
    ],
  };

  // ── Hook 2：如果繼續這樣，一年後？ ────────────────────────────────────
  const yearProjection = Math.round(recentAvg * 12);
  const topCatEat = ["外送", "速食", "餐飲"];
  const topCatDrink = ["咖啡", "飲料"];
  const topCatConv = ["超商"];
  const eatTotal = cats.filter((c) => topCatEat.includes(c.cat)).reduce((a, c) => a + c.total, 0);
  const convTotal = cats.filter((c) => topCatConv.includes(c.cat)).reduce((a, c) => a + c.total, 0);
  const eatMonthly = months.length > 0 ? Math.round(eatTotal / months.length) : 0;
  const convMonthly = months.length > 0 ? Math.round(convTotal / months.length) : 0;

  const hook2 = {
    id: "future",
    q: "如果繼續這樣，一年後？",
    big: "$" + fmt(yearProjection),
    bigSub: "照目前趨勢，你未來一年的預估總花費",
    body: "你的月均消費 $" + fmt(monthlyAvg) + "，近 3 個月均 $" + fmt(recentAvg) + "。\n\n如果趨勢不變，一年後你的消費會長這樣：",
    trend: trendValues,
    trendLabels,
    trendLabel: "每月消費趨勢",
    trendColor: recentAvg > monthlyAvg ? "#E8453C" : "#007AFF",
    tip: "月均 $" + fmt(monthlyAvg) + " 看似不多，但年化就是 $" + fmt(yearProjection) + "。小額高頻消費累積的速度比你想的快。",
    followups: [
      {
        q: "一年的花費換算成什麼？",
        a: (() => {
          return "一年預估 $" + fmt(yearProjection) + "，用你自己的消費習慣來換算：\n\n" + fmtComparisons(yearProjection, s) + "\n\n這些都是從你的真實消費計算出來的。";
        })(),
        followups: [
          {
            q: "如果能省下 10%，可以做什麼？",
            a: (() => {
              const saved = Math.round(yearProjection * 0.1);
              return "省下 10% = $" + fmt(saved) + "/年。換算你的消費：\n\n" + fmtComparisons(saved, s) + "\n\n10% 不需要大幅改變生活，只要在幾個高頻消費上稍微調整。";
            })(),
          },
          {
            q: "哪個月花最多？為什麼？",
            a: (() => {
              const maxMonth = trendData.reduce((a, b) => a.value > b.value ? a : b);
              const maxYm = months.find((m) => m.total === Math.max(...months.map((x) => x.total)));
              if (!maxYm) return "資料不足。";
              const monthInvs = invoices.filter((inv) => inv.yearMonth === maxYm.ym);
              const mb = {};
              monthInvs.forEach((inv) => { const { brand } = resolveShop(inv.shop); if (!mb[brand]) mb[brand] = 0; mb[brand] += inv.amount || 0; });
              const topInMonth = Object.entries(mb).sort((a, b) => b[1] - a[1]).slice(0, 3);
              return maxMonth.label + " 花了 $" + fmt(maxMonth.value) + "，是最高的月份。\n\n該月前三大：\n" + topInMonth.map(([b, t]) => "• " + b + "：$" + fmt(t)).join("\n");
            })(),
          },
        ],
      },
      {
        q: "如果每週少消費 2 次，差多少？",
        a: (() => {
          const avg = Math.round(top.total / top.visits);
          const monthlySave = Math.round(avg * 2 * 4.3);
          const yearlySave = avg * 2 * 52;
          return "你目前每週去「" + top.brand + "」約 " + (top.visits / (totalDays / 7)).toFixed(1) + " 次，每次 $" + avg + "。\n\n每週少 2 次：\n📉 每月省 $" + fmt(monthlySave) + "\n📉 一年省 $" + fmt(yearlySave) + "\n\n這筆省下來的錢：\n" + fmtComparisons(yearlySave, s) + "\n\n你自己決定。";
        })(),
        followups: [
          {
            q: "最容易省的是哪個類別？",
            a: (() => {
              const conv = cats.find((c) => c.cat === "超商");
              const market = cats.find((c) => c.cat === "超市");
              if (conv && market) {
                return "超商消費 $" + fmt(conv.total) + "（" + conv.visits + " 次）——很多小額但高頻。\n\n如果把超商的固定品項改在超市買，同品項省 20-30%。一年可省 ~$" + fmt(Math.round(conv.total / months.length * 12 * 0.25)) + "。\n\n你已經固定去「" + (market ? brands.find((b) => b.cat === "超市")?.brand || "超市" : "超市") + "」，多帶幾樣就好。";
              }
              return "檢視你的高頻小額消費（超商、飲料），這些最容易在不改變生活的情況下省下來。";
            })(),
          },
          {
            q: "省下來的錢可以拿來做什麼？",
            a: (() => {
              const avg = Math.round(top.total / top.visits);
              const yearlySave = avg * 2 * 52;
              return "每年省 $" + fmt(yearlySave) + "，用你的消費習慣來看：\n\n" + fmtComparisons(yearlySave, s) + "\n\n不管金額大小，省下來的都是你自己的。你自己決定怎麼用。";
            })(),
          },
        ],
      },
    ],
  };

  // ── Hook 3：你的錢真正流向哪裡？ ──────────────────────────────────────
  // Find "hidden high spenders" — mid-low frequency but high total (surprising accumulation)
  const avgVisits = invoiceCount / brands.length;
  const hiddenSpenders = brandsByTotal.filter((b) => b.visits <= avgVisits * 1.5 && b.visits >= 3 && b.total > totalAmount * 0.02)
    .sort((a, b) => b.total - a.total).slice(0, 4);
  const topHidden = hiddenSpenders[0] || brandsByTotal[0];
  const topHighFreq = brands[0];
  const hiddenRatio = topHighFreq.total > 0 ? (topHidden.total / topHighFreq.total).toFixed(1) : "?";

  // 80/20
  const top5Spend = brandsByTotal.slice(0, 5);
  const top5Total = top5Spend.reduce((a, b) => a + b.total, 0);
  const top5Pct = Math.round(top5Total / totalAmount * 100);

  // Convenience store totals
  const convBrands = brands.filter((b) => b.cat === "超商");
  const convVisits = convBrands.reduce((a, b) => a + b.visits, 0);
  const convAmount = convBrands.reduce((a, b) => a + b.total, 0);
  const marketBrands = brands.filter((b) => b.cat === "超市");
  const marketAmount = marketBrands.reduce((a, b) => a + b.total, 0);

  // Build ranks: top spenders with their frequency context
  const spendRanks = brandsByTotal.slice(0, 6).map((b, i) => {
    const freqRank = brands.findIndex((x) => x.brand === b.brand) + 1;
    const avg = Math.round(b.total / b.visits);
    const isSurprise = freqRank > i + 2; // ranks much lower in frequency than spending
    return { rank: (i + 1) + "", name: b.brand, freq: "$" + fmt(b.total) + "（" + b.visits + " 次）", note: "均$" + avg + (isSurprise ? " ⚠️ 去的少但花的多" : ""), isSurprise };
  });

  const hook3 = {
    id: "truth",
    q: "你的錢真正流向哪裡？",
    big: "$" + fmt(topHidden.total),
    bigSub: "「" + topHidden.brand + "」只去 " + topHidden.visits + " 次，但累積花了這麼多——你可能沒意識到",
    body: "有些通路你不常去，但每次去都花很多，累積起來比你想的驚人：",
    ranks: spendRanks,
    tip: topHidden.brand + " 只去了 " + topHidden.visits + " 次，但花了 $" + fmt(topHidden.total) + "（均 $" + Math.round(topHidden.total / topHidden.visits) + "/次）。而你去最多的 " + topHighFreq.brand + "（" + topHighFreq.visits + " 次）只花 $" + fmt(topHighFreq.total) + "。低頻高消費的通路才是預算的隱形殺手。",
    followups: [
      {
        q: "哪些是「隱形吃錢怪」？",
        a: (() => {
          let t = "有些消費每次金額小，但累積驚人：\n\n";
          if (convVisits > 0) {
            t += "🏪 超商（" + convBrands.map((b) => b.brand).join("+") + "）：" + convVisits + " 次 × 均 $" + Math.round(convAmount / convVisits) + " = $" + fmt(convAmount) + "\n相當於每天 $" + Math.round(convAmount / totalDays) + "——一年 $" + fmt(Math.round(convAmount / months.length * 12)) + "\n\n";
          }
          t += "真正的隱形殺手是高頻小額消費——你不會注意每次 $100，但一年就是好幾萬。";
          return t;
        })(),
        followups: [
          {
            q: "超商消費一年累積多少？",
            a: (() => {
              const yearly = Math.round(convAmount / months.length * 12);
              const snackPct = 45;
              const snackYearly = Math.round(yearly * snackPct / 100);
              return "超商年化約 $" + fmt(yearly) + "。其中飲料零食估計佔 " + snackPct + "%，也就是每年 $" + fmt(snackYearly) + " 花在超商零食飲料上。" + (snackYearly > 7990 ? "\n\n相當於 " + (snackYearly / 7990).toFixed(1) + " 副 AirPods Pro。" : "");
            })(),
          },
          {
            q: "改在超市統一採買能省多少？",
            a: (() => {
              const savePct = 25;
              const yearlySave = Math.round(convAmount / months.length * 12 * savePct / 100);
              const market = brands.find((b) => b.cat === "超市");
              return "超商同品項在超市通常便宜 20-30%。\n\n如果把固定品項每週在" + (market ? "「" + market.brand + "」" : "超市") + "買齊：\n📉 每月省 ~$" + fmt(Math.round(yearlySave / 12)) + "\n📉 一年省 ~$" + fmt(yearlySave) + (market ? "\n\n你已經固定去" + market.brand + "，多帶幾樣就好。" : "");
            })(),
          },
        ],
      },
      {
        q: "前 5 大花費佔了多少比例？",
        a: "你的前 5 大通路花費：\n\n" + top5Spend.map((b, i) => (i + 1) + ". " + b.brand + "：$" + fmt(b.total) + "（" + b.visits + " 次）").join("\n") + "\n\n合計 $" + fmt(top5Total) + "，佔總消費的 " + top5Pct + "%。\n\n" + (top5Pct < 30 ? "剩下 " + (100 - top5Pct) + "% 散落在其他 " + (brands.length - 5) + " 個通路——零散消費才是真正的黑洞。" : "消費蠻集中的，掌控這 5 個通路就掌控了大部分花費。"),
        followups: [
          {
            q: "哪筆花費最值得重新檢視？",
            a: (() => {
              const highAvg = [...brands].filter((b) => b.visits >= 3).sort((a, b) => (b.total / b.visits) - (a.total / a.visits))[0];
              if (!highAvg) return "目前沒有特別需要檢視的。";
              const avg = Math.round(highAvg.total / highAvg.visits);
              const yearly = Math.round(highAvg.total / months.length * 12);
              return "「" + highAvg.brand + "」：" + highAvg.visits + " 次但花了 $" + fmt(highAvg.total) + "，均單價 $" + avg + "——是高頻通路中單價最高的。\n\n如果每次控制在 $" + Math.round(avg * 0.7) + " 以內，一年可省 ~$" + fmt(Math.round(yearly * 0.3)) + "。列個清單再出門是最簡單的方式。";
            })(),
          },
          {
            q: "有沒有重複消費可以合併的？",
            a: (() => {
              // Find categories with multiple brands
              const catBrands = {};
              brands.filter((b) => b.visits >= 3).forEach((b) => {
                if (!catBrands[b.cat]) catBrands[b.cat] = [];
                catBrands[b.cat].push(b);
              });
              const mergeable = Object.entries(catBrands).filter(([, bs]) => bs.length >= 2).map(([cat, bs]) => ({
                cat, brands: bs, totalVisits: bs.reduce((a, b) => a + b.visits, 0), totalSpend: bs.reduce((a, b) => a + b.total, 0),
              })).sort((a, b) => b.totalVisits - a.totalVisits);
              if (!mergeable.length) return "你的消費通路沒有明顯重複。";
              const m = mergeable[0];
              return "你的「" + m.cat + "」消費分散在：\n" + m.brands.map((b) => "• " + b.brand + "：" + b.visits + " 次 $" + fmt(b.total)).join("\n") + "\n\n合計 " + m.totalVisits + " 次 $" + fmt(m.totalSpend) + "。\n\n集中在一家可以累積更多點數回饋，而且減少「順便買」的衝動消費。合併通路是最無痛的省錢方式。";
            })(),
          },
        ],
      },
    ],
  };

  // ── Hook 4：我跟前期有什麼不同？ ──────────────────────────────────────
  const totalBefore = Object.values(catFirst).reduce((a, v) => a + v.total, 0);
  const totalAfter = Object.values(catSecond).reduce((a, v) => a + v.total, 0);

  const catChanges = cats.map((c) => {
    const bef = catFirst[c.cat]?.total || 0;
    const aft = catSecond[c.cat]?.total || 0;
    return { cat: c.cat, bef, aft, growth: bef > 0 ? Math.round(((aft - bef) / bef) * 100) : (aft > 0 ? 999 : 0), total: c.total };
  });
  const increasing = catChanges.filter((c) => c.growth > 15 && c.total > 500).sort((a, b) => b.growth - a.growth).slice(0, 3);
  const stable = catChanges.filter((c) => Math.abs(c.growth) <= 15 && c.total > 500).slice(0, 2);

  const biggestGrowth = rising[0];
  const bigPct = biggestGrowth ? (biggestGrowth.growth < 999 ? "+" + biggestGrowth.growth + "%" : "新增") : "+" + Math.round(((totalAfter - totalBefore) / Math.max(totalBefore, 1)) * 100) + "%";

  const hook4 = {
    id: "change",
    q: "我跟前期有什麼不同？",
    big: bigPct,
    bigSub: biggestGrowth ? "「" + biggestGrowth.brand + "」的消費變化" : "整體消費變化",
    body: "你前期和近期，是不太一樣的消費者。",
    changes: {
      up: increasing.map((c) => ({
        icon: catIcon(c.cat), label: c.cat,
        detail: "$" + fmt(Math.round(c.bef / Math.max(firstKeys.length, 1))) + "/月 → $" + fmt(Math.round(c.aft / Math.max(secondKeys.length, 1))) + "/月" + (c.growth < 999 ? "（+" + c.growth + "%）" : "（新增）"),
      })),
      stable: stable.map((c) => ({
        icon: catIcon(c.cat), label: c.cat,
        detail: "每月約 $" + fmt(Math.round(c.total / months.length)) + "，幾乎沒變",
      })),
    },
    trend: trendValues, trendLabels,
    trendLabel: "每月消費趨勢", trendColor: totalAfter > totalBefore ? "#E8453C" : "#007AFF",
    tip: "你的消費版圖在「擴張」——新的習慣加上去了，但舊的沒有被取代。",
    followups: [
      {
        q: "變化最大的是什麼？",
        a: (() => {
          const topGrow = rising.slice(0, 3);
          if (!topGrow.length) return "你的消費通路分布很穩定。";
          return "增幅最大的：\n\n" + topGrow.map((g, i) => ["🥇", "🥈", "🥉"][i] + " " + g.brand + "：前期 " + g.bef + " 次 → 近期 " + g.aft + " 次" + (g.growth < 999 ? "（+" + g.growth + "%）" : "（新增）")).join("\n") + (topGrow[0].growth > 100 ? "\n\n" + topGrow[0].brand + " 從「偶爾」變成了「固定」——新消費習慣正在形成。" : "");
        })(),
        followups: [
          {
            q: "這個變化是好是壞？",
            a: (() => {
              const g = rising[0];
              if (!g) return "整體消費趨勢平穩。";
              return "「" + g.brand + "」的增加" + (g.cat === "超市" || g.cat === "學習平台" ? "是正面的——代表你在" + (g.cat === "超市" ? "自己採買、控制飲食" : "投資自己") + "。" : "本身不是壞事，關鍵是你是否有意識地選擇。\n\n如果是因為方便而養成的習慣，值得想想這個方便值多少錢。");
            })(),
          },
          {
            q: "要怎麼調整最有效？",
            a: (() => {
              const conv = brands.filter((b) => b.cat === "超商");
              const market = brands.find((b) => b.cat === "超市");
              if (conv.length && market) {
                const convYearly = Math.round(conv.reduce((a, b) => a + b.total, 0) / months.length * 12);
                return "最有效的一步：把超商高頻消費（均 $" + Math.round(conv.reduce((a, b) => a + b.total, 0) / conv.reduce((a, b) => a + b.visits, 0)) + "/次）盡量合併到「" + market.brand + "」。\n\n同品項超市比超商便宜 20-30%，一年可省 ~$" + fmt(Math.round(convYearly * 0.25)) + "。\n\n不需要大幅改變生活，只要調整採購節奏。";
              }
              return "檢視高頻小額消費，這些最容易在不改變生活的情況下優化。";
            })(),
          },
        ],
      },
      {
        q: "有什麼消費消失或減少了？",
        a: (() => {
          const declining = brands.filter((b) => b.visits >= 3).map((b) => {
            const bef = brandFirst[b.brand]?.visits || 0;
            const aft = brandSecond[b.brand]?.visits || 0;
            return { brand: b.brand, cat: b.cat, bef, aft, change: aft - bef };
          }).filter((b) => b.change < -2).sort((a, b) => a.change - b.change).slice(0, 3);
          if (!declining.length) return "沒有明顯消失的通路。你之前常去的店現在還是常去。\n\n整體來看，消費在「擴張」不是「替換」——新習慣加上去了，舊的沒被取代。";
          return "有一些在減少：\n\n" + declining.map((d) => "📉 " + d.brand + "（" + d.cat + "）：前期 " + d.bef + " 次 → 近期 " + d.aft + " 次").join("\n");
        })(),
        followups: [
          {
            q: "消失的錢去了哪裡？",
            a: (() => {
              const declining = brands.filter((b) => b.visits >= 3).map((b) => ({ brand: b.brand, cat: b.cat, bef: brandFirst[b.brand]?.visits || 0, aft: brandSecond[b.brand]?.visits || 0 })).filter((b) => b.aft < b.bef - 1);
              const growingCats = rising.slice(0, 2);
              if (!declining.length) return "沒有明顯消失的消費。你的總花費在增加，是「增量」不是「轉移」。";
              const declinedTotal = declining.reduce((a, d) => a + ((d.bef - d.aft) * Math.round(totalAmount / invoiceCount)), 0);
              return "減少的通路（" + declining.map((d) => d.brand).join("、") + "）大約少了 $" + fmt(declinedTotal) + "/期。\n\n但同時 " + (growingCats.length > 0 ? growingCats.map((g) => g.brand).join("、") + " 新增了更多" : "其他通路增加了") + "——這是「消費轉移」，你把一部分花費從 A 移到了 B。";
            })(),
          },
          {
            q: "整體在擴張還是轉移？",
            a: (() => {
              const diff = totalAfter - totalBefore;
              const pct = totalBefore > 0 ? Math.round((diff / totalBefore) * 100) : 0;
              return diff > 0
                ? "主要是擴張。近期比前期多花了 $" + fmt(diff) + "（" + (pct > 0 ? "+" : "") + pct + "%）。\n\n新增通路的消費遠大於減少的——你的消費版圖正在變大，不只是換地方花。"
                : "整體消費相對穩定" + (pct < -5 ? "，甚至有下降趨勢（" + pct + "%）。控制得不錯！" : "。") ;
            })(),
          },
        ],
      },
    ],
  };

  // ── 引導句 ────────────────────────────────────────────────────────────
  const bridges = [
    "知道了你最依賴「" + top.brand + "」。但照這個頻率繼續下去，一年後呢？",
    "一年 $" + fmt(yearProjection) + " 的衝擊不小。但你以為花最多的地方，真的是花最多的嗎？",
    "現在知道錢真正流在哪了。最後看看你跟之前的自己有什麼不同。",
  ];

  // Consumer type for summary
  const topCat = cats[0];
  const pattern = (convTotal > eatTotal ? "高頻超商" : "外食導向") + " + " + (marketAmount > 0 ? "穩定超市" : "外食為主") + " + " + (rising.length > 2 ? "擴張型" : "穩定型");
  const keyInsight = biggestGrowth ? biggestGrowth.brand + " 從前期 " + biggestGrowth.bef + " 次暴增到近期 " + biggestGrowth.aft + " 次" : "消費整體穩定";
  const summary = "根據你的 " + invoiceCount + " 張發票分析完成。你是「" + pattern + "」消費者。最值得注意的是：" + keyInsight + "。";

  return { hooks: [hook1, hook2, hook3, hook4], bridges, summary };
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
      {hook.projection && (<div style={{ marginTop: 12, background: "rgba(255,255,255,0.04)", borderRadius: 10, overflow: "hidden" }}><div style={{ display: "flex", padding: "8px 12px", borderBottom: "1px solid #2C2C2E" }}><span style={{ flex: 2, fontSize: 11, color: "#636366" }}>項目</span><span style={{ flex: 2, fontSize: 11, color: "#636366", textAlign: "center" }}>現在</span><span style={{ flex: 2, fontSize: 11, color: "#636366", textAlign: "center" }}>一年後</span><span style={{ flex: 1, fontSize: 11, color: "#636366", textAlign: "right" }}>變化</span></div>{hook.projection.map((p, i) => (<div key={i} style={{ display: "flex", padding: "8px 12px", borderBottom: i < hook.projection.length - 1 ? "1px solid #2C2C2E" : "none", alignItems: "center" }}><span style={{ flex: 2, fontSize: 13, color: "#E5E5EA" }}>{p.label}</span><span style={{ flex: 2, fontSize: 13, color: "#8E8E93", textAlign: "center" }}>{p.now}</span><span style={{ flex: 2, fontSize: 13, color: "#FF9500", textAlign: "center", fontWeight: 600 }}>{p.future}</span><span style={{ flex: 1, fontSize: 12, color: "#E8453C", textAlign: "right", fontWeight: 600 }}>{p.change}</span></div>))}</div>)}
      {hook.changes && (<div style={{ marginTop: 10 }}>{hook.changes.up.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: "#E8453C", marginBottom: 6 }}>變多的</div>}{hook.changes.up.map((c, i) => (<div key={i} style={{ fontSize: 13, color: "#E5E5EA", lineHeight: 1.8, paddingLeft: 4 }}>{c.icon} {c.label}：{c.detail}</div>))}{hook.changes.stable.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: "#8E8E93", marginTop: 8, marginBottom: 6 }}>穩定的</div>}{hook.changes.stable.map((c, i) => (<div key={i} style={{ fontSize: 13, color: "#8E8E93", lineHeight: 1.8, paddingLeft: 4 }}>{c.icon} {c.label}：{c.detail}</div>))}</div>)}
      {hook.trend && hook.trendLabels && (<div style={{ marginTop: 14 }}><div style={{ fontSize: 12, color: "#8E8E93", marginBottom: 8 }}>{hook.trendLabel}</div><TrendChart values={hook.trend} labels={hook.trendLabels} color={hook.trendColor} /></div>)}
      {hook.tip && (<div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(255,255,255,0.06)", borderRadius: 10, borderLeft: "3px solid #FF9500" }}><div style={{ fontSize: 13, color: "#FFD60A", lineHeight: 1.6, fontWeight: 500 }}>💡 {hook.tip}</div></div>)}
    </div>
  );
}

// ── AI Chat 主元件（樹狀敘事鏈）──────────────────────────────────────────
export default function AIChat({ invoices, invoiceCount, totalAmount, monthlyTrend }) {
  const stats = useMemo(() => computeStats(invoices || []), [invoices]);
  const { hooks: HOOKS, bridges: BRIDGES, summary: SUMMARY } = useMemo(
    () => buildHooks(invoices || [], invoiceCount || 0, totalAmount || 0, monthlyTrend),
    [invoices, invoiceCount, totalAmount, monthlyTrend]
  );

  const topBrand = stats.brands[0];

  const OPENS = useMemo(() => [
    { text: "嗨，我看完了你 " + (invoiceCount || 0) + " 張發票。", delay: 400 },
    { text: "想跟你聊聊我觀察到的事。", delay: 1200, dim: true },
    { text: topBrand ? "你跟「" + topBrand.brand + "」的關係很穩定——平均每 " + (stats.totalDays / topBrand.visits).toFixed(1) + " 天就會去一次。這是你最離不開的消費。" : "讓我幫你分析一下。", delay: 2200, hook: true },
  ], [topBrand, invoiceCount, stats.totalDays]);

  const [msgs, setMsgs] = useState([]);
  const [phase, setPhase] = useState("opening");
  const [step, setStep] = useState(0);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [dispText, setDispText] = useState("");
  const [usedIds, setUsedIds] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [deepFollowups, setDeepFollowups] = useState([]);
  const [unlockedHooks, setUnlockedHooks] = useState([0]); // index-based
  const [bridgeSent, setBridgeSent] = useState({}); // hookIdx → true
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
  }, [msgs, dispText, step, typing, followups, deepFollowups]);

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
      setFollowups(hook.followups || []);
      setDeepFollowups([]);
    }, 800);
  }

  function tapHook(hook) {
    stop();
    setMsgs((p) => [...p, { role: "user", text: hook.q }]);
    setUsedIds((p) => [...p, hook.id]);
    setFollowups([]);
    setDeepFollowups([]);
    setTimeout(() => showInsight(hook), 400);
  }

  function tapFollowup(fq) {
    stop();
    setMsgs((p) => [...p, { role: "user", text: fq.q }]);
    // Remove this followup from the list, keep siblings
    const remainingFu = followups.filter((f) => f.q !== fq.q);
    setFollowups(remainingFu);
    setDeepFollowups([]);
    setTimeout(() => {
      typeText(fq.a, () => {
        if (fq.followups && fq.followups.length > 0) {
          setDeepFollowups(fq.followups);
          // remainingFu stays visible alongside deep followups
        } else {
          maybeUnlockNext();
        }
      });
    }, 400);
  }

  function tapDeepFollowup(dfq) {
    stop();
    setMsgs((p) => [...p, { role: "user", text: dfq.q }]);
    // Remove this deep followup, keep siblings
    const remainingDeep = deepFollowups.filter((d) => d.q !== dfq.q);
    setDeepFollowups(remainingDeep);
    setTimeout(() => {
      typeText(dfq.a, () => {
        // Unlock next hook but keep remaining questions visible
        maybeUnlockNext();
      });
    }, 400);
  }

  function maybeUnlockNext() {
    // Find the index of the last used hook
    const lastUsedIdx = HOOKS.reduce((max, h, i) => usedIds.includes(h.id) ? i : max, -1);
    // Also check current — usedIds might not be updated yet in this render
    const currentMax = Math.max(lastUsedIdx, ...usedIds.map((id) => HOOKS.findIndex((h) => h.id === id)));
    const nextIdx = currentMax + 1;

    if (nextIdx < HOOKS.length && !unlockedHooks.includes(nextIdx) && !bridgeSent[currentMax]) {
      setBridgeSent((p) => ({ ...p, [currentMax]: true }));
      // Send bridge message after a short delay
      setTimeout(() => {
        const bridgeText = BRIDGES[currentMax] || "";
        if (bridgeText) {
          setMsgs((p) => [...p, { role: "bridge", text: bridgeText }]);
        }
        setUnlockedHooks((p) => [...p, nextIdx]);
      }, 800);
    } else if (nextIdx >= HOOKS.length && !bridgeSent["final"]) {
      setBridgeSent((p) => ({ ...p, final: true }));
      setTimeout(() => {
        setMsgs((p) => [...p, { role: "ai", text: SUMMARY }]);
      }, 800);
    }
  }

  function buildContext() {
    const top5 = stats.brands.slice(0, 5);
    const topCats = stats.cats.slice(0, 5);
    const lines = ["發票總數：" + (invoiceCount || 0) + " 張", "總消費：$" + fmt(totalAmount || 0), "", "前5大通路：", ...top5.map((b) => "- " + b.brand + "：" + b.visits + " 次，$" + fmt(b.total) + "（" + b.cat + "）"), "", "類別分佈：", ...topCats.map((c) => "- " + c.cat + "：$" + fmt(c.total) + "（" + Math.round((c.total / totalAmount) * 100) + "%）")];
    if (monthlyTrend?.length) { lines.push("", "月趨勢："); monthlyTrend.forEach((m) => lines.push("- " + m.month + "：$" + fmt(m.amount))); }
    return lines.join("\n");
  }

  async function sendFree() {
    const q = input.trim();
    if (!q) return;
    stop();
    setMsgs((p) => [...p, { role: "user", text: q }]);
    setInput("");
    setFollowups([]);
    setDeepFollowups([]);
    setTyping(true);
    try {
      const res = await fetch(AI_PROXY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, context: buildContext() }) });
      const data = await res.json();
      typeText(data.reply || "抱歉，AI 暫時無法回答。");
    } catch { typeText("連線失敗，請稍後再試。"); }
  }

  const available = HOOKS.filter((h, i) => unlockedHooks.includes(i) && !usedIds.includes(h.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#000" }}>
      <div style={{ padding: "14px 16px 12px", borderBottom: "0.5px solid #2C2C2E", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: "linear-gradient(135deg,#5B7FFF,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff" }}>✦</div>
        <div style={{ flex: 1 }}><div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>AI 管家</div><div style={{ fontSize: 12, color: "#636366" }}>已分析 {invoiceCount || 0} 張發票</div></div>
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
                <div style={{ fontSize: 11, color: "#636366", marginBottom: 6 }}>深入了解：</div>
                {deepFollowups.map((dfq, i) => (<button key={"d" + i} onClick={() => tapDeepFollowup(dfq)} style={{ display: "block", width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid #5B4A9E", background: "rgba(91,127,255,0.05)", color: "#B4A0FF", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left", marginBottom: 6 }}>{dfq.q}</button>))}
              </div>
            )}
            {followups.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: "#636366", marginBottom: 6 }}>{deepFollowups.length > 0 ? "或回到其他追問：" : "追問更多："}</div>
                {followups.map((fq, i) => (<button key={"f" + i} onClick={() => tapFollowup(fq)} style={{ display: "block", width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid #3A3A3C", background: "#1C1C1E", color: "#E5E5EA", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left", marginBottom: 6 }}>{fq.q}</button>))}
              </div>
            )}
            {available.length > 0 && phase === "hooks" && (
              <div style={{ marginBottom: 6 }}>
                {followups.length > 0 && <div style={{ fontSize: 11, color: "#636366", marginBottom: 6, marginTop: 2 }}>或探索其他觀察：</div>}
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
