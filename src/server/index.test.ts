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
});
