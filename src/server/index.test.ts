import { describe, it, expect } from "vitest";
import request from "supertest";
import { createHttpServer } from "./index.js";
import { Config } from "../config/index.js";
import { MessageRouter } from "../routing/router.js";
import { ChannelHandler, MessageContext } from "../routing/types.js";

describe("HTTP Server (100% HTTP / Serverless / Probes)", () => {
  const mockConfig: Config = {
    NODE_ENV: "test",
    PORT: 8080,
    CRON_SECRET: "test-secret",
  };

  it("GET /healthz deve retornar status alive e HTTP 200", async () => {
    const router = new MessageRouter();
    const app = createHttpServer(router, mockConfig);
    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "alive");
    expect(response.body).toHaveProperty("uptime");
  });

  it("GET /ready deve responder 200 no modo HTTP", async () => {
    const router = new MessageRouter();
    const app = createHttpServer(router, mockConfig);
    const response = await request(app).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ready");
    expect(response.body.bot.status).toBe("ready");
  });

  describe("Endpoint /api/commands/:name (Testes Diretos de Comandos)", () => {
    it("POST /api/commands/ping deve responder com latência", async () => {
      const router = new MessageRouter();
      const app = createHttpServer(router, mockConfig);

      const response = await request(app).post("/api/commands/ping");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.command).toBe("ping");
      expect(response.body.response.content).toContain("Pong");
    });

    it("POST /api/commands/status deve responder com embeds do bot", async () => {
      const router = new MessageRouter();
      const app = createHttpServer(router, mockConfig);

      const response = await request(app).post("/api/commands/status");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.response).toHaveProperty("embeds");
      expect(response.body.response.embeds[0].title).toContain("Status do Bot");
    });

    it("POST /api/commands/:name deve retornar 404 para comando inexistente", async () => {
      const router = new MessageRouter();
      const app = createHttpServer(router, mockConfig);

      const response = await request(app).post("/api/commands/comando-inexistente");

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe("Endpoint /api/channels/messages (Enviar Comando/Mensagem como se fosse um Canal)", () => {
    it("deve simular mensagem em canal e executar handlers registrados", async () => {
      const router = new MessageRouter();

      class MockTestHandler implements ChannelHandler {
        public readonly name = "MockTestHandler";
        public readonly description = "Handler de teste de canal";
        public canHandle(context: MessageContext) {
          return context.channelName === "compras";
        }
        public async handle(context: MessageContext) {
          await context.message.reply("Item adicionado à lista de compras!");
          await context.message.react("🛒");
        }
      }

      router.register(new MockTestHandler());
      const app = createHttpServer(router, mockConfig);

      const response = await request(app)
        .post("/api/channels/messages")
        .send({
          channel: "compras",
          content: "Comprar leite e ovos",
          author: "Albertto",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.handled).toBe(true);
      expect(response.body.handlersMatched).toContain("MockTestHandler");
      expect(response.body.replies[0].content).toBe("Item adicionado à lista de compras!");
      expect(response.body.reactions).toContain("🛒");
    });

    it("deve aceitar canal como parâmetro de rota /api/channels/:channel/messages", async () => {
      const router = new MessageRouter();
      const app = createHttpServer(router, mockConfig);

      const response = await request(app)
        .post("/api/channels/financeiro/messages")
        .send({
          content: "Lançamento de despesa R$ 50",
        });

      expect(response.status).toBe(200);
      expect(response.body.channel).toBe("financeiro");
      expect(response.body.content).toBe("Lançamento de despesa R$ 50");
    });

    it("deve retornar 400 se o campo 'content' não for informado", async () => {
      const router = new MessageRouter();
      const app = createHttpServer(router, mockConfig);

      const response = await request(app)
        .post("/api/channels/messages")
        .send({
          channel: "geral",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("Endpoint /api/interactions (Discord Webhook)", () => {
    it("deve responder PONG ao receber PING (type: 1) do Discord", async () => {
      const router = new MessageRouter();
      const app = createHttpServer(router, mockConfig);

      const response = await request(app)
        .post("/api/interactions")
        .send({ type: 1 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ type: 1 });
    });

    it("deve executar slash command (type: 2) e responder ChannelMessageWithSource (type: 4)", async () => {
      const router = new MessageRouter();
      const app = createHttpServer(router, mockConfig);

      const response = await request(app)
        .post("/api/interactions")
        .send({
          type: 2,
          data: {
            name: "ping",
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.type).toBe(4);
      expect(response.body.data.content).toContain("Pong");
    });

    it("deve responder de imediato com DEFERRED (type: 5) e editar mensagem em background quando token for informado", async () => {
      const router = new MessageRouter();
      const mockWebhookService = {
        editOriginalResponse: vi.fn().mockResolvedValue(undefined),
      } as any;

      const app = createHttpServer(router, mockConfig, undefined, mockWebhookService);

      const response = await request(app)
        .post("/api/interactions")
        .send({
          type: 2,
          token: "interaction-token-xyz",
          application_id: "app-id-123",
          data: {
            name: "ping",
          },
        });

      // 1. Resposta imediata dentro de milissegundos
      expect(response.status).toBe(200);
      expect(response.body.type).toBe(5);

      // Aguarda o tick do event loop para o background processar
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 2. Confirma que o serviço chamou o patch do webhook com a resposta final
      expect(mockWebhookService.editOriginalResponse).toHaveBeenCalledTimes(1);
      expect(mockWebhookService.editOriginalResponse).toHaveBeenCalledWith(
        "app-id-123",
        "interaction-token-xyz",
        expect.objectContaining({
          content: expect.stringContaining("Pong"),
        })
      );
    });
  });

  describe("Endpoint /api/cron/:job (Cloud Scheduler)", () => {
    it("deve bloquear requisição sem token CRON_SECRET", async () => {
      const router = new MessageRouter();
      const app = createHttpServer(router, mockConfig);

      const response = await request(app).post("/api/cron/alerta-boletos");
      expect(response.status).toBe(401);
    });

    it("deve autorizar com Bearer token correto", async () => {
      const router = new MessageRouter();
      const app = createHttpServer(router, mockConfig);

      const response = await request(app)
        .post("/api/cron/alerta-boletos")
        .set("Authorization", "Bearer test-secret");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.job).toBe("alerta-boletos");
    });
  });

  describe("Interactions Type 3 (Discord Components: Botões e Select Menus)", () => {
    it("deve processar clique em shopping_create_all e responder com Type 7 (UPDATE_MESSAGE)", async () => {
      const { ComprasService } = await import("../services/compras/comprasService.js");
      const { InMemoryComprasRepository } = await import("../services/compras/comprasRepository.js");

      const router = new MessageRouter();
      const comprasService = new ComprasService(new InMemoryComprasRepository());
      await comprasService.addToStage(["Leite", "Café"], "Albertto");

      const app = createHttpServer(router, mockConfig, undefined, undefined, comprasService);

      const response = await request(app)
        .post("/api/interactions")
        .send({
          type: 3,
          data: {
            custom_id: "shopping_create_all",
          },
          user: { username: "Albertto" },
        });

      expect(response.status).toBe(200);
      expect(response.body.type).toBe(7); // UPDATE_MESSAGE
      expect(response.body.data.embeds[0].title).toContain("Lista Ativa");

      const activeList = await comprasService.getActiveList();
      expect(activeList).not.toBeNull();
      expect(activeList?.items).toHaveLength(2);
    });

    it("deve processar seleção em shopping_check_item e ticar os itens", async () => {
      const { ComprasService } = await import("../services/compras/comprasService.js");
      const { InMemoryComprasRepository } = await import("../services/compras/comprasRepository.js");

      const router = new MessageRouter();
      const comprasService = new ComprasService(new InMemoryComprasRepository());
      await comprasService.addToStage(["Leite", "Café"], "Albertto");
      const list = await comprasService.createListFromStage("Mercado", "all");

      const app = createHttpServer(router, mockConfig, undefined, undefined, comprasService);

      const response = await request(app)
        .post("/api/interactions")
        .send({
          type: 3,
          data: {
            custom_id: "shopping_check_item",
            values: [list.items[0].id],
          },
          user: { username: "Albertto" },
        });

      expect(response.status).toBe(200);
      expect(response.body.type).toBe(7);

      const activeList = await comprasService.getActiveList();
      expect(activeList?.items[0].checked).toBe(true);
    });

    it("deve processar shopping_finish_stage e devolver não comprados ao Stage", async () => {
      const { ComprasService } = await import("../services/compras/comprasService.js");
      const { InMemoryComprasRepository } = await import("../services/compras/comprasRepository.js");

      const router = new MessageRouter();
      const comprasService = new ComprasService(new InMemoryComprasRepository());
      await comprasService.addToStage(["Leite", "Café"], "Albertto");
      await comprasService.createListFromStage("Mercado", "all");
      // Nenhum foi comprado

      const app = createHttpServer(router, mockConfig, undefined, undefined, comprasService);

      const response = await request(app)
        .post("/api/interactions")
        .send({
          type: 3,
          data: {
            custom_id: "shopping_finish_stage",
          },
          user: { username: "Albertto" },
        });

      expect(response.status).toBe(200);
      expect(response.body.type).toBe(7);
      expect(response.body.data.content).toContain("devolvidos ao Stage");

      expect(await comprasService.getActiveList()).toBeNull();
      const stage = await comprasService.getStage();
      expect(stage).toHaveLength(2);
    });
  });

  describe("Endpoints REST da Lista de Compras (/api/compras/*)", () => {
    it("deve gerenciar ciclo completo da lista de compras via REST", async () => {
      const { ComprasService } = await import("../services/compras/comprasService.js");
      const { InMemoryComprasRepository } = await import("../services/compras/comprasRepository.js");

      const router = new MessageRouter();
      const comprasService = new ComprasService(new InMemoryComprasRepository());
      const app = createHttpServer(router, mockConfig, undefined, undefined, comprasService);

      // 1. GET /api/compras/stage (inicialmente vazio)
      const stageGet1 = await request(app).get("/api/compras/stage");
      expect(stageGet1.status).toBe(200);
      expect(stageGet1.body.count).toBe(0);

      // 2. POST /api/compras/stage (adicionar 4 itens)
      const stagePost = await request(app)
        .post("/api/compras/stage")
        .send({ items: ["Leite", "Café", "Pão", "Manteiga"], author: "Albertto" });
      expect(stagePost.status).toBe(200);
      expect(stagePost.body.count).toBe(4);

      // 3. POST /api/compras/lists (criar lista com 2 itens)
      const listPost = await request(app)
        .post("/api/compras/lists")
        .send({ name: "Padaria e Laticínios", items: ["Leite", "Pão"], author: "Albertto" });
      expect(listPost.status).toBe(201);
      expect(listPost.body.list.name).toBe("Padaria e Laticínios");
      expect(listPost.body.list.items).toHaveLength(2);

      // Verifica que Café e Manteiga permaneceram no Stage
      const stageGet2 = await request(app).get("/api/compras/stage");
      expect(stageGet2.body.count).toBe(2);
      expect(stageGet2.body.stage.map((s: any) => s.name)).toEqual(["Café", "Manteiga"]);

      // 4. GET /api/compras/lists/active
      const listActiveGet = await request(app).get("/api/compras/lists/active");
      expect(listActiveGet.status).toBe(200);
      expect(listActiveGet.body.activeList.name).toBe("Padaria e Laticínios");

      // 5. POST /api/compras/lists/active/check (ticar Leite)
      const checkPost = await request(app)
        .post("/api/compras/lists/active/check")
        .send({ item: "Leite", checked: true, author: "Albertto" });
      expect(checkPost.status).toBe(200);
      const leiteItem = checkPost.body.list.items.find((i: any) => i.name === "Leite");
      expect(leiteItem.checked).toBe(true);

      // 6. POST /api/compras/lists/active/finish com "return_to_stage"
      // Pão não foi comprado -> deve voltar ao stage com Café e Manteiga
      const finishPost = await request(app)
        .post("/api/compras/lists/active/finish")
        .send({ action: "return_to_stage", author: "Albertto" });
      expect(finishPost.status).toBe(200);
      expect(finishPost.body.result.returnedToStageCount).toBe(1);

      // Verifica Stage final
      const stageGet3 = await request(app).get("/api/compras/stage");
      expect(stageGet3.body.count).toBe(3);
      expect(stageGet3.body.stage.map((s: any) => s.name)).toEqual(["Café", "Manteiga", "Pão"]);

      // Verifica que lista ativa agora é null
      const listActiveGet2 = await request(app).get("/api/compras/lists/active");
      expect(listActiveGet2.body.activeList).toBeNull();
    });
  });
});
