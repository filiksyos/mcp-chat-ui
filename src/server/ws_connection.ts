import { TokenPayload } from "google-auth-library";
import { ChatSession } from "../utils/chat_session";
import { WebSocket } from "ws";
import { verifyGoogleToken } from "./auth_google";
import { get } from "object-path";
import moment from "moment-timezone";
import { parseJSON } from "../utils";
import { AgentsHelper } from "../utils/agents_helper";
import { AgentInputItem } from "@openai/agents";
import { EXTERNAL_MCP_SERVERS_CONFIG } from "../utils/external_mcp";
import fs from "fs";

const DEBUG = false;

interface WebSocketMessage {
  type: string;
  session_id: string;
  prompt: string;
  model: string;
  id_token?: string;
  mcpServers?: string[];
}

export class WebSocketConnection {
  private ws: WebSocket;
  private session: ChatSession;
  private user: TokenPayload;
  private active: boolean = false;
  private toolCallId: string = "";

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.session = new ChatSession();
    this.user = {} as TokenPayload;
  }

  public start() {
    console.log("WebSocket client connected");

    this.active = true;
    // this.session = new ChatSession();
    this.user = {} as TokenPayload;

    this.toolCallId = "";

    this.sendMessage({
      type: "config",
      config: {
        mcpServers: EXTERNAL_MCP_SERVERS_CONFIG,
      },
    });
    const allEvents = [] as any;
    this.ws.on("message", async (message) => {
      let data: WebSocketMessage;

      try {
        data = JSON.parse(message.toString());
      } catch (e) {
        this.sendMessage({ error: "Invalid JSON" });
        return;
      }

      if (data.type === "ping") {
        this.sendMessage({ type: "pong", session_id: data.session_id });
        return;
      }

      if (data.type === "start-process") {
        if (!(await this.verifyAuth(data))) {
          return;
        }

        try {
          console.log("Starting chat session with data:", {
            sessionId: data.session_id,
            prompt: data.prompt,
            model: data.model,
          });

          this.session.sessionId = data.session_id;
          let fullOutput = "";

          const input = this.generateInput(data);

          const stream = await this.session.startStream(
            input,
            data.mcpServers || []
          );

          for await (const event of stream as any) {
            if (DEBUG) {
              allEvents.push(event);
              fs.writeFileSync(
                `ws_events.json`,
                JSON.stringify(allEvents, null, 2)
              );
            }
            if (!this.active) {
              console.log("Connection closed, stopping process");
              break;
            }
            fullOutput += this.processStreamEvent(event, data);
          }

          await stream.completed;

          this.session.setHistory(stream.history);

          this.sendMessage({
            sessionId: data.session_id,
            output: fullOutput,
            done: true,
            contextSize: this.session.getContextSize(),
          });

          const totalTokens = await AgentsHelper.calculateTokenCount(
            data.model,
            JSON.stringify(this.session.history)
          );

          this.sendMessage({
            sessionId: data.session_id,
            state: true,
            contextSizeTokens: totalTokens,
          });
        } catch (error: any) {
          console.error("Error processing message: ", error);
          this.sendMessage({
            error: "Internal server error: " + error.message,
          });
        }
      }
    });

    this.ws.on("close", () => {
      this.active = false;
      this.session.flushHistory();
      (this.session as any) = null;
    });
  }

  private generateInput(data: WebSocketMessage): string | AgentInputItem[] {
    const promptPrefix = "Call Tools one by one. ";
    return this.session.history.length > 0
      ? this.session.history.concat({
          type: "message",
          role: "user",
          content: promptPrefix + data.prompt,
        })
      : promptPrefix + data.prompt;
  }

  private processStreamEvent(event: any, data: WebSocketMessage): string {
    let result = "";
    let delta = "";

    const dataType = get<string>(event, "data.type", "");
    const eventName = get<string>(event, "name", "");
    const rawItemStatus = get<string>(event, "item.rawItem.status", "");
    const isOutputTextDelta = dataType === "output_text_delta";
    const isToolCalled = eventName === "tool_called";

    const toolName =
      dataType === "model" &&
      get<string>(event, "data.event.choices.0.finish_reason", "") ===
        "tool_calls"
        ? get<string>(
            event,
            "data.event.choices.0.delta.tool_calls.0.function.name",
            ""
          )
        : "";

    const isMessageOutputCreated = dataType === "message_output_created";

    if (isOutputTextDelta) {
      delta = event.data.delta;
    }

    if (toolName) {
      this.toolCallId = [
        "tc",
        Math.random().toString(36).substring(2, 15),
        moment().utc().valueOf(),
      ].join("-");
      delta = "tool_call";
    }

    if (isToolCalled && event.item && event.item.rawItem) {
      delta = "tool_call";
    }

    delta &&
      delta.trim() &&
      this.sendMessage({
        sessionId: data.session_id,
        delta,
        tool:
          isToolCalled || toolName
            ? toolName
              ? {
                  ...get<object>(
                    event,
                    "data.event.choices.0.delta.tool_calls.0.function",
                    {}
                  ),
                  started: true,
                  id: this.toolCallId,
                  timestamp: moment().utc().valueOf(),
                }
              : {
                  ...event.item.rawItem,
                  finished: true,
                  id: this.toolCallId,
                  timestamp: moment().utc().valueOf(),
                }
            : undefined,
      });

    if (
      isMessageOutputCreated &&
      rawItemStatus === "completed" &&
      event.item.rawItem.content
    ) {
      const output = event.item.rawItem.content[0].text || "";
      this.ws.send(
        JSON.stringify({
          sessionId: data.session_id,
          output: output,
          intermediate: true,
        })
      );
      result = output;
    }

    if (
      eventName === "message_output_created" &&
      rawItemStatus === "completed" &&
      event.item.rawItem.content &&
      this.toolCallId
    ) {
      this.sendMessage({
        sessionId: data.session_id,
        tool: {
          finished: true,
          id: this.toolCallId,
          timestamp: moment().utc().valueOf(),
        },
      });
      this.sendMessage({
        sessionId: data.session_id,
        id: this.toolCallId,
        toolOutput: get(
          event,
          "item.rawItem.name",
          "transfer_to_Coding_AI_Agent"
        ),
        output: this.parseToolOutput(
          event.item.output || get(event, "item.rawItem.content", "")
        ),
      });
    }

    if (eventName === "tool_output") {
      this.sendMessage({
        sessionId: data.session_id,
        id: this.toolCallId,
        toolOutput: get(event, "item.rawItem.name"),
        output: this.parseToolOutput(
          event.item.output || get(event, "item.rawItem.output.text")
        ),
      });
    }
    return result;
  }

  private async verifyAuth(_data: WebSocketMessage) {
    // Authentication disabled by request
    (this.ws as any).user = { email: "none", name: "Anonymous" };
    return true;
  }

  sendMessage(message: object) {
    this.ws.send(JSON.stringify(message));
  }

  parseToolOutput(output: any) {
    if (typeof output === "object") {
      return output;
    }
    try {
      // Try parsing as JSON first
      return JSON.parse(output);
    } catch (e) {
      // If parsing fails, return the raw string wrapped in an object
      console.warn("Failed to parse tool output as JSON, returning raw text:", e);
      return { text: output || "No output" };
    }
  }
}
