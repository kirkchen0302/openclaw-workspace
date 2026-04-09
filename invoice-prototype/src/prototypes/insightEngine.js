/**
 * Insight Engine — 從用戶真實消費數據中挖掘最有衝擊力的洞察
 * 動態生成 4 個 Hook，每個有 2 追問 × 2 深追問
 */
import { resolveShop } from "./shopMapping";

const fmt = (n) => n.toLocaleString();
const catIcon = (cat) => ({ "外送": "🛵", "速食": "🍔", "超商": "🏪", "超市": "🛒", "咖啡": "☕", "飲料": "🧋", "餐飲": "🍽", "網購": "📦", "美妝": "💄", "訂閱": "📱", "加油": "⛽", "量販": "🛒", "百貨": "🏬", "停車": "🅿️", "電影娛樂": "🎬", "運動": "💪" }[cat] || "📌");

// Exclude bill-type categories from "surprise" insights
const BILL_CATS = ["電費", "水費", "瓦斯費", "電信費", "網路"];
const PLATFORM_FEE_THRESHOLD = 50; // avg < $50 likely platform fee only

// ── Stats computation ───────────────────────────────────────────────
export function computeStats(invoices) {
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
    if (!catMap[b.cat]) catMap[b.cat] = { cat: b.cat, visits: 0, total: 0, brands: [] };
    catMap[b.cat].visits += b.visits;
    catMap[b.cat].total += b.total;
    catMap[b.cat].brands.push(b);
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

  const sortedKeys = months.map((m) => m.ym);
  const mid = Math.floor(sortedKeys.length / 2);
  const firstKeys = sortedKeys.slice(0, mid);
  const secondKeys = sortedKeys.slice(mid);

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

  const totalAmount = invoices.reduce((s, inv) => s + (inv.amount || 0), 0);
  const totalDays = Math.max(months.length * 30, 30);
  const avgPerVisit = totalAmount / invoices.length || 0;

  return { brands, brandsByTotal, cats, months, totalAmount, totalDays, avgPerVisit, brandFirst, brandSecond, firstKeys, secondKeys };
}

// ── Personalized comparisons ────────────────────────────────────────
function fmtComparisons(amount, stats) {
  const comps = [];
  const { brands, cats, months, totalAmount, totalDays } = stats;
  // Equivalent visits to top brands
  brands.slice(0, 2).forEach((b) => {
    const avg = Math.round(b.total / b.visits);
    if (avg > 5) {
      const times = Math.round(amount / avg);
      if (times >= 2) comps.push(catIcon(b.cat) + " 免費去 " + times + " 次「" + b.brand + "」");
    }
  });
  // Equivalent months of category
  cats.filter((c) => !BILL_CATS.includes(c.cat) && c.cat !== "其他" && c.total > 0).slice(0, 2).forEach((c) => {
    const monthly = Math.round(c.total / Math.max(months.length, 1));
    if (monthly > 0) {
      const mo = (amount / monthly).toFixed(1);
      if (parseFloat(mo) >= 1) comps.push(catIcon(c.cat) + " " + mo + " 個月的「" + c.cat + "」消費");
    }
  });
  // Days of average spend
  const daily = Math.round(totalAmount / totalDays);
  if (daily > 0) comps.push("📅 " + Math.round(amount / daily) + " 天的日均消費");
  // Travel
  if (amount >= 3000) {
    const t = (amount / 8000).toFixed(1);
    comps.push("✈️ " + (parseFloat(t) >= 1 ? t + " 趟東京來回" : "攢 " + Math.round((1 - amount / 8000) * 100) + "% 就能飛東京"));
  }
  return comps.slice(0, 4).join("\n");
}

// ── Insight candidates ──────────────────────────────────────────────

function detectInsights(stats, invoiceCount, totalAmount, monthlyTrend) {
  const { brands, brandsByTotal, cats, months, totalDays, avgPerVisit, brandFirst, brandSecond, firstKeys, secondKeys } = stats;
  const candidates = [];

  // ── Type: EXPLOSIVE_GROWTH ────────────────────────────────────────
  // Brands that grew massively or appeared from zero
  const growthList = brands.filter((b) => b.visits >= 3 && !BILL_CATS.includes(b.cat)).map((b) => {
    const bef = brandFirst[b.brand]?.visits || 0;
    const aft = brandSecond[b.brand]?.visits || 0;
    const growth = bef > 0 ? Math.round(((aft - bef) / bef) * 100) : (aft > 0 ? 999 : 0);
    return { ...b, bef, aft, growth };
  }).filter((b) => b.growth > 50).sort((a, b) => b.growth - a.growth);

  if (growthList.length > 0) {
    const g = growthList[0];
    const isNew = g.growth === 999;
    const score = (isNew ? 90 : 70) + Math.min(g.aft, 30);
    candidates.push({
      type: "growth", score,
      hook: {
        id: "growth",
        q: "什麼消費正在悄悄擴張？",
        big: isNew ? "從 0 到 " + g.aft + " 次" : "+" + g.growth + "%",
        bigSub: "「" + g.brand + "」" + (isNew ? "是你近期新養成的消費" : "前期 " + g.bef + " 次 → 近期 " + g.aft + " 次"),
        body: isNew
          ? "「" + g.brand + "」在前期完全沒有出現，但近期已經去了 " + g.aft + " 次，累計 $" + fmt(g.total) + "。這是一個正在形成的新消費習慣。"
          : "「" + g.brand + "」的消費頻率從前期 " + g.bef + " 次飆到近期 " + g.aft + " 次（+" + g.growth + "%）。\n\n這個增長速度代表它正在從「偶爾去」變成「固定消費」。",
        ranks: growthList.slice(0, 4).map((x, i) => ({
          rank: x.growth === 999 ? "🆕" : "📈",
          name: x.brand, freq: x.bef + " → " + x.aft + " 次",
          note: x.growth === 999 ? "新增！" : "+" + x.growth + "%",
        })),
        tip: "新消費習慣一旦固定下來就很難改變。現在是你能有意識決定「要不要讓它變成日常」的最後時機。",
        followups: [
          {
            q: "這些新習慣一年要花多少？",
            a: (() => {
              const items = growthList.slice(0, 3).map((x) => {
                const yearly = Math.round(x.total / Math.max(months.length, 1) * 12);
                return catIcon(x.cat) + " " + x.brand + "：~$" + fmt(yearly) + "/年";
              });
              const yearlyTotal = growthList.slice(0, 3).reduce((s, x) => s + Math.round(x.total / Math.max(months.length, 1) * 12), 0);
              return "照近期頻率推算：\n\n" + items.join("\n") + "\n\n合計 ~$" + fmt(yearlyTotal) + "/年。\n\n" + fmtComparisons(yearlyTotal, stats);
            })(),
            followups: [
              {
                q: "哪個最值得保留、哪個該控制？",
                a: (() => {
                  const sorted = growthList.slice(0, 3).map((x) => ({ ...x, avg: Math.round(x.total / x.visits) })).sort((a, b) => b.avg - a.avg);
                  return sorted.map((x) => catIcon(x.cat) + " " + x.brand + "（均 $" + x.avg + "/次）：" + (x.avg > avgPerVisit * 2 ? "⚠️ 單價偏高，值得控制" : "✅ 單價合理")).join("\n") + "\n\n單價高的通路每次去就是一筆大支出，控制頻率或單次消費最有效。";
                })(),
              },
              {
                q: "如果頻率再翻倍，會怎樣？",
                a: (() => {
                  const g2 = growthList[0];
                  const doubled = Math.round(g2.total / Math.max(months.length, 1) * 12 * 2);
                  return "如果「" + g2.brand + "」的頻率再翻倍：\n\n每年消費 ~$" + fmt(doubled) + "\n\n" + fmtComparisons(doubled, stats) + "\n\n趨勢一旦加速就很難煞車，現在注意比以後後悔好。";
                })(),
              },
            ],
          },
          {
            q: "什麼消費在減少？",
            a: (() => {
              const declining = brands.filter((b) => b.visits >= 3).map((b) => ({ brand: b.brand, cat: b.cat, bef: brandFirst[b.brand]?.visits || 0, aft: brandSecond[b.brand]?.visits || 0 })).filter((b) => b.bef > b.aft + 1).sort((a, b) => (a.aft - a.bef) - (b.aft - b.bef)).slice(0, 3);
              if (!declining.length) return "沒有明顯減少的通路。你的消費在「擴張」而不是「轉移」——新的加上去了，舊的沒被取代。";
              return "正在減少的：\n\n" + declining.map((d) => "📉 " + d.brand + "（" + d.cat + "）：" + d.bef + " → " + d.aft + " 次").join("\n");
            })(),
            followups: [
              {
                q: "整體是在擴張還是轉移？",
                a: (() => {
                  const ft = firstKeys.reduce((s, k) => s + (stats.months.find((m) => m.ym === k)?.total || 0), 0);
                  const st = secondKeys.reduce((s, k) => s + (stats.months.find((m) => m.ym === k)?.total || 0), 0);
                  return ft > 0 && st > ft ? "主要是擴張。近期比前期多花了 $" + fmt(st - ft) + "（+" + Math.round((st - ft) / ft * 100) + "%）。新增的遠大於減少的。" : "整體相對穩定，沒有明顯擴張。";
                })(),
              },
              {
                q: "減少的錢跑去哪了？",
                a: "新增通路（" + growthList.slice(0, 2).map((x) => x.brand).join("、") + "）吸收了大部分新增消費。你不是省了，是把錢花到了新的地方。",
              },
            ],
          },
        ],
      },
    });
  }

  // ── Type: HIDDEN_HIGH_SPENDER ─────────────────────────────────────
  // Mid-low frequency but high total — things user didn't realize cost so much
  const nonBillBrands = brandsByTotal.filter((b) => !BILL_CATS.includes(b.cat) && b.cat !== "其他");
  const avgFreq = invoiceCount / brands.length;
  const hiddenSpenders = nonBillBrands.filter((b) => b.visits <= avgFreq * 1.2 && b.visits >= 3 && b.total > totalAmount * 0.03)
    .sort((a, b) => b.total - a.total);

  if (hiddenSpenders.length > 0) {
    const h = hiddenSpenders[0];
    const hAvg = Math.round(h.total / h.visits);
    const topFreq = brands[0];
    const topFreqAvg = Math.round(topFreq.total / topFreq.visits);
    const multiplier = topFreqAvg > 0 ? Math.round(hAvg / topFreqAvg) : 0;
    const score = 75 + Math.min(Math.round(h.total / totalAmount * 100), 25);

    candidates.push({
      type: "hidden", score,
      hook: {
        id: "hidden",
        q: "哪裡在不知不覺吃掉你的預算？",
        big: "$" + fmt(h.total),
        bigSub: "「" + h.brand + "」只去 " + h.visits + " 次就花了這麼多——均 $" + fmt(hAvg) + "/次",
        body: "你可能沒意識到，每次去「" + h.brand + "」的花費（$" + fmt(hAvg) + "）" + (multiplier > 2 ? "是去「" + topFreq.brand + "」的 " + multiplier + " 倍" : "遠高於平均") + "。\n\n去的少不代表花的少：",
        ranks: hiddenSpenders.slice(0, 5).map((b, i) => ({
          rank: (i + 1) + "", name: b.brand,
          freq: b.visits + "次 $" + fmt(b.total),
          note: "均$" + Math.round(b.total / b.visits) + " " + (Math.round(b.total / b.visits) > avgPerVisit * 2 ? "⚠️" : ""),
        })),
        tip: "這些通路你不常去所以不會注意，但每次去的金額都很高。" + h.brand + " " + h.visits + " 次 = $" + fmt(h.total) + "，比你去 " + topFreq.visits + " 次「" + topFreq.brand + "」（$" + fmt(topFreq.total) + "）還多。",
        followups: [
          {
            q: "每次去「" + h.brand + "」的 $" + fmt(hAvg) + " 是花在什麼？",
            a: "「" + h.brand + "」屬於「" + h.cat + "」類別。均單價 $" + fmt(hAvg) + "，" + h.visits + " 次累計 $" + fmt(h.total) + "。\n\n如果每次能控制在 $" + fmt(Math.round(hAvg * 0.7)) + " 以內（-30%），一年可省 ~$" + fmt(Math.round(h.total / months.length * 12 * 0.3)) + "。\n\n列個清單或設個預算上限再出門，是最簡單的方式。",
            followups: [
              {
                q: "控制這個通路能省多少？",
                a: (() => {
                  const yearSave = Math.round(h.total / months.length * 12 * 0.3);
                  return "如果每次去「" + h.brand + "」少花 30%：\n\n📉 每年省 ~$" + fmt(yearSave) + "\n\n" + fmtComparisons(yearSave, stats);
                })(),
              },
              {
                q: "有更便宜的替代選擇嗎？",
                a: (() => {
                  const sameCat = cats.find((c) => c.cat === h.cat);
                  const alternatives = sameCat ? sameCat.brands.filter((b) => b.brand !== h.brand && b.visits >= 2).sort((a, b) => (a.total / a.visits) - (b.total / b.visits)) : [];
                  if (alternatives.length > 0) {
                    return "同類別中更便宜的選擇：\n\n" + alternatives.slice(0, 3).map((a) => catIcon(a.cat) + " " + a.brand + "：均 $" + Math.round(a.total / a.visits) + "/次（比" + h.brand + "便宜 " + Math.round((1 - (a.total / a.visits) / hAvg) * 100) + "%）").join("\n");
                  }
                  return "在你目前的消費通路中，「" + h.cat + "」類別沒有明顯更便宜的替代。可以考慮減少頻率或控制單次消費。";
                })(),
              },
            ],
          },
          {
            q: "前 5 大花費佔了多少？",
            a: (() => {
              const top5 = nonBillBrands.slice(0, 5);
              const top5Total = top5.reduce((s, b) => s + b.total, 0);
              const pct = Math.round(top5Total / totalAmount * 100);
              return "前 5 大通路花費（排除帳單）：\n\n" + top5.map((b, i) => (i + 1) + ". " + b.brand + "：$" + fmt(b.total) + "（" + b.visits + " 次，均 $" + Math.round(b.total / b.visits) + "）").join("\n") + "\n\n合計 $" + fmt(top5Total) + "，佔 " + pct + "%。" + (pct < 30 ? "\n\n剩下 " + (100 - pct) + "% 散落在其他通路——零散消費才是真正的黑洞。" : "");
            })(),
            followups: [
              {
                q: "哪筆最值得重新檢視？",
                a: (() => {
                  const highest = hiddenSpenders[0];
                  const yearSave = Math.round(highest.total / months.length * 12 * 0.3);
                  return "「" + highest.brand + "」——均 $" + fmt(Math.round(highest.total / highest.visits)) + "/次是高頻通路中最高的。每次少花 30% 就能年省 $" + fmt(yearSave) + "。";
                })(),
              },
              {
                q: "有可以合併的重複消費嗎？",
                a: (() => {
                  const catBrands = {};
                  brands.filter((b) => b.visits >= 3 && !BILL_CATS.includes(b.cat)).forEach((b) => {
                    if (!catBrands[b.cat]) catBrands[b.cat] = [];
                    catBrands[b.cat].push(b);
                  });
                  const mergeable = Object.entries(catBrands).filter(([, bs]) => bs.length >= 2).map(([cat, bs]) => ({ cat, brands: bs, total: bs.reduce((s, b) => s + b.total, 0) })).sort((a, b) => b.total - a.total);
                  if (!mergeable.length) return "你的消費通路沒有明顯重複。";
                  const m = mergeable[0];
                  return "「" + m.cat + "」分散在 " + m.brands.length + " 家：\n" + m.brands.map((b) => "• " + b.brand + " " + b.visits + "次 $" + fmt(b.total)).join("\n") + "\n\n集中在一家可累積回饋，還能減少衝動消費。";
                })(),
              },
            ],
          },
        ],
      },
    });
  }

  // ── Type: FREQUENCY_CHAMP ─────────────────────────────────────────
  // The thing you visit most often — dependency angle
  const topFreq = brands[0];
  if (topFreq && topFreq.visits >= 5) {
    const freq = (totalDays / topFreq.visits).toFixed(1);
    const isPlatformFee = Math.round(topFreq.total / topFreq.visits) < PLATFORM_FEE_THRESHOLD;
    const score = 80 + Math.min(topFreq.visits, 20);

    candidates.push({
      type: "frequency", score,
      hook: {
        id: "freq",
        q: "你最離不開什麼？",
        big: "每 " + freq + " 天",
        bigSub: "你去「" + topFreq.brand + "」的頻率" + (isPlatformFee ? "（發票為平台服務費）" : ""),
        body: "你在這段期間去了「" + topFreq.brand + "」" + topFreq.visits + " 次" + (isPlatformFee ? "（金額為平台手續費 $" + fmt(topFreq.total) + "，實際餐費另計）" : "，累計 $" + fmt(topFreq.total)) + "。\n\n你的消費依賴排行：",
        ranks: brands.slice(0, 4).map((b, i) => {
          const f = (totalDays / b.visits).toFixed(1);
          const avg = Math.round(b.total / b.visits);
          return { rank: ["🥇", "🥈", "🥉", "4️⃣"][i], name: b.brand, freq: "每" + f + "天", note: avg < PLATFORM_FEE_THRESHOLD ? b.cat + "（平台費）" : b.cat + " · 均$" + avg };
        }),
        tip: "前 4 大通路佔了你 " + Math.round(brands.slice(0, 4).reduce((s, b) => s + b.visits, 0) / invoiceCount * 100) + "% 的消費次數。你的日常生活高度依賴這幾個地方。",
        followups: [
          {
            q: "這個依賴在變強還是變弱？",
            a: (() => {
              const bef = brandFirst[topFreq.brand]?.visits || 0;
              const aft = brandSecond[topFreq.brand]?.visits || 0;
              const befAvg = bef > 0 ? Math.round((brandFirst[topFreq.brand]?.total || 0) / bef) : 0;
              const aftAvg = aft > 0 ? Math.round((brandSecond[topFreq.brand]?.total || 0) / aft) : 0;
              let t = "「" + topFreq.brand + "」前期 " + bef + " 次，近期 " + aft + " 次——" + (aft > bef ? "頻率在增加（+" + (bef > 0 ? Math.round(((aft - bef) / bef) * 100) : "∞") + "%）" : aft < bef ? "頻率有下降" : "差不多") + "。";
              if (befAvg > 0 && aftAvg > 0 && Math.abs(aftAvg - befAvg) > 10) {
                t += "\n\n單次金額 $" + befAvg + " → $" + aftAvg + (aftAvg > befAvg ? "，花的錢也在增加。" : "，但每次花的錢在控制。");
              }
              return t;
            })(),
            followups: [
              {
                q: "如果每週少去 2 次，差多少？",
                a: (() => {
                  const avg = Math.round(topFreq.total / topFreq.visits);
                  const yearlySave = avg * 2 * 52;
                  return "每週少去 2 次「" + topFreq.brand + "」：\n📉 一年省 $" + fmt(yearlySave) + "\n\n" + fmtComparisons(yearlySave, stats) + "\n\n你自己決定。";
                })(),
              },
              {
                q: "有更划算的替代嗎？",
                a: (() => {
                  const sameCat = brands.filter((b) => b.cat === topFreq.cat && b.brand !== topFreq.brand && b.visits >= 2);
                  if (sameCat.length > 0) {
                    return "同類別的其他選擇：\n\n" + sameCat.slice(0, 3).map((b) => catIcon(b.cat) + " " + b.brand + "：" + b.visits + " 次，均 $" + Math.round(b.total / b.visits)).join("\n");
                  }
                  return "你目前在「" + topFreq.cat + "」類別主要靠「" + topFreq.brand + "」。可以嘗試分散到其他通路看看。";
                })(),
              },
            ],
          },
          {
            q: "除了「" + topFreq.brand + "」，還有什麼正在變成習慣？",
            a: (() => {
              const growing = growthList.filter((b) => b.brand !== topFreq.brand).slice(0, 3);
              if (!growing.length) return "目前沒有明顯在增加的新消費。你的通路選擇很穩定。";
              return "成長中的通路：\n\n" + growing.map((g) => catIcon(g.cat) + " " + g.brand + "：前期 " + g.bef + " → 近期 " + g.aft + (g.growth === 999 ? "（新增！）" : "（+" + g.growth + "%）")).join("\n");
            })(),
            followups: [
              {
                q: "哪個新習慣花費最高？",
                a: (() => {
                  const topGrow = growthList.filter((b) => b.brand !== topFreq.brand).sort((a, b) => b.total - a.total)[0];
                  if (!topGrow) return "沒有明顯高花費的新習慣。";
                  return "「" + topGrow.brand + "」——近期 " + topGrow.aft + " 次，累計 $" + fmt(topGrow.total) + "（均 $" + Math.round(topGrow.total / topGrow.visits) + "/次）。照這趨勢，一年約 $" + fmt(Math.round(topGrow.total / months.length * 12)) + "。";
                })(),
              },
              {
                q: "我的消費版圖在擴大嗎？",
                a: (() => {
                  const firstBrandCount = Object.keys(brandFirst).length;
                  const secondBrandCount = Object.keys(brandSecond).length;
                  return "前期你消費了 " + firstBrandCount + " 個通路，近期 " + secondBrandCount + " 個。" + (secondBrandCount > firstBrandCount ? "\n\n消費版圖在擴大——新通路在增加，但舊通路沒有被取代。" : "\n\n版圖大致穩定。");
                })(),
              },
            ],
          },
        ],
      },
    });
  }

  // ── Type: CATEGORY_DOMINANCE ──────────────────────────────────────
  // One category eating a huge chunk — excluding 其他 and bills
  const realCats = cats.filter((c) => c.cat !== "其他" && !BILL_CATS.includes(c.cat));
  const topCat = realCats[0];
  if (topCat && topCat.total > totalAmount * 0.15) {
    const pct = Math.round(topCat.total / totalAmount * 100);
    const score = 65 + pct;

    candidates.push({
      type: "dominance", score,
      hook: {
        id: "dominance",
        q: "你的錢 " + pct + "% 花在哪？",
        big: pct + "%",
        bigSub: "「" + topCat.cat + "」吃掉了你 " + pct + "% 的消費",
        body: "你的 $" + fmt(totalAmount) + " 消費中，「" + topCat.cat + "」佔了 $" + fmt(topCat.total) + "（" + pct + "%）。\n\n這個類別的消費分布：",
        ranks: topCat.brands.sort((a, b) => b.total - a.total).slice(0, 5).map((b, i) => ({
          rank: (i + 1) + "", name: b.brand,
          freq: b.visits + "次 $" + fmt(b.total),
          note: "均$" + Math.round(b.total / b.visits) + "（佔" + Math.round(b.total / topCat.total * 100) + "%）",
        })),
        tip: "單一類別超過 " + pct + "% 代表你的預算高度集中。了解裡面的細項分布，才知道要不要調整。",
        followups: [
          {
            q: "這個類別的花費合理嗎？",
            a: (() => {
              const monthly = Math.round(topCat.total / months.length);
              const yearly = monthly * 12;
              return "「" + topCat.cat + "」每月約 $" + fmt(monthly) + "，一年 $" + fmt(yearly) + "。\n\n" + fmtComparisons(yearly, stats) + "\n\n合不合理你最清楚，但至少現在你知道數字了。";
            })(),
            followups: [
              {
                q: "如果砍 20%，能省多少？",
                a: (() => {
                  const save = Math.round(topCat.total / months.length * 12 * 0.2);
                  return "砍 20% = 每年省 $" + fmt(save) + "。\n\n" + fmtComparisons(save, stats);
                })(),
              },
              {
                q: "這個類別在增加還是穩定？",
                a: (() => {
                  const catBef = Object.entries(stats.brandFirst).filter(([k]) => brands.find((b) => b.brand === k)?.cat === topCat.cat).reduce((s, [, v]) => s + v.total, 0);
                  const catAft = Object.entries(stats.brandSecond).filter(([k]) => brands.find((b) => b.brand === k)?.cat === topCat.cat).reduce((s, [, v]) => s + v.total, 0);
                  const change = catBef > 0 ? Math.round(((catAft - catBef) / catBef) * 100) : 0;
                  return "「" + topCat.cat + "」前期 $" + fmt(catBef) + " → 近期 $" + fmt(catAft) + (change > 10 ? "（+" + change + "%，在增加）" : change < -10 ? "（" + change + "%，在減少）" : "（穩定）") + "。";
                })(),
              },
            ],
          },
          {
            q: "其他類別各佔多少？",
            a: "你的消費類別分布：\n\n" + realCats.slice(0, 6).map((c) => catIcon(c.cat) + " " + c.cat + "：$" + fmt(c.total) + "（" + Math.round(c.total / totalAmount * 100) + "%）").join("\n"),
            followups: [
              {
                q: "哪個類別最值得優化？",
                a: (() => {
                  const highFreqCat = realCats.filter((c) => c.visits > 10).sort((a, b) => (b.total / b.visits) - (a.total / a.visits))[0];
                  if (!highFreqCat) return "目前各類別都還算合理。";
                  return "「" + highFreqCat.cat + "」——" + highFreqCat.visits + " 次，均 $" + Math.round(highFreqCat.total / highFreqCat.visits) + "/次。高頻高單價的類別最容易優化，降低單次消費就能有感。";
                })(),
              },
              {
                q: "有哪些是固定支出？",
                a: (() => {
                  const fixed = cats.filter((c) => BILL_CATS.includes(c.cat));
                  if (!fixed.length) return "你的發票中沒有明顯的固定帳單支出。";
                  const fixedTotal = fixed.reduce((s, c) => s + c.total, 0);
                  return "固定支出（帳單）：\n\n" + fixed.map((c) => catIcon(c.cat) + " " + c.cat + "：$" + fmt(c.total)).join("\n") + "\n\n合計 $" + fmt(fixedTotal) + "（佔 " + Math.round(fixedTotal / totalAmount * 100) + "%）。這些是剛性支出，優化空間有限。";
                })(),
              },
            ],
          },
        ],
      },
    });
  }

  // ── Type: PROJECTION ──────────────────────────────────────────────
  // Future projection — always relevant
  const trendData = (monthlyTrend && monthlyTrend.length > 0)
    ? monthlyTrend.map((m) => ({ label: m.month, value: m.amount }))
    : months.map((m) => ({ label: (m.ym.split("-")[1] || "") + "月", value: m.total }));
  const trendValues = trendData.map((t) => t.value);
  const trendLabels = trendData.map((t) => t.label);
  const monthlyAvg = trendValues.length > 0 ? Math.round(trendValues.reduce((s, v) => s + v, 0) / trendValues.length) : 0;
  const recentAvg = trendValues.slice(-3).length > 0 ? Math.round(trendValues.slice(-3).reduce((s, v) => s + v, 0) / trendValues.slice(-3).length) : 0;
  const yearProjection = Math.round(recentAvg * 12);

  if (yearProjection > 0) {
    const trendDirection = recentAvg > monthlyAvg * 1.1 ? "up" : recentAvg < monthlyAvg * 0.9 ? "down" : "stable";
    const score = 60 + (trendDirection === "up" ? 20 : 10);

    candidates.push({
      type: "projection", score,
      hook: {
        id: "projection",
        q: "照這樣下去，一年會花多少？",
        big: "$" + fmt(yearProjection),
        bigSub: "照近 3 個月趨勢推算的年消費",
        body: "你的月均消費 $" + fmt(monthlyAvg) + "，近 3 個月均 $" + fmt(recentAvg) + (trendDirection === "up" ? "——消費在加速。" : trendDirection === "down" ? "——有在控制。" : "——大致穩定。"),
        trend: trendValues,
        trendLabels,
        trendLabel: "每月消費趨勢",
        trendColor: trendDirection === "up" ? "#E8453C" : trendDirection === "down" ? "#34C759" : "#007AFF",
        tip: "月均 $" + fmt(monthlyAvg) + " 聽起來還好，但年化就是 $" + fmt(yearProjection) + "。" + (trendDirection === "up" ? "而且趨勢還在上升。" : ""),
        followups: [
          {
            q: "一年的花費換算成什麼？",
            a: "一年預估 $" + fmt(yearProjection) + "：\n\n" + fmtComparisons(yearProjection, stats) + "\n\n都是從你的真實消費推算的。",
            followups: [
              {
                q: "省 10% 可以做什麼？",
                a: (() => {
                  const save = Math.round(yearProjection * 0.1);
                  return "10% = $" + fmt(save) + "/年：\n\n" + fmtComparisons(save, stats) + "\n\n不需要大改，調整幾個高頻消費就夠了。";
                })(),
              },
              {
                q: "哪個月花最多？",
                a: (() => {
                  const max = trendData.reduce((a, b) => a.value > b.value ? a : b);
                  return max.label + " 花了 $" + fmt(max.value) + "——是最高的月份。可能有大額消費或季節性支出。";
                })(),
              },
            ],
          },
          {
            q: "最容易省的是什麼？",
            a: (() => {
              // Find high-freq low-priority categories
              const convCat = cats.find((c) => c.cat === "超商");
              const drinkCat = cats.find((c) => c.cat === "飲料" || c.cat === "咖啡");
              let t = "最容易省的是「高頻小額」消費：\n\n";
              if (convCat) t += "🏪 超商：$" + fmt(convCat.total) + "（" + convCat.visits + " 次）——固定品項改超市買可省 20-30%\n";
              if (drinkCat) t += catIcon(drinkCat.cat) + " " + drinkCat.cat + "：$" + fmt(drinkCat.total) + "（" + drinkCat.visits + " 次）——減少頻率最直接\n";
              return t || "檢視你的高頻消費，小額調整累積起來就很可觀。";
            })(),
            followups: [
              {
                q: "具體怎麼做最有效？",
                a: (() => {
                  const conv = cats.find((c) => c.cat === "超商");
                  const market = brands.find((b) => b.cat === "超市");
                  if (conv && market) {
                    const save = Math.round(conv.total / months.length * 12 * 0.25);
                    return "把超商的固定品項改在「" + market.brand + "」買：\n📉 同品項省 20-30%\n📉 一年省 ~$" + fmt(save) + "\n\n你已經固定去" + market.brand + "，多帶幾樣就好。最無痛的省錢法。";
                  }
                  return "找出你最高頻的消費，每次少花 20% 就能年省數萬。";
                })(),
              },
              {
                q: "不省的話，未來趨勢？",
                a: (() => {
                  const growth = recentAvg > monthlyAvg ? Math.round(((recentAvg - monthlyAvg) / monthlyAvg) * 100) : 0;
                  const twoYear = Math.round(yearProjection * (1 + growth / 100));
                  return growth > 5 ? "照 +" + growth + "% 的趨勢，兩年後年消費可能到 $" + fmt(twoYear) + "。\n\n消費習慣有慣性，越早調整越輕鬆。" : "目前趨勢平穩，維持現狀就好。";
                })(),
              },
            ],
          },
        ],
      },
    });
  }

  // ── Pick top 4, sort by score ─────────────────────────────────────
  candidates.sort((a, b) => b.score - a.score);
  const picked = candidates.slice(0, 4);
  const hooks = picked.map((c) => c.hook);

  // ── Dynamic bridge sentences ──────────────────────────────────────
  const bridges = [];
  for (let i = 0; i < hooks.length - 1; i++) {
    const curr = picked[i];
    const next = picked[i + 1];
    const bridgeMap = {
      "frequency→growth": "知道了你最依賴什麼。但有些消費正在悄悄擴張中——",
      "frequency→hidden": "知道了你去最多的地方。但真正吃掉預算的，可能不是你想的那些——",
      "frequency→dominance": "知道了你的消費依賴。接下來看看你的錢到底集中在哪個類別——",
      "frequency→projection": "知道了你最常去哪。但照這個花法，一年下來呢？",
      "growth→hidden": "看到了什麼在擴張。但還有些「低頻高消費」的隱形殺手——",
      "growth→dominance": "新習慣在增加。來看看整體類別分布——你的錢主要花在哪？",
      "growth→projection": "新習慣會持續燒錢。照目前趨勢，一年後呢？",
      "hidden→growth": "找到了隱形高消費。同時有些新習慣正在快速形成——",
      "hidden→dominance": "知道了哪裡在偷吃預算。來看看整體分布——",
      "hidden→projection": "找到了隱形殺手。如果不調整，一年後呢？",
      "dominance→growth": "看到了消費集中的地方。同時有些新趨勢在發生——",
      "dominance→hidden": "知道了類別分布。但有些通路在不知不覺中吃掉你的預算——",
      "dominance→projection": "知道了錢花在哪。照這樣下去，一年呢？",
      "projection→growth": "看到了未來預估。來看看哪些消費正在加速——",
      "projection→hidden": "知道了年花費。但有些你沒注意到的通路特別吃預算——",
      "projection→dominance": "看到了整體數字。來看看具體花在哪個類別——",
    };
    bridges.push(bridgeMap[curr.type + "→" + next.type] || "接下來看看另一個有趣的發現——");
  }

  // ── Summary ───────────────────────────────────────────────────────
  const topBrand = brands[0];
  const topGrowth = growthList[0];
  const summaryParts = [];
  if (topBrand) summaryParts.push("最依賴「" + topBrand.brand + "」（每 " + (totalDays / topBrand.visits).toFixed(1) + " 天）");
  if (topGrowth) summaryParts.push("「" + topGrowth.brand + "」成長最快（" + (topGrowth.growth === 999 ? "新增" : "+" + topGrowth.growth + "%") + "）");
  if (hiddenSpenders[0]) summaryParts.push("「" + hiddenSpenders[0].brand + "」是隱形高消費（均 $" + Math.round(hiddenSpenders[0].total / hiddenSpenders[0].visits) + "/次）");
  const summary = "分析完你的 " + invoiceCount + " 張發票。" + summaryParts.join("；") + "。";

  return { hooks, bridges, summary };
}

export { detectInsights, fmtComparisons };
