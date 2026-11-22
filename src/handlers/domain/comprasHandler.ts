import { ChannelHandler, MessageContext } from "../../routing/types.js";
import { config } from "../../config/index.js";
import { ComprasService } from "../../services/compras/comprasService.js";

export class ComprasHandler implements ChannelHandler {
  public readonly name = "ComprasHandler";
  public readonly description =
    "Gerencia lista de compras familiar, stage de necessidades e check-off em tempo real";

  private service: ComprasService;

  constructor(service: ComprasService = new ComprasService()) {
    this.service = service;
  }

  public canHandle(context: MessageContext): boolean {
    if (config.CHANNEL_COMPRAS_ID && context.channelId === config.CHANNEL_COMPRAS_ID) {
      return true;
    }
    return context.channelName.toLowerCase().includes("compras");
  }

  public async handle(context: MessageContext): Promise<void> {
    const rawContent = context.content.trim();
    if (!rawContent) return;

    const lower = rawContent.toLowerCase();

    // 1. Comando: Ver Stage
    if (lower === "!stage" || lower === "stage" || lower === "!despensa") {
      const stage = await this.service.getStage();
      const { embed, components } = this.service.buildStageEmbed(stage);
      await context.message.reply({ embeds: [embed], components });
      return;
    }

    // 2. Comando: Ver Lista Ativa
    if (
      lower === "!lista" ||
      lower === "lista" ||
      lower === "!compras" ||
      lower === "!ver" ||
      lower === "ver lista"
    ) {
      const activeList = await this.service.getActiveList();
      if (!activeList) {
        await context.message.reply({
          content:
            "ℹ️ Não há nenhuma lista de compras ativa no momento.\n" +
            "💡 Use `criar lista [nome]` para iniciar as compras com os itens do Stage ou digite `!stage` para ver o que precisa ser comprado.",
        });
        return;
      }

      const { embed, components } = this.service.buildActiveListEmbed(activeList);
      await context.message.reply({ embeds: [embed], components });
      return;
    }

    // 3. Comando: Criar Lista a partir do Stage
    if (lower.startsWith("!criar lista") || lower.startsWith("criar lista")) {
      const prefix = lower.startsWith("!criar lista") ? "!criar lista" : "criar lista";
      const listName = rawContent.slice(prefix.length).trim();

      try {
        const newList = await this.service.createListFromStage(
          listName || undefined,
          "all",
          context.authorUsername
        );
        const { embed, components } = this.service.buildActiveListEmbed(newList);
        await context.message.reply({
          content: `🎉 Lista de compras **"${newList.name}"** iniciada com ${newList.items.length} item(ns)!`,
          embeds: [embed],
          components,
        });
      } catch (err: any) {
        await context.message.reply({
          content: `⚠️ Não foi possível criar a lista: ${err?.message || "Erro desconhecido."}`,
        });
      }
      return;
    }

    // 4. Comando: Ticar / Check item
    const checkPrefixes = ["!ticar ", "ticar ", "!check ", "check ", "!comprar ", "comprar "];
    const matchedCheck = checkPrefixes.find((p) => lower.startsWith(p));
    if (matchedCheck) {
      const itemQuery = rawContent.slice(matchedCheck.length).trim();
      if (!itemQuery) return;

      try {
        const { item, list } = await this.service.toggleCheckItem(itemQuery, context.authorUsername);
        const statusEmoji = item.checked ? "✅" : "⬜";
        const statusText = item.checked ? "marcado como comprado" : "desmarcado";
        await context.message.reply({
          content: `${statusEmoji} Item **${item.name}** ${statusText} na lista **"${list.name}"**!`,
        });
      } catch (err: any) {
        await context.message.reply({
          content: `⚠️ ${err?.message || "Erro ao atualizar item."}`,
        });
      }
      return;
    }

    // 5. Comando: Finalizar lista
    if (lower === "!finalizar" || lower === "finalizar" || lower === "finalizar compras") {
      const activeList = await this.service.getActiveList();
      if (!activeList) {
        await context.message.reply({
          content: "ℹ️ Não há nenhuma lista de compras ativa para finalizar no momento.",
        });
        return;
      }

      const { embed, components } = this.service.buildFinishOptionsEmbed(activeList);
      await context.message.reply({ embeds: [embed], components });
      return;
    }

    // 6. Comando: Limpar stage
    if (lower === "!limpar stage" || lower === "limpar stage") {
      const count = await this.service.clearStage();
      await context.message.reply({
        content: `🧹 Stage limpo! **${count}** item(ns) foram removidos.`,
      });
      return;
    }

    // 7. Texto comum ou prefixado com "+": Adicionar itens ao Stage
    let itemsToAdd = rawContent;
    if (rawContent.startsWith("+")) {
      itemsToAdd = rawContent.slice(1).trim();
    }

    // Se a mensagem começar com outros comandos conhecidos (ex: botões ou exclamações), ignora
    if (rawContent.startsWith("!") || rawContent.startsWith("/")) {
      return;
    }

    try {
      const added = await this.service.addToStage(itemsToAdd, context.authorUsername);
      if (added.length === 0) {
        await context.message.reply({
          content: "ℹ️ Todos os itens informados já estão no Stage de compras.",
        });
        return;
      }

      if (context.message.react) {
        try {
          await context.message.react("📝");
        } catch {
          // Ignora se não puder reagir
        }
      }

      const names = added.map((i) => `• **${i.name}**`).join("\n");
      await context.message.reply({
        content: `📥 **${added.length}** item(ns) adicionado(s) ao Stage de compras:\n${names}`,
      });
    } catch (err: any) {
      console.error("[ComprasHandler] Erro ao adicionar ao stage:", err);
    }
  }
}
