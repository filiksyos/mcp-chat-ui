import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { logMCPRequest } from "./log";
import path from "path";
import fs from "fs";

const ALL_TOOLS = [] as ((server: McpServer) => void)[];

// Autoload all available tools
const toolsDir = path.join(__dirname, "../tools");
const toolFiles = fs
  .readdirSync(toolsDir)
  .filter((f) => f.endsWith(".ts") && f !== "index.ts");

for (const file of toolFiles) {
  const tool = require(path.join(toolsDir, file)).default;
  if (tool) {
    ALL_TOOLS.push(tool);
  }
}

export const getServer = (sessionId: string) => {
  const mcpServer = new McpServer({
    name: "my-mcp",
    version: "1.0.0",
  });

  ALL_TOOLS.forEach((tool) => {
    tool(mcpServer);
  });

  return mcpServer;
};

export const setupMcpServer = async (app: express.Application) => {
  app.use((req, res, next) => {
    req.originalUrl === "/mcp" && logMCPRequest(req);
    next();
  });
  app.post(
    "/mcp",
    async (req: express.Request, res: express.Response) => {
      try {
        const sessionId = "rnd" + Math.round(Math.random() * 1000000);
        const server = getServer(sessionId);
        const transport: StreamableHTTPServerTransport =
          new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          });
        res.on("close", () => {
          transport.close();
          server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    }
  );

  // SSE notifications not supported in stateless mode
  app.get("/mcp", async (req: express.Request, res: express.Response) => {
    console.log("Received GET MCP request");
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      })
    );
  });

  // Session termination not needed in stateless mode
  app.delete("/mcp", async (req: express.Request, res: express.Response) => {
    console.log("Received DELETE MCP request");
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      })
    );
  });
};
