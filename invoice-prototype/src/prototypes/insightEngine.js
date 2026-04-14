/**
 * Insight Engine — 從用戶真實消費數據中挖掘最有衝擊力的洞察
 * 動態生成 4-5 個 Hook，每個有 2 追問 × 2 深追問
 * v2: excludes delivery platforms and online bulk stores from item analysis
 */
import { resolveShop } from "./shopMapping";
import { classifyItem, aggregateItemCategories } from "./itemClassifier";

const fmt = (n) => n.toLocaleString();
const catIcon = (cat) => ({ "外送": "🛵", "速食": "🍔", "超商": "🏪", "超市": "🛒", "咖啡": "☕", "飲料": "🧋", "餐飲": "🍽", "網購": "📦", "美妝": "💄", "訂閱": "📱", "加油": "⛽", "量販": "🛒", "百貨": "🏬", "停車": "🅿️", "電影娛樂": "🎬", "運動": "💪" }[cat] || "📌");
const itemCatIcon = (cat) => ({ "咖啡": "☕", "茶飲": "🍵", "手搖飲": "🧋", "瓶裝飲料": "🥤", "乳製品": "🥛", "速食餐點": "🍔", "便當/正餐": "🍱", "麵包/烘焙": "🍞", "零食/餅乾": "🍪", "滷味/小食": "🥚", "生鮮蔬果": "🥬", "生鮮肉品": "🥩", "衛生紙/面紙": "🧻", "洗髮/沐浴": "🧴", "美妝保養": "💄", "生理用品": "🩹", "外送服務費": "🛵", "訂閱服務": "📱", "加油": "⛽" }[cat] || "📦");

// Group benchmarks — average prices from 9 test users
// FMCG: compared across 超商+超市 together (same product, different store)
// Store-specific: only compared within same store type
const GROUP_BENCHMARKS = {
  // FMCG — cross 超商/超市 (same products exist in both)
  "瓶裝飲料@零售": { cat: "瓶裝飲料", scope: "超商+超市", groupAvg: 29, groupMin: 22, groupMax: 39, users: 9, isFmcg: true },
  "乳製品@零售": { cat: "乳製品", scope: "超商+超市", groupAvg: 52, groupMin: 32, groupMax: 80, users: 9, isFmcg: true },
  "零食@零售": { cat: "零食", scope: "超商+超市", groupAvg: 46, groupMin: 30, groupMax: 53, users: 6, isFmcg: true },
  // Store-specific — within same type only
  "咖啡@超商": { cat: "咖啡", scope: "超商", groupAvg: 55, groupMin: 35, groupMax: 68, users: 6, isFmcg: false },
  "鮮食@超商": { cat: "鮮食", scope: "超商", groupAvg: 48, groupMin: 36, groupMax: 62, users: 8, isFmcg: false },
};
const STORE_TYPE_MAP = {
  "7-11": "超商", "全家": "超商", "萊爾富": "超商",
  "全聯": "超市", "家樂福便利購": "超市", "美廉社": "超市",
  "麥當勞": "速食", "肯德基": "速食", "摩斯漢堡": "速食",
};

// Exclude bill-type categories from "surprise" insights
const BILL_CATS = ["電費", "水費", "瓦斯費", "電信費", "網路"];
const PLATFORM_FEE_THRESHOLD = 50; // avg < $50 likely platform fee only
// Delivery platforms — invoices are service fees, not actual food purchases
const DELIVERY_PLATFORMS = ["ubereats", "uber eats", "foodpanda", "uber", "外送"];
function isDeliveryPlatform(shopName) {
  if (!shopName) return false;
  const lower = shopName.toLowerCase();
  return DELIVERY_PLATFORMS.some((p) => lower.includes(p));
}
// Online/bulk stores — box purchases vs single items aren't comparable for price gap
const ONLINE_BULK = ["momo", "蝦皮", "shopee", "酷澎", "coupang", "好市多", "costco", "pchome", "yahoo"];
function isOnlineBulk(shop) { return ONLINE_BULK.some((k) => (shop || "").toLowerCase().includes(k)); }

// Subscription detection — strict keyword match for real subscriptions only
const SUB_KEYWORDS = ["訂閱", "月費", "會員訂閱", "uber one", "pandapro", "panda pro", "蝦皮vip"];
const SUB_EXCLUDE = ["apple store", "momo", "shopee蝦皮購物"]; // one-time purchases, not subscriptions
function detectSubscriptions(invoices) {
  const subs = {};
  invoices.forEach((inv) => {
    (inv.items || []).forEach((it) => {
      const itemLower = (it.name || "").toLowerCase();
      const shopLower = (inv.shop || "").toLowerCase();
      // Skip excluded stores (unless the item itself says 訂閱/月費)
      const isExcludedShop = SUB_EXCLUDE.some((ex) => shopLower.includes(ex));
      const isSubItem = SUB_KEYWORDS.some((kw) => itemLower.includes(kw));
      if (!isSubItem) return;
      if (isExcludedShop && !itemLower.includes("訂閱") && !itemLower.includes("月費")) return;
      // Deduplicate by service name
      const key = inv.shop + "_" + Math.round(it.price);
      if (!subs[key]) subs[key] = { shop: inv.shop, item: it.name, price: it.price, count: 0, dates: [] };
      subs[key].count++;
      subs[key].dates.push(inv.issued_at || inv.yearMonth || "");
    });
  });
  // Also detect delivery platform subscription fees specifically
  invoices.forEach((inv) => {
    if (!isDeliveryPlatform(inv.shop)) return;
    (inv.items || []).forEach((it) => {
      const itemLower = (it.name || "").toLowerCase();
      if (itemLower.includes("訂閱") || itemLower.includes("月費") || itemLower.includes("uber one") || itemLower.includes("pandapro")) {
        const key = inv.shop + "_sub";
        if (!subs[key]) subs[key] = { shop: inv.shop, item: it.name, price: it.price, count: 0, dates: [] };
        subs[key].count++;
        subs[key].dates.push(inv.issued_at || "");
      }
    });
  });
  return Object.values(subs).sort((a, b) => b.price - a.price);
}

// ── Stats computation ───────────────────────────────────────────────
// v2 data has clean shop names from BQ channel table — use directly, only resolve for category
function resolveV2Shop(shopName) {
  // Try resolveShop for category, but keep the original name as brand
  const resolved = resolveShop(shopName);
  // If resolveShop found a mapping, use its category but keep original display name
  return { brand: shopName, cat: resolved.cat };
}

export function computeStats(invoices) {
  // Detect v2: has "items" or "hour" field
  const isV2 = invoices.length > 0 && (invoices[0].items || invoices[0].hour !== undefined);
  const brandMap = {};
  invoices.forEach((inv) => {
    const { brand, cat } = isV2 ? resolveV2Shop(inv.shop) : resolveShop(inv.shop);
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
  // Exclude delivery platforms for "top brand" analysis (their invoices are just service fees)
  const brandsReal = brands.filter((b) => !isDeliveryPlatform(b.brand));
  const brandsRealByTotal = brandsByTotal.filter((b) => !isDeliveryPlatform(b.brand));

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
    const { brand } = isV2 ? resolveV2Shop(inv.shop) : resolveShop(inv.shop);
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

  return { brands, brandsByTotal, brandsReal, brandsRealByTotal, cats, months, totalAmount, totalDays, avgPerVisit, brandFirst, brandSecond, firstKeys, secondKeys };
}

// ── Personalized comparisons（消費心理學框架）────────────────────────
// Layer 1: Self-anchoring — 用自己的消費做錨點（最有感）
// Layer 2: Experiential alternative — 體驗型替代（旅行、聚餐、課程）
// Layer 3: Daily loss frame — 日均損失框架（Loss Aversion + 時間粒度）
function fmtComparisons(amount, stats) {
  const { brands, cats, months, totalAmount, totalDays } = stats;
  const lines = [];

  // ── Layer 1: 自我消費錨點 ─────────────────────────────────────────
  // 「這筆錢 = 你去全聯 X 次大採購」— 用你已經在做的事來比
  const anchors = brands.filter((b) => b.visits >= 5 && !BILL_CATS.includes(b.cat) && b.cat !== "其他")
    .map((b) => ({ brand: b.brand, cat: b.cat, avg: Math.round(b.total / b.visits) }))
    .filter((b) => b.avg > 30);
  if (anchors.length > 0) {
    // Pick one with medium avg (not too cheap, not too expensive) for relatable comparison
    const anchor = anchors.sort((a, b) => Math.abs(a.avg - 200) - Math.abs(b.avg - 200))[0];
    const times = Math.round(amount / anchor.avg);
    if (times >= 2) {
      lines.push(catIcon(anchor.cat) + " 等於你去「" + anchor.brand + "」" + times + " 次（均 $" + anchor.avg + "）");
    }
  }

  // ── Layer 2: 體驗型替代（體驗 > 物質）─────────────────────────────
  // 研究顯示體驗型消費的幸福感遠大於物質消費
  // 2026 真實價格：廉航東京來回 $5,000、傳統航空 $14,000、國內兩天一夜 $5,000/人、聚餐人均 $600
  const experiences = [];
  if (amount >= 20000) {
    experiences.push("✈️ 一趟東京 5 天自由行（傳統航空來回 $14,000 + 住宿餐飲）");
  } else if (amount >= 10000) {
    experiences.push("✈️ 一趟東京 3 天快閃（廉航來回 $5,000 + 住宿）");
  } else if (amount >= 5000) {
    experiences.push("🏖️ 一趟國內兩天一夜小旅行（住宿 + 交通 + 吃喝）");
  }
  // 社交聚餐 — 人均 $600 的好餐廳
  const meals = Math.round(amount / 600);
  if (meals >= 2) {
    experiences.push("🍽️ 跟朋友吃 " + meals + " 次好餐廳（人均 $600）");
  }
  // 健身 — World Gym 月費 $988 取中間值
  if (amount >= 3000) {
    experiences.push("💪 " + Math.round(amount / 988) + " 個月的健身房會員");
  }
  lines.push(...experiences.slice(0, 2));

  // ── Layer 3: 日均損失框架 ─────────────────────────────────────────
  // 「每天 $X 正在從你的口袋溜走」— Loss Aversion 是得到的 2 倍痛
  // 2026 真實價格：路易莎拿鐵 $100、星巴克拿鐵 $155、路易莎美式 $55
  const daily = Math.round(amount / 365);
  if (daily > 0) {
    // Use real coffee prices as daily anchors
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
      lines.push("💸 每天 $" + daily + " 正在溜走——等於每天丟掉" + dailyRef);
    } else if (daily >= 10) {
      lines.push("💸 每天 $" + daily + " 不知不覺流出去");
    }
  }

  if (lines.length === 0) {
    return "這筆 $" + fmt(amount) + " 積少成多，值得注意。";
  }
  return lines.slice(0, 4).join("\n");
}

// ── Helper: get top items for a brand ───────────────────────────────
function getTopItemsForBrand(invoices, brandName, limit) {
  const items = {};
  invoices.forEach((inv) => {
    const shop = inv.shop || "";
    if (shop !== brandName) return;
    (inv.items || []).forEach((it) => {
      const n = it.name;
      if (!n) return;
      if (!items[n]) items[n] = { name: n, count: 0, total: 0, cat: classifyItem(n) };
      items[n].count += it.qty || 1;
      items[n].total += it.price || 0;
    });
  });
  return Object.values(items).sort((a, b) => b.count - a.count).slice(0, limit || 5);
}

function fmtTopItems(items) {
  if (!items.length) return "";
  return items.map((it) => itemCatIcon(it.cat) + " " + it.name + "（" + it.count + " 次 $" + fmt(Math.round(it.total)) + "）").join("\n");
}

// ── Insight candidates ──────────────────────────────────────────────

function detectInsights(stats, invoiceCount, totalAmount, monthlyTrend, invoices) {
  const { brands, brandsByTotal, brandsReal, brandsRealByTotal, cats, months, totalDays, avgPerVisit, brandFirst, brandSecond, firstKeys, secondKeys } = stats;
  invoices = invoices || [];
  const hasItems = invoices.some((inv) => inv.items && inv.items.length > 0);
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
        body: (() => {
          let t = isNew
            ? "「" + g.brand + "」在前期完全沒有出現，但近期已經去了 " + g.aft + " 次，累計 $" + fmt(g.total) + "。"
            : "「" + g.brand + "」的消費頻率從前期 " + g.bef + " 次飆到近期 " + g.aft + " 次（+" + g.growth + "%）。";
          if (hasItems) {
            const topIt = getTopItemsForBrand(invoices, g.brand, 3);
            if (topIt.length) t += "\n\n你在「" + g.brand + "」最常買：" + topIt.map((it) => it.name).join("、") + "。";
          }
          t += "\n\n這" + (isNew ? "是一個正在形成的新消費習慣" : "個增長速度代表它正在變成「固定消費」") + "。";
          return t;
        })(),
        ranks: growthList.slice(0, 4).map((x, i) => {
          const topIt = hasItems ? getTopItemsForBrand(invoices, x.brand, 1)[0] : null;
          return {
            rank: x.growth === 999 ? "🆕" : "📈",
            name: x.brand, freq: x.bef + " → " + x.aft + " 次",
            note: (topIt ? topIt.name + " · " : "") + (x.growth === 999 ? "新增！" : "+" + x.growth + "%"),
          };
        }),
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

  // ── Type: SPENDING_CREEP ────────────────────────────────────────────
  // Brands where average-per-visit is creeping up — the real overconsumption signal
  const nonBillBrands = brandsByTotal.filter((b) => !BILL_CATS.includes(b.cat) && b.cat !== "其他");
  const creepingBrands = brands.filter((b) => {
    const bef = brandFirst[b.brand];
    const aft = brandSecond[b.brand];
    if (!bef || !aft || bef.visits < 3 || aft.visits < 3) return false;
    if (BILL_CATS.includes(b.cat) || b.cat === "其他") return false;
    const avgBef = Math.round(bef.total / bef.visits);
    const avgAft = Math.round(aft.total / aft.visits);
    b._avgBef = avgBef;
    b._avgAft = avgAft;
    b._avgCreep = avgBef > 0 ? Math.round(((avgAft - avgBef) / avgBef) * 100) : 0;
    return b._avgCreep > 15; // avg increased >15%
  }).sort((a, b) => b._avgCreep - a._avgCreep);

  if (creepingBrands.length > 0) {
    const c = creepingBrands[0];
    const extraPerVisit = c._avgAft - c._avgBef;
    const extraYearly = Math.round(extraPerVisit * (c.visits / months.length) * 12);
    const score = 80 + Math.min(c._avgCreep, 20);

    candidates.push({
      type: "creep", score,
      hook: {
        id: "creep",
        q: "哪裡每次花的錢越來越多？",
        big: "+" + c._avgCreep + "%",
        bigSub: "「" + c.brand + "」每次消費從 $" + fmt(c._avgBef) + " 升到 $" + fmt(c._avgAft),
        body: "去的次數沒變多，但每次花的錢在悄悄增加。這種「均價爬升」是最不容易察覺的過度消費：",
        ranks: creepingBrands.slice(0, 5).map((b, i) => ({
          rank: "📈", name: b.brand,
          freq: "$" + b._avgBef + " → $" + b._avgAft,
          note: "+" + b._avgCreep + "%（" + b.cat + "）",
        })),
        tip: "「" + c.brand + "」每次多花 $" + extraPerVisit + " 看起來不多，但累積一年就是多花 $" + fmt(extraYearly) + "。均價爬升是最隱形的預算殺手——因為你不會注意到每次「只是多了一點」。",
        followups: [
          {
            q: "每次多花的錢累積起來有多少？",
            a: (() => {
              const items = creepingBrands.slice(0, 3).map((b) => {
                const extra = b._avgAft - b._avgBef;
                const yearly = Math.round(extra * (b.visits / months.length) * 12);
                return catIcon(b.cat) + " " + b.brand + "：每次多 $" + extra + "，一年多花 $" + fmt(yearly);
              });
              const totalExtra = creepingBrands.slice(0, 3).reduce((s, b) => s + Math.round((b._avgAft - b._avgBef) * (b.visits / months.length) * 12), 0);
              return "均價上升造成的額外支出：\n\n" + items.join("\n") + "\n\n合計每年多花 $" + fmt(totalExtra) + "——你的消費習慣沒變，但花的錢變多了。\n\n" + fmtComparisons(totalExtra, stats);
            })(),
            followups: [
              {
                q: "怎麼控制均價不繼續漲？",
                a: (() => {
                  return "最有效的方法：\n\n1️⃣ 設定每次消費上限（例如「" + c.brand + "」控制在 $" + fmt(c._avgBef) + " 以內）\n2️⃣ 出門前列清單，避免「順便加購」\n3️⃣ 注意促銷陷阱——買多不一定省，反而可能拉高均價\n\n關鍵是回到之前的均價水準（$" + fmt(c._avgBef) + "），而不是少去。";
                })(),
              },
              {
                q: "是什麼原因讓均價在漲？",
                a: (() => {
                  const catBrands = brands.filter((b) => b.cat === c.cat && b._avgCreep > 0);
                  const isCatWide = catBrands.length > 1;
                  return isCatWide
                    ? "不只「" + c.brand + "」——整個「" + c.cat + "」類別的均價都在上升。可能是物價因素，也可能是你的消費升級（選了更貴的品項）。\n\n值得檢視你是否在不知不覺中「升級」了日常消費的規格。"
                    : "可能的原因：\n\n• 選了更多/更貴的品項（消費升級）\n• 促銷買多（看似省但總額更高）\n• 「順便」加購增加了每次消費\n\n如果是有意識的升級那就沒問題，怕的是不知不覺中越花越多。";
                })(),
              },
            ],
          },
          {
            q: "有沒有均價在下降的通路？",
            a: (() => {
              const decreasing = brands.filter((b) => {
                const bef = brandFirst[b.brand];
                const aft = brandSecond[b.brand];
                if (!bef || !aft || bef.visits < 3 || aft.visits < 3) return false;
                if (BILL_CATS.includes(b.cat) || b.cat === "其他") return false;
                const avgBef = Math.round(bef.total / bef.visits);
                const avgAft = Math.round(aft.total / aft.visits);
                b._decBef = avgBef;
                b._decAft = avgAft;
                b._decPct = avgBef > 0 ? Math.round(((avgAft - avgBef) / avgBef) * 100) : 0;
                return b._decPct < -10;
              }).sort((a, b) => a._decPct - b._decPct);
              if (!decreasing.length) return "目前沒有均價明顯下降的通路。所有通路的單次消費都在持平或上升。";
              return "有幾個通路的均價在下降（代表你有在控制）：\n\n" + decreasing.slice(0, 3).map((b) => "📉 " + b.brand + "：$" + b._decBef + " → $" + b._decAft + "（" + b._decPct + "%）").join("\n") + "\n\n這些地方你消費得越來越精準，值得肯定。";
            })(),
            followups: [
              {
                q: "整體均價趨勢？",
                a: (() => {
                  const firstTotal = Object.values(brandFirst).reduce((s, v) => s + v.total, 0);
                  const firstVisits = Object.values(brandFirst).reduce((s, v) => s + v.visits, 0);
                  const secondTotal = Object.values(brandSecond).reduce((s, v) => s + v.total, 0);
                  const secondVisits = Object.values(brandSecond).reduce((s, v) => s + v.visits, 0);
                  const overallBef = firstVisits > 0 ? Math.round(firstTotal / firstVisits) : 0;
                  const overallAft = secondVisits > 0 ? Math.round(secondTotal / secondVisits) : 0;
                  const change = overallBef > 0 ? Math.round(((overallAft - overallBef) / overallBef) * 100) : 0;
                  return "整體均價：前期 $" + fmt(overallBef) + "/次 → 近期 $" + fmt(overallAft) + "/次（" + (change >= 0 ? "+" : "") + change + "%）。\n\n" + (change > 10 ? "整體單次消費在上升，不只是個別通路的問題。" : change < -5 ? "整體均價在下降，你花得更精準了。" : "整體均價大致穩定。");
                })(),
              },
              {
                q: "哪個通路最值得學習？",
                a: (() => {
                  const bestControl = brands.filter((b) => {
                    const bef = brandFirst[b.brand];
                    const aft = brandSecond[b.brand];
                    return bef && aft && bef.visits >= 3 && aft.visits >= 3 && !BILL_CATS.includes(b.cat);
                  }).map((b) => {
                    const avgBef = Math.round(brandFirst[b.brand].total / brandFirst[b.brand].visits);
                    const avgAft = Math.round(brandSecond[b.brand].total / brandSecond[b.brand].visits);
                    return { brand: b.brand, cat: b.cat, avgBef, avgAft, change: avgBef > 0 ? Math.round(((avgAft - avgBef) / avgBef) * 100) : 0 };
                  }).filter((b) => b.change <= 0 && b.avgBef > 100).sort((a, b) => a.change - b.change);
                  if (!bestControl.length) return "目前各通路的均價都在持平或上升。";
                  const best = bestControl[0];
                  return "「" + best.brand + "」做得最好——均價從 $" + best.avgBef + " 降到 $" + best.avgAft + "（" + best.change + "%）。\n\n你在「" + best.cat + "」的消費越來越精準，把這個方法套用到其他通路看看。";
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
        body: (() => {
          let t = "你在這段期間去了「" + topFreq.brand + "」" + topFreq.visits + " 次" + (isPlatformFee ? "（金額為平台手續費 $" + fmt(topFreq.total) + "，實際餐費另計）" : "，累計 $" + fmt(topFreq.total)) + "。";
          if (hasItems) {
            const topItems = getTopItemsForBrand(invoices, topFreq.brand, 3);
            if (topItems.length > 0) {
              t += "\n\n你在「" + topFreq.brand + "」最常買的：" + topItems.map((it) => it.name).join("、") + "。";
            }
          }
          t += "\n\n你的消費依賴排行：";
          return t;
        })(),
        ranks: brands.slice(0, 4).map((b, i) => {
          const f = (totalDays / b.visits).toFixed(1);
          const avg = Math.round(b.total / b.visits);
          const topIt = hasItems ? getTopItemsForBrand(invoices, b.brand, 1)[0] : null;
          return { rank: ["🥇", "🥈", "🥉", "4️⃣"][i], name: b.brand, freq: "每" + f + "天", note: (topIt ? topIt.name + " · " : "") + (avg < PLATFORM_FEE_THRESHOLD ? b.cat + "（平台費）" : "均$" + avg) };
        }),
        tip: (() => {
          let t = "前 4 大通路佔了你 " + Math.round(brands.slice(0, 4).reduce((s, b) => s + b.visits, 0) / invoiceCount * 100) + "% 的消費次數。";
          if (hasItems) {
            const allItems = {};
            invoices.forEach((inv) => (inv.items || []).forEach((it) => {
              if (!it.name) return;
              const cat = classifyItem(it.name);
              if (cat === "其他" || cat === "外送服務費" || cat === "餐飲消費") return;
              if (!allItems[it.name]) allItems[it.name] = 0;
              allItems[it.name] += it.qty || 1;
            }));
            const topAllItem = Object.entries(allItems).sort((a, b) => b[1] - a[1])[0];
            if (topAllItem) t += " 你所有消費中買最多的品項是「" + topAllItem[0] + "」（" + topAllItem[1] + " 次）。";
          }
          return t;
        })(),
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
              let t = "成長中的通路：\n\n" + growing.map((g) => {
                let line = catIcon(g.cat) + " " + g.brand + "：前期 " + g.bef + " → 近期 " + g.aft + (g.growth === 999 ? "（新增！）" : "（+" + g.growth + "%）");
                if (hasItems) {
                  const topIt = getTopItemsForBrand(invoices, g.brand, 2);
                  if (topIt.length) line += "\n  常買：" + topIt.map((it) => it.name).join("、");
                }
                return line;
              }).join("\n\n");
              return t;
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

  // ── Type: POSITIVE_SIGNAL ──────────────────────────────────────────
  // Brands where avg-per-visit is stable or DECREASING — "你其實做得不錯"
  const stableBrands = brands.filter((b) => {
    const bef = brandFirst[b.brand];
    const aft = brandSecond[b.brand];
    if (!bef || !aft || bef.visits < 3 || aft.visits < 3) return false;
    if (BILL_CATS.includes(b.cat) || b.cat === "其他") return false;
    const avgBef = Math.round(bef.total / bef.visits);
    const avgAft = Math.round(aft.total / aft.visits);
    b._posBef = avgBef;
    b._posAft = avgAft;
    b._posChange = avgBef > 0 ? Math.round(((avgAft - avgBef) / avgBef) * 100) : 0;
    return b._posChange <= 0 && avgBef > 50; // avg decreased or stayed same, and meaningful amount
  }).sort((a, b) => a._posChange - b._posChange); // most decreased first

  const disciplinedBrands = brands.filter((b) => {
    const bef = brandFirst[b.brand];
    const aft = brandSecond[b.brand];
    if (!bef || !aft || bef.visits < 3 || aft.visits < 3) return false;
    if (BILL_CATS.includes(b.cat) || b.cat === "其他") return false;
    const avgBef = Math.round(bef.total / bef.visits);
    const avgAft = Math.round(aft.total / aft.visits);
    return Math.abs(avgAft - avgBef) <= avgBef * 0.1 && avgBef > 50; // within 10% = disciplined
  });

  if (stableBrands.length >= 1 || disciplinedBrands.length >= 2) {
    const goodNews = [...stableBrands.slice(0, 3), ...disciplinedBrands.filter((b) => !stableBrands.includes(b)).slice(0, 2)].slice(0, 4);
    const bestBrand = goodNews[0];
    const score = 72 + goodNews.length * 3;

    candidates.push({
      type: "positive", score,
      hook: {
        id: "positive",
        q: "我有哪裡做得不錯？",
        big: bestBrand ? bestBrand._posChange + "%" : "穩定",
        bigSub: bestBrand ? "「" + bestBrand.brand + "」的均價從 $" + bestBrand._posBef + " 降到 $" + bestBrand._posAft + "——你花得越來越精準" : "你有幾個通路的消費非常穩定",
        body: "不是所有消費都需要調整。以下是你做得好的地方：",
        ranks: goodNews.map((b) => ({
          rank: b._posChange < -5 ? "📉" : "✅",
          name: b.brand,
          freq: "$" + b._posBef + " → $" + b._posAft,
          note: b._posChange < -5 ? "均價下降 " + b._posChange + "%，越花越精準" : "均價穩定，有紀律的消費",
        })),
        tip: "這些通路你消費得很有意識——" + (stableBrands.length > 0 ? "均價在下降代表你在篩選更好的選擇" : "均價穩定代表你沒有衝動加購") + "。值得肯定，也值得把這個方法套用到其他地方。",
        followups: [
          {
            q: "我是怎麼做到的？可以複製嗎？",
            a: (() => {
              const best = goodNews[0];
              const methods = [];
              if (best.cat === "超市") methods.push("你在超市的消費很穩定，可能是因為你有固定的採購清單或習慣");
              else if (best.cat === "超商") methods.push("你在超商的單次消費在下降，代表你在有意識地控制「順便買」");
              else methods.push("你在「" + best.brand + "」的消費越來越精準，代表你知道自己要什麼、不會多買");
              methods.push("這個「知道要買什麼就不多買」的方法，可以直接套用到其他高頻通路");
              return methods.join("。\n\n") + "。\n\n如果能在其他通路也做到均價穩定或下降，整體省下來的金額會很可觀。";
            })(),
            followups: [
              {
                q: "套用到哪個通路效果最大？",
                a: (() => {
                  const needImprove = creepingBrands.slice(0, 2);
                  if (!needImprove.length) return "目前你的各通路均價都控制得不錯，繼續保持！";
                  return "最適合套用的：\n\n" + needImprove.map((b) => "📈 " + b.brand + "：均價從 $" + b._avgBef + " 升到 $" + b._avgAft + "（+" + b._avgCreep + "%）").join("\n") + "\n\n用你在「" + goodNews[0].brand + "」的方式——出門前想好要買什麼、設定消費上限——直接套用過去。";
                })(),
              },
              {
                q: "如果所有通路都能做到呢？",
                a: (() => {
                  // Estimate savings if all creeping brands returned to previous avg
                  const totalSaveable = creepingBrands.reduce((s, b) => {
                    const extra = b._avgAft - b._avgBef;
                    return s + Math.round(extra * (b.visits / months.length) * 12);
                  }, 0);
                  return totalSaveable > 0
                    ? "如果所有均價上升的通路都回到之前的水準，一年可以省 $" + fmt(totalSaveable) + "。\n\n" + fmtComparisons(totalSaveable, stats) + "\n\n不需要少買，只需要每次買得更精準。"
                    : "你目前大部分通路的均價都很穩定，做得很好！";
                })(),
              },
            ],
          },
          {
            q: "整體來看我的消費健康嗎？",
            a: (() => {
              const signals = [];
              if (stableBrands.length > 0) signals.push("✅ " + stableBrands.length + " 個通路均價在下降——花得越來越精準");
              if (disciplinedBrands.length > 0) signals.push("✅ " + disciplinedBrands.length + " 個通路均價穩定——有紀律的消費");
              const marketBrand = brands.find((b) => b.cat === "超市");
              if (marketBrand) signals.push("✅ 有固定去超市的習慣——比全靠超商外食健康");
              const warns = [];
              if (creepingBrands.length > 0) warns.push("⚠️ " + creepingBrands.length + " 個通路均價在爬升——需要注意");
              if (growthList.length > 3) warns.push("⚠️ 新消費習慣增加較快——消費版圖在擴張");
              const monthlyAvg = Math.round(totalAmount / months.length);
              return "月均消費 $" + fmt(monthlyAvg) + "。\n\n" + (signals.length > 0 ? "做得好的：\n" + signals.join("\n") : "") + (warns.length > 0 ? "\n\n可以注意的：\n" + warns.join("\n") : "") + "\n\n整體來說，" + (warns.length <= signals.length ? "你的消費習慣比你想的更健康。" : "有一些地方可以優化，但也有不少做得好的。");
            })(),
            followups: [
              {
                q: "跟半年前比，我進步了嗎？",
                a: (() => {
                  const improved = stableBrands.length;
                  const worsened = creepingBrands.length;
                  return improved > worsened
                    ? "進步了！有 " + improved + " 個通路的均價在下降，只有 " + worsened + " 個在上升。\n\n你的消費精準度在提高——這是很正面的趨勢。"
                    : improved === worsened
                    ? "持平。有 " + improved + " 個通路在改善，" + worsened + " 個在上升。還有優化空間。"
                    : "有 " + worsened + " 個通路均價在升，" + improved + " 個在降。整體可以再精進。\n\n好消息是——你已經證明自己做得到（" + goodNews.map((b) => b.brand).join("、") + "），只是需要把方法擴展到更多地方。";
                })(),
              },
              {
                q: "給我一個消費者評語吧",
                a: (() => {
                  const monthlyAvg = Math.round(totalAmount / months.length);
                  const topCat = cats.filter((c) => c.cat !== "其他" && !BILL_CATS.includes(c.cat))[0];
                  const style = topCat ? topCat.cat : "多元";
                  const discipline = stableBrands.length >= 3 ? "高紀律" : stableBrands.length >= 1 ? "有意識" : "需關注";
                  const growth = growthList.length >= 3 ? "擴張型" : "穩定型";
                  return "你的消費者畫像：\n\n📊 「" + style + "導向 · " + discipline + " · " + growth + "」\n\n• 月均消費 $" + fmt(monthlyAvg) + "\n• 最依賴「" + brands[0].brand + "」\n• " + (stableBrands.length > 0 ? "在「" + stableBrands[0].brand + "」花得最精準" : "消費精準度還有提升空間") + "\n\n" + (discipline === "高紀律" ? "你比大部分人更懂得控制消費——繼續保持！" : "你有做得好的地方，放大這些優勢就能花得更聰明。");
                })(),
              },
            ],
          },
        ],
      },
    });
  }

  // ── Type: AUTOPAY ──────────────────────────────────────────────────
  // "Your habits auto-charge you $X/month" — mental accounting shock
  // Declared at function scope so opener can reference them
  let habitItems = [];
  let habitMonthly = 0;
  let habitYearly = 0;
  if (hasItems) {
    const repeatItems = {};
    invoices.filter((inv) => !isDeliveryPlatform(inv.shop) && !isOnlineBulk(inv.shop)).forEach((inv) => {
      (inv.items || []).forEach((it) => {
        const cat = classifyItem(it.name);
        if (cat === "其他" || cat === "外送服務費" || cat === "餐飲消費" || cat === "訂閱服務") return;
        if (!repeatItems[it.name]) repeatItems[it.name] = { name: it.name, count: 0, total: 0, cat, shop: inv.shop };
        repeatItems[it.name].count += it.qty || 1;
        repeatItems[it.name].total += it.price || 0;
      });
    });
    habitItems = Object.values(repeatItems).filter((it) => it.count >= 3).sort((a, b) => b.total - a.total);
    habitMonthly = Math.round(habitItems.reduce((s, it) => s + it.total, 0) / Math.max(months.length, 1));
    habitYearly = habitMonthly * 12;

    if (habitItems.length >= 3 && habitMonthly > 200) {
      const score = 95 + Math.min(habitItems.length, 10);

      candidates.push({
        type: "autopay", score,
        hook: {
          id: "autopay",
          q: "我有哪些東西一直在重複買？",
          big: habitItems.length + " 個",
          bigSub: "你有 " + habitItems.length + " 個品項反覆在買——累計 $" + fmt(Math.round(habitItems.reduce((s, it) => s + it.total, 0))),
          body: "這些品項你買了 3 次以上，不是你每次都「決定」要買的，是習慣自動在下單：",
          ranks: habitItems.slice(0, 6).map((it) => ({
            rank: itemCatIcon(it.cat),
            name: it.name.slice(0, 15),
            freq: it.count + " 次",
            note: "共 $" + fmt(Math.round(it.total)) + " 在「" + it.shop + "」",
          })),
          tip: "這 " + habitItems.length + " 個品項累計 $" + fmt(Math.round(habitItems.reduce((s, it) => s + it.total, 0))) + "，年化 $" + fmt(habitYearly) + "。\n\n每一筆都不痛，但加在一起就是一筆可觀的「習慣稅」。",
          followups: [
            {
              q: "哪些是我想保留的、哪些該檢視？",
              a: (() => {
                const keep = habitItems.filter((it) => ["乳製品", "咖啡", "生鮮蔬果", "生鮮肉品"].includes(it.cat)).slice(0, 3);
                const review = habitItems.filter((it) => ["零食/餅乾", "瓶裝飲料", "速食餐點", "茶飲"].includes(it.cat)).slice(0, 3);
                let t = "";
                if (keep.length) t += "✅ 值得保留的習慣：\n" + keep.map((it) => itemCatIcon(it.cat) + " " + it.name + "（" + it.cat + "）").join("\n") + "\n\n";
                if (review.length) t += "🤔 可以檢視的：\n" + review.map((it) => itemCatIcon(it.cat) + " " + it.name + "（$" + fmt(Math.round(it.total / months.length)) + "/月）").join("\n") + "\n\n";
                t += "健康、營養相關的習慣值得保留。零食、飲料可以想想「是真的想喝，還是順手買的」。";
                return t || "你的重複購買品項大部分看起來是日常需求，整體還算合理。";
              })(),
              followups: [
                {
                  q: "如果減掉「順手買的」能省多少？",
                  a: (() => {
                    const snackDrink = habitItems.filter((it) => ["零食/餅乾", "瓶裝飲料", "手搖飲"].includes(it.cat));
                    const saveable = snackDrink.reduce((s, it) => s + it.total, 0);
                    const yearSave = Math.round(saveable / months.length * 12);
                    if (yearSave < 500) return "你的零食飲料類重複消費不多，省不了太多。";
                    return "零食 + 瓶裝飲料的「習慣消費」：$" + fmt(Math.round(saveable)) + "（" + months.length + " 個月）\n\n年化 $" + fmt(yearSave) + "。\n\n" + fmtComparisons(yearSave, stats) + "\n\n不是說不能買——而是把「無意識的順手」變成「有意識的選擇」。";
                  })(),
                },
                {
                  q: "每家店我的「固定菜單」是什麼？",
                  a: (() => {
                    const storeMenus = {};
                    habitItems.forEach((it) => {
                      if (!storeMenus[it.shop]) storeMenus[it.shop] = [];
                      storeMenus[it.shop].push(it);
                    });
                    const stores = Object.entries(storeMenus).sort((a, b) => b[1].length - a[1].length).slice(0, 4);
                    return stores.map(([shop, items]) => catIcon(brandsReal.find((b) => b.brand === shop)?.cat || "其他") + " 「" + shop + "」你的固定菜單：\n" + items.slice(0, 3).map((it) => "  " + itemCatIcon(it.cat) + " " + it.name + "（" + it.count + " 次）").join("\n")).join("\n\n");
                  })(),
                },
              ],
            },
            {
              q: "哪些品項是我「沒意識到」一直在買的？",
              a: (() => {
                const hidden = habitItems.slice(3, 10); // skip top 3 obvious ones
                if (!hidden.length) return "你的重複購買品項不多，消費相對隨機。";
                return "你可能沒注意到自己一直在買這些：\n\n" + hidden.map((it) => itemCatIcon(it.cat) + " " + it.name + "（" + it.count + " 次 $" + fmt(Math.round(it.total)) + "）在「" + it.shop + "」").join("\n") + "\n\n這些不是大筆消費，但因為太自動化了你根本不會注意到。";
              })(),
              followups: [
                {
                  q: "這些加起來一年多少？",
                  a: (() => {
                    const hidden = habitItems.slice(3, 10);
                    const total = hidden.reduce((s, it) => s + it.total, 0);
                    const yearly = Math.round(total / months.length * 12);
                    return "這些「隱形品項」合計 $" + fmt(Math.round(total)) + "（" + months.length + " 個月），年化 $" + fmt(yearly) + "。\n\n" + fmtComparisons(yearly, stats);
                  })(),
                },
                {
                  q: "有沒有更划算的買法？",
                  a: "幾個無痛省法：\n\n1️⃣ 超商的飲料/零食 → 全聯同款省 20-30%\n2️⃣ 固定喝的咖啡 → 考慮自備保溫杯或買量販包\n3️⃣ 經常買的生活用品 → 網購量大更划算\n\n不需要少買，只是「換個地方買同一個東西」。",
                },
              ],
            },
          ],
        },
      });
    }
  }

  // ── Type: PRICE_GAP ───────────────────────────────────────────────
  // "Same drink, 3 different prices" — opportunity cost neglect
  let gaps = [];
  if (hasItems) {
    // Find item categories that appear across multiple stores
    const catByStore = {}; // { itemCat: { storeName: { count, total, avgPrice } } }
    invoices.forEach((inv) => {
      if (isDeliveryPlatform(inv.shop)) return; // Skip delivery platforms
      (inv.items || []).forEach((it) => {
        const cat = classifyItem(it.name);
        if (cat === "其他" || cat === "外送服務費" || cat === "餐飲消費" || cat === "訂閱服務") return;
        if (!catByStore[cat]) catByStore[cat] = {};
        const shop = inv.shop || "";
        if (!catByStore[cat][shop]) catByStore[cat][shop] = { count: 0, total: 0 };
        catByStore[cat][shop].count += it.qty || 1;
        catByStore[cat][shop].total += it.price || 0;
      });
    });

    // Find categories with price gaps across ≥2 stores
    gaps = [];
    Object.entries(catByStore).forEach(([cat, stores]) => {
      // Only compare physical retail stores (convenience stores, supermarkets, fast food, coffee shops)
      const storeList = Object.entries(stores)
        .filter(([shop, d]) => d.count >= 2 && !isOnlineBulk(shop))
        .map(([shop, d]) => ({ shop, count: d.count, avg: Math.round(d.total / d.count) }));
      if (storeList.length < 2) return;
      storeList.sort((a, b) => a.avg - b.avg);
      const cheapest = storeList[0];
      const most = storeList[storeList.length - 1];
      if (most.avg <= cheapest.avg * 1.15 || most.avg > cheapest.avg * 5) return; // 15-500% range only
      const gapPct = Math.round((most.avg - cheapest.avg) / cheapest.avg * 100);
      // How much could be saved if always buying from cheapest
      const totalBought = storeList.reduce((s, st) => s + st.count, 0);
      const currentSpend = storeList.reduce((s, st) => s + st.count * st.avg, 0);
      const ifCheapest = totalBought * cheapest.avg;
      const saveable = currentSpend - ifCheapest;
      gaps.push({ cat, stores: storeList, cheapest, most, gapPct, totalBought, saveable });
    });
    gaps.sort((a, b) => b.gapPct - a.gapPct);

    if (gaps.length >= 2) {
      const topGap = gaps[0];
      const totalSaveable = gaps.slice(0, 5).reduce((s, g) => s + g.saveable, 0);
      const yearlySaveable = Math.round(totalSaveable / months.length * 12);
      const score = 88 + Math.min(topGap.gapPct, 10);

      candidates.push({
        type: "pricegap", score,
        hook: {
          id: "pricegap",
          q: "還有哪些東西我買貴了？",
          big: topGap.gapPct + "%",
          bigSub: "同樣是「" + topGap.cat + "」，你在「" + topGap.most.shop + "」付的比「" + topGap.cheapest.shop + "」貴 " + topGap.gapPct + "%",
          body: "你不需要少買——你只是在「不同價格的同一個東西」之間搖擺：",
          ranks: gaps.slice(0, 4).map((g) => ({
            rank: itemCatIcon(g.cat),
            name: g.cat,
            freq: g.cheapest.shop + " $" + g.cheapest.avg + " vs " + g.most.shop + " $" + g.most.avg,
            note: "差 " + g.gapPct + "%（" + g.totalBought + " 次）",
          })),
          tip: "你已經知道便宜的選擇在哪（" + topGap.cheapest.shop + "），你只是「不在那裡的時候沒在想」。行為經濟學叫這個「機會成本忽略」——你在貴的地方買的時候，不會想到自己多付了多少。\n\n如果每次都選你已經在用的最便宜通路，年省 $" + fmt(yearlySaveable) + "。",
          followups: [
            {
              q: "「" + topGap.cat + "」在不同店差多少？",
              a: (() => {
                return "你的「" + topGap.cat + "」購買記錄：\n\n" + topGap.stores.map((st) => (st.shop === topGap.cheapest.shop ? "✅ " : "⚠️ ") + st.shop + "：均 $" + st.avg + "（" + st.count + " 次）").join("\n") + "\n\n最便宜的「" + topGap.cheapest.shop + "」你已經在去了！只要把其他店的同類消費也轉過來，每次省 $" + (topGap.most.avg - topGap.cheapest.avg) + "。";
              })(),
              followups: [
                {
                  q: "如果永遠選最便宜的，能省多少？",
                  a: (() => {
                    return "把所有品類都選最便宜的通路：\n\n" + gaps.slice(0, 4).map((g) => itemCatIcon(g.cat) + " " + g.cat + "：永遠在「" + g.cheapest.shop + "」買 → 省 $" + fmt(Math.round(g.saveable))).join("\n") + "\n\n合計省 $" + fmt(totalSaveable) + "（" + months.length + " 個月），年省 $" + fmt(yearlySaveable) + "。\n\n" + fmtComparisons(yearlySaveable, stats);
                  })(),
                },
                {
                  q: "為什麼我會在貴的地方買？",
                  a: "通常不是因為「不知道便宜的」，而是：\n\n1️⃣ 方便——「" + topGap.most.shop + "」就在路上，不想繞路\n2️⃣ 搭配——買「" + topGap.cat + "」時順便買了其他東西\n3️⃣ 沒在想——付款時不會算「比全聯貴多少」\n\n解法不是每次都跑去最便宜的店，而是在你「已經會去」的便宜通路多買一點，減少在貴通路的「順手買」。",
                },
              ],
            },
            {
              q: "還有哪些品類有價差？",
              a: (() => {
                const others = gaps.slice(1, 5);
                if (!others.length) return "主要就是「" + topGap.cat + "」的價差最明顯。";
                return "其他有價差的品類：\n\n" + others.map((g) => itemCatIcon(g.cat) + " " + g.cat + "\n  便宜：" + g.cheapest.shop + " $" + g.cheapest.avg + " | 貴：" + g.most.shop + " $" + g.most.avg + "（差 " + g.gapPct + "%）").join("\n\n");
              })(),
              followups: [
                {
                  q: "價差最大的品項是什麼？",
                  a: (() => {
                    // Find specific items appearing in multiple stores with price differences
                    const itemPrices = {};
                    invoices.forEach((inv) => (inv.items || []).forEach((it) => {
                      const cat = classifyItem(it.name);
                      if (cat === "其他" || cat === "外送服務費") return;
                      if (!itemPrices[cat]) itemPrices[cat] = {};
                      const shop = inv.shop || "";
                      if (!itemPrices[cat][shop]) itemPrices[cat][shop] = [];
                      itemPrices[cat][shop].push({ name: it.name, price: it.price });
                    }));
                    // Find most extreme examples
                    let best = null;
                    Object.entries(itemPrices).forEach(([cat, shops]) => {
                      const shopAvgs = Object.entries(shops).map(([shop, items]) => ({ shop, avg: Math.round(items.reduce((s, it) => s + it.price, 0) / items.length), example: items[0].name }));
                      if (shopAvgs.length < 2) return;
                      shopAvgs.sort((a, b) => a.avg - b.avg);
                      const gap = shopAvgs[shopAvgs.length - 1].avg - shopAvgs[0].avg;
                      if (!best || gap > best.gap) best = { cat, cheap: shopAvgs[0], expensive: shopAvgs[shopAvgs.length - 1], gap };
                    });
                    if (!best) return "各品類的價差主要在通路之間，個別品項差異不大。";
                    return "價差最大的例子：\n\n" + itemCatIcon(best.cat) + " 「" + best.cat + "」\n✅ " + best.cheap.shop + "：均 $" + best.cheap.avg + "（如 " + best.cheap.example + "）\n⚠️ " + best.expensive.shop + "：均 $" + best.expensive.avg + "（如 " + best.expensive.example + "）\n\n差 $" + best.gap + "——同類東西，價格差這麼多。";
                  })(),
                },
                {
                  q: "最無痛的省法是什麼？",
                  a: (() => {
                    const easiest = gaps.filter((g) => g.cheapest.count >= 3).sort((a, b) => b.saveable - a.saveable)[0];
                    if (!easiest) return "把高頻消費集中到你已經在去的便宜通路。";
                    return "最無痛的一步：\n\n把「" + easiest.cat + "」集中在「" + easiest.cheapest.shop + "」買（你已經在那買了 " + easiest.cheapest.count + " 次）。\n\n不用改變習慣，只是「多買一點」在便宜的地方、「少買一點」在貴的地方。\n\n預估每年省 $" + fmt(Math.round(easiest.saveable / months.length * 12)) + "。";
                  })(),
                },
              ],
            },
          ],
        },
      });
    }
  }

  // ── Type: ITEM_INSIGHT ─────────────────────────────────────────────
  // Dynamic category analysis — picks the most "interesting" category
  // using composite score: amount × frequency^0.3 × growth_boost
  let topCatResult = null;
  if (hasItems) {
    const nonDeliveryInvoices = invoices.filter((inv) => !isDeliveryPlatform(inv.shop) && !isOnlineBulk(inv.shop));
    const itemCats = aggregateItemCategories(nonDeliveryInvoices);
    const meaningfulCats = itemCats.filter((c) => c.cat !== "其他" && c.cat !== "外送服務費" && c.cat !== "餐飲消費" && c.cat !== "訂閱服務" && c.cat !== "加油" && c.cat !== "停車");

    // Calculate growth per category (first half vs second half)
    const catGrowth = {};
    nonDeliveryInvoices.forEach((inv) => {
      const ym = inv.yearMonth || "";
      const isFirst = firstKeys.includes(ym);
      const isSecond = secondKeys.includes(ym);
      (inv.items || []).forEach((it) => {
        const cat = classifyItem(it.name);
        if (!cat || cat === "其他" || cat === "外送服務費" || cat === "餐飲消費") return;
        if (!catGrowth[cat]) catGrowth[cat] = { first: 0, second: 0 };
        if (isFirst) catGrowth[cat].first += it.qty || 1;
        if (isSecond) catGrowth[cat].second += it.qty || 1;
      });
    });

    // Score each category
    const catScored = meaningfulCats.filter((c) => c.count >= 3).map((c) => {
      const g = catGrowth[c.cat] || { first: 0, second: 0 };
      const freqGrowth = g.first > 0 ? Math.round(((g.second - g.first) / g.first) * 100) : (g.second > 0 ? 999 : 0);
      let boost = 1.0;
      if (freqGrowth > 30) boost += 0.5;
      if (freqGrowth > 100) boost += 0.5;
      const composite = c.total * Math.pow(c.count, 0.3) * boost;
      return { ...c, freqGrowth, boost, composite: Math.round(composite) };
    }).sort((a, b) => b.composite - a.composite);

    topCatResult = catScored[0];
    const topItem = topCatResult ? topCatResult.items[0] : null;
    const totalItemSpend = meaningfulCats.reduce((s, c) => s + c.total, 0);
    const score = 82 + Math.min(catScored.length, 10);

    if (topCatResult && topCatResult.count >= 5) {

      const tc = topCatResult;
      const tcYearly = Math.round(tc.total / months.length * 12);
      const growthLabel = tc.freqGrowth > 30 ? "（而且還在增加中 +" + tc.freqGrowth + "%）" : tc.freqGrowth < -10 ? "（不過有在減少 " + tc.freqGrowth + "%）" : "";

      candidates.push({
        type: "items", score,
        hook: {
          id: "items",
          q: "我的「" + tc.cat + "」花了多少？",
          big: "$" + fmt(Math.round(tc.total)),
          bigSub: "你在「" + tc.cat + "」買了 " + tc.count + " 次，年化 $" + fmt(tcYearly) + growthLabel,
          body: "「" + tc.cat + "」是你最值得關注的品類——不只是金額最高，消費頻率和趨勢都顯示這是你的核心消費：",
          ranks: catScored.slice(0, 6).map((c) => ({
            rank: itemCatIcon(c.cat),
            name: c.cat,
            freq: c.count + " 次 $" + fmt(Math.round(c.total)),
            note: (c.freqGrowth > 30 ? "📈+" + c.freqGrowth + "% " : c.freqGrowth < -10 ? "📉" + c.freqGrowth + "% " : "") + (c.items[0] ? "常買：" + c.items[0].name.slice(0, 12) : ""),
          })),
          tip: "「" + tc.cat + "」佔了 " + (totalItemSpend > 0 ? Math.round(tc.total / totalItemSpend * 100) : 0) + "% 的品項消費" + (tc.freqGrowth > 30 ? "，而且成長 " + tc.freqGrowth + "%——這個趨勢值得注意。" : "。") + (topItem ? " 你買最多的是「" + topItem.name.slice(0, 15) + "」（" + topItem.count + " 次）。" : ""),
          followups: [
            {
              q: "這個花費有在增加嗎？一年要花多少？",
              a: (() => {
                const trendTxt = tc.freqGrowth > 30 ? "是的，成長了 +" + tc.freqGrowth + "%——頻率在明顯增加。" : tc.freqGrowth > 0 ? "有小幅增加（+" + tc.freqGrowth + "%），趨勢緩慢上升。" : tc.freqGrowth < -10 ? "其實在減少中（" + tc.freqGrowth + "%），你有在控制。" : "大致穩定，沒有明顯增減。";
                const avgPerItem = tc.count > 0 ? Math.round(tc.total / tc.count) : 0;
                return "「" + tc.cat + "」趨勢分析：\n\n" + trendTxt + "\n\n📊 " + tc.count + " 次消費，均 $" + avgPerItem + "/次\n📊 累計 $" + fmt(Math.round(tc.total)) + "\n📊 年化 $" + fmt(tcYearly) + "\n\n" + fmtComparisons(tcYearly, stats);
              })(),
              followups: [
                {
                  q: "這樣的花費合理嗎？",
                  a: (() => {
                    const daily = Math.round(tc.total / totalDays);
                    const monthlyAvg = Math.round(tc.total / months.length);
                    const pctOfTotal = totalAmount > 0 ? Math.round(tc.total / totalAmount * 100) : 0;
                    return "「" + tc.cat + "」佔你總消費的 " + pctOfTotal + "%。\n\n• 每月約 $" + fmt(monthlyAvg) + "\n• 每天約 $" + daily + "\n\n" + (pctOfTotal > 20 ? "佔比超過 20%——這是你消費的大頭，值得特別留意。" : pctOfTotal > 10 ? "佔比中等，屬於你的核心消費之一。" : "佔比不算高，在合理範圍內。") + (tc.freqGrowth > 50 ? "\n\n但成長速度偏快（+" + tc.freqGrowth + "%），如果不注意可能會持續膨脹。" : "");
                  })(),
                },
                {
                  q: "跟其他品類比起來呢？",
                  a: (() => {
                    return "你的品類花費排行：\n\n" + catScored.slice(0, 5).map((c, i) => {
                      const pct = totalItemSpend > 0 ? Math.round(c.total / totalItemSpend * 100) : 0;
                      const trend = c.freqGrowth > 30 ? " 📈+" + c.freqGrowth + "%" : c.freqGrowth < -10 ? " 📉" + c.freqGrowth + "%" : "";
                      return (i + 1) + ". " + itemCatIcon(c.cat) + " " + c.cat + "：$" + fmt(Math.round(c.total)) + "（" + pct + "%）" + trend;
                    }).join("\n") + "\n\n" + (catScored[0].cat === tc.cat ? "「" + tc.cat + "」是你花最多的品類。" : "");
                  })(),
                },
              ],
            },
            {
              q: "跟別人比，我的「" + tc.cat + "」算多嗎？",
              a: (() => {
                // Find benchmark for this category
                const bmKey = Object.keys(GROUP_BENCHMARKS).find((k) => GROUP_BENCHMARKS[k].cat === tc.cat);
                const bm = bmKey ? GROUP_BENCHMARKS[bmKey] : null;
                const avgPerItem = tc.count > 0 ? Math.round(tc.total / tc.count) : 0;
                if (bm) {
                  const diff = avgPerItem - bm.groupAvg;
                  const diffPct = bm.groupAvg > 0 ? Math.round(diff / bm.groupAvg * 100) : 0;
                  return "「" + tc.cat + "」均價比較（" + bm.scope + "）：\n\n• 你的均價：$" + avgPerItem + "/次\n• 其他人均價：$" + bm.groupAvg + "/次\n• " + (diffPct > 10 ? "你偏高 " + diffPct + "%——可能選了更貴的品項。" : diffPct < -10 ? "你比別人省 " + Math.abs(diffPct) + "%——買得精打細算！" : "跟別人差不多，在合理範圍。");
                }
                return "「" + tc.cat + "」你的均價是 $" + avgPerItem + "/次，共 " + tc.count + " 次。\n\n這個品類的花費因個人選擇差異大，不一定有標準答案——但知道自己花了多少是第一步。";
              })(),
              followups: [
                {
                  q: "有什麼方法可以在這個品類省錢？",
                  a: (() => {
                    const avgPerItem = tc.count > 0 ? Math.round(tc.total / tc.count) : 0;
                    const tenPctSave = Math.round(tcYearly * 0.1);
                    return "在「" + tc.cat + "」省錢的方式：\n\n1️⃣ 選擇同品類中較平價的替代品項\n2️⃣ 超商品改在超市買，通常省 20-30%\n3️⃣ 注意促銷或量販裝\n\n如果均價降低 10%：年省 $" + fmt(tenPctSave) + "\n\n" + fmtComparisons(tenPctSave, stats);
                  })(),
                },
                {
                  q: "哪個品類成長最快？",
                  a: (() => {
                    const growing = catScored.filter((c) => c.freqGrowth > 20).sort((a, b) => b.freqGrowth - a.freqGrowth);
                    if (!growing.length) return "各品類的消費都相對穩定。";
                    return "成長最快的品類：\n\n" + growing.slice(0, 3).map((c) => itemCatIcon(c.cat) + " " + c.cat + "：+" + c.freqGrowth + "%（" + c.count + " 次 $" + fmt(Math.round(c.total)) + "）").join("\n") + "\n\n" + (growing[0].freqGrowth > 100 ? "「" + growing[0].cat + "」的成長速度驚人——這是一個正在快速養成的消費習慣。" : "");
                  })(),
                },
              ],
            },
          ],
        },
      });
    }
  }

  // ── Type: SUBSCRIPTION ─────────────────────────────────────────────
  // Detect and analyze subscription spending
  const userSubs = detectSubscriptions(invoices);
  if (userSubs.length >= 1) {
    const monthlySubTotal = userSubs.reduce((s, sub) => s + sub.price, 0);
    const yearlySubTotal = monthlySubTotal * 12;
    const score = 78 + Math.min(userSubs.length * 3, 12);

    candidates.push({
      type: "subscription", score,
      hook: {
        id: "subscription",
        q: "我的訂閱還值得嗎？",
        big: "$" + fmt(Math.round(monthlySubTotal)) + "/月",
        bigSub: "你有 " + userSubs.length + " 個訂閱服務正在自動扣款——年花 $" + fmt(Math.round(yearlySubTotal)),
        body: "這些訂閱每個月自動從你的帳戶扣款，你可能已經忘了它們的存在：",
        ranks: userSubs.slice(0, 5).map((sub) => ({
          rank: "📱",
          name: sub.shop,
          freq: "$" + fmt(Math.round(sub.price)) + "/月",
          note: sub.item.slice(0, 25) + (sub.count > 1 ? "（已扣 " + sub.count + " 次）" : ""),
        })),
        tip: "訂閱服務的設計就是讓你「忘記自己在付錢」。每月 $" + fmt(Math.round(monthlySubTotal)) + " 看似不多，但一年就是 $" + fmt(Math.round(yearlySubTotal)) + "。\n\n" + fmtComparisons(yearlySubTotal, stats),
        followups: [
          {
            q: "這些訂閱都還值得嗎？",
            a: (() => {
              const lines = userSubs.map((sub) => {
                const yearly = Math.round(sub.price * 12);
                return "📱 " + sub.shop + "（$" + fmt(Math.round(sub.price)) + "/月 = $" + fmt(yearly) + "/年）\n  → " + sub.item.slice(0, 40);
              });
              return "逐一檢視：\n\n" + lines.join("\n\n") + "\n\n問自己：「上個月我用了幾次？」如果答不出來，可能就不值得了。";
            })(),
            followups: [
              {
                q: "如果全部取消能省多少？",
                a: "全部取消 = 每年省 $" + fmt(Math.round(yearlySubTotal)) + "。\n\n" + fmtComparisons(yearlySubTotal, stats) + "\n\n當然不是叫你全取消——但至少知道這筆「隱形月費」的全貌。",
              },
              {
                q: "哪個訂閱最值得重新想想？",
                a: (() => {
                  // The most expensive one is most likely to be worth reviewing
                  const most = userSubs[0];
                  return "最值得檢視的：「" + most.shop + "」$" + fmt(Math.round(most.price)) + "/月。\n\n因為它是你最貴的訂閱。問自己：\n• 上個月用了幾次？\n• 不訂的話會怎樣？\n• 有更便宜的替代方案嗎？\n\n如果三個問題都答不出明確的「值得」，就值得考慮暫停。";
                })(),
              },
            ],
          },
          {
            q: "放大到一年來看呢？",
            a: (() => {
              return "每月 $" + fmt(Math.round(monthlySubTotal)) + " 感覺還好，但拉長到一年：\n\n" + userSubs.map((s) => "📱 " + s.shop + "：$" + fmt(Math.round(s.price)) + "/月 → $" + fmt(Math.round(s.price * 12)) + "/年").join("\n") + "\n\n年度訂閱總費用：$" + fmt(Math.round(yearlySubTotal)) + "\n\n" + fmtComparisons(yearlySubTotal, stats) + "\n\n每一筆月費看起來不痛，但加在一起就是一筆可觀的固定支出。";
            })(),
            followups: [
              {
                q: "哪些訂閱我可能用不夠？",
                a: (() => {
                  return "你可以逐一問自己：\n\n" + userSubs.map((s) => "📱 " + s.shop + "（$" + fmt(Math.round(s.price)) + "/月）\n  → 上個月用了幾次？這筆花費帶給你什麼價值？").join("\n\n") + "\n\n如果想不出來——代表這筆訂閱值得重新評估。\n\n定期檢視訂閱是聰明消費的好習慣。";
                })(),
              },
              {
                q: "如果暫停一半，能省多少？",
                a: (() => {
                  const halfSave = Math.round(yearlySubTotal / 2);
                  return "暫停一半的訂閱 = 年省 $" + fmt(halfSave) + "。\n\n" + fmtComparisons(halfSave, stats) + "\n\n不需要全砍——把「不確定值不值得」的先暫停一個月，看看生活有沒有影響。沒影響的就不用恢復了。";
                })(),
              },
            ],
          },
        ],
      },
    });
  }

  // ── Type: BENCHMARK ────────────────────────────────────────────────
  // "Other users buy the same thing differently" — social comparison
  // FMCG (瓶裝飲料/乳製品/零食): compare across 超商+超市 (same products exist in both)
  // Store-specific (咖啡/鮮食): only compare within same store type
  let bmResults = [];
  if (hasItems) {
    const fmcgKw = {
      "瓶裝飲料": ["可樂","雪碧","氣泡水","PET","鋁罐","多喝水","台鹽","礦泉水","美粒果","每朝","御茶園","茉莉茶園"],
      "乳製品": ["鮮乳","鮮奶","牛奶","豆漿","豆奶","優格","優酪","養樂多","LP33","光泉","林鳳營","瑞穗","六甲","AB+"],
      "零食": ["餅乾","洋芋片","樂事","多力多滋","品客","口香糖","巧克力","糖果","軟糖","士力架","波的多","卡辣姆久"],
    };
    const storeSpecKw = {
      "咖啡": ["咖啡","美式","拿鐵","摩卡","卡布"],
      "鮮食": ["飯糰","三明治","便當","涼麵","餐盒"],
    };
    function bmClassify(name) {
      const l = (name || "").toLowerCase();
      for (const [cat, kws] of Object.entries(fmcgKw)) { for (const k of kws) if (l.includes(k)) return { cat, isFmcg: true }; }
      for (const [cat, kws] of Object.entries(storeSpecKw)) { for (const k of kws) if (l.includes(k)) return { cat, isFmcg: false }; }
      return null;
    }

    const RETAIL_STORES = new Set(Object.keys(STORE_TYPE_MAP).filter((s) => ["超商", "超市"].includes(STORE_TYPE_MAP[s])));

    // Calculate user's own averages per benchmark key
    const userBmData = {};
    invoices.filter((inv) => !isDeliveryPlatform(inv.shop) && !isOnlineBulk(inv.shop)).forEach((inv) => {
      const st = STORE_TYPE_MAP[inv.shop];
      if (!st) return;
      (inv.items || []).forEach((it) => {
        const cls = bmClassify(it.name);
        if (!cls) return;
        // FMCG: combine 超商+超市 into "零售"
        // Store-specific: keep store type separate
        const key = cls.isFmcg ? cls.cat + "@零售" : cls.cat + "@" + st;
        // Only count if store is in retail set (for FMCG) or matching type
        if (cls.isFmcg && !RETAIL_STORES.has(inv.shop)) return;
        if (!userBmData[key]) userBmData[key] = { count: 0, total: 0 };
        userBmData[key].count += it.qty || 1;
        userBmData[key].total += it.price || 0;
      });
    });

    // Compare with group benchmarks
    bmResults = [];
    Object.entries(userBmData).forEach(([key, ud]) => {
      if (ud.count < 3) return;
      const bm = GROUP_BENCHMARKS[key];
      if (!bm) return;
      const userAvg = Math.round(ud.total / ud.count);
      const diff = userAvg - bm.groupAvg;
      const diffPct = Math.round(diff / bm.groupAvg * 100);
      bmResults.push({ key, cat: bm.cat, scope: bm.scope, userAvg, groupAvg: bm.groupAvg, groupMin: bm.groupMin, groupMax: bm.groupMax, diff, diffPct, count: ud.count, total: Math.round(ud.total), users: bm.users, isFmcg: bm.isFmcg });
    });
    bmResults.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));

    const overpaying = bmResults.filter((b) => b.diffPct > 10);
    const underpaying = bmResults.filter((b) => b.diffPct < -10);

    if (bmResults.length >= 2) {
      const topDiff = bmResults[0];
      const score = 88 + Math.min(Math.abs(topDiff.diffPct), 10);

      candidates.push({
        type: "benchmark", score,
        hook: {
          id: "benchmark",
          q: "同樣的東西，別人怎麼買？",
          big: (topDiff.diffPct > 0 ? "+" : "") + topDiff.diffPct + "%",
          bigSub: "你在" + topDiff.scope + "買「" + topDiff.cat + "」均 $" + topDiff.userAvg + "，其他人均 $" + topDiff.groupAvg,
          body: "我們比對了其他用戶在相同通路類型購買相同品類的價格。以下是你跟大家的差異：",
          ranks: bmResults.slice(0, 5).map((b) => ({
            rank: b.diffPct > 10 ? "⬆️" : b.diffPct < -10 ? "✅" : "➡️",
            name: b.cat + "@" + b.scope,
            freq: "你 $" + b.userAvg + " vs 均 $" + b.groupAvg,
            note: b.diffPct > 10 ? "你偏高 " + b.diffPct + "%" : b.diffPct < -10 ? "你更省 " + Math.abs(b.diffPct) + "%" : "差不多",
          })),
          tip: (() => {
            if (overpaying.length > 0 && underpaying.length > 0) {
              return "你在「" + underpaying[0].cat + "@" + underpaying[0].scope + "」買得比別人精——但在「" + overpaying[0].cat + "@" + overpaying[0].scope + "」花得比別人多。你已經會省了，只要把同樣的方法套到其他品類。";
            } else if (overpaying.length > 0) {
              return "你在幾個品類的花費高於其他人。不一定要改——但知道差距在哪，你可以自己決定。";
            }
            return "你的消費跟其他人相比大致合理，甚至在某些品類更精打細算。";
          })(),
          followups: [
            {
              q: overpaying.length > 0 ? "我在哪裡花得比別人多？" : "我跟別人比得怎麼樣？",
              a: (() => {
                if (overpaying.length === 0) return "你的各品類消費都在平均值附近或更低，整體買得很精打細算！";
                return "你花得比別人多的品類：\n\n" + overpaying.map((b) => {
                  const yearExtra = Math.round(b.diff * b.count / months.length * 12);
                  return "⬆️ " + b.cat + " @ " + b.scope + "\n  你均 $" + b.userAvg + " vs 其他人均 $" + b.groupAvg + "（+" + b.diffPct + "%）\n  " + b.count + " 次買下來，一年多花 ~$" + fmt(yearExtra);
                }).join("\n\n") + "\n\n這不是說你買錯了——可能你選了更好的品項。但差距值得知道。";
              })(),
              followups: [
                {
                  q: "怎麼做到跟別人一樣省？",
                  a: (() => {
                    if (overpaying.length === 0) return "你已經做得很好了！";
                    const top = overpaying[0];
                    const yearSave = Math.round(top.diff * top.count / months.length * 12);
                    return "以「" + top.cat + " @ " + top.scope + "」為例：\n\n你均 $" + top.userAvg + "，其他人均 $" + top.groupAvg + "。\n\n其他人可能：\n• 選擇了同品類中更平價的品項\n• 善用特價或會員優惠\n• 買較小容量/份量\n\n如果回到平均水準，一年可省 ~$" + fmt(yearSave) + "。\n\n" + fmtComparisons(yearSave, stats);
                  })(),
                },
                {
                  q: "差距最大的是什麼品項？",
                  a: (() => {
                    if (overpaying.length === 0) return "沒有明顯偏高的品類。";
                    const top = overpaying[0];
                    return "差距最大的是「" + top.cat + "」在「" + top.scope + "」：\n\n• 你的均價：$" + top.userAvg + "\n• 其他人均價：$" + top.groupAvg + "\n• 最低的人只要：$" + top.groupMin + "\n\n差了 " + top.diffPct + "%。" + (top.count >= 10 ? "而且你買了 " + top.count + " 次，累積下來差距不小。" : "");
                  })(),
                },
              ],
            },
            {
              q: "我有比別人更會買的地方嗎？",
              a: (() => {
                if (underpaying.length === 0) return "你的各品類消費都在平均附近，沒有特別突出的省錢項目——但也沒有明顯偏高的。";
                return "你比別人精的品類：\n\n" + underpaying.map((b) => "✅ " + b.cat + " @ " + b.scope + "\n  你均 $" + b.userAvg + " vs 其他人均 $" + b.groupAvg + "（你省 " + Math.abs(b.diffPct) + "%）").join("\n\n") + "\n\n" + (underpaying.length >= 2 ? "你在這些品類的消費精準度高於其他人——值得肯定！" : "在這個品類你確實比別人會挑。");
              })(),
              followups: [
                {
                  q: "我的省錢方法可以套用到哪？",
                  a: (() => {
                    if (underpaying.length === 0 || overpaying.length === 0) return "目前各品類都差不多，繼續保持。";
                    return "你在「" + underpaying[0].cat + "」的選擇比別人精準（$" + underpaying[0].userAvg + " vs 均 $" + underpaying[0].groupAvg + "）。\n\n把同樣的選購方式——選平價品項、注意特價——套到「" + overpaying[0].cat + "」上（你目前 $" + overpaying[0].userAvg + " vs 均 $" + overpaying[0].groupAvg + "），就能把優勢擴大。";
                  })(),
                },
                {
                  q: "整體來看我算會買嗎？",
                  a: (() => {
                    const aboveAvg = bmResults.filter((b) => b.diffPct > 5).length;
                    const belowAvg = bmResults.filter((b) => b.diffPct < -5).length;
                    const neutral = bmResults.length - aboveAvg - belowAvg;
                    return bmResults.length + " 個品類中：\n\n✅ " + belowAvg + " 個比別人省\n➡️ " + neutral + " 個跟別人差不多\n⬆️ " + aboveAvg + " 個比別人高\n\n" + (belowAvg >= aboveAvg ? "整體來看你算會買的——多數品類都在平均或更低。" : "有一些品類可以優化，但也有做得好的地方。");
                  })(),
                },
              ],
            },
          ],
        },
      });
    }
  }

  // ── Type: HIDDEN_PATTERN ────────────────────────────────────────────
  // Discover behavioral patterns the user doesn't know about
  if (hasItems && invoices.length >= 30) {
    // 1. Weekday spending pattern
    const wkStats = {};
    const wkNames = ["週一","週二","週三","週四","週五","週六","週日"];
    invoices.filter((inv) => !isDeliveryPlatform(inv.shop) && !isOnlineBulk(inv.shop) && inv.issued_at).forEach((inv) => {
      const dt = new Date(inv.issued_at);
      if (isNaN(dt)) return;
      const wk = wkNames[dt.getDay() === 0 ? 6 : dt.getDay() - 1];
      if (!wkStats[wk]) wkStats[wk] = { total: 0, count: 0, days: new Set() };
      wkStats[wk].total += inv.amount || 0;
      wkStats[wk].count++;
      wkStats[wk].days.add(inv.issued_at?.slice(0, 10));
    });
    const wkAvgs = wkNames.map((wk) => {
      const s = wkStats[wk];
      return s && s.days.size > 0 ? { wk, avg: Math.round(s.total / s.days.size), days: s.days.size, count: s.count } : { wk, avg: 0, days: 0, count: 0 };
    }).filter((w) => w.days > 0);
    const maxWk = wkAvgs.reduce((a, b) => a.avg > b.avg ? a : b, wkAvgs[0]);
    const minWk = wkAvgs.reduce((a, b) => a.avg < b.avg ? a : b, wkAvgs[0]);
    const wkRatio = minWk && minWk.avg > 0 ? (maxWk.avg / minWk.avg).toFixed(1) : 0;

    // 2. Item combos — pairs that appear together frequently
    const invoiceItemSets = {};
    invoices.filter((inv) => !isDeliveryPlatform(inv.shop)).forEach((inv) => {
      const key = (inv.issued_at || "") + "_" + (inv.shop || "");
      if (!invoiceItemSets[key]) invoiceItemSets[key] = new Set();
      (inv.items || []).forEach((it) => {
        if (it.name && classifyItem(it.name) !== "外送服務費" && classifyItem(it.name) !== "其他") {
          invoiceItemSets[key].add(it.name.slice(0, 20));
        }
      });
    });
    const pairCount = {};
    Object.values(invoiceItemSets).forEach((items) => {
      const arr = [...items];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const pair = [arr[i], arr[j]].sort().join(" + ");
          pairCount[pair] = (pairCount[pair] || 0) + 1;
        }
      }
    });
    const topPairs = Object.entries(pairCount).filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]);
    const bestPair = topPairs[0];

    // 3. Time-of-day pattern for top category
    const hourBuckets = { "早上(6-11)": 0, "中午(12-14)": 0, "下午(15-17)": 0, "晚上(18-21)": 0, "深夜(22-5)": 0 };
    invoices.filter((inv) => !isDeliveryPlatform(inv.shop) && inv.issued_at).forEach((inv) => {
      const h = parseInt((inv.issued_at || "").slice(11, 13));
      if (isNaN(h)) return;
      const bucket = h >= 6 && h < 12 ? "早上(6-11)" : h >= 12 && h < 15 ? "中午(12-14)" : h >= 15 && h < 18 ? "下午(15-17)" : h >= 18 && h < 22 ? "晚上(18-21)" : "深夜(22-5)";
      hourBuckets[bucket] += inv.amount || 0;
    });
    const topTimeBucket = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0];

    if (wkRatio >= 2 || (bestPair && bestPair[1] >= 5)) {
      const score = 86 + Math.min(parseFloat(wkRatio) || 0, 8);

      candidates.push({
        type: "pattern", score,
        hook: {
          id: "pattern",
          q: "我的消費有什麼隱藏規律？",
          big: wkRatio + " 倍",
          bigSub: maxWk.wk + " 的消費是 " + minWk.wk + " 的 " + wkRatio + " 倍——你可能沒注意到",
          body: "AI 從你的消費時間、品項和通路中找到了一些你可能沒發現的行為模式：",
          ranks: [
            { rank: "📅", name: "最花錢的日子", freq: maxWk.wk + " 日均$" + fmt(maxWk.avg), note: "是" + minWk.wk + "的" + wkRatio + "倍" },
            { rank: "📅", name: "最省的日子", freq: minWk.wk + " 日均$" + fmt(minWk.avg), note: "" },
            ...(bestPair ? [{ rank: "🔗", name: "固定組合", freq: bestPair[1] + "次", note: bestPair[0] }] : []),
            { rank: "⏰", name: "花最多的時段", freq: topTimeBucket[0], note: "$" + fmt(Math.round(topTimeBucket[1])) },
          ],
          tip: (() => {
            let t = maxWk.wk + " 是你的「高消費日」（日均 $" + fmt(maxWk.avg) + "），" + minWk.wk + " 最省（$" + fmt(minWk.avg) + "）。";
            if (bestPair && bestPair[1] >= 5) t += "\n\n你還有一個「隱藏套餐」——「" + bestPair[0] + "」出現了 " + bestPair[1] + " 次，這個組合已經是你的自動消費。";
            return t;
          })(),
          followups: [
            {
              q: "為什麼" + maxWk.wk + "花特別多？",
              a: (() => {
                // Analyze what's bought on the expensive day
                const dayItems = {};
                invoices.filter((inv) => {
                  if (!inv.issued_at) return false;
                  const dt = new Date(inv.issued_at);
                  const wk = wkNames[dt.getDay() === 0 ? 6 : dt.getDay() - 1];
                  return wk === maxWk.wk && !isDeliveryPlatform(inv.shop);
                }).forEach((inv) => {
                  (inv.items || []).forEach((it) => {
                    const cat = classifyItem(it.name);
                    if (cat === "其他" || cat === "外送服務費") return;
                    if (!dayItems[cat]) dayItems[cat] = { count: 0, total: 0 };
                    dayItems[cat].count += it.qty || 1;
                    dayItems[cat].total += it.price || 0;
                  });
                });
                const sorted = Object.entries(dayItems).sort((a, b) => b[1].total - a[1].total).slice(0, 4);
                return maxWk.wk + " 你主要花在：\n\n" + sorted.map(([cat, d]) => itemCatIcon(cat) + " " + cat + "：$" + fmt(Math.round(d.total)) + "（" + d.count + " 次）").join("\n") + "\n\n" + (maxWk.wk === "週六" || maxWk.wk === "週日" ? "週末通常是採購日和外出日，花費自然偏高。" : "這天可能是你固定的採購或外食日。");
              })(),
              followups: [
                {
                  q: "如果" + maxWk.wk + "消費降到平均，能省多少？",
                  a: (() => {
                    const allAvg = Math.round(wkAvgs.reduce((s, w) => s + w.avg, 0) / wkAvgs.length);
                    const savePerWeek = maxWk.avg - allAvg;
                    const saveYearly = savePerWeek * 52;
                    return "如果" + maxWk.wk + "從 $" + fmt(maxWk.avg) + " 降到日均 $" + fmt(allAvg) + "：\n\n每週省 $" + fmt(savePerWeek) + "，一年省 $" + fmt(saveYearly) + "。\n\n" + fmtComparisons(saveYearly, stats) + "\n\n不是要你不花，而是在" + maxWk.wk + "消費前多想一下。";
                  })(),
                },
                {
                  q: "我有沒有「衝動消費日」？",
                  a: (() => {
                    const allAvg = Math.round(wkAvgs.reduce((s, w) => s + w.avg, 0) / wkAvgs.length);
                    const burstDays = wkAvgs.filter((w) => w.avg > allAvg * 2);
                    if (!burstDays.length) return "沒有特別明顯的衝動消費日——你的消費分佈還算平均。";
                    return "超過日均 2 倍的日子：\n\n" + burstDays.map((w) => "📈 " + w.wk + "：日均 $" + fmt(w.avg) + "（是平均的 " + (w.avg / allAvg).toFixed(1) + " 倍）").join("\n") + "\n\n這些日子的消費明顯偏高，值得留意是計劃性的還是衝動性的。";
                  })(),
                },
              ],
            },
            {
              q: bestPair ? "「" + bestPair[0].split(" + ")[0] + "」和「" + bestPair[0].split(" + ")[1] + "」為什麼總是一起出現？" : "我有什麼固定的消費組合嗎？",
              a: (() => {
                if (!bestPair || bestPair[1] < 3) return "目前沒有明顯的固定組合——你的消費組合比較隨機。";
                const pairItems = bestPair[0].split(" + ");
                const count = bestPair[1];
                let t = "「" + pairItems[0] + "」和「" + pairItems[1] + "」一起出現了 " + count + " 次。\n\n這代表每次買其中一個，你幾乎都會順手買另一個——這是一個自動化的消費組合。";
                if (topPairs.length > 1) {
                  t += "\n\n其他常見組合：\n" + topPairs.slice(1, 4).map(([pair, c]) => "🔗 " + pair + "（" + c + " 次）").join("\n");
                }
                return t;
              })(),
              followups: [
                {
                  q: "這些組合一年花多少？",
                  a: (() => {
                    const comboTotal = topPairs.slice(0, 3).reduce((s, [, c]) => s + c, 0);
                    // rough estimate: each combo appearance = ~$100 avg
                    const avgComboSpend = 100;
                    const yearly = Math.round(comboTotal * avgComboSpend / months.length * 12);
                    return "你的前 3 個固定組合大約每年出現 " + Math.round(comboTotal / months.length * 12) + " 次。\n\n這些「自動搭配」的消費是習慣驅動的——不一定要改，但意識到它的存在就是第一步。";
                  })(),
                },
                {
                  q: "打破這些組合有什麼好處？",
                  a: "不是要你不買——而是把「自動搭配」變成「有意識的選擇」。\n\n比如每次買 A 都會順手買 B：\n• 下次買 A 時，問自己「我真的想要 B 嗎？」\n• 如果答案是 yes，那就買——但這是你的決定，不是習慣的決定\n\n光是這個意識，就能減少 20-30% 的「順手消費」。",
                },
              ],
            },
          ],
        },
      });
    }
  }

  // ── Type: SAVE_PLAN ────────────────────────────────────────────────
  // Concrete, ranked saving strategies based on user's actual data
  const savePlans = [];
  // Strategy 1: Convenience store → supermarket migration
  const convCat = cats.find((c) => c.cat === "超商");
  const marketBrand = brands.find((b) => b.cat === "超市");
  if (convCat && convCat.visits >= 10 && marketBrand) {
    const yearlySave = Math.round(convCat.total / months.length * 12 * 0.25);
    savePlans.push({ icon: "🏪→🛒", label: "超商固定品項改在「" + marketBrand.brand + "」買", save: yearlySave, effort: "低", detail: "同品項超市便宜 20-30%，你已經固定去" + marketBrand.brand + "，多帶幾樣就好", monthly: Math.round(yearlySave / 12) });
  }
  // Strategy 2: Control avg-price creep
  if (creepingBrands.length > 0) {
    const cb = creepingBrands[0];
    const extra = cb._avgAft - cb._avgBef;
    const yearlySave = Math.round(extra * (cb.visits / months.length) * 12);
    savePlans.push({ icon: "📉", label: "「" + cb.brand + "」每次控制回 $" + fmt(cb._avgBef), save: yearlySave, effort: "低", detail: "列清單再出門，避免順便加購。回到之前的均價就好", monthly: Math.round(yearlySave / 12) });
  }
  // Strategy 3: Reduce frequency of top brand
  if (brands[0] && brands[0].visits >= 10) {
    const tb = brands[0];
    const avg = Math.round(tb.total / tb.visits);
    const weeklyVisits = tb.visits / (totalDays / 7);
    if (weeklyVisits >= 2 && avg > 20) {
      const yearlySave = avg * 52; // reduce 1/week
      savePlans.push({ icon: "📅", label: "「" + tb.brand + "」每週少去 1 次", save: yearlySave, effort: "中", detail: "目前每週 " + weeklyVisits.toFixed(1) + " 次，少 1 次不影響生活", monthly: Math.round(yearlySave / 12) });
    }
  }
  // Strategy 4: Consolidate duplicate category brands
  const catBrandGroups = {};
  brands.filter((b) => b.visits >= 3 && !BILL_CATS.includes(b.cat) && b.cat !== "其他").forEach((b) => {
    if (!catBrandGroups[b.cat]) catBrandGroups[b.cat] = [];
    catBrandGroups[b.cat].push(b);
  });
  const mergeableCat = Object.entries(catBrandGroups).filter(([, bs]) => bs.length >= 2).map(([cat, bs]) => {
    const sorted = bs.sort((a, b) => (a.total / a.visits) - (b.total / b.visits));
    const cheapest = sorted[0];
    const others = sorted.slice(1);
    const saveable = others.reduce((s, b) => s + Math.round((b.total / b.visits - cheapest.total / cheapest.visits) * b.visits), 0);
    return { cat, cheapest, others, saveable };
  }).filter((m) => m.saveable > 500).sort((a, b) => b.saveable - a.saveable);
  if (mergeableCat.length > 0) {
    const m = mergeableCat[0];
    const yearlySave = Math.round(m.saveable / months.length * 12);
    savePlans.push({ icon: "🔄", label: "「" + m.cat + "」集中在「" + m.cheapest.brand + "」消費", save: yearlySave, effort: "低", detail: "目前分散 " + (m.others.length + 1) + " 家，集中一家可累積回饋且減少衝動消費", monthly: Math.round(yearlySave / 12) });
  }
  // Strategy 5: New habit awareness (from growth)
  if (growthList.length > 0) {
    const newHabit = growthList.find((g) => g.growth === 999 || g.growth > 200);
    if (newHabit) {
      const yearlySave = Math.round(newHabit.total / months.length * 12 * 0.5);
      savePlans.push({ icon: "🆕", label: "新習慣「" + newHabit.brand + "」頻率減半", save: yearlySave, effort: "中", detail: "這個習慣還在形成中，現在調整最容易", monthly: Math.round(yearlySave / 12) });
    }
  }

  savePlans.sort((a, b) => b.save - a.save);
  const totalSaveable = savePlans.reduce((s, p) => s + p.save, 0);

  if (savePlans.length >= 2) {
    const score = 85; // Always high — everyone wants to know how to save

    candidates.push({
      type: "save", score,
      hook: {
        id: "save",
        q: "怎麼省最有感？",
        big: "$" + fmt(totalSaveable) + "/年",
        bigSub: "不用改變生活就能省下的金額",
        body: "根據你的消費數據，以下是最有效的省錢方案，按「省最多、最不費力」排序：",
        ranks: savePlans.slice(0, 4).map((p) => ({
          rank: p.icon, name: p.label,
          freq: "$" + fmt(p.save) + "/年",
          note: "每月 $" + fmt(p.monthly) + " · 難度" + p.effort,
        })),
        tip: "全部做到可以一年省 $" + fmt(totalSaveable) + "。但不用全做——挑最無痛的 1-2 個開始就好。\n\n" + fmtComparisons(totalSaveable, stats),
        followups: [
          {
            q: "最無痛的第一步是什麼？",
            a: (() => {
              const easiest = savePlans.filter((p) => p.effort === "低").sort((a, b) => b.save - a.save)[0];
              if (!easiest) return "從最高頻的消費開始觀察，小調整就有感。";
              return "最推薦先做：\n\n" + easiest.icon + " " + easiest.label + "\n\n為什麼？\n• 一年省 $" + fmt(easiest.save) + "\n• " + easiest.detail + "\n• 難度最低，不需要改變任何習慣\n\n" + fmtComparisons(easiest.save, stats);
            })(),
            followups: [
              {
                q: "做了之後下一步呢？",
                a: (() => {
                  const steps = savePlans.filter((p) => p.effort === "低").sort((a, b) => b.save - a.save);
                  if (steps.length < 2) return "先把第一步養成習慣，穩定後再看看其他調整。";
                  return "第一步穩定後，接著做：\n\n" + steps.slice(1, 3).map((p) => p.icon + " " + p.label + "（$" + fmt(p.save) + "/年）").join("\n") + "\n\n循序漸進，不要一次改太多。";
                })(),
              },
              {
                q: "會不會影響生活品質？",
                a: (() => {
                  const easiest = savePlans.filter((p) => p.effort === "低")[0];
                  return "這些都是「轉移」而不是「犧牲」：\n\n" + (easiest ? "• " + easiest.label + "——同樣的東西，只是換個地方買\n" : "") + "• 不是要你少吃少喝，而是把錢花得更聰明\n• 省下的錢可以拿去做讓你更開心的事\n\n生活品質不會變差，只是消費路徑微調。";
                })(),
              },
            ],
          },
          {
            q: "全部做到的話呢？",
            a: (() => {
              return "全部執行，一年省 $" + fmt(totalSaveable) + "：\n\n" + savePlans.slice(0, 4).map((p) => p.icon + " " + p.label + "：$" + fmt(p.save) + "/年").join("\n") + "\n\n省下來的錢可以：\n" + fmtComparisons(totalSaveable, stats) + "\n\n但記住：不用全做，挑 1-2 個最適合你的就好。";
            })(),
            followups: [
              {
                q: "哪個 CP 值最高？",
                a: (() => {
                  // Best ratio of savings to effort
                  const best = savePlans.filter((p) => p.effort === "低").sort((a, b) => b.save - a.save)[0];
                  if (!best) return "每個方案都不錯，從金額最大的開始。";
                  return "CP 值最高的是：\n\n" + best.icon + " " + best.label + "\n\n• 省 $" + fmt(best.save) + "/年\n• 難度最低\n• " + best.detail + "\n\n不費力但省最多，這就是聰明消費。";
                })(),
              },
              {
                q: "我的消費整體算健康嗎？",
                a: (() => {
                  const monthlyTotal = Math.round(totalAmount / months.length);
                  const savePct = Math.round(totalSaveable / (monthlyTotal * 12) * 100);
                  const healthSignals = [];
                  if (marketBrand) healthSignals.push("✅ 你有固定去超市採買的習慣");
                  if (creepingBrands.length === 0) healthSignals.push("✅ 沒有明顯的均價爬升");
                  if (growthList.length <= 1) healthSignals.push("✅ 消費版圖穩定，沒有失控擴張");
                  const warnSignals = [];
                  if (creepingBrands.length > 2) warnSignals.push("⚠️ 多個通路均價在上升");
                  if (growthList.length > 3) warnSignals.push("⚠️ 新消費習慣增加較快");
                  return "月均消費 $" + fmt(monthlyTotal) + "，可優化空間約 " + savePct + "%。\n\n" + (healthSignals.length > 0 ? "做得好的：\n" + healthSignals.join("\n") + "\n\n" : "") + (warnSignals.length > 0 ? "可以注意的：\n" + warnSignals.join("\n") : "整體消費習慣不錯，微調就能更好。");
                })(),
              },
            ],
          },
        ],
      },
    });
  }

  // ── Pick top 4 ────────────────────────────────────────────────────
  // When item data is available, prioritize the item-based insights:
  // PREDICT → item drinks/categories → PRICE_GAP → SAVE
  // This ensures the 4 hooks leverage item data for maximum impact
  let picked;
  if (hasItems) {
    // 4 hooks base, add 5th (subscription) when user has ≥2 subscriptions
    const subCandidate = candidates.find((c) => c.type === "subscription");
    const hasManySubscriptions = subCandidate && userSubs.length >= 2;
    // autopay + items + save are core, 4th slot filled by best-scoring remaining insight
    const preferred = ["autopay", "items", "benchmark", "pattern", "save"];
    if (hasManySubscriptions) preferred.push("subscription");
    const maxHooks = preferred.length; // 4 or 5
    const preferredPicked = [];
    preferred.forEach((type) => {
      const found = candidates.find((c) => c.type === type);
      if (found && preferredPicked.length < maxHooks) preferredPicked.push(found);
    });
    // Fill remaining slots with highest-scoring non-preferred
    if (preferredPicked.length < maxHooks) {
      const usedTypes = new Set(preferredPicked.map((c) => c.type));
      candidates.sort((a, b) => b.score - a.score);
      candidates.forEach((c) => {
        if (!usedTypes.has(c.type) && preferredPicked.length < maxHooks) {
          preferredPicked.push(c);
          usedTypes.add(c.type);
        }
      });
    }
    picked = preferredPicked;
  } else {
    candidates.sort((a, b) => b.score - a.score);
    picked = candidates.slice(0, 4);
  }
  const hooks = picked.map((c) => c.hook);

  // ── Dynamic bridge sentences ──────────────────────────────────────
  const bridges = [];
  for (let i = 0; i < hooks.length - 1; i++) {
    const curr = picked[i];
    const next = picked[i + 1];
    const bridgeMap = {
      "frequency→growth": "知道了你最依賴什麼。但有些消費正在悄悄擴張中——",
      "frequency→creep": "知道了你去最多的地方。但有些通路，你每次花的錢正在悄悄增加——",
      "frequency→dominance": "知道了你的消費依賴。接下來看看你的錢到底集中在哪個類別——",
      "frequency→projection": "知道了你最常去哪。但照這個花法，一年下來呢？",
      "growth→creep": "看到了什麼在擴張。同時有些通路的均價也在悄悄爬升——",
      "growth→dominance": "新習慣在增加。來看看整體類別分布——你的錢主要花在哪？",
      "growth→projection": "新習慣會持續燒錢。照目前趨勢，一年後呢？",
      "creep→growth": "知道了均價在爬升。同時有些新消費習慣也在快速形成——",
      "creep→dominance": "看到了均價在哪裡漲。來看看整體類別分布——",
      "creep→projection": "均價在爬升，如果不調整，一年後呢？",
      "dominance→growth": "看到了消費集中的地方。同時有些新趨勢在發生——",
      "dominance→creep": "知道了類別分布。但有些通路每次消費正在悄悄變貴——",
      "dominance→projection": "知道了錢花在哪。照這樣下去，一年呢？",
      "projection→growth": "看到了未來預估。來看看哪些消費正在加速——",
      "projection→creep": "知道了年花費。但你可能沒注意到，有些通路每次花的錢越來越多——",
      "projection→dominance": "看到了整體數字。來看看具體花在哪個類別——",
      "frequency→save": "知道了你的消費依賴。那有什麼辦法可以花得更聰明？",
      "growth→save": "新習慣在燒錢。來看看怎麼聰明省下來——",
      "creep→save": "均價在爬升。有哪些方法可以不費力地省回來？",
      "dominance→save": "知道了錢集中在哪。來看看怎麼優化最有感——",
      "projection→save": "看到了一年的數字。接下來看看怎麼讓這個數字小一點——",
      "save→frequency": "知道了怎麼省。回頭看看你最依賴什麼——",
      "save→growth": "有了省錢方案。但同時有些新消費在快速形成——",
      "save→creep": "知道了怎麼省。但有些通路的均價也在悄悄漲——",
      "save→dominance": "有了省錢計劃。來看看你的錢整體花在哪——",
      "save→projection": "知道了怎麼省。照目前趨勢，一年後呢？",
      "positive→frequency": "知道了你做得好的地方。接下來看看你最依賴什麼——",
      "positive→growth": "有些地方做得好。但同時有些消費在快速擴張——",
      "positive→creep": "做得好的值得肯定。但也有些通路的均價在悄悄漲——",
      "positive→dominance": "知道了你的優勢。來看看整體消費分佈——",
      "positive→projection": "做得不錯！但照整體趨勢，一年後呢？",
      "positive→save": "知道了優勢在哪。接下來看看怎麼更聰明地省——",
      "frequency→positive": "知道了你的依賴。但不是所有消費都要改——有些你做得很好。",
      "growth→positive": "看到了在擴張的。但也有好消息——有些地方你控制得不錯。",
      "creep→positive": "均價在爬升的要注意。但也有些通路你做得很好——",
      "dominance→positive": "看了類別分佈。但不全是壞消息——有些地方你做得不錯。",
      "projection→positive": "看了未來預估。但也有好消息——你有些地方做得很好。",
      "save→positive": "有了省錢計劃。順便看看你已經做得好的地方——值得肯定。",
      "items→frequency": "看了你最常買的東西。接下來看看你最依賴哪個通路——",
      "items→growth": "知道了你買什麼。但有些消費正在悄悄增加——",
      "items→creep": "看了品項明細。有些通路每次花的錢也在變多——",
      "items→dominance": "了解了你買什麼。來看看整體類別分佈——",
      "items→projection": "知道了你的消費品項。照這個花法，一年呢？",
      "items→save": "看了你常買的東西。那有什麼辦法可以花得更聰明？",
      "items→positive": "知道了你買什麼。也有好消息——有些地方你做得不錯。",
      "frequency→items": "知道了你最依賴哪。但你在這些店都買什麼？從品項看更有趣——",
      "growth→items": "看到了什麼在擴張。來看看你實際都在買什麼——",
      "creep→items": "均價在爬升。那你都在買什麼東西？從品項找答案——",
      "dominance→items": "看了類別分佈。來看看你實際最常買的品項是什麼——",
      "projection→items": "看了年花費。但你的錢具體花在什麼品項上？",
      "save→items": "有了省錢方案。來看看你最常買什麼——說不定能找到更精準的切入點。",
      "positive→items": "知道了做得好的地方。來看看你實際都在買什麼——",
      "autopay→pricegap": "知道了你的隱形月費。但同一個東西你在不同地方的價格可能差很多——",
      "autopay→frequency": "看到了你的隱形月費。來看看你最依賴哪個通路——",
      "autopay→growth": "看了你的隱形月費。但有些新消費正在加入你的「自動導航」——",
      "autopay→creep": "看到了你的習慣消費。同時有些通路的均價在悄悄上升——",
      "autopay→dominance": "知道了你買什麼。來看看整體類別分佈——",
      "autopay→projection": "看到了你的隱形月費。照這個模式，一年呢？",
      "autopay→save": "知道了你的消費模式。那有什麼辦法可以花得更聰明？",
      "autopay→positive": "看到了自動化消費。但也有好消息——有些地方你做得不錯。",
      "autopay→items": "知道了你的隱形月費。更深入看看你都在買什麼——",
      "pricegap→autopay": "看到了價差。但你有一筆「隱形月費」——習慣幫你自動扣款——",
      "pricegap→frequency": "知道了同一個東西的價差。來看看你最依賴哪個通路——",
      "pricegap→growth": "看了價差分析。同時有些消費在快速擴張——",
      "pricegap→save": "知道了哪裡有價差。來看看完整的省錢方案——",
      "pricegap→positive": "看了價差。但也有好消息——有些地方你已經選了便宜的。",
      "pricegap→items": "知道了價差。來看看你最常買的品項是什麼——",
      "pricegap→projection": "看了價差。如果不調整，一年呢？",
      "frequency→autopay": "知道了你最依賴哪。但你可能不知道——你有一筆「隱形月費」你可能沒注意到。",
      "growth→autopay": "看到了在擴張的消費。但你可能不知道自己有一筆「隱形月費」——",
      "items→autopay": "看了你常買什麼。但你可能不知道——你有一筆習慣幫你自動扣的「隱形月費」。",
      "items→pricegap": "知道了你買什麼。但同一個東西你在不同地方的價格差很多——",
      "save→autopay": "有了省錢方案。另外你可能不知道——你其實有一筆「隱形月費」。",
      "save→pricegap": "有了省錢方案。再看看同一個東西的價差——這也是省錢的切入點。",
      "frequency→pricegap": "知道了你最依賴哪。但同一個東西你在不同通路的價格差很多——",
      "dominance→autopay": "看了類別分佈。但你可能不知道——你有一筆不小的「隱形月費」。",
      "dominance→pricegap": "看了消費分佈。但同一個東西的價差可能會讓你驚訝——",
      "creep→autopay": "均價在爬升。同時你也有一筆「隱形月費」——",
      "projection→autopay": "看了年花費。但你可能不知道習慣幫你「自動扣款」多少——",
      "positive→autopay": "知道了做得好的地方。但但你的消費習慣每月悄悄「扣款」的金額可能會讓你驚訝——",
      "positive→pricegap": "做得好的值得肯定。但同一個東西的價差你可能沒注意到——",
      "creep→pricegap": "均價在爬升。同時同一個東西在不同通路的價差也很明顯——",
      "projection→pricegap": "看了未來預估。但你可能沒注意到同一個東西在不同地方價差多少——",
      "autopay→subscription": "看到了你的隱形月費。說到「自動」——你還有幾筆訂閱也在自動扣款。",
      "items→subscription": "知道了你買什麼。另外你有幾筆訂閱正在自動扣款——",
      "pricegap→subscription": "看了價差。另外你的訂閱月費也值得看一下——",
      "save→subscription": "有了省錢方案。另外看看你的訂閱——這些也是每月自動扣款。",
      "pattern→save": "發現了隱藏規律。接下來看看怎麼省最有感——",
      "pattern→autopay": "看到了你的消費規律。另外你有些品項一直在重複買——",
      "pattern→items": "發現了隱藏模式。來看看你的品類消費——",
      "pattern→benchmark": "看到了你的消費規律。跟別人比起來呢？",
      "autopay→pattern": "看了重複消費。另外你的消費還有一些隱藏規律——",
      "items→pattern": "知道了品類花費。你的消費時間和組合也有一些有趣的規律——",
      "benchmark→pattern": "跟別人比完了。你的消費還有一些隱藏的行為模式——",
      "save→pattern": "有了省錢方案。另外你的消費也有一些有趣的隱藏規律——",
      "benchmark→save": "知道了跟別人的差距。接下來看看怎麼省最有感——",
      "benchmark→autopay": "看了跟別人的比較。另外你有些品項一直在重複買——",
      "benchmark→items": "知道了跟別人的差異。來看看你都在買什麼品項——",
      "benchmark→subscription": "看了消費比較。另外你的訂閱也值得看一下——",
      "autopay→benchmark": "看了你的重複消費。想知道同樣的東西，別人都怎麼買嗎？",
      "items→benchmark": "知道了你買什麼。那同樣的東西，別人花多少？",
      "save→benchmark": "有了省錢方案。也看看跟別人比，你的消費在什麼水平——",
      "subscription→autopay": "看了訂閱費。另外你的消費模式也很有趣——你有一筆「隱形月費」——習慣幫你扣的。",
      "subscription→items": "檢視了訂閱。來看看你日常都在買什麼——",
      "subscription→pricegap": "看了訂閱。同一個東西在不同地方的價差也很驚人——",
      "subscription→save": "知道了訂閱費。來看看完整的省錢方案——",
      "subscription→frequency": "看了訂閱。來看看你最依賴哪個通路——",
      "subscription→growth": "檢視了訂閱。另外有些消費正在快速增加——",
      "frequency→subscription": "知道了你最依賴什麼。另外你有幾筆訂閱在自動扣款——",
      "growth→subscription": "看到了在擴張的消費。另外你的訂閱也值得檢視——",
    };
    bridges.push(bridgeMap[curr.type + "→" + next.type] || "接下來看看另一個有趣的發現——");
  }

  // ── Summary ───────────────────────────────────────────────────────
  const topBrand = brands[0];
  const topGrowth = growthList[0];
  const summaryParts = [];
  if (topBrand) summaryParts.push("最依賴「" + topBrand.brand + "」（每 " + (totalDays / topBrand.visits).toFixed(1) + " 天）");
  if (topGrowth) summaryParts.push("「" + topGrowth.brand + "」成長最快（" + (topGrowth.growth === 999 ? "新增" : "+" + topGrowth.growth + "%") + "）");
  if (creepingBrands[0]) summaryParts.push("「" + creepingBrands[0].brand + "」均價正在爬升（$" + creepingBrands[0]._avgBef + "→$" + creepingBrands[0]._avgAft + "）");
  const summary = "分析完你的 " + invoiceCount + " 張發票。" + summaryParts.join("；") + "。";

  // ── Opener — pick the most WOW fact, then reorder hooks to match ───
  // Score each potential opener by "shock factor" — the bigger the contrast with expectations, the better
  const openerOptions = [];

  // Top category — dynamic based on composite score
  if (topCatResult) {
    const tcO = topCatResult;
    const tcYearlyO = Math.round(tcO.total / months.length * 12);
    const growthO = tcO.freqGrowth > 30 ? "，而且還在增加中" : "";
    openerOptions.push({ type: "items", score: Math.min(tcO.count, 85), text: "你的「" + tcO.cat + "」花了 $" + fmt(Math.round(tcO.total)) + "——" + tcO.count + " 次消費" + growthO + "，年化 $" + fmt(tcYearlyO) + "。" });
  }

  // Savings — "每年可省 $X" — big number is shocking
  if (totalSaveable > 3000) {
    openerOptions.push({ type: "save", score: Math.min(totalSaveable / 500, 80), text: "看完你的消費後，我發現每年有 $" + fmt(totalSaveable) + " 可以不改變生活就省下來。" });
  }

  // Habit autopay — "$X/month you didn't know about"
  if (habitMonthly > 200) {
    const habitTotal = habitItems.reduce((s, it) => s + it.total, 0);
    openerOptions.push({ type: "autopay", score: Math.min(habitItems.length * 2, 70), text: "你有 " + habitItems.length + " 個品項你反覆在買——累計花了 $" + fmt(Math.round(habitTotal)) + "，你可能沒注意到。" });
  }

  // Benchmark — "Others buy differently"
  if (bmResults && bmResults.length >= 2) {
    const topBm = bmResults[0];
    openerOptions.push({ type: "benchmark", score: Math.min(Math.abs(topBm.diffPct), 65), text: "同樣在" + topBm.scope + "買「" + topBm.cat + "」，你花 $" + topBm.userAvg + "，其他人平均只花 $" + topBm.groupAvg + "。" });
  }

  // Subscription
  if (userSubs.length >= 2) {
    const subTotal = userSubs.reduce((s, sub) => s + sub.price, 0);
    openerOptions.push({ type: "subscription", score: Math.min(subTotal / 20, 50), text: "你有 " + userSubs.length + " 個訂閱正在每月自動扣款 $" + fmt(Math.round(subTotal)) + "——其中有些你可能已經忘了。" });
  }

  // Pick most shocking
  openerOptions.sort((a, b) => b.score - a.score);
  const bestOpener = openerOptions[0];
  let opener = bestOpener ? bestOpener.text : "讓我幫你分析一下消費狀況。";

  // Reorder hooks so the matching hook is first
  if (bestOpener) {
    const matchIdx = hooks.findIndex((h) => picked.find((p) => p.type === bestOpener.type)?.hook.id === h.id);
    if (matchIdx > 0) {
      const [matched] = hooks.splice(matchIdx, 1);
      hooks.unshift(matched);
    }
  }

  return { hooks, bridges, summary, opener };
}

export { detectInsights, fmtComparisons };
