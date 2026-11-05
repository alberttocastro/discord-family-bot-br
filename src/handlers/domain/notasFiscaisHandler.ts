import { ChannelHandler, MessageContext } from "../../routing/types.js";
import { config } from "../../config/index.js";

export class NotasFiscaisHandler implements ChannelHandler {
  public readonly name = "NotasFiscaisHandler";
  public readonly description = "Detecta links de notas fiscais (SEFAZ / NFC-e) e notas postadas";

  private sefazRegex = /(https?:\/\/[^\s]+(?:sefaz|nfe|nfce|danfe)[^\s]*)/i;

  public canHandle(context: MessageContext): boolean {
    if (config.CHANNEL_NOTAS_FISCAIS_ID && context.channelId === config.CHANNEL_NOTAS_FISCAIS_ID) {
      return true;
    }
    if (context.channelName.toLowerCase().includes("nota") || context.channelName.toLowerCase().includes("fiscal")) {
      return true;
    }
    return this.sefazRegex.test(context.content);
  }

  public async handle(context: MessageContext): Promise<void> {
    console.log(`[NotasFiscaisHandler] Possível nota fiscal detectada de ${context.authorUsername}: "${context.content}"`);
    // Placeholder para a tarefa "Parser de Nota Fiscal e armazenamento de itens no Google Drive"
  }
}
