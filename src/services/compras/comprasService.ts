import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import {
  IComprasRepository,
  createComprasRepository,
} from "./comprasRepository.js";
import { FinishListAction, ShoppingData, ShoppingItem, ShoppingList } from "./types.js";

export class ComprasService {
  private repository: IComprasRepository;

  constructor(repository: IComprasRepository = createComprasRepository()) {
    this.repository = repository;
  }

  private generateId(prefix = "item"): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  }

  public async getStage(): Promise<ShoppingItem[]> {
    const data = await this.repository.getData();
    return data.stage;
  }

  public async addToStage(itemNames: string[] | string, author = "Usuário"): Promise<ShoppingItem[]> {
    const rawNames = Array.isArray(itemNames) ? itemNames : [itemNames];
    const cleanedNames: string[] = [];

    for (const raw of rawNames) {
      if (!raw) continue;
      // Quebra por vírgula ou por linha
      const splitted = raw
        .split(/[\n,]+/)
        .map((s) => s.trim().replace(/^[-*•+]\s*/, ""))
        .filter((s) => s.length > 0);
      cleanedNames.push(...splitted);
    }

    if (cleanedNames.length === 0) {
      return [];
    }

    const data = await this.repository.getData();
    const addedItems: ShoppingItem[] = [];

    for (const name of cleanedNames) {
      // Normalização e verificação de duplicidade no stage (case-insensitive)
      const existing = data.stage.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        continue;
      }

      const newItem: ShoppingItem = {
        id: this.generateId("stg"),
        name,
        addedBy: author,
        addedAt: new Date().toISOString(),
        checked: false,
      };

      data.stage.push(newItem);
      addedItems.push(newItem);
    }

    await this.repository.saveData(data);
    return addedItems;
  }

  public async removeFromStage(itemIdsOrNames: string[]): Promise<ShoppingItem[]> {
    const data = await this.repository.getData();
    const lookup = new Set(itemIdsOrNames.map((i) => i.trim().toLowerCase()));

    const removed: ShoppingItem[] = [];
    const remaining: ShoppingItem[] = [];

    for (const item of data.stage) {
      if (lookup.has(item.id.toLowerCase()) || lookup.has(item.name.toLowerCase())) {
        removed.push(item);
      } else {
        remaining.push(item);
      }
    }

    data.stage = remaining;
    await this.repository.saveData(data);
    return removed;
  }

  public async clearStage(): Promise<number> {
    const data = await this.repository.getData();
    const count = data.stage.length;
    data.stage = [];
    await this.repository.saveData(data);
    return count;
  }

  public async getActiveList(): Promise<ShoppingList | null> {
    const data = await this.repository.getData();
    return data.activeList;
  }

  public async createListFromStage(
    listName?: string,
    selectedItemIdsOrNames?: string[] | "all",
    author = "Usuário"
  ): Promise<ShoppingList> {
    const data = await this.repository.getData();

    if (data.activeList && data.activeList.status === "active") {
      throw new Error(
        `Já existe uma lista de compras ativa ("${data.activeList.name}"). Finalize-a antes de criar uma nova.`
      );
    }

    if (data.stage.length === 0) {
      throw new Error("O Stage de compras está vazio. Adicione itens antes de criar uma lista.");
    }

    let itemsForList: ShoppingItem[] = [];
    let remainingStage: ShoppingItem[] = [];

    if (!selectedItemIdsOrNames || selectedItemIdsOrNames === "all") {
      // Puxa todos os itens do stage
      itemsForList = [...data.stage];
      remainingStage = [];
    } else {
      const selectedSet = new Set(
        selectedItemIdsOrNames.map((s) => s.trim().toLowerCase())
      );

      for (const item of data.stage) {
        if (selectedSet.has(item.id.toLowerCase()) || selectedSet.has(item.name.toLowerCase())) {
          itemsForList.push({ ...item, checked: false });
        } else {
          remainingStage.push(item);
        }
      }

      if (itemsForList.length === 0) {
        throw new Error("Nenhum item válido do Stage foi selecionado para a lista.");
      }
    }

    const now = new Date();
    const finalName =
      listName && listName.trim().length > 0
        ? listName.trim()
        : `Compras de ${now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}`;

    const newList: ShoppingList = {
      id: this.generateId("lst"),
      name: finalName,
      status: "active",
      createdAt: now.toISOString(),
      createdBy: author,
      items: itemsForList.map((item) => ({
        ...item,
        checked: false,
      })),
    };

    data.stage = remainingStage;
    data.activeList = newList;

    await this.repository.saveData(data);
    return newList;
  }

  public async toggleCheckItem(
    itemIdOrName: string,
    author = "Usuário",
    forceChecked?: boolean
  ): Promise<{ item: ShoppingItem; list: ShoppingList }> {
    const data = await this.repository.getData();
    if (!data.activeList || data.activeList.status !== "active") {
      throw new Error("Não há nenhuma lista de compras ativa no momento.");
    }

    const query = itemIdOrName.trim().toLowerCase();
    const item = data.activeList.items.find(
      (i) => i.id.toLowerCase() === query || i.name.toLowerCase() === query
    );

    if (!item) {
      throw new Error(`Item "${itemIdOrName}" não encontrado na lista de compras ativa.`);
    }

    const newChecked = forceChecked !== undefined ? forceChecked : !item.checked;
    item.checked = newChecked;
    if (newChecked) {
      item.checkedAt = new Date().toISOString();
      item.checkedBy = author;
    } else {
      item.checkedAt = undefined;
      item.checkedBy = undefined;
    }

    await this.repository.saveData(data);
    return { item, list: data.activeList };
  }

  public async checkMultipleItems(
    itemIdsOrNames: string[],
    author = "Usuário",
    checked = true
  ): Promise<ShoppingList> {
    const data = await this.repository.getData();
    if (!data.activeList || data.activeList.status !== "active") {
      throw new Error("Não há nenhuma lista de compras ativa no momento.");
    }

    const querySet = new Set(itemIdsOrNames.map((q) => q.trim().toLowerCase()));

    for (const item of data.activeList.items) {
      if (querySet.has(item.id.toLowerCase()) || querySet.has(item.name.toLowerCase())) {
        item.checked = checked;
        if (checked) {
          item.checkedAt = new Date().toISOString();
          item.checkedBy = author;
        } else {
          item.checkedAt = undefined;
          item.checkedBy = undefined;
        }
      }
    }

    await this.repository.saveData(data);
    return data.activeList;
  }

  public async finishActiveList(
    action: FinishListAction,
    author = "Usuário"
  ): Promise<{
    archivedList: ShoppingList;
    newList?: ShoppingList;
    returnedToStageCount?: number;
    action: FinishListAction;
  }> {
    const data = await this.repository.getData();
    const list = data.activeList;

    if (!list || list.status !== "active") {
      throw new Error("Não há nenhuma lista de compras ativa para finalizar.");
    }

    const now = new Date();
    list.status = "finished";
    list.finishedAt = now.toISOString();
    list.finishAction = action;

    const uncheckedItems = list.items.filter((item) => !item.checked);
    data.history.push(list);

    let newList: ShoppingList | undefined;
    let returnedCount = 0;

    if (action === "keep") {
      // 1. Manter na lista e arquivar: apenas limpa activeList
      data.activeList = null;
    } else if (action === "new_list_missing") {
      // 2. Criar uma nova com o que falta:
      if (uncheckedItems.length > 0) {
        newList = {
          id: this.generateId("lst"),
          name: `${list.name} (Restante)`,
          status: "active",
          createdAt: now.toISOString(),
          createdBy: author,
          items: uncheckedItems.map((item) => ({
            ...item,
            id: this.generateId("item"),
            checked: false,
            checkedAt: undefined,
            checkedBy: undefined,
          })),
        };
        data.activeList = newList;
      } else {
        data.activeList = null;
      }
    } else if (action === "return_to_stage") {
      // 3. Voltar tudo o que falta para o Stage:
      for (const item of uncheckedItems) {
        const existsInStage = data.stage.some(
          (s) => s.name.toLowerCase() === item.name.toLowerCase()
        );
        if (!existsInStage) {
          data.stage.push({
            id: this.generateId("stg"),
            name: item.name,
            addedBy: author,
            addedAt: now.toISOString(),
            checked: false,
          });
          returnedCount++;
        }
      }
      data.activeList = null;
    }

    await this.repository.saveData(data);

    return {
      archivedList: list,
      newList,
      returnedToStageCount: returnedCount,
      action,
    };
  }

  // =========================================================================
  // Discord UI Builders (Embeds, Buttons, Select Menus)
  // =========================================================================

  public buildProgressBar(checked: number, total: number, size = 10): string {
    if (total === 0) return "░".repeat(size) + " 0%";
    const percentage = Math.round((checked / total) * 100);
    const filled = Math.round((checked / total) * size);
    const empty = size - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${percentage}% (${checked}/${total})`;
  }

  public buildStageEmbed(stage: ShoppingItem[]): { embed: any; components: any[] } {
    const embed: any = {
      title: "📦 Stage de Compras (Despensa Familiar)",
      description:
        stage.length === 0
          ? "O Stage está vazio no momento!\n\n💡 *Dica: Digite itens no canal (ex: `café, leite, manteiga`) ou use `/compras adicionar` para incluir necessidades da casa.*"
          : `Total de **${stage.length}** item(ns) aguardando ida às compras:`,
      color: 0xf39c12, // Amber / Orange
      fields: [],
      timestamp: new Date().toISOString(),
      footer: { text: "Stage de Compras • discord-family-bot-br" },
    };

    if (stage.length > 0) {
      const itemsList = stage
        .map((item, index) => `**${index + 1}.** ${item.name} *(por ${item.addedBy})*`)
        .join("\n");

      embed.fields.push({
        name: "📝 Itens no Stage",
        value: itemsList.length > 1024 ? itemsList.slice(0, 1020) + "..." : itemsList,
      });
    }

    const row = new ActionRowBuilder<ButtonBuilder>();

    if (stage.length > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("shopping_create_all")
          .setLabel("🛒 Iniciar Lista de Compras")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("shopping_stage_clear")
          .setLabel("🧹 Limpar Stage")
          .setStyle(ButtonStyle.Danger)
      );
    } else {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("shopping_stage_refresh")
          .setLabel("🔄 Atualizar Stage")
          .setStyle(ButtonStyle.Secondary)
      );
    }

    return { embed, components: [row.toJSON()] };
  }

  public buildActiveListEmbed(list: ShoppingList): { embed: any; components: any[] } {
    const total = list.items.length;
    const checkedItems = list.items.filter((i) => i.checked);
    const pendingItems = list.items.filter((i) => !i.checked);
    const checkedCount = checkedItems.length;

    const progressBar = this.buildProgressBar(checkedCount, total);

    const embed: any = {
      title: `🛒 Lista Ativa: ${list.name}`,
      description: `**Progresso da Compra:**\n\`${progressBar}\``,
      color: checkedCount === total && total > 0 ? 0x2ecc71 : 0x3498db,
      fields: [],
      timestamp: new Date().toISOString(),
      footer: { text: `Criada por ${list.createdBy} • Toque nos menus ou botões abaixo` },
    };

    if (pendingItems.length > 0) {
      const pendingText = pendingItems
        .map((item, index) => `⬜ **${index + 1}.** ${item.name}`)
        .join("\n");
      embed.fields.push({
        name: `⏳ No Carrinho Pendente (${pendingItems.length})`,
        value: pendingText.length > 1024 ? pendingText.slice(0, 1020) + "..." : pendingText,
        inline: false,
      });
    }

    if (checkedItems.length > 0) {
      const checkedText = checkedItems
        .map((item) => `✅ ~~${item.name}~~ *(por ${item.checkedBy || "Alguém"})*`)
        .join("\n");
      embed.fields.push({
        name: `🛍️ Comprados / No Carrinho (${checkedItems.length})`,
        value: checkedText.length > 1024 ? checkedText.slice(0, 1020) + "..." : checkedText,
        inline: false,
      });
    }

    const components: any[] = [];

    // Se houver itens pendentes, adiciona um Select Menu para ticar itens diretamente
    if (pendingItems.length > 0) {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("shopping_check_item")
        .setPlaceholder("🛒 Marcar item como comprado no carrinho...")
        .setMinValues(1)
        .setMaxValues(Math.min(pendingItems.length, 10));

      for (const item of pendingItems.slice(0, 25)) {
        selectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(item.name.slice(0, 100))
            .setValue(item.id)
            .setDescription(`Adicionado por ${item.addedBy}`)
            .setEmoji("✅")
        );
      }

      components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu).toJSON());
    }

    const buttonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("shopping_finish_menu")
        .setLabel("🏁 Finalizar Compra")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("shopping_refresh_list")
        .setLabel("🔄 Atualizar")
        .setStyle(ButtonStyle.Secondary)
    );

    components.push(buttonsRow.toJSON());

    return { embed, components };
  }

  public buildFinishOptionsEmbed(list: ShoppingList): { embed: any; components: any[] } {
    const total = list.items.length;
    const checkedCount = list.items.filter((i) => i.checked).length;
    const missingCount = total - checkedCount;

    const embed: any = {
      title: "🏁 Finalização da Lista de Compras",
      description:
        `Você está finalizando a lista **"${list.name}"**.\n\n` +
        `• Total de itens: **${total}**\n` +
        `• Itens comprados: **${checkedCount}**\n` +
        `• Itens faltantes: **${missingCount}**\n\n` +
        `Escolha o que deseja fazer com a lista e os itens que faltaram:`,
      color: 0x9b59b6, // Roxo
      timestamp: new Date().toISOString(),
      footer: { text: "Selecione uma das opções abaixo" },
    };

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("shopping_finish_keep")
        .setLabel("📦 Manter & Arquivar")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("shopping_finish_new")
        .setLabel("🔄 Nova com o que Falta")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(missingCount === 0),
      new ButtonBuilder()
        .setCustomId("shopping_finish_stage")
        .setLabel("📥 Voltar Faltantes pro Stage")
        .setStyle(ButtonStyle.Success)
        .setDisabled(missingCount === 0)
    );

    return { embed, components: [row.toJSON()] };
  }
}
