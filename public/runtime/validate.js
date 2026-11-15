/**
 * Validates a published agent network before any model call.
 * Apache-2.0 © 2026 Mark Yukhimets, Level Up Inc.
 */

export function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function validateNetwork(network, options = {}) {
  const errors = [];
  const agents = Array.isArray(network?.tools) ? network.tools : null;
  if (!agents || agents.length === 0) {
    return { ok: false, errors: ["Network needs a tools array with at least one agent."], frontMan: "" };
  }
  const names = new Set();
  const actionNames = new Set((options.actions || []).map((action) => action.name));
  const linkNames = new Set(options.linkNames || []);
  for (const agent of agents) {
    if (!agent || typeof agent.name !== "string" || !agent.name.trim()) {
      errors.push("An agent is missing a name.");
      continue;
    }
    if (names.has(agent.name)) errors.push(`Duplicate agent name: ${agent.name}`);
    names.add(agent.name);
    if (typeof agent.instructions !== "string" || !agent.instructions.trim()) {
      errors.push(`Agent ${agent.name} is missing instructions.`);
    }
    if (!agent.function || typeof agent.function.description !== "string") {
      errors.push(`Agent ${agent.name} is missing function.description.`);
    }
    for (const tool of agent.tools || []) {
      if (typeof tool === "string") {
        if (names.has(tool) || linkNames.has(tool) || actionNames.has(tool) || isHttpUrl(tool)) continue;
        if (!/^[a-z0-9_-]+$/i.test(tool)) {
          errors.push(`Agent ${agent.name} references unsupported tool ${tool}.`);
        }
        continue;
      }
      if (tool && typeof tool === "object" && typeof tool.url === "string") continue;
      errors.push(`Agent ${agent.name} has a tool entry that is not a name, URL, or MCP descriptor.`);
    }
  }
  for (const agent of agents) {
    for (const tool of agent.tools || []) {
      if (typeof tool !== "string" || isHttpUrl(tool) || linkNames.has(tool) || actionNames.has(tool)) continue;
      if (!names.has(tool)) errors.push(`Agent ${agent.name} references missing agent ${tool}.`);
    }
  }
  const frontMan = options.frontMan || agents[0].name;
  if (!names.has(frontMan)) errors.push(`Front agent ${frontMan} is not in the network.`);
  return { ok: errors.length === 0, errors, frontMan };
}
