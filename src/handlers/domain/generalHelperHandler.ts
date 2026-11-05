import { ChannelHandler, MessageContext } from "../../routing/types.js";

export class GeneralHelperHandler implements ChannelHandler {
  public readonly name = "GeneralHelper";
  public readonly description = "Responde a menções diretas ao bot caso nenhuma rota específica capture";

  public canHandle(context: MessageContext): boolean {
    const clientUser = context.message.client.user;
    if (!clientUser) return false;
    return context.message.mentions.has(clientUser);
  }

  public async handle(context: MessageContext): Promise<void> {
    await context.message.reply({
      content: `Olá **${context.authorUsername}**! Sou o Bot da Família 🤖.\nEstou ativo e pronto para ajudar na organização de finanças, notas fiscais, compras e compromissos!`,
    });
  }
}
