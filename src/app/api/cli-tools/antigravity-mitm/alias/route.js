import { NextResponse } from "next/server";
import { getMitmAlias, setMitmAliasAll } from "@/models";
import { writeAliasForTool } from "@/lib/mitmAliasCache";

// GET - Get MITM aliases for a tool
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const toolName = searchParams.get("tool");
    const aliases = await getMitmAlias(toolName || undefined);
    return NextResponse.json({ aliases });
  } catch (error) {
    console.log("Error fetching MITM aliases:", error.message);
    return NextResponse.json({ error: "Failed to fetch aliases" }, { status: 500 });
  }
}

// PUT - Save MITM aliases for a specific tool (allowed anytime, even when DNS/Server is off)
export async function PUT(request) {
  try {
    const { tool, mappings } = await request.json();

    if (
      !tool ||
      typeof tool !== "string" ||
      !tool.trim() ||
      tool === "__proto__" ||
      tool === "constructor" ||
      !mappings ||
      typeof mappings !== "object"
    ) {
      return NextResponse.json({ error: "valid tool and mappings required" }, { status: 400 });
    }

    const filtered = {};
    for (const [alias, rawModel] of Object.entries(mappings)) {
      const model = typeof rawModel === "string" ? rawModel.trim() : String(rawModel || "").trim();
      if (model) {
        filtered[alias] = model;
      }
    }

    await setMitmAliasAll(tool, filtered);
    writeAliasForTool(tool, filtered);
    return NextResponse.json({ success: true, aliases: filtered });
  } catch (error) {
    console.log("Error saving MITM aliases:", error.message);
    return NextResponse.json({ error: "Failed to save aliases" }, { status: 500 });
  }
}
