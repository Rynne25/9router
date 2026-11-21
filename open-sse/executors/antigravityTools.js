import { AG_DEFAULT_TOOLS, AG_TOOL_SUFFIX } from "../config/appConstants.js";

// Sanitize function name: Gemini requires [a-zA-Z_][a-zA-Z0-9_.:\-]{0,63}
export function sanitizeFunctionName(name) {
  if (!name) return "_unknown";
  let s = name.replace(/[^a-zA-Z0-9_.:\-]/g, "_");
  if (!/^[a-zA-Z_]/.test(s)) s = "_" + s;
  return s.substring(0, 64);
}

// AG decoy tools — same names as AG native defaults, redirect to _ide suffixed tools
export const AG_DECOY_TOOLS = [
  {
    name: "browser_subagent",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "command_status",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "find_by_name",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "generate_image",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "grep_search",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "list_dir",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "list_resources",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "mcp_sequential-thinking_sequentialthinking",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "multi_replace_file_content",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "notify_user",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "read_resource",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "read_terminal",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "read_url_content",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "replace_file_content",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "run_command",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "search_web",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "send_command_input",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "task_boundary",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "view_content_chunk",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "view_file",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  },
  {
    name: "write_to_file",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] }
  }
];

/**
 * Cloak tools before sending to Antigravity provider (anti-ban):
 * - Rename client tools with _ide suffix
 * - Inject AG default decoy tools after client tools
 * Returns { cloakedBody, toolNameMap } where toolNameMap maps suffixed → original
 */
export function cloakTools(body, clientTool = null) {
  const tools = body.request?.tools;
  if (!tools || tools.length === 0) {
    return { cloakedBody: body, toolNameMap: null };
  }

  const isCopilot = clientTool === "github-copilot";
  const toolNameMap = new Map();
  const clientDeclarations = [];
  const decoyNames = new Set(AG_DECOY_TOOLS.map(tool => tool.name));

  // First: collect renamed client tools
  for (const toolGroup of tools) {
    if (!toolGroup.functionDeclarations) continue;

    for (const func of toolGroup.functionDeclarations) {
      // For GitHub Copilot, avoid emitting duplicate native Antigravity tool names.
      // Keep the decoys only once in the final declaration list.
      if (isCopilot && AG_DEFAULT_TOOLS.has(func.name)) {
        continue;
      }

      // Skip if already covered by decoys for Copilot
      if (isCopilot && decoyNames.has(func.name)) {
        continue;
      }

      // Preserve native AG names for non-Copilot clients
      if (AG_DEFAULT_TOOLS.has(func.name)) {
        clientDeclarations.push(func);
        continue;
      }

      const suffixed = `${func.name}${AG_TOOL_SUFFIX}`;
      toolNameMap.set(suffixed, func.name);
      clientDeclarations.push({ ...func, name: suffixed });
    }
  }

  // Client tools first, then AG decoy tools
  const allDeclarations = [];
  const seenNames = new Set();
  for (const decl of [...clientDeclarations, ...AG_DECOY_TOOLS]) {
    if (!decl?.name || seenNames.has(decl.name)) continue;
    seenNames.add(decl.name);
    allDeclarations.push(decl);
  }

  // Rename tool names in conversation history (contents)
  const cloakedContents = body.request?.contents?.map(msg => {
    if (!msg.parts) return msg;

    const cloakedParts = msg.parts.map(part => {
      // Rename functionCall.name
      if (part.functionCall && !AG_DEFAULT_TOOLS.has(part.functionCall.name)) {
        return {
          ...part,
          functionCall: {
            ...part.functionCall,
            name: `${part.functionCall.name}${AG_TOOL_SUFFIX}`
          }
        };
      }

      // Rename functionResponse.name
      if (part.functionResponse && !AG_DEFAULT_TOOLS.has(part.functionResponse.name)) {
        return {
          ...part,
          functionResponse: {
            ...part.functionResponse,
            name: `${part.functionResponse.name}${AG_TOOL_SUFFIX}`
          }
        };
      }

      return part;
    });

    return { ...msg, parts: cloakedParts };
  });

  // Single functionDeclarations group: client tools first, then decoys
  return {
    cloakedBody: {
      ...body,
      request: {
        ...body.request,
        tools: [{ functionDeclarations: allDeclarations }],
        contents: cloakedContents || body.request.contents
      }
    },
    toolNameMap
  };
}
