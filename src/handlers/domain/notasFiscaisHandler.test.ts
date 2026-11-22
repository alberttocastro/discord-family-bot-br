import { describe, it, expect, vi } from "vitest";
import { NotasFiscaisHandler } from "./notasFiscaisHandler.js";
import { MessageContext } from "../../routing/types.js";
import { Message } from "discord.js";
import { SefazParser, InvoiceData } from "../../services/sefazParser.js";
import { GoogleDriveService, GoogleSyncResult } from "../../services/googleDriveService.js";

describe("NotasFiscaisHandler", () => {
  const mockInvoice: InvoiceData = {
    establishmentName: "Mercadinho da Esquina",
    cnpj: "11.222.333/0001-44",
    totalAmount: 50.00,
    itemsCount: 1,
    items: [
      {
        name: "Pão de Forma",
        quantity: 2,
        unit: "UN",
        unitPrice: 25.00,
        totalPrice: 50.00,
      },
    ],
  };

  it("deve reconhecer links de SEFAZ e NFC-e no conteúdo", () => {
    const handler = new NotasFiscaisHandler();
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
    const handler = new NotasFiscaisHandler();
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

  it("deve processar nota fiscal, sincronizar e responder com embed no Discord", async () => {
    const mockParser = {
      parseUrl: vi.fn().mockResolvedValue(mockInvoice),
    } as unknown as SefazParser;

    const mockSyncResult: GoogleSyncResult = {
      sheetAppended: true,
      fileCreated: true,
      fileUrl: "https://drive.google.com/file/d/123",
      rowsAdded: 1,
      isSimulated: false,
    };

    const mockDriveService = {
      syncInvoice: vi.fn().mockResolvedValue(mockSyncResult),
    } as unknown as GoogleDriveService;

    const handler = new NotasFiscaisHandler(mockParser, mockDriveService);

    const replyFn = vi.fn().mockResolvedValue(undefined);
    const reactFn = vi.fn().mockResolvedValue(undefined);
    const removeAllReactionsFn = vi.fn().mockResolvedValue(undefined);

    const mockMessage = {
      reply: replyFn,
      react: reactFn,
      reactions: {
        removeAll: removeAllReactionsFn,
      },
    } as unknown as Message;

    const context: MessageContext = {
      message: mockMessage,
      channelId: "123",
      channelName: "notas-fiscais",
      isThread: false,
      authorId: "user-1",
      authorUsername: "Albertto",
      content: "https://nfe.sefaz.ba.gov.br/portal/nfce/qrcode.aspx?p=test",
    };

    await handler.handle(context);

    expect(mockParser.parseUrl).toHaveBeenCalledWith("https://nfe.sefaz.ba.gov.br/portal/nfce/qrcode.aspx?p=test");
    expect(mockDriveService.syncInvoice).toHaveBeenCalledWith(mockInvoice);
    expect(reactFn).toHaveBeenCalledWith("⏳");
    expect(replyFn).toHaveBeenCalledTimes(1);

    const replyArgs = replyFn.mock.calls[0][0];
    expect(replyArgs).toHaveProperty("embeds");
    expect(replyArgs.embeds[0].data.title).toBe("🧾 Nota Fiscal Processada com Sucesso!");
  });

  it("deve avisar se a mensagem no canal não possuir link válido", async () => {
    const handler = new NotasFiscaisHandler();
    const replyFn = vi.fn().mockResolvedValue(undefined);

    const mockMessage = {
      reply: replyFn,
    } as unknown as Message;

    const context: MessageContext = {
      message: mockMessage,
      channelId: "123",
      channelName: "notas-fiscais",
      isThread: false,
      authorId: "user-1",
      authorUsername: "Albertto",
      content: "bom dia pessoal",
    };

    await handler.handle(context);

    expect(replyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Não encontrei um link de Nota Fiscal"),
      })
    );
  });
});
