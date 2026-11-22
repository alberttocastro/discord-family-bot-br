import { Message } from "discord.js";

export interface MessageContext {
  message: Message;
  channelId: string;
  channelName: string;
  isThread: boolean;
  parentId?: string | null;
  authorId: string;
  authorUsername: string;
  content: string;
}

export interface ChannelHandler {
  readonly name: string;
  readonly description: string;
  canHandle(context: MessageContext): boolean;
  handle(context: MessageContext): Promise<void>;
}
