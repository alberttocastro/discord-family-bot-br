import { describe, it, expect } from "vitest";
import request from "supertest";
import { Client } from "discord.js";
import { createHttpServer } from "./index.js";
import { Config } from "../config/index.js";

describe("HTTP Server (Cloud Run Probes)", () => {
  const mockConfig: Config = {
    NODE_ENV: "test",
    PORT: 8080,
    DISCORD_TOKEN: "mock-token",
    CRON_SECRET: "test-secret",
  };

  it("GET /healthz deve retornar status alive e HTTP 200", async () => {
    const mockClient = {
      isReady: () => true,
      user: { tag: "FamilyBot#0001" },
      ws: { ping: 25 },
    } as unknown as Client;

    const app = createHttpServer(mockClient, mockConfig);
    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "alive");
    expect(response.body).toHaveProperty("uptime");
  });

  it("GET /ready deve responder 200 quando o bot estiver pronto", async () => {
    const mockClient = {
      isReady: () => true,
      user: { tag: "FamilyBot#0001" },
      ws: { ping: 30 },
    } as unknown as Client;

    const app = createHttpServer(mockClient, mockConfig);
    const response = await request(app).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ready");
    expect(response.body.bot.tag).toBe("FamilyBot#0001");
  });

  it("GET /ready deve responder 503 quando o bot não estiver pronto fora de ambiente de teste", async () => {
    const mockClient = {
      isReady: () => false,
      user: null,
      ws: { ping: -1 },
    } as unknown as Client;

    const prodConfig: Config = {
      ...mockConfig,
      NODE_ENV: "production",
    };

    const app = createHttpServer(mockClient, prodConfig);
    const response = await request(app).get("/ready");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("not_ready");
  });

  it("POST /api/cron/:job deve bloquear requisição sem token CRON_SECRET", async () => {
    const mockClient = { isReady: () => true } as unknown as Client;
    const app = createHttpServer(mockClient, mockConfig);

    const response = await request(app).post("/api/cron/alerta-boletos");
    expect(response.status).toBe(401);
  });

  it("POST /api/cron/:job deve autorizar com Bearer token correto", async () => {
    const mockClient = { isReady: () => true } as unknown as Client;
    const app = createHttpServer(mockClient, mockConfig);

    const response = await request(app)
      .post("/api/cron/alerta-boletos")
      .set("Authorization", "Bearer test-secret");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.job).toBe("alerta-boletos");
  });
});
