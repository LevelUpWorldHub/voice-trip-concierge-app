/**
 * OpenAI-compatible BYOK client. The key is attached only to this router URL.
 */

export function createOpenAICompatibleLlm({ baseUrl, apiKey, model, fetchImpl = fetch }) {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  return async function complete({ agent, messages, tools }) {
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: agent.instructions }, ...messages.map(toMessage)],
        tools: tools.length ? tools.map(toTool) : undefined,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || payload?.error || `Router returned ${response.status}`;
      throw new Error(typeof message === "string" ? message : "Router request failed");
    }
    const choice = payload.choices?.[0]?.message || {};
    const toolCalls = (choice.tool_calls || []).map((call) => ({
      name: call.function?.name,
      arguments: parseArgs(call.function?.arguments),
    }));
    return { content: choice.content || "", toolCalls };
  };
}

function toMessage(message) {
  if (message.role === "tool") {
    return { role: "user", content: `Tool ${message.name} returned: ${message.content}` };
  }
  return { role: message.role === "assistant" ? "assistant" : "user", content: message.content || "" };
}

function toTool(tool) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: "object", properties: {} },
    },
  };
}

function parseArgs(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
