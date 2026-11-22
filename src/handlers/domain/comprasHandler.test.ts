import { describe, expect, it, beforeEach } from "vitest";
import { ComprasHandler } from "./comprasHandler.js";
import { ComprasService } from "../../services/compras/comprasService.js";
import { InMemoryComprasRepository } from "../../services/compras/comprasRepository.js";
import { MessageRouter } from "../../routing/router.js";

describe("ComprasHandler", () => {
  let repo: InMemoryComprasRepository;
  let service: ComprasService;
  let handler: ComprasHandler;
  let router: MessageRouter;

  beforeEach(() => {
    repo = new InMemoryComprasRepository();
    service = new ComprasService(repo);
    handler = new ComprasHandler(service);
    router = new MessageRouter().register(handler);
  });

  it("deve identificar o canal de compras pelo nome ou ID", () => {
    expect(
      handler.canHandle({
        channelName: "compras-casa",
        channelId: "123",
      } as any)
    ).toBe(true);

    expect(
      handler.canHandle({
        channelName: "geral",
        channelId: "999",
      } as any)
    ).toBe(false);
  });

  it("deve adicionar itens ao Stage quando usuário enviar texto comum no canal compras", async () => {
    const result = await router.dispatchSimulated({
      channel: "compras",
      content: "Leite, Café em pó, Pão francês",
      author: "Albertto",
    });

    expect(result.handled).toBe(true);
    expect(result.replies[0].content).toContain("**3** item(ns) adicionado(s) ao Stage");
    expect(result.reactions).toContain("📝");

    const stage = await service.getStage();
    expect(stage).toHaveLength(3);
  });

  it("deve exibir o stage quando usuário digitar !stage", async () => {
    await service.addToStage(["Arroz", "Feijão"], "Albertto");

    const result = await router.dispatchSimulated({
      channel: "compras",
      content: "!stage",
      author: "Albertto",
    });

    expect(result.handled).toBe(true);
    expect(result.replies[0].embeds?.[0].title).toContain("Stage de Compras");
    expect(result.replies[0].embeds?.[0].fields[0].value).toContain("Arroz");
  });

  it("deve criar lista a partir do stage com 'criar lista [nome]'", async () => {
    await service.addToStage(["Sabão em pó", "Detergente"], "Albertto");

    const result = await router.dispatchSimulated({
      channel: "compras",
      content: "criar lista Limpeza",
      author: "Albertto",
    });

    expect(result.handled).toBe(true);
    expect(result.replies[0].content).toContain('Lista de compras **"Limpeza"** iniciada');

    const activeList = await service.getActiveList();
    expect(activeList?.name).toBe("Limpeza");
    expect(activeList?.items).toHaveLength(2);
  });

  it("deve ticar item na lista ativa com 'ticar [item]'", async () => {
    await service.addToStage(["Azeite", "Sal"], "Albertto");
    await service.createListFromStage("Temperos", "all");

    const result = await router.dispatchSimulated({
      channel: "compras",
      content: "ticar Azeite",
      author: "Albertto",
    });

    expect(result.handled).toBe(true);
    expect(result.replies[0].content).toContain("marcado como comprado");

    const activeList = await service.getActiveList();
    const item = activeList?.items.find((i) => i.name === "Azeite");
    expect(item?.checked).toBe(true);
  });

  it("deve exibir painel de finalização ao digitar 'finalizar'", async () => {
    await service.addToStage(["Item 1"], "Albertto");
    await service.createListFromStage("Lista", "all");

    const result = await router.dispatchSimulated({
      channel: "compras",
      content: "finalizar",
      author: "Albertto",
    });

    expect(result.handled).toBe(true);
    expect(result.replies[0].embeds?.[0].title).toContain("Finalização da Lista");
  });
});
