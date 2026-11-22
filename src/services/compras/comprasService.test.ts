import { describe, expect, it, beforeEach } from "vitest";
import { ComprasService } from "./comprasService.js";
import { InMemoryComprasRepository } from "./comprasRepository.js";

describe("ComprasService", () => {
  let repo: InMemoryComprasRepository;
  let service: ComprasService;

  beforeEach(() => {
    repo = new InMemoryComprasRepository();
    service = new ComprasService(repo);
  });

  describe("Stage (Backlog de Necessidades)", () => {
    it("deve iniciar com stage vazio", async () => {
      const stage = await service.getStage();
      expect(stage).toEqual([]);
    });

    it("deve adicionar itens ao stage separando por vírgula e quebra de linha", async () => {
      const added = await service.addToStage("Leite integral, Café em pó\nAzeite de oliva", "Albertto");
      expect(added).toHaveLength(3);
      expect(added.map((i) => i.name)).toEqual(["Leite integral", "Café em pó", "Azeite de oliva"]);

      const stage = await service.getStage();
      expect(stage).toHaveLength(3);
      expect(stage[0].addedBy).toBe("Albertto");
    });

    it("não deve duplicar itens no stage se já existirem (case-insensitive)", async () => {
      await service.addToStage(["Leite", "Café"], "Albertto");
      const secondAdd = await service.addToStage(["leite", "Pão"], "Maria");

      expect(secondAdd).toHaveLength(1);
      expect(secondAdd[0].name).toBe("Pão");

      const stage = await service.getStage();
      expect(stage).toHaveLength(3);
    });

    it("deve remover itens do stage por ID ou por nome", async () => {
      await service.addToStage(["Arroz", "Feijão", "Macarrão"], "Albertto");
      const removed = await service.removeFromStage(["feijão"]);

      expect(removed).toHaveLength(1);
      expect(removed[0].name).toBe("Feijão");

      const stage = await service.getStage();
      expect(stage.map((s) => s.name)).toEqual(["Arroz", "Macarrão"]);
    });

    it("deve limpar o stage completamente", async () => {
      await service.addToStage(["Item 1", "Item 2"], "Albertto");
      const count = await service.clearStage();

      expect(count).toBe(2);
      expect(await service.getStage()).toEqual([]);
    });
  });

  describe("Criação de Lista a partir do Stage", () => {
    it("deve lançar erro se tentar criar lista com stage vazio", async () => {
      await expect(service.createListFromStage("Mercado")).rejects.toThrow(
        "O Stage de compras está vazio"
      );
    });

    it("deve criar lista com TODOS os itens do stage e esvaziar o stage", async () => {
      await service.addToStage(["Leite", "Café", "Pão"], "Albertto");

      const list = await service.createListFromStage("Supermercado", "all", "Albertto");
      expect(list.name).toBe("Supermercado");
      expect(list.items).toHaveLength(3);
      expect(list.status).toBe("active");

      // Stage deve ficar vazio
      const stage = await service.getStage();
      expect(stage).toHaveLength(0);

      // Lista ativa deve estar presente
      const active = await service.getActiveList();
      expect(active?.id).toBe(list.id);
    });

    it("deve criar lista PARCIAL do stage: itens selecionados vão para a lista e o restante fica no stage", async () => {
      await service.addToStage(["Leite", "Café", "Azeite", "Detergente"], "Albertto");

      const list = await service.createListFromStage(
        "Mercado Rápido",
        ["leite", "detergente"],
        "Maria"
      );

      expect(list.items.map((i) => i.name)).toEqual(["Leite", "Detergente"]);

      // Restante permanece no Stage
      const stage = await service.getStage();
      expect(stage.map((i) => i.name)).toEqual(["Café", "Azeite"]);
    });

    it("deve impedir criação de nova lista se já houver uma lista ativa", async () => {
      await service.addToStage(["Item 1", "Item 2"], "Albertto");
      await service.createListFromStage("Lista 1", "all");

      await service.addToStage(["Item 3"], "Albertto");
      await expect(service.createListFromStage("Lista 2", "all")).rejects.toThrow(
        'Já existe uma lista de compras ativa ("Lista 1")'
      );
    });
  });

  describe("Check-off de Itens na Lista Ativa (Ticar)", () => {
    it("deve ticar e desticar um item na lista ativa", async () => {
      await service.addToStage(["Leite", "Café"], "Albertto");
      const list = await service.createListFromStage("Mercado", "all");

      const { item, list: updatedList } = await service.toggleCheckItem(list.items[0].id, "Albertto");
      expect(item.checked).toBe(true);
      expect(item.checkedBy).toBe("Albertto");
      expect(item.checkedAt).toBeDefined();

      // Destica
      const { item: uncheckedItem } = await service.toggleCheckItem(item.id, "Albertto");
      expect(uncheckedItem.checked).toBe(false);
      expect(uncheckedItem.checkedBy).toBeUndefined();
    });

    it("deve ticar múltiplos itens de uma só vez", async () => {
      await service.addToStage(["Item 1", "Item 2", "Item 3"], "Albertto");
      await service.createListFromStage("Mercado", "all");

      const updated = await service.checkMultipleItems(["item 1", "item 3"], "Albertto", true);
      const checked = updated.items.filter((i) => i.checked).map((i) => i.name);
      expect(checked).toEqual(["Item 1", "Item 3"]);
    });

    it("deve lançar erro se tentar ticar item sem lista ativa", async () => {
      await expect(service.toggleCheckItem("Leite")).rejects.toThrow(
        "Não há nenhuma lista de compras ativa no momento."
      );
    });
  });

  describe("Pós-Compra / Finalização da Lista (3 Opções)", () => {
    beforeEach(async () => {
      await service.addToStage(["Arroz", "Feijão", "Carne", "Frango"], "Albertto");
      await service.createListFromStage("Compra Semanal", "all");
      // Marca Arroz e Feijão como comprados; Carne e Frango faltaram
      await service.checkMultipleItems(["Arroz", "Feijão"], "Albertto", true);
    });

    it("Opção 1 (keep): deve manter a lista arquivada e não alterar o stage", async () => {
      const result = await service.finishActiveList("keep", "Albertto");

      expect(result.action).toBe("keep");
      expect(result.archivedList.status).toBe("finished");
      expect(await service.getActiveList()).toBeNull();
      // Stage continua vazio
      expect(await service.getStage()).toHaveLength(0);
    });

    it("Opção 2 (new_list_missing): deve criar uma nova lista ativa contendo apenas os itens que faltaram", async () => {
      const result = await service.finishActiveList("new_list_missing", "Albertto");

      expect(result.action).toBe("new_list_missing");
      expect(result.newList).toBeDefined();
      expect(result.newList?.name).toContain("(Restante)");
      expect(result.newList?.items.map((i) => i.name)).toEqual(["Carne", "Frango"]);
      expect(result.newList?.items.every((i) => i.checked === false)).toBe(true);

      const activeList = await service.getActiveList();
      expect(activeList?.id).toBe(result.newList?.id);
    });

    it("Opção 3 (return_to_stage): deve devolver os itens não comprados de volta ao Stage", async () => {
      // Adiciona um item novo no stage enquanto as compras aconteciam
      await service.addToStage(["Biscoito"], "Maria");

      const result = await service.finishActiveList("return_to_stage", "Albertto");

      expect(result.action).toBe("return_to_stage");
      expect(result.returnedToStageCount).toBe(2); // Carne e Frango
      expect(await service.getActiveList()).toBeNull();

      const stage = await service.getStage();
      expect(stage.map((s) => s.name)).toEqual(["Biscoito", "Carne", "Frango"]);
    });
  });

  describe("UI Helpers (Embeds e Components)", () => {
    it("deve gerar embed para o stage vazio e com itens", async () => {
      const emptyUi = service.buildStageEmbed([]);
      expect(emptyUi.embed.title).toContain("Stage de Compras");
      expect(emptyUi.components).toHaveLength(1);

      await service.addToStage(["Leite", "Café"], "Albertto");
      const stage = await service.getStage();
      const withItemsUi = service.buildStageEmbed(stage);
      expect(withItemsUi.embed.fields[0].value).toContain("Leite");
      expect(withItemsUi.components).toHaveLength(1);
    });

    it("deve gerar embed para lista ativa com barra de progresso e botões", async () => {
      await service.addToStage(["Item 1", "Item 2"], "Albertto");
      await service.createListFromStage("Lista UI", "all");
      const { list: updatedList } = await service.toggleCheckItem("Item 1", "Albertto");

      const activeUi = service.buildActiveListEmbed(updatedList);
      expect(activeUi.embed.title).toContain("Lista Ativa: Lista UI");
      expect(activeUi.embed.description).toContain("50%");
      expect(activeUi.components.length).toBeGreaterThan(0);
    });

    it("deve gerar embed de opções de finalização com 3 botões", async () => {
      await service.addToStage(["Item 1", "Item 2"], "Albertto");
      const list = await service.createListFromStage("Lista UI", "all");

      const finishUi = service.buildFinishOptionsEmbed(list);
      expect(finishUi.embed.title).toContain("Finalização da Lista");
      const buttons = finishUi.components[0].components;
      expect(buttons).toHaveLength(3);
    });
  });
});
