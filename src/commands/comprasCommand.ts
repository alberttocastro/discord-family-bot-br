import { SlashCommandBuilder } from "discord.js";
import { Command, CommandContext } from "./index.js";
import { ComprasService } from "../services/compras/comprasService.js";

export const comprasCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("compras")
    .setDescription("Gerenciador familiar de lista de compras, stage e itens no carrinho")
    .addSubcommand((sub) =>
      sub
        .setName("stage")
        .setDescription("Visualiza o Stage (necessidades da despensa aguardando compras)")
    )
    .addSubcommand((sub) =>
      sub
        .setName("adicionar")
        .setDescription("Adiciona itens ao Stage de compras")
        .addStringOption((opt) =>
          opt
            .setName("itens")
            .setDescription("Nomes dos produtos separados por vírgula (ex: Café, Leite, Pão)")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("criar-lista")
        .setDescription("Cria uma lista de compras ativa a partir dos itens do Stage")
        .addStringOption((opt) =>
          opt
            .setName("nome")
            .setDescription("Nome da lista (ex: Supermercado Semanal, Hortifruti)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("ver")
        .setDescription("Exibe a lista de compras ativa e o progresso dos itens no carrinho")
    )
    .addSubcommand((sub) =>
      sub
        .setName("ticar")
        .setDescription("Marca ou desmarca um item como comprado na lista ativa")
        .addStringOption((opt) =>
          opt
            .setName("item")
            .setDescription("Nome ou ID do item na lista ativa")
            .setRequired(true)
        )
        .addBooleanOption((opt) =>
          opt
            .setName("comprado")
            .setDescription("Marcar como comprado (true) ou desmarcar (false)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("finalizar")
        .setDescription("Exibe as opções para finalizar a lista de compras ativa")
    )
    .addSubcommand((sub) =>
      sub
        .setName("limpar-stage")
        .setDescription("Remove todos os itens do Stage")
    ),

  async execute(interaction, context: CommandContext) {
    const service: ComprasService = (context as any).comprasService || new ComprasService();
    const subcommand = interaction.options.getSubcommand?.() || "ver";
    const author = interaction.user?.username || "Usuário";

    const respond = async (payload: any) => {
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply(payload);
      }
      return interaction.reply(payload);
    };

    try {
      switch (subcommand) {
        case "stage": {
          const stage = await service.getStage();
          const { embed, components } = service.buildStageEmbed(stage);
          await respond({ embeds: [embed], components });
          break;
        }

        case "adicionar": {
          const itemsStr = interaction.options.getString("itens", true);
          const added = await service.addToStage(itemsStr, author);

          if (added.length === 0) {
            await respond({
              content: "ℹ️ Os itens informados já estavam presentes no Stage de compras.",
            });
            return;
          }

          const stage = await service.getStage();
          const { embed, components } = service.buildStageEmbed(stage);
          await respond({
            content: `✅ **${added.length}** item(ns) adicionado(s) ao Stage com sucesso!`,
            embeds: [embed],
            components,
          });
          break;
        }

        case "criar-lista": {
          const listName = interaction.options.getString("nome") || undefined;
          const newList = await service.createListFromStage(listName, "all", author);
          const { embed, components } = service.buildActiveListEmbed(newList);
          await respond({
            content: `🎉 Lista de compras **"${newList.name}"** criada com sucesso!`,
            embeds: [embed],
            components,
          });
          break;
        }

        case "ver": {
          const activeList = await service.getActiveList();
          if (!activeList) {
            await respond({
              content:
                "ℹ️ Nenhuma lista de compras ativa no momento.\n" +
                "💡 Use `/compras criar-lista` para puxar os itens do Stage ou `/compras stage` para ver as necessidades.",
            });
            return;
          }

          const { embed, components } = service.buildActiveListEmbed(activeList);
          await respond({ embeds: [embed], components });
          break;
        }

        case "ticar": {
          const itemQuery = interaction.options.getString("item", true);
          const forceChecked = interaction.options.getBoolean("comprado");

          const { item, list } = await service.toggleCheckItem(
            itemQuery,
            author,
            forceChecked !== null ? forceChecked : undefined
          );

          const status = item.checked ? "✅ comprado" : "⬜ pendente";
          const { embed, components } = service.buildActiveListEmbed(list);

          await respond({
            content: `Item **${item.name}** marcado como ${status} na lista **"${list.name}"**!`,
            embeds: [embed],
            components,
          });
          break;
        }

        case "finalizar": {
          const activeList = await service.getActiveList();
          if (!activeList) {
            await respond({
              content: "ℹ️ Nenhuma lista de compras ativa no momento para finalizar.",
            });
            return;
          }

          const { embed, components } = service.buildFinishOptionsEmbed(activeList);
          await respond({ embeds: [embed], components });
          break;
        }

        case "limpar-stage": {
          const count = await service.clearStage();
          await respond({
            content: `🧹 Stage de compras esvaziado. **${count}** item(ns) removido(s).`,
          });
          break;
        }

        default:
          await respond({ content: "Comando não reconhecido." });
      }
    } catch (err: any) {
      await respond({
        content: `❌ Erro ao executar /compras ${subcommand}: ${err?.message || "Erro inesperado."}`,
      });
    }
  },
};
