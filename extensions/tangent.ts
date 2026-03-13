import {
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
  streamSimple,
  type AssistantMessage,
  type Message,
  type ThinkingLevel as AiThinkingLevel,
} from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";

const TANGENT_SYSTEM_PROMPT = [
  "You are having an isolated side conversation with the user.",
  "Do not assume any context from the user's current working session unless they explicitly restate it here.",
  "Treat this as an ephemeral tangent that should stand on its own.",
  "If the user refers to \"this\", \"that\", or other missing context, ask them to provide the relevant details instead of guessing.",
].join(" ");

type SessionThinkingLevel = "off" | AiThinkingLevel;

type TangentDetails = {
  question: string;
  thinking: string;
  answer: string;
  provider: string;
  model: string;
  thinkingLevel: SessionThinkingLevel;
  timestamp: number;
  usage?: AssistantMessage["usage"];
};

type TangentSlot = {
  question: string;
  modelLabel: string;
  thinking: string;
  answer: string;
  done: boolean;
  controller: AbortController;
};

function toReasoning(level: SessionThinkingLevel): AiThinkingLevel | undefined {
  return level === "off" ? undefined : level;
}

function extractText(parts: AssistantMessage["content"], type: "text" | "thinking"): string {
  const chunks: string[] = [];

  for (const part of parts) {
    if (type === "text" && part.type === "text") {
      chunks.push(part.text);
    } else if (type === "thinking" && part.type === "thinking") {
      chunks.push(part.thinking);
    }
  }

  return chunks.join("\n").trim();
}

function extractAnswer(message: AssistantMessage): string {
  return extractText(message.content, "text") || "(No text response)";
}

function extractThinking(message: AssistantMessage): string {
  return extractText(message.content, "thinking");
}

function buildTangentContext(ctx: ExtensionCommandContext, question: string, thread: TangentDetails[]) {
  const messages: Message[] = [];

  for (const entry of thread) {
    messages.push(
      {
        role: "user",
        content: [{ type: "text", text: entry.question }],
        timestamp: entry.timestamp,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: entry.answer }],
        provider: entry.provider,
        model: entry.model,
        api: ctx.model?.api ?? "openai-responses",
        usage:
          entry.usage ?? {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
        stopReason: "stop",
        timestamp: entry.timestamp,
      },
    );
  }

  messages.push({
    role: "user",
    content: [{ type: "text", text: question }],
    timestamp: Date.now(),
  });

  return {
    systemPrompt: [ctx.getSystemPrompt(), TANGENT_SYSTEM_PROMPT].filter(Boolean).join("\n\n"),
    messages,
  };
}

function notify(ctx: ExtensionContext | ExtensionCommandContext, message: string, level: "info" | "warning" | "error"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
  }
}

export default function (pi: ExtensionAPI) {
  let pendingThread: TangentDetails[] = [];
  let slots: TangentSlot[] = [];

  function abortActiveSlots(): void {
    for (const slot of slots) {
      if (!slot.done) {
        slot.controller.abort();
      }
    }
  }

  function renderWidget(ctx: ExtensionContext | ExtensionCommandContext): void {
    if (!ctx.hasUI) {
      return;
    }

    if (slots.length === 0) {
      ctx.ui.setWidget("tangent", undefined);
      return;
    }

    ctx.ui.setWidget(
      "tangent",
      (_tui, theme) => {
        const dim = (text: string) => theme.fg("dim", text);
        const success = (text: string) => theme.fg("success", text);
        const italic = (text: string) => theme.fg("dim", theme.italic(text));
        const warning = (text: string) => theme.fg("warning", text);
        const parts: string[] = [];

        const title = " 🧭 tangent ";
        const hint = " /tangent:clear dismiss ";
        const width = Math.max(16, 68 - title.length - hint.length);
        parts.push(dim(`╭${title}${"─".repeat(width)}${hint}╮`));

        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i];
          if (i > 0) {
            parts.push(dim("│ ───"));
          }

          parts.push(dim("│ ") + success("› ") + slot.question);

          if (slot.thinking) {
            const cursor = !slot.answer && !slot.done ? warning(" ▍") : "";
            parts.push(dim("│ ") + italic(slot.thinking) + cursor);
          }

          if (slot.answer) {
            const answerLines = slot.answer.split("\n");
            parts.push(dim("│ ") + answerLines[0]);
            if (answerLines.length > 1) {
              parts.push(answerLines.slice(1).join("\n"));
            }
            if (!slot.done) {
              parts[parts.length - 1] += warning(" ▍");
            }
          } else if (!slot.done) {
            parts.push(dim("│ ") + warning("⏳ thinking..."));
          }

          parts.push(dim("│ ") + dim(`model: ${slot.modelLabel}`));
        }

        parts.push(dim(`╰${"─".repeat(68)}╯`));
        return new Text(parts.join("\n"), 0, 0);
      },
      { placement: "aboveEditor" },
    );
  }

  function resetThread(ctx: ExtensionContext | ExtensionCommandContext): void {
    abortActiveSlots();
    pendingThread = [];
    slots = [];
    renderWidget(ctx);
  }

  async function runTangent(ctx: ExtensionCommandContext, question: string): Promise<void> {
    const model = ctx.model;
    if (!model) {
      notify(ctx, "No active model selected.", "error");
      return;
    }

    const apiKey = await ctx.modelRegistry.getApiKey(model);
    if (!apiKey) {
      notify(ctx, `No credentials available for ${model.provider}/${model.id}.`, "error");
      return;
    }

    const thinkingLevel = pi.getThinkingLevel() as SessionThinkingLevel;
    const slot: TangentSlot = {
      question,
      modelLabel: `${model.provider}/${model.id}`,
      thinking: "",
      answer: "",
      done: false,
      controller: new AbortController(),
    };

    const threadSnapshot = pendingThread.slice();
    slots.push(slot);
    renderWidget(ctx);

    try {
      const stream = streamSimple(model, buildTangentContext(ctx, question, threadSnapshot), {
        apiKey,
        reasoning: toReasoning(thinkingLevel),
        signal: slot.controller.signal,
      });

      let response: AssistantMessage | null = null;

      for await (const event of stream) {
        if (event.type === "thinking_delta") {
          slot.thinking += event.delta;
          renderWidget(ctx);
        } else if (event.type === "text_delta") {
          slot.answer += event.delta;
          renderWidget(ctx);
        } else if (event.type === "done") {
          response = event.message;
        } else if (event.type === "error") {
          response = event.error;
        }
      }

      if (!response) {
        throw new Error("Tangent request finished without a response.");
      }
      if (response.stopReason === "aborted") {
        const slotIndex = slots.indexOf(slot);
        if (slotIndex >= 0) {
          slots.splice(slotIndex, 1);
          renderWidget(ctx);
        }
        return;
      }
      if (response.stopReason === "error") {
        throw new Error(response.errorMessage || "Tangent request failed.");
      }

      const answer = extractAnswer(response);
      const thinking = extractThinking(response) || slot.thinking;
      slot.thinking = thinking;
      slot.answer = answer;
      slot.done = true;
      renderWidget(ctx);

      pendingThread.push({
        question,
        thinking,
        answer,
        provider: model.provider,
        model: model.id,
        thinkingLevel,
        timestamp: Date.now(),
        usage: response.usage,
      });
    } catch (error) {
      if (slot.controller.signal.aborted) {
        const slotIndex = slots.indexOf(slot);
        if (slotIndex >= 0) {
          slots.splice(slotIndex, 1);
          renderWidget(ctx);
        }
        return;
      }

      slot.answer = `❌ ${error instanceof Error ? error.message : String(error)}`;
      slot.done = true;
      renderWidget(ctx);
      notify(ctx, error instanceof Error ? error.message : String(error), "error");
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    resetThread(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    resetThread(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    resetThread(ctx);
  });

  pi.on("session_shutdown", async () => {
    abortActiveSlots();
  });

  pi.registerCommand("tangent", {
    description: "Continue an isolated side conversation without using the current session context.",
    handler: async (args, ctx) => {
      const question = args.trim();
      if (!question) {
        notify(ctx, "Usage: /tangent <question>", "warning");
        return;
      }

      await runTangent(ctx, question);
    },
  });

  pi.registerCommand("tangent:new", {
    description: "Start a fresh isolated tangent thread. Optionally ask the first question immediately.",
    handler: async (args, ctx) => {
      resetThread(ctx);
      const question = args.trim();
      if (question) {
        await runTangent(ctx, question);
      } else {
        notify(ctx, "Started a fresh tangent thread.", "info");
      }
    },
  });

  pi.registerCommand("tangent:clear", {
    description: "Dismiss the tangent widget and clear the current isolated thread.",
    handler: async (_args, ctx) => {
      resetThread(ctx);
      notify(ctx, "Cleared tangent thread.", "info");
    },
  });
}
