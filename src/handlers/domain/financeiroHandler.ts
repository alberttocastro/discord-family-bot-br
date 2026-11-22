import { ChannelHandler, MessageContext } from "../../routing/types.js";
import { config } from "../../config/index.js";

export class FinanceiroHandler implements ChannelHandler {
  public readonly name = "FinanceiroHandler";
  public readonly description = "Captura registros de despesas e transações no canal financeiro";

  public canHandle(context: MessageContext): boolean {
    if (config.CHANNEL_FINANCEIRO_ID && context.channelId === config.CHANNEL_FINANCEIRO_ID) {
      return true;
    }
    return context.channelName.toLowerCase().includes("financeiro");
  }

  public async handle(context: MessageContext): Promise<void> {
    console.log(`[FinanceiroHandler] Mensagem recebida no financeiro de ${context.authorUsername}: "${context.content}"`);
    // Placeholder para a tarefa "Integração Meu Dinheiro"
  }
}
