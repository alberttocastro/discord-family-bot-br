import { describe, it, expect } from "vitest";
import { NotasFiscaisHandler } from "./notasFiscaisHandler.js";
import { MessageContext } from "../../routing/types.js";
import { Message } from "discord.js";

describe("NotasFiscaisHandler", () => {
  const handler = new NotasFiscaisHandler();

  it("deve reconhecer links de SEFAZ e NFC-e no conteúdo", () => {
    const context: MessageContext = {
      message: {} as Message,
      channelId: "123",
      channelName: "comprovantes",
      isThread: false,
      authorId: "user-1",
      authorUsername: "Albertto",
      content: "Segue a nota: https://nfe.sefaz.ba.gov.br/portal/nfce/qrcode.aspx?p=...",
    };

    expect(handler.canHandle(context)).toBe(true);
  });

  it("deve reconhecer quando o canal é 'notas-fiscais'", () => {
    const context: MessageContext = {
      message: {} as Message,
      channelId: "123",
      channelName: "notas-fiscais",
      isThread: false,
      authorId: "user-1",
      authorUsername: "Albertto",
      content: "foto do cupom fiscal",
    };

    expect(handler.canHandle(context)).toBe(true);
  });

  it("deve ignorar mensagens gerais sem relação com nota fiscal", () => {
    const context: MessageContext = {
      message: {} as Message,
      channelId: "123",
      channelName: "bate-papo",
      isThread: false,
      authorId: "user-1",
      authorUsername: "Albertto",
      content: "Bom dia família!",
    };

    expect(handler.canHandle(context)).toBe(false);
  });
});
