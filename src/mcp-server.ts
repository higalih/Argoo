#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { marketPulse } from "./endpoints";
import { tokenSafety } from "./tokenSafety";
import { whalePulse } from "./whalePulse";
import { alphaBundle } from "./alphaBundle";


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

server.registerTool(
    "token_safety",
    {
        description: "Token safety check: score, level, holder concentration, authorities (devnet slice)",
        inputSchema: {
            token: z.string().describe("Solana mint address, mis. 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
        },
    },
    async ({ token }) => {
        const data = await tokenSafety(token);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
);

server.registerTool(
    "whale_pulse",
    {
        description: "Whale pulse: recent large transfers, whale count, coverage (devnet slice)",
        inputSchema: {
            token: z.string().describe("Solana mint address"),
        },
    },
    async ({ token }) => {
        const data = await whalePulse(token);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
);

server.registerTool(
    "alpha_bundle",
    {
        description: "Alpha bundle: BUY/WAIT/AVOID verdict + reasons from safety, whale, momentum (devnet slice)",
        inputSchema: {
            token: z.string().describe("Solana mint address"),
        },
    },
    async ({ token }) => {
        const data = await alphaBundle(token);
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("argoo-mcp running on stdio");
}
main().catch((err) => { console.error(err); process.exit(1); });
