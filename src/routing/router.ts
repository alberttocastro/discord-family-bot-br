import { Message, TextChannel, ThreadChannel } from "discord.js";
import { ChannelHandler, MessageContext } from "./types.js";

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
}
