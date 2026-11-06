import { Message, TextChannel, ThreadChannel } from "discord.js";
import { ChannelHandler, MessageContext } from "./types.js";

export interface SimulatedDispatchOptions {
  channel?: string;
  channelId?: string;
  channelName?: string;
  content: string;
  author?: string;
  authorId?: string;
  isThread?: boolean;
  parentId?: string | null;
}

export interface SimulatedDispatchResult {
  handled: boolean;
  handlersMatched: string[];
  channelId: string;
  channelName: string;
  authorUsername: string;
  content: string;
  replies: Array<{
    content?: string;
    embeds?: any[];
  }>;
  reactions: string[];
}

export class MessageRouter {
  private handlers: ChannelHandler[] = [];

  public register(handler: ChannelHandler): this {
    this.handlers.push(handler);
    return this;
  }

  public getHandlers(): readonly ChannelHandler[] {
    return this.handlers;
  }

  public extractContext(message: Message): MessageContext {
    const channel = message.channel;
    const isThread = channel.isThread();
    let channelName = "unknown";
    let parentId: string | null = null;

    if (channel instanceof TextChannel) {
      channelName = channel.name;
    } else if (channel.isThread()) {
      const thread = channel as ThreadChannel;
      channelName = thread.name;
      parentId = thread.parentId;
    } else if ("name" in channel && typeof channel.name === "string") {
      channelName = channel.name;
    }

    return {
      message,
      channelId: channel.id,
      channelName,
      isThread,
      parentId,
      authorId: message.author.id,
      authorUsername: message.author.username,
      content: message.content,
    };
  }

  public async dispatch(message: Message): Promise<boolean> {
    // Ignorar bots (incluindo o próprio)
    if (message.author.bot) {
      return false;
    }

    const context = this.extractContext(message);
    let handled = false;

    for (const handler of this.handlers) {
      try {
        if (handler.canHandle(context)) {
          await handler.handle(context);
          handled = true;
        }
      } catch (error) {
        console.error(
          `[MessageRouter] Erro no handler "${handler.name}" no canal ${context.channelName} (${context.channelId}):`,
          error
        );
      }
    }

    return handled;
  }

  /**
   * Executa a mensagem simulada através dos handlers sem necessidade de conexão WebSocket do Discord.
   * Ideal para testes automatizados, chamadas HTTP REST, webhooks e serverless.
   */
  public async dispatchSimulated(options: SimulatedDispatchOptions): Promise<SimulatedDispatchResult> {
    const channelName = options.channelName || options.channel || "geral";
    const channelId = options.channelId || `chan-${channelName.toLowerCase().replace(/\s+/g, "-")}`;
    const authorUsername = options.author || "TestUser";
    const authorId = options.authorId || "user-123";
    const content = options.content || "";

    const replies: Array<{ content?: string; embeds?: any[] }> = [];
    const reactions: string[] = [];

    const simulatedMessage = {
      id: `msg-${Date.now()}`,
      content,
      channelId,
      channel: {
        id: channelId,
        name: channelName,
        isThread: () => Boolean(options.isThread),
      },
      author: {
        id: authorId,
        username: authorUsername,
        bot: false,
      },
      client: {
        user: {
          id: "bot-family-id",
          tag: "FamilyBot#0001",
        },
      },
      mentions: {
        has: (target: any) => {
          if (!target) return false;
          return content.includes("@bot") || content.includes(target.id) || content.includes(target.tag);
        },
      },
      reactions: {
        removeAll: async () => {
          reactions.length = 0;
          return Promise.resolve();
        },
      },
      reply: async (payload: any) => {
        if (typeof payload === "string") {
          replies.push({ content: payload });
        } else {
          // Normaliza embeds caso sejam EmbedBuilder do discord.js
          const rawEmbeds = payload.embeds
            ? payload.embeds.map((emb: any) => (typeof emb.toJSON === "function" ? emb.toJSON() : emb))
            : undefined;
          replies.push({
            content: payload.content,
            embeds: rawEmbeds,
          });
        }
        return Promise.resolve(simulatedMessage as any);
      },
      react: async (emoji: string) => {
        reactions.push(emoji);
        return Promise.resolve();
      },
    } as unknown as Message;

    const context: MessageContext = {
      message: simulatedMessage,
      channelId,
      channelName,
      isThread: Boolean(options.isThread),
      parentId: options.parentId || null,
      authorId,
      authorUsername,
      content,
    };

    let handled = false;
    const handlersMatched: string[] = [];

    for (const handler of this.handlers) {
      try {
        if (handler.canHandle(context)) {
          handlersMatched.push(handler.name);
          await handler.handle(context);
          handled = true;
        }
      } catch (error) {
        console.error(
          `[MessageRouter] Erro no handler "${handler.name}" no canal ${channelName} (${channelId}):`,
          error
        );
      }
    }

    return {
      handled,
      handlersMatched,
      channelId,
      channelName,
      authorUsername,
      content,
      replies,
      reactions,
    };
  }
}
