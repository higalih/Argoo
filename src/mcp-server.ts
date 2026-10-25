import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
// ⬇️ CEK DULU: buka src/endpoints.ts, ganti dengan nama fungsi & argumen aslinya
import { marketPulse } from "./endpoints";

const server = new McpServer({ name: "argoo-mcp", version: "0.1.0" });

server.registerTool(
    "market_pulse",
    {
        description: "Market pulse: harga, 24h change, volume, RSI 14d (devnet slice)",
        inputSchema: {
            token: z.string().optional().describe("Token id, mis. bitcoin"),
        },
    },
    async ({ token }) => {
        const data = await marketPulse(token ?? "bitcoin");
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("argoo-mcp running on stdio");
}
main().catch((err) => { console.error(err); process.exit(1); });
