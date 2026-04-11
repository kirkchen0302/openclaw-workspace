/**
 * Insight Engine — 從用戶真實消費數據中挖掘最有衝擊力的洞察
 * 動態生成 4 個 Hook，每個有 2 追問 × 2 深追問
 */
import { resolveShop } from "./shopMapping";
import { classifyItem, aggregateItemCategories } from "./itemClassifier";

const fmt = (n) => n.toLocaleString();
const catIcon = (cat) => ({ "外送": "🛵", "速食": "🍔", "超商": "🏪", "超市": "🛒", "咖啡": "☕", "飲料": "🧋", "餐飲": "🍽", "網購": "📦", "美妝": "💄", "訂閱": "📱", "加油": "⛽", "量販": "🛒", "百貨": "🏬", "停車": "🅿️", "電影娛樂": "🎬", "運動": "💪" }[cat] || "📌");
const itemCatIcon = (cat) => ({ "咖啡": "☕", "茶飲": "🍵", "手搖飲": "🧋", "瓶裝飲料": "🥤", "乳製品": "🥛", "速食餐點": "🍔", "便當/正餐": "🍱", "麵包/烘焙": "🍞", "零食/餅乾": "🍪", "滷味/小食": "🥚", "生鮮蔬果": "🥬", "生鮮肉品": "🥩", "衛生紙/面紙": "🧻", "洗髮/沐浴": "🧴", "美妝保養": "💄", "生理用品": "🩹", "外送服務費": "🛵", "訂閱服務": "📱", "加油": "⛽" }[cat] || "📦");

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

  return { brands, brandsByTotal, cats, months, totalAmount, totalDays, avgPerVisit, brandFirst, brandSecond, firstKeys, secondKeys };
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
  const { brands, brandsByTotal, cats, months, totalDays, avgPerVisit, brandFirst, brandSecond, firstKeys, secondKeys } = stats;
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

  // ── Type: PREDICT ──────────────────────────────────────────────────
  // "AI can predict what you'll buy next" — status quo bias shock
  if (hasItems) {
    const predictions = [];
    brands.filter((b) => b.visits >= 5 && !isDeliveryPlatform(b.brand)).slice(0, 6).forEach((b) => {
      const topIt = getTopItemsForBrand(invoices, b.brand, 3).filter((it) => classifyItem(it.name) !== "外送服務費");
      if (topIt.length === 0) return;
      const hitRate = Math.round(topIt[0].count / b.visits * 100);
      if (hitRate >= 30) {
        predictions.push({ brand: b.brand, cat: b.cat, visits: b.visits, topItem: topIt[0], topItems: topIt, hitRate });
      }
    });
    predictions.sort((a, b) => b.hitRate - a.hitRate);

    if (predictions.length >= 2) {
      const best = predictions[0];
      const score = 95 + Math.min(best.hitRate, 10); // Very high score — this is the most shocking

      // Calculate total "autopilot" spending
      const autoTotal = predictions.reduce((s, p) => s + p.topItems.reduce((s2, it) => s2 + it.total, 0), 0);
      const autoMonthly = Math.round(autoTotal / Math.max(months.length, 1));

      candidates.push({
        type: "predict", score,
        hook: {
          id: "predict",
          q: "AI 能預測你下次會買什麼嗎？",
          big: best.hitRate + "%",
          bigSub: "你走進「" + best.brand + "」→ AI 猜你會買「" + best.topItem.name + "」——準確率 " + best.hitRate + "%",
          body: "你以為每次消費都在「選擇」？AI 看完你的品項明細後，已經能預測你在每家店會買什麼：",
          ranks: predictions.slice(0, 4).map((p) => ({
            rank: catIcon(p.cat),
            name: p.brand,
            freq: p.hitRate + "% 命中",
            note: "→ " + p.topItem.name + "（" + p.topItem.count + "/" + p.visits + " 次）",
          })),
          tip: "你以為自己在「選」，其實你在「重播」。行為經濟學稱這為「現狀偏誤」——大腦把做過的決策當作好的決策，所以你不假思索地重複。這 " + predictions.length + " 個通路的自動化消費，每月 $" + fmt(autoMonthly) + "。",
          followups: [
            {
              q: "我在「" + best.brand + "」的完整固定菜單？",
              a: (() => {
                const allIt = getTopItemsForBrand(invoices, best.brand, 8);
                return "你在「" + best.brand + "」的消費 " + best.visits + " 次中，這些品項反覆出現：\n\n" + allIt.map((it, i) => (i + 1) + ". " + itemCatIcon(it.cat) + " " + it.name + "（" + it.count + " 次 $" + fmt(Math.round(it.total)) + "）").join("\n") + "\n\n" + (allIt.length >= 3 ? "前 3 項的組合就是你的「隱藏套餐」——AI 下次看到你進「" + best.brand + "」就知道你會點這些。" : "");
              })(),
              followups: [
                {
                  q: "其他店我也有固定套路嗎？",
                  a: (() => {
                    const others = predictions.filter((p) => p.brand !== best.brand).slice(0, 3);
                    if (!others.length) return "目前其他店的消費比較隨機，沒有明顯的固定套路。";
                    return "你在其他店的「自動導航」：\n\n" + others.map((p) => catIcon(p.cat) + " " + p.brand + "（" + p.hitRate + "% 可預測）\n  → " + p.topItems.slice(0, 2).map((it) => it.name).join(" + ")).join("\n\n");
                  })(),
                },
                {
                  q: "這些自動化消費一年花多少？",
                  a: (() => {
                    const yearly = autoMonthly * 12;
                    return "你的「自動導航消費」每月 $" + fmt(autoMonthly) + "，一年 $" + fmt(yearly) + "。\n\n" + fmtComparisons(yearly, stats) + "\n\n這些錢不是亂花，但也不是「有意識地決定」的。知道就好。";
                  })(),
                },
              ],
            },
            {
              q: "哪些品項是我「沒意識到」一直在買的？",
              a: (() => {
                // Find items with high repeat count but not the "obvious" ones (not top 3 overall)
                const allItems = {};
                invoices.forEach((inv) => (inv.items || []).forEach((it) => {
                  if (!it.name) return;
                  const cat = classifyItem(it.name);
                  if (cat === "其他" || cat === "外送服務費" || cat === "餐飲消費") return;
                  if (!allItems[it.name]) allItems[it.name] = { name: it.name, count: 0, total: 0, cat, shop: inv.shop };
                  allItems[it.name].count += it.qty || 1;
                  allItems[it.name].total += it.price || 0;
                }));
                const hidden = Object.values(allItems).filter((it) => it.count >= 3).sort((a, b) => b.count - a.count).slice(3, 10); // skip top 3 obvious ones
                if (!hidden.length) return "你的重複購買品項不多，消費相對隨機。";
                return "你可能沒注意到自己一直在買這些：\n\n" + hidden.map((it) => itemCatIcon(it.cat) + " " + it.name + "（" + it.count + " 次 $" + fmt(Math.round(it.total)) + "）在「" + it.shop + "」").join("\n") + "\n\n這些不是大筆消費，但因為太自動化了你根本不會注意到。";
              })(),
              followups: [
                {
                  q: "我的消費有多「自動化」？",
                  a: (() => {
                    const totalRepeat = predictions.reduce((s, p) => s + p.topItems.reduce((s2, it) => s2 + it.count, 0), 0);
                    const totalInvItems = invoices.reduce((s, inv) => s + (inv.items || []).length, 0);
                    const autoPct = totalInvItems > 0 ? Math.round(totalRepeat / totalInvItems * 100) : 0;
                    return "你的消費品項中，約 " + autoPct + "% 是可預測的重複購買。\n\n" + (autoPct > 40 ? "超過 4 成——你的消費基本上在自動導航。不一定是壞事，但代表你有很大的「微調空間」。" : autoPct > 20 ? "大約 " + autoPct + "%——不算太自動化，但核心品項的重複度很高。" : "比較隨機，沒有太嚴重的自動化問題。");
                  })(),
                },
                {
                  q: "打破自動化有什麼好處？",
                  a: "不是要你每次都做不同選擇——那太累了。\n\n但「知道自己在自動導航」本身就是好處：\n\n1️⃣ 你可以有意識地保留好的習慣（如 LP33 健康飲）\n2️⃣ 主動淘汰「只是因為習慣」的消費（如每次順手帶的零食）\n3️⃣ 把省下的空間留給新體驗\n\n不是改變，是「升級」你的自動導航路線。",
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
    const gaps = [];
    Object.entries(catByStore).forEach(([cat, stores]) => {
      const storeList = Object.entries(stores).filter(([, d]) => d.count >= 2).map(([shop, d]) => ({ shop, count: d.count, avg: Math.round(d.total / d.count) }));
      if (storeList.length < 2) return;
      storeList.sort((a, b) => a.avg - b.avg);
      const cheapest = storeList[0];
      const most = storeList[storeList.length - 1];
      if (most.avg <= cheapest.avg * 1.15) return; // less than 15% gap — not interesting
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
          q: "同一個東西，你付了幾種價格？",
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
  // Item-level analysis — what you actually buy, not just where
  if (hasItems) {
    const nonDeliveryInvoices = invoices.filter((inv) => !isDeliveryPlatform(inv.shop));
    const itemCats = aggregateItemCategories(nonDeliveryInvoices);
    const meaningfulCats = itemCats.filter((c) => c.cat !== "其他" && c.cat !== "外送服務費" && c.cat !== "餐飲消費");
    const topItemCat = meaningfulCats[0];

    if (topItemCat && topItemCat.count >= 5) {
      const topItem = topItemCat.items[0];
      const totalItemSpend = meaningfulCats.reduce((s, c) => s + c.total, 0);
      const score = 82 + Math.min(meaningfulCats.length, 10);

      candidates.push({
        type: "items", score,
        hook: {
          id: "items",
          q: "你最常買的東西是什麼？",
          big: topItem ? topItem.count + " 次" : topItemCat.count + " 次",
          bigSub: topItem ? "「" + topItem.name + "」是你的最愛——買了 " + topItem.count + " 次" : "「" + topItemCat.cat + "」類品項你買最多",
          body: "從你的發票品項明細來看，你的消費分佈在這些品類：",
          ranks: meaningfulCats.slice(0, 6).map((c) => ({
            rank: itemCatIcon(c.cat),
            name: c.cat,
            freq: c.count + " 項 $" + fmt(Math.round(c.total)),
            note: c.items[0] ? "常買：" + c.items[0].name : "",
          })),
          tip: "「" + topItemCat.cat + "」佔了你品項消費的 " + (totalItemSpend > 0 ? Math.round(topItemCat.total / totalItemSpend * 100) : 0) + "%。了解你買什麼，比只看去哪裡更能反映真實的消費習慣。",
          followups: [
            {
              q: "我在「" + (brands[0]?.brand || "最常去的店") + "」都買什麼？",
              a: (() => {
                const topShop = brands[0]?.brand;
                if (!topShop) return "資料不足。";
                const shopInvs = invoices.filter((inv) => inv.shop === topShop || resolveShop(inv.shop).brand === topShop);
                const shopItems = {};
                shopInvs.forEach((inv) => {
                  (inv.items || []).forEach((item) => {
                    const n = item.name;
                    if (!shopItems[n]) shopItems[n] = { name: n, count: 0, total: 0, cat: classifyItem(n) };
                    shopItems[n].count += item.qty || 1;
                    shopItems[n].total += item.price || 0;
                  });
                });
                const sorted = Object.values(shopItems).sort((a, b) => b.count - a.count).slice(0, 8);
                if (!sorted.length) return "這個通路的品項明細不夠多。";
                return "你在「" + topShop + "」最常買的：\n\n" + sorted.map((it) => itemCatIcon(it.cat) + " " + it.name + "（" + it.count + " 次 $" + fmt(Math.round(it.total)) + "）").join("\n");
              })(),
              followups: [
                {
                  q: "有沒有每次都會買的「固定班底」？",
                  a: (() => {
                    const allItems = {};
                    invoices.forEach((inv) => {
                      (inv.items || []).forEach((item) => {
                        const n = item.name;
                        if (!allItems[n]) allItems[n] = { name: n, count: 0, total: 0, cat: classifyItem(n) };
                        allItems[n].count += item.qty || 1;
                        allItems[n].total += item.price || 0;
                      });
                    });
                    const regulars = Object.values(allItems).filter((it) => it.count >= 5 && it.cat !== "其他" && it.cat !== "外送服務費").sort((a, b) => b.count - a.count).slice(0, 6);
                    if (!regulars.length) return "沒有特別高頻的固定品項。";
                    const yearTotal = regulars.reduce((s, it) => s + Math.round(it.total / months.length * 12), 0);
                    return "你的「固定班底」——買超過 5 次的品項：\n\n" + regulars.map((it) => itemCatIcon(it.cat) + " " + it.name + "（" + it.count + " 次，年化 $" + fmt(Math.round(it.total / months.length * 12)) + "）").join("\n") + "\n\n這些固定品項一年合計約 $" + fmt(yearTotal) + "。";
                  })(),
                },
                {
                  q: "哪些品項的錢花最多？",
                  a: (() => {
                    const allItems = {};
                    invoices.forEach((inv) => {
                      (inv.items || []).forEach((item) => {
                        const n = item.name;
                        if (!allItems[n]) allItems[n] = { name: n, count: 0, total: 0, cat: classifyItem(n) };
                        allItems[n].count += item.qty || 1;
                        allItems[n].total += item.price || 0;
                      });
                    });
                    const bySpend = Object.values(allItems).filter((it) => it.cat !== "其他" && it.cat !== "外送服務費").sort((a, b) => b.total - a.total).slice(0, 6);
                    return "花費最高的品項：\n\n" + bySpend.map((it, i) => (i + 1) + ". " + it.name + "：$" + fmt(Math.round(it.total)) + "（" + it.count + " 次，" + it.cat + "）").join("\n");
                  })(),
                },
              ],
            },
            {
              q: "飲料類花了多少？",
              a: (() => {
                const drinkCats = itemCats.filter((c) => ["咖啡", "茶飲", "手搖飲", "瓶裝飲料"].includes(c.cat));
                const drinkTotal = drinkCats.reduce((s, c) => s + c.total, 0);
                const drinkCount = drinkCats.reduce((s, c) => s + c.count, 0);
                const yearly = Math.round(drinkTotal / months.length * 12);
                if (drinkCount === 0) return "你的發票品項中沒有明顯的飲料消費。";
                return "你的飲料消費：\n\n" + drinkCats.map((c) => itemCatIcon(c.cat) + " " + c.cat + "：" + c.count + " 杯/瓶 $" + fmt(Math.round(c.total))).join("\n") + "\n\n合計 " + drinkCount + " 杯/瓶 $" + fmt(Math.round(drinkTotal)) + "，年化 $" + fmt(yearly) + "。\n\n" + fmtComparisons(yearly, stats);
              })(),
              followups: [
                {
                  q: "我最常喝的飲料是什麼？",
                  a: (() => {
                    const drinkItems = {};
                    invoices.forEach((inv) => {
                      (inv.items || []).forEach((item) => {
                        const cat = classifyItem(item.name);
                        if (["咖啡", "茶飲", "手搖飲", "瓶裝飲料", "乳製品"].includes(cat)) {
                          const n = item.name;
                          if (!drinkItems[n]) drinkItems[n] = { name: n, count: 0, total: 0, cat };
                          drinkItems[n].count += item.qty || 1;
                          drinkItems[n].total += item.price || 0;
                        }
                      });
                    });
                    const sorted = Object.values(drinkItems).sort((a, b) => b.count - a.count).slice(0, 6);
                    if (!sorted.length) return "沒有足夠的飲料品項資料。";
                    return "你的飲料排行榜：\n\n" + sorted.map((it, i) => (i + 1) + ". " + itemCatIcon(it.cat) + " " + it.name + "（" + it.count + " 次 $" + fmt(Math.round(it.total)) + "）").join("\n");
                  })(),
                },
                {
                  q: "零食花了多少？",
                  a: (() => {
                    const snackCat = itemCats.find((c) => c.cat === "零食/餅乾");
                    if (!snackCat || snackCat.count < 2) return "你的零食消費不多，或品項明細中沒有明顯的零食記錄。";
                    const yearly = Math.round(snackCat.total / months.length * 12);
                    return "零食/餅乾：" + snackCat.count + " 次 $" + fmt(Math.round(snackCat.total)) + "\n\n最常買的：\n" + snackCat.items.slice(0, 5).map((it) => "• " + it.name + "（" + it.count + " 次）").join("\n") + "\n\n年化 $" + fmt(yearly) + "。" + (yearly > 3000 ? "\n\n" + fmtComparisons(yearly, stats) : "");
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
        q: "你每月有多少「自動扣款」？",
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
                q: "哪個最可能是浪費？",
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
                  return "你可以逐一問自己：\n\n" + userSubs.map((s) => "📱 " + s.shop + "（$" + fmt(Math.round(s.price)) + "/月）\n  → 上個月用了幾次？值不值這個價？").join("\n\n") + "\n\n如果答不出「上個月用了幾次」——那就很可能是在浪費。\n\n訂閱的設計就是讓你「忘記在付錢」。定期檢視是唯一的解法。";
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
        q: "我可以怎麼聰明省錢？",
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
    const preferred = ["predict", "items", "pricegap", "save"];
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
      "predict→pricegap": "知道了你的消費有多可預測。但同一個東西你在不同地方的價格可能差很多——",
      "predict→frequency": "看到了你的自動導航模式。來看看你最依賴哪個通路——",
      "predict→growth": "你的消費很可預測。但有些新消費正在加入你的「自動導航」——",
      "predict→creep": "看到了你的固定消費模式。同時有些通路的均價在悄悄上升——",
      "predict→dominance": "知道了你買什麼。來看看整體類別分佈——",
      "predict→projection": "看到了你的自動消費。照這個模式，一年呢？",
      "predict→save": "知道了你的消費模式。那有什麼辦法可以花得更聰明？",
      "predict→positive": "看到了自動化消費。但也有好消息——有些地方你做得不錯。",
      "predict→items": "知道了你的預測模式。更深入看看你都在買什麼——",
      "pricegap→predict": "看到了價差。但你的消費可預測程度可能會嚇到你——",
      "pricegap→frequency": "知道了同一個東西的價差。來看看你最依賴哪個通路——",
      "pricegap→growth": "看了價差分析。同時有些消費在快速擴張——",
      "pricegap→save": "知道了哪裡有價差。來看看完整的省錢方案——",
      "pricegap→positive": "看了價差。但也有好消息——有些地方你已經選了便宜的。",
      "pricegap→items": "知道了價差。來看看你最常買的品項是什麼——",
      "pricegap→projection": "看了價差。如果不調整，一年呢？",
      "frequency→predict": "知道了你最依賴哪。但你可能不知道——AI 已經能預測你下次會買什麼。",
      "growth→predict": "看到了在擴張的消費。但你可能不知道自己的消費有多可預測——",
      "items→predict": "看了你常買什麼。但你可能不知道——AI 已經能預測你的下一筆消費。",
      "items→pricegap": "知道了你買什麼。但同一個東西你在不同地方的價格差很多——",
      "save→predict": "有了省錢方案。另外你可能不知道——你的消費其實非常可預測。",
      "save→pricegap": "有了省錢方案。再看看同一個東西的價差——這也是省錢的切入點。",
      "frequency→pricegap": "知道了你最依賴哪。但同一個東西你在不同通路的價格差很多——",
      "dominance→predict": "看了類別分佈。但你可能不知道——你的消費模式高度可預測。",
      "dominance→pricegap": "看了消費分佈。但同一個東西的價差可能會讓你驚訝——",
      "creep→predict": "均價在爬升。同時你的消費模式也高度可預測——",
      "projection→predict": "看了年花費。但你可能不知道自己的消費有多「自動化」——",
      "positive→predict": "知道了做得好的地方。但你的消費可預測程度可能會讓你驚訝——",
      "positive→pricegap": "做得好的值得肯定。但同一個東西的價差你可能沒注意到——",
      "creep→pricegap": "均價在爬升。同時同一個東西在不同通路的價差也很明顯——",
      "projection→pricegap": "看了未來預估。但你可能沒注意到同一個東西在不同地方價差多少——",
      "predict→subscription": "看到了你的自動消費。說到「自動」——你還有幾筆訂閱也在自動扣款。",
      "items→subscription": "知道了你買什麼。另外你有幾筆訂閱正在自動扣款——",
      "pricegap→subscription": "看了價差。另外你的訂閱月費也值得看一下——",
      "save→subscription": "有了省錢方案。另外看看你的訂閱——這些也是每月自動扣款。",
      "subscription→predict": "看了訂閱費。另外你的消費模式也很有趣——AI 能預測你會買什麼。",
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

  // ── Opener — matches Hook 1's theme ───────────────────────────────
  const hook1 = hooks[0];
  const hook1Type = picked[0]?.type;
  let opener = "讓我幫你分析一下消費狀況。";
  if (hook1Type === "growth" && growthList[0]) {
    const g = growthList[0];
    opener = g.growth === 999
      ? "「" + g.brand + "」是你近期才開始的消費——短短幾個月已經去了 " + g.aft + " 次。這個新習慣值得聊聊。"
      : "「" + g.brand + "」的消費正在快速增加——從前期 " + g.bef + " 次到近期 " + g.aft + " 次，成長了 " + g.growth + "%。";
  } else if (hook1Type === "frequency" && brands[0]) {
    opener = "你跟「" + brands[0].brand + "」的關係很穩定——平均每 " + (totalDays / brands[0].visits).toFixed(1) + " 天就會去一次。這是你最離不開的消費。";
  } else if (hook1Type === "creep" && creepingBrands[0]) {
    const c = creepingBrands[0];
    opener = "你去「" + c.brand + "」的頻率沒變，但每次花的錢從 $" + c._avgBef + " 升到了 $" + c._avgAft + "。這種「悄悄變貴」很容易忽略。";
  } else if (hook1Type === "dominance" && realCats[0]) {
    opener = "你的消費有 " + Math.round(realCats[0].total / totalAmount * 100) + "% 集中在「" + realCats[0].cat + "」——這個比例值得聊聊。";
  } else if (hook1Type === "projection") {
    opener = "照你最近的消費速度，一年下來會是 $" + fmt(Math.round(recentAvg * 12)) + "。這個數字可能比你想的大。";
  } else if (hook1Type === "save") {
    opener = "看完你的消費後，我發現有 $" + fmt(totalSaveable) + "/年可以不用改變生活就省下來。想知道怎麼做嗎？";
  } else if (hook1Type === "positive" && stableBrands[0]) {
    opener = "看完你的發票，發現你在「" + stableBrands[0].brand + "」的消費越來越精準——均價從 $" + stableBrands[0]._posBef + " 降到 $" + stableBrands[0]._posAft + "。不是所有消費都要改。";
  } else if (hook1Type === "predict" && hasItems) {
    const topPred = brands[0];
    const topIt = topPred ? getTopItemsForBrand(invoices, topPred.brand, 1)[0] : null;
    opener = topIt ? "我看完你 " + (invoiceCount || 0) + " 張發票的品項明細後，發現一件事——你走進「" + topPred.brand + "」，我有 " + Math.round(topIt.count / topPred.visits * 100) + "% 的把握知道你會買什麼。" : "我看完你的品項明細，發現你的消費比你想的更可預測。";
  } else if (hook1Type === "pricegap" && hasItems) {
    const topG = gaps[0];
    opener = topG ? "同樣是「" + topG.cat + "」，你在「" + topG.most.shop + "」付的比「" + topG.cheapest.shop + "」貴了 " + topG.gapPct + "%——你可能從來沒注意過。" : "你在不同地方買同一類東西，價格差距比你想的大。";
  } else if (hook1Type === "subscription") {
    opener = "你有 " + userSubs.length + " 個訂閱正在每月自動扣款——加起來 $" + fmt(Math.round(userSubs.reduce((s, sub) => s + sub.price, 0))) + "/月。你可能忘了其中幾個。";
  } else if (hook1Type === "items" && hasItems) {
    const topItemCats = aggregateItemCategories(invoices).filter((c) => c.cat !== "其他" && c.cat !== "外送服務費");
    const topIt = topItemCats[0];
    opener = topIt ? "我看了你的消費品項明細——你買最多的是「" + topIt.cat + "」類（" + topIt.count + " 次），比你想的可能還多。" : "我看了你的消費品項明細，有些有趣的發現。";
  }

  return { hooks, bridges, summary, opener };
}

export { detectInsights, fmtComparisons };
