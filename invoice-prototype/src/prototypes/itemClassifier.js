/**
 * Item Classifier — 將發票品項名稱分類到消費品類
 * 使用關鍵字匹配，按優先順序匹配
 */

const RULES = [
  // ── 飲品 ──────────────────────────────────────────────────
  { cat: "咖啡", keywords: ["咖啡", "美式", "拿鐵", "摩卡", "卡布", "espresso", "latte", "americano", "冷萃", "氮氣"] },
  { cat: "茶飲", keywords: ["茶", "紅茶", "綠茶", "烏龍", "奶茶", "抹茶飲", "鮮奶茶", "多多綠", "不知春"] },
  { cat: "手搖飲", keywords: ["珍珠", "波霸", "多多", "冰沙", "果汁", "蘇打", "檸檬", "冬瓜", "仙草", "愛玉", "鮮果"] },
  { cat: "瓶裝飲料", keywords: ["氣泡水", "礦泉水", "可樂", "雪碧", "寶特瓶", "PET", "罐裝", "鋁罐", "美粒果", "舒跑", "黑松", "多喝水", "台鹽海洋", "每朝", "御茶園", "茉莉茶園", "維他命水"] },
  { cat: "乳製品", keywords: ["鮮乳", "鮮奶", "牛奶", "豆漿", "豆奶", "優格", "優酪", "乳酸", "養樂多", "LP33", "AB+", "福樂", "光泉", "六甲", "林鳳營", "瑞穗"] },

  // ── 食物 ──────────────────────────────────────────────────
  { cat: "速食餐點", keywords: ["漢堡", "薯條", "大薯", "中薯", "小薯", "雞塊", "雞翅", "麥克", "六塊雞", "十塊雞", "冰炫風", "蛋堡", "豬排堡", "套餐", "勁辣", "麥香"] },
  { cat: "便當/正餐", keywords: ["便當", "飯糰", "三明治", "御飯糰", "涼麵", "餐盒", "蛋白餐", "雞肉飯", "排骨飯", "焗烤", "義大利麵", "燴飯"] },
  { cat: "麵包/烘焙", keywords: ["麵包", "吐司", "貝果", "可頌", "蛋糕", "泡芙", "鬆餅", "軟歐", "菠蘿", "奶酥", "肉鬆"] },
  { cat: "零食/餅乾", keywords: ["餅乾", "洋芋片", "樂事", "多力多滋", "品客", "口香糖", "巧克力", "糖果", "軟糖", "士力架", "OREO", "波的多", "蝦味先", "乖乖", "科學麵", "Extra"] },
  { cat: "滷味/小食", keywords: ["茶葉蛋", "關東煮", "滷味", "地瓜", "蕃薯", "玉米", "水煮蛋", "溏心蛋"] },
  { cat: "生鮮蔬果", keywords: ["蔬菜", "水果", "蘋果", "香蕉", "番茄", "洋蔥", "馬鈴薯", "高麗菜", "青菜", "花椰菜", "茄子", "小白菜", "菠菜", "櫛瓜", "老薑", "牛番茄", "履歷"] },
  { cat: "生鮮肉品", keywords: ["牛排", "豬肉", "雞肉", "肉片", "肉絲", "雞胸", "雞腿", "豬排", "牛肋", "五花", "里肌", "霜降", "培根", "火腿", "香腸"] },
  { cat: "蛋/豆腐", keywords: ["雞蛋", "動福蛋", "豆腐", "油豆腐", "蛋"] },
  { cat: "泡麵/即食", keywords: ["泡麵", "杯麵", "速食麵", "統一麵", "維力", "滿漢", "來一客", "調理包", "冷凍"] },
  { cat: "調味料", keywords: ["醬油", "鹽", "糖", "胡椒", "辣椒", "芥末", "美乃滋", "番茄醬", "月桂葉", "小磨坊", "味精"] },

  // ── 日用品 ────────────────────────────────────────────────
  { cat: "衛生紙/面紙", keywords: ["衛生紙", "面紙", "盒面", "棉柔巾", "抽取式", "濕紙巾", "廚房紙巾"] },
  { cat: "洗髮/沐浴", keywords: ["洗髮", "沐浴", "潤髮", "髮膜", "洗面", "慕斯", "呂 ", "潘婷", "海倫仙度絲", "多芬", "麗仕"] },
  { cat: "口腔清潔", keywords: ["牙膏", "牙刷", "漱口水", "牙線", "高露潔", "黑人牙膏", "舒酸定"] },
  { cat: "美妝保養", keywords: ["面膜", "化妝", "卸妝", "防曬", "乳液", "精華", "保濕", "妮維雅", "曼秀雷敦", "護手霜", "隔離"] },
  { cat: "生理用品", keywords: ["衛生棉", "護墊", "棉條", "量多", "量少", "夜用", "好自在", "蕾妮亞", "愛康", "靠得住", "痘痘貼"] },
  { cat: "清潔用品", keywords: ["洗碗", "洗衣", "柔軟精", "清潔劑", "漂白", "除臭", "垃圾袋", "抹布", "菜瓜布"] },

  // ── 服務/訂閱 ─────────────────────────────────────────────
  { cat: "外送服務費", keywords: ["外送費", "服務費", "平台費", "小費"] },
  { cat: "訂閱服務", keywords: ["訂閱", "月費", "Uber One", "WOW", "會員"] },
  { cat: "加油", keywords: ["無鉛汽油", "柴油", "加油", "95無鉛", "98無鉛", "92無鉛"] },
  { cat: "停車", keywords: ["停車", "車位"] },

  // ── 壽司/迴轉 ─────────────────────────────────────────────
  { cat: "壽司/迴轉", keywords: ["元盤", "30元盤", "40元盤", "150元盤", "壽司", "生魚片", "鮭魚"] },

  // ── 其他食品 ──────────────────────────────────────────────
  { cat: "餐飲消費", keywords: ["餐飲", "內用", "外帶", "加價", "升級", "加點"] },
];

// Pre-compile lowercase keywords for faster matching
const COMPILED = RULES.map((r) => ({
  cat: r.cat,
  keywords: r.keywords.map((k) => k.toLowerCase()),
}));

export function classifyItem(itemName) {
  if (!itemName) return "其他";
  const lower = itemName.toLowerCase();
  for (const rule of COMPILED) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) return rule.cat;
    }
  }
  return "其他";
}

// Classify all items in an invoice list and add item_cat field
export function classifyInvoices(invoices) {
  return invoices.map((inv) => ({
    ...inv,
    items: (inv.items || []).map((item) => ({
      ...item,
      cat: classifyItem(item.name),
    })),
  }));
}

// Aggregate item categories across all invoices
export function aggregateItemCategories(invoices) {
  const cats = {};
  invoices.forEach((inv) => {
    (inv.items || []).forEach((item) => {
      const cat = item.cat || classifyItem(item.name);
      if (!cats[cat]) cats[cat] = { cat, count: 0, total: 0, items: {} };
      cats[cat].count += item.qty || 1;
      cats[cat].total += item.price || 0;
      const name = item.name;
      if (!cats[cat].items[name]) cats[cat].items[name] = { name, count: 0, total: 0 };
      cats[cat].items[name].count += item.qty || 1;
      cats[cat].items[name].total += item.price || 0;
    });
  });
  return Object.values(cats)
    .map((c) => ({
      ...c,
      items: Object.values(c.items).sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.total - a.total);
}

export default classifyItem;
