/**
 * Default no-key router for the published Voice Trip Concierge network.
 * It never calls a provider. A visitor BYOK router replaces it.
 */

function lastUserText(messages) {
  const user = [...messages].reverse().find((message) => message.role === "user");
  return user?.content || "";
}

function toolResult(messages) {
  const tools = messages.filter((message) => message.role === "tool");
  if (!tools.length) return "";
  return tools.map((message) => message.content).join("\n");
}

export function createDeterministicLlm() {
  return async function complete({ agent, messages, tools }) {
    const prior = toolResult(messages);
    if (prior) return { content: prior };
    const text = lastUserText(messages);
    const names = new Set(tools.map((tool) => tool.name));
    const call = (name, args) => ({ toolCalls: [{ name, arguments: args }] });
    if (agent.name === "front_desk") {
      if (/note|happening|pulse|local news/i.test(text) && names.has("city_notes")) {
        return call("city_notes", { inquiry: text });
      }
      if (/closed|weather|rain|watch|too far|long drive|proposal/i.test(text) && names.has("autonomy_watch")) {
        return call("autonomy_watch", { inquiry: text });
      }
      if (names.has("planner_specialist")) return call("planner_specialist", { inquiry: text });
    }
    if (agent.name === "planner_specialist") {
      if (/swap|replace|change/i.test(text) && names.has("website_revise_stop")) {
        return call("website_revise_stop", { request: text });
      }
      if (names.has("website_plan_trip")) return call("website_plan_trip", { request: text });
    }
    if (agent.name === "autonomy_watch") {
      if (/approve|apply/i.test(text) && names.has("website_apply_swap")) {
        return call("website_apply_swap", { proposalId: "latest" });
      }
      if (names.has("website_propose_swaps")) return call("website_propose_swaps", {});
    }
    if (agent.name === "narrator") {
      return { content: text.slice(0, 700) };
    }
    if (agent.name === "note_keeper") {
      return {
        content:
          "I can only repeat notes this site already holds. I do not invent events, and I never see the visitor's model key.",
      };
    }
    return { content: "I can plan a trip, revise one stop, or check the day for problems." };
  };
}
