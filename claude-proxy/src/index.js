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

      const systemPrompt = `你是一個發票 AI 管家，專門分析用戶的消費發票數據。用戶已經登入，以下是他的消費摘要數據。

請根據這些真實數據回答用戶的問題。回答要求：
- 用繁體中文回答
- 語氣親切但專業，像一個了解用戶消費習慣的管家
- 回答要具體，引用實際數字
- 適度加入 emoji 讓回答更生動
- 控制在 200 字以內
- 不要編造數據中沒有的資訊

用戶消費摘要：
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
