import express, { Express, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import { Client } from "discord.js";
import { Config } from "../config/index.js";
import { MessageRouter } from "../routing/router.js";
import { executeCommandHttp } from "../commands/index.js";
import { verifyDiscordSignature } from "./discordSecurity.js";

// Extende a tipagem de Request para carregar o buffer bruto do corpo
interface AuthenticatedRequest extends Request {
  rawBody?: Buffer;
}

export function createHttpServer(
  routerOrClient: MessageRouter | Client,
  config: Config,
  optionalRouter?: MessageRouter
): Express {
  const app = express();

  // Resolve MessageRouter e Client de forma retrocompatível
  const router =
    routerOrClient instanceof MessageRouter
      ? routerOrClient
      : optionalRouter || new MessageRouter();

  const client = routerOrClient instanceof MessageRouter ? undefined : (routerOrClient as Client);

  app.use(helmet());
  app.use(cors());

  // Captura o rawBody para permitir validação da assinatura Ed25519 do Discord
  app.use(
    express.json({
      verify: (req: AuthenticatedRequest, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
      },
    })
  );

  // Liveness probe (Cloud Run)
  app.get(["/healthz", "/live"], (_req: Request, res: Response) => {
    res.status(200).json({ status: "alive", uptime: process.uptime() });
  });

  // Readiness probe (Cloud Run) - Modo 100% HTTP sempre pronto
  app.get("/ready", (_req: Request, res: Response) => {
    if (client && config.DISCORD_TOKEN) {
      const isBotReady = client.isReady();
      if (isBotReady || config.NODE_ENV === "test") {
        res.status(200).json({
          status: "ready",
          bot: {
            tag: client.user?.tag || "test-user",
            ping: client.ws?.ping ?? 0,
          },
        });
        return;
      }
    }

    res.status(200).json({
      status: "ready",
      mode: "http-serverless",
      uptime: process.uptime(),
      bot: {
        tag: "http-mode",
        ping: 0,
        status: "ready",
        message: "Bot operando em modo 100% HTTP (sem conexão socket persistente)",
      },
    });
  });

  // =========================================================================
  // 1. Endpoint Oficial do Discord para Interactions (Webhooks sem Socket)
  // =========================================================================
  app.post("/api/interactions", async (req: AuthenticatedRequest, res: Response) => {
    const signature = req.headers["x-signature-ed25519"] as string;
    const timestamp = req.headers["x-signature-timestamp"] as string;

    // Se DISCORD_PUBLIC_KEY estiver configurada, valida a assinatura criptográfica
    if (config.DISCORD_PUBLIC_KEY) {
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
      const isValid = verifyDiscordSignature(
        rawBody,
        signature,
        timestamp,
        config.DISCORD_PUBLIC_KEY
      );

      if (!isValid) {
        res.status(401).send("Invalid request signature");
        return;
      }
    }

    const { type, data } = req.body;

    // Discord Ping (Tipo 1) -> Responde com Pong
    if (type === 1) {
      res.status(200).json({ type: 1 });
      return;
    }

    // Discord Slash Commands (Tipo 2)
    if (type === 2 && data?.name) {
      try {
        const commandResponse = await executeCommandHttp(data.name, router, data.options);
        if (!commandResponse) {
          res.status(200).json({
            type: 4,
            data: {
              content: `❌ Comando \`/${data.name}\` não encontrado.`,
              flags: 64, // Ephemeral
            },
          });
          return;
        }

        // Responde no formato ChannelMessageWithSource (Tipo 4)
        res.status(200).json({
          type: 4,
          data: commandResponse,
        });
        return;
      } catch (err) {
        console.error(`[Interactions] Erro ao executar comando /${data.name}:`, err);
        res.status(200).json({
          type: 4,
          data: {
            content: "❌ Ocorreu um erro interno ao processar o comando.",
            flags: 64,
          },
        });
        return;
      }
    }

    res.status(400).json({ error: "Unsupported interaction type" });
  });

  // =========================================================================
  // 2. Endpoint de Teste Direto de Slash Commands via HTTP (ex: POST /api/commands/ping)
  // =========================================================================
  app.post("/api/commands/:name", async (req: Request, res: Response) => {
    const { name } = req.params;
    const options = req.body || {};

    const response = await executeCommandHttp(name, router, options);
    if (!response) {
      res.status(404).json({
        success: false,
        error: `Comando "/${name}" não encontrado.`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      command: name,
      response,
    });
  });

  // =========================================================================
  // 3. Endpoint para Enviar Comandos/Mensagens como se fosse um Canal via HTTP
  // =========================================================================
  const handleChannelMessage = async (req: Request, res: Response) => {
    const channelParam = req.params.channel;
    const { channel, channelId, channelName, content, author, authorId, isThread, parentId } = req.body;

    const targetChannel = channelParam || channel || channelName || "geral";

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "O campo 'content' é obrigatório e deve conter o texto/link da mensagem.",
      });
      return;
    }

    const result = await router.dispatchSimulated({
      channel: targetChannel,
      channelId,
      channelName: targetChannel,
      content,
      author,
      authorId,
      isThread,
      parentId,
    });

    res.status(200).json({
      success: true,
      handled: result.handled,
      handlersMatched: result.handlersMatched,
      channel: result.channelName,
      channelId: result.channelId,
      author: result.authorUsername,
      content: result.content,
      replies: result.replies,
      reactions: result.reactions,
    });
  };

  app.post("/api/channels/:channel/messages", handleChannelMessage);
  app.post("/api/channels/messages", handleChannelMessage);

  // =========================================================================
  // 4. Endpoint para Cron Triggers (Google Cloud Scheduler)
  // =========================================================================
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

    res.status(200).json({
      success: true,
      job,
      triggeredAt: new Date().toISOString(),
    });
  });

  return app;
}
