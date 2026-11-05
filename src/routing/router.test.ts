import { describe, it, expect, vi } from "vitest";
import { Message } from "discord.js";
import { MessageRouter } from "./router.js";
import { ChannelHandler, MessageContext } from "./types.js";

describe("MessageRouter", () => {
  it("deve ignorar mensagens enviadas por bots", async () => {
    const router = new MessageRouter();
    const mockHandler: ChannelHandler = {
      name: "MockHandler",
      description: "Test handler",
      canHandle: vi.fn().mockReturnValue(true),
      handle: vi.fn(),
    };

    router.register(mockHandler);

    const mockMessage = {
      author: { bot: true, id: "bot-1", username: "OtherBot" },
      channel: { id: "chan-1", name: "geral", isThread: () => false },
      content: "Hello",
    } as unknown as Message;

    const handled = await router.dispatch(mockMessage);
    expect(handled).toBe(false);
    expect(mockHandler.canHandle).not.toHaveBeenCalled();
    expect(mockHandler.handle).not.toHaveBeenCalled();
  });

  it("deve despachar para o handler quando canHandle retornar true", async () => {
    const router = new MessageRouter();
    const mockHandler: ChannelHandler = {
      name: "MockHandler",
      description: "Test handler",
      canHandle: vi.fn().mockReturnValue(true),
      handle: vi.fn().mockResolvedValue(undefined),
    };

    router.register(mockHandler);

    const mockMessage = {
      author: { bot: false, id: "user-1", username: "Albertto" },
      channel: { id: "chan-1", name: "financeiro", isThread: () => false },
      content: "R$ 50 mercado",
    } as unknown as Message;

    const handled = await router.dispatch(mockMessage);
    expect(handled).toBe(true);
    expect(mockHandler.canHandle).toHaveBeenCalled();
    expect(mockHandler.handle).toHaveBeenCalled();
  });

  it("deve extrair contexto correto mesmo para threads e tópicos de fórum", () => {
    const router = new MessageRouter();
    const mockThreadMessage = {
      author: { bot: false, id: "user-1", username: "Albertto" },
      channel: {
        id: "thread-123",
        name: "Viagem Paris",
        isThread: () => true,
        parentId: "forum-999",
      },
      content: "Cotação de hotel",
    } as unknown as Message;

    const context: MessageContext = router.extractContext(mockThreadMessage);
    expect(context.isThread).toBe(true);
    expect(context.channelId).toBe("thread-123");
    expect(context.channelName).toBe("Viagem Paris");
    expect(context.parentId).toBe("forum-999");
  });

  it("deve isolar falha se um handler lançar erro e continuar execução", async () => {
    const router = new MessageRouter();
    const failingHandler: ChannelHandler = {
      name: "FailingHandler",
      description: "Throws an error",
      canHandle: () => true,
      handle: vi.fn().mockRejectedValue(new Error("Erro simulado")),
    };

    const healthyHandler: ChannelHandler = {
      name: "HealthyHandler",
      description: "Succeeds",
      canHandle: () => true,
      handle: vi.fn().mockResolvedValue(undefined),
    };

    router.register(failingHandler).register(healthyHandler);

    const mockMessage = {
      author: { bot: false, id: "user-1", username: "Albertto" },
      channel: { id: "chan-1", name: "geral", isThread: () => false },
      content: "Teste",
    } as unknown as Message;

    const handled = await router.dispatch(mockMessage);
    expect(handled).toBe(true);
    expect(healthyHandler.handle).toHaveBeenCalled();
  });
});
