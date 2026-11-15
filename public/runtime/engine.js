/**
 * Browser runtime for a published agent network.
 * Executes the graph in the page, with the caller's router, consent,
 * bounded depth, and deny-by-default private context.
 */

import { createDeterministicLlm } from "./deterministic.js";
import { fetchPeerNetwork, resolveNetworkRef } from "./peers.js";
import { validateNetwork } from "./validate.js";

const DEFAULT_LIMITS = { maxDepth: 4, maxInvocations: 12, maxMs: 20000 };

function validateArgs(schema, args) {
  const value = args && typeof args === "object" ? args : {};
  for (const key of schema?.required || []) {
    if (value[key] === undefined || value[key] === null || value[key] === "") {
      return { ok: false, error: `Missing argument ${key}` };
    }
  }
  return { ok: true, value };
}

function filterPrivate(context, allow) {
  const output = {};
  for (const key of allow || []) {
    if (context && Object.prototype.hasOwnProperty.call(context, key)) output[key] = context[key];
  }
  return output;
}

function toolSpecs(agent, network, actions, links) {
  const specs = [];
  for (const tool of agent.tools || []) {
    if (typeof tool === "string") {
      const child = network.tools.find((item) => item.name === tool);
      if (child) {
        specs.push({
          name: child.name,
          description: child.function?.description || child.name,
          parameters: child.function?.parameters || { type: "object", properties: { inquiry: { type: "string" } } },
          kind: "agent",
        });
        continue;
      }
      const action = actions.find((item) => item.name === tool);
      if (action) {
        specs.push({
          name: action.name,
          description: action.description,
          parameters: action.parameters || { type: "object", properties: {} },
          kind: "action",
        });
        continue;
      }
      if (links[tool] || /^https?:\/\//i.test(tool)) {
        specs.push({
          name: tool,
          description: `Published peer network ${tool}`,
          parameters: { type: "object", properties: { inquiry: { type: "string" } }, required: ["inquiry"] },
          kind: "peer",
        });
      }
      continue;
    }
    if (tool && typeof tool.url === "string") {
      const allowed = Array.isArray(tool.tools) && tool.tools.length ? tool.tools : ["call"];
      for (const name of allowed) {
        specs.push({
          name: `mcp_${name}`,
          description: `MCP tool ${name} at ${tool.url}`,
          parameters: { type: "object", properties: {} },
          kind: "mcp",
          mcpUrl: tool.url,
          mcpTool: name,
        });
      }
    }
  }
  return specs;
}

async function callMcp(spec, args, options) {
  const origin = new URL(spec.mcpUrl).origin;
  const allowed = await options.requestConsent({
    origin,
    purpose: `Call MCP tool ${spec.mcpTool}`,
  });
  if (!allowed) return { content: `Consent denied for MCP origin ${origin}.`, isError: true };
  const response = await options.fetchImpl(spec.mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "omit",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: spec.mcpTool, arguments: args },
    }),
  });
  if (!response.ok) return { content: `MCP ${spec.mcpUrl} returned ${response.status}.`, isError: true };
  const payload = await response.json();
  return { content: JSON.stringify(payload.result ?? payload), isError: false };
}

export function createEngine(options) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const actions = options.actions || [];
  const links = options.links || {};
  const fetchImpl = options.fetchImpl || fetch;
  const llm = options.llm || createDeterministicLlm();
  const validation = validateNetwork(options.network, {
    frontMan: options.frontMan,
    actions,
    linkNames: Object.keys(links),
  });
  const origin = options.origin || "http://localhost";

  async function runAgent(agentName, inquiry, state, network, privateContext) {
    if (state.invocations >= limits.maxInvocations) {
      throw new Error("Execution budget exceeded: too many agent invocations.");
    }
    if (Date.now() - state.started > limits.maxMs) {
      throw new Error("Execution budget exceeded: time limit.");
    }
    if (state.depth > limits.maxDepth) {
      throw new Error("Execution budget exceeded: composition depth.");
    }
    const agent = network.tools.find((item) => item.name === agentName);
    if (!agent) throw new Error(`Unknown agent ${agentName}.`);
    state.invocations += 1;
    const specs = toolSpecs(agent, network, state.depth === 0 ? actions : actions.filter((action) => action.shared !== false), links);
    const messages = [{ role: "user", content: typeof inquiry === "string" ? inquiry : JSON.stringify(inquiry) }];
    for (let turn = 0; turn < 6; turn += 1) {
      const result = await llm({ agent, messages, tools: specs });
      const calls = result.toolCalls || [];
      if (!calls.length) return result.content || "";
      messages.push({ role: "assistant", content: result.content || "", toolCalls: calls });
      for (const call of calls) {
        const output = await dispatch(call, specs, state, network, privateContext);
        state.trace.push({
          agent: agentName,
          tool: call.name,
          ok: !output.isError,
          detail: output.content.slice(0, 240),
        });
        messages.push({ role: "tool", name: call.name, content: output.content });
      }
    }
    throw new Error("Agent loop exceeded its turn limit.");
  }

  async function dispatch(call, specs, state, network, privateContext) {
    const spec = specs.find((item) => item.name === call.name);
    if (!spec) return { content: `Unknown tool ${call.name}.`, isError: true };
    if (spec.kind === "agent") {
      const previousDepth = state.depth;
      state.depth += 1;
      try {
        const text = await runAgent(
          spec.name,
          call.arguments?.inquiry || JSON.stringify(call.arguments || {}),
          state,
          network,
          privateContext,
        );
        return { content: text, isError: false };
      } finally {
        state.depth = previousDepth;
      }
    }
    if (spec.kind === "action") {
      const action = actions.find((item) => item.name === spec.name);
      const parsed = validateArgs(action.parameters, call.arguments);
      if (!parsed.ok) return { content: parsed.error, isError: true };
      if (action.effect === "write") {
        const approved = await options.confirm?.({
          name: action.name,
          arguments: parsed.value,
          origin,
        });
        if (!approved) return { content: `Declined ${action.name}. Nothing was changed.`, isError: true };
      }
      try {
        const result = await action.handler(parsed.value);
        return { content: typeof result === "string" ? result : JSON.stringify(result), isError: false };
      } catch (error) {
        return { content: error instanceof Error ? error.message : "Action failed.", isError: true };
      }
    }
    if (spec.kind === "peer") {
      const ref = links[spec.name] || spec.name;
      const networkUrl = resolveNetworkRef(ref, origin);
      if (state.peerStack.includes(networkUrl)) {
        return { content: `Stopped a peer cycle at ${networkUrl}.`, isError: true };
      }
      const peerOrigin = new URL(networkUrl).origin;
      const allowed = await options.requestConsent?.({
        origin: peerOrigin,
        purpose: `Load published agent network ${spec.name}`,
      });
      if (!allowed) return { content: `Consent denied for ${peerOrigin}.`, isError: true };
      try {
        const loaded = await fetchPeerNetwork(networkUrl, fetchImpl);
        const peerValidation = validateNetwork(loaded.network, { frontMan: loaded.frontMan });
        if (!peerValidation.ok) return { content: peerValidation.errors.join(" "), isError: true };
        const peerPrivate = filterPrivate(privateContext, options.peerPrivateAllow || []);
        const previousDepth = state.depth;
        const previousStack = state.peerStack;
        state.depth += 1;
        state.peerStack = [...state.peerStack, networkUrl];
        try {
          const text = await runAgent(
            loaded.frontMan,
            call.arguments?.inquiry || "",
            state,
            loaded.network,
            peerPrivate,
          );
          return { content: text, isError: false };
        } finally {
          state.depth = previousDepth;
          state.peerStack = previousStack;
        }
      } catch (error) {
        return { content: error instanceof Error ? error.message : "Peer network failed.", isError: true };
      }
    }
    if (spec.kind === "mcp") return callMcp(spec, call.arguments || {}, { ...options, fetchImpl });
    return { content: "Unsupported tool.", isError: true };
  }

  return {
    validation,
    async run(inquiry, runOptions = {}) {
      const trace = [];
      if (!validation.ok) {
        return { ok: false, error: validation.errors.join(" "), trace, text: "" };
      }
      const state = {
        invocations: 0,
        started: Date.now(),
        depth: 0,
        trace,
        peerStack: [],
      };
      try {
        const text = await runAgent(
          validation.frontMan,
          inquiry,
          state,
          options.network,
          runOptions.privateContext || {},
        );
        return { ok: true, text, trace, error: "" };
      } catch (error) {
        return {
          ok: false,
          text: "",
          trace,
          error: error instanceof Error ? error.message : "The agent runtime stopped.",
        };
      }
    },
  };
}
