import express, { Express, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import { Client } from "discord.js";
import { Config } from "../config/index.js";

export function createHttpServer(client: Client, config: Config): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Liveness probe (Cloud Run)
  app.get(["/healthz", "/live"], (_req: Request, res: Response) => {
    res.status(200).json({ status: "alive", uptime: process.uptime() });
  });

  // Readiness probe (Cloud Run)
  app.get("/ready", (_req: Request, res: Response) => {
    const isBotReady = client.isReady();
    if (isBotReady || config.NODE_ENV === "test") {
      res.status(200).json({
        status: "ready",
        bot: {
          tag: client.user?.tag || "test-user",
          ping: client.ws?.ping ?? 0,
        },
      });
    } else {
      res.status(503).json({
        status: "not_ready",
        message: "Discord client is connecting...",
      });
    }
  });

  // Endpoint para cron triggers (Google Cloud Scheduler)
  app.post("/api/cron/:job", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (config.CRON_SECRET) {
      const expected = `Bearer ${config.CRON_SECRET}`;
      if (authHeader !== expected) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    const { job } = req.params;
    console.log(`[CloudScheduler] Trigger recebido para o job: ${job}`);

    // Rotas de jobs periódicos mapeados no roadmap (ex: lembretes, resumo semanal)
    res.status(200).json({
      success: true,
      job,
      triggeredAt: new Date().toISOString(),
    });
  });

  return app;
}
