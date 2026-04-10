export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const { question, context } = await request.json();

      if (!question || !context) {
        return jsonResponse({ error: "Missing question or context" }, 400);
      }

      const systemPrompt = `你是一個發票 AI 管家，專門分析用戶的消費發票數據。

嚴格規則：
1. 只能使用下方 Context 中提供的數據，絕對不能編造
2. 每個【】內的通路名稱都是獨立品牌，不可混淆（例如「全家 FamilyMart」≠「7-ELEVEN」）
3. 用戶問某個通路時，只回答該通路的數據
4. 如果 Context 中沒有用戶問的通路，直接說「你的發票中沒有這個通路的記錄」
5. 用繁體中文，語氣親切但專業
6. 引用具體數字（次數、金額、均價）
7. 控制在 200 字以內
8. 適度用 emoji

用戶資料：
${context}`;

      const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        max_tokens: 512,
      });

      const reply = response.response || "抱歉，我暫時無法回答。";

      return jsonResponse({ reply });
    } catch (e) {
      return jsonResponse({ error: "Internal error", detail: e.message }, 500);
    }
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
