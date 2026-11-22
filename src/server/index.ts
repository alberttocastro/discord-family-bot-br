import express, { Express, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import { Client } from "discord.js";
import { Config } from "../config/index.js";
import { MessageRouter } from "../routing/router.js";
import { executeCommandHttp, commands } from "../commands/index.js";
import { verifyDiscordSignature } from "./discordSecurity.js";
import { DiscordWebhookService } from "../services/discordWebhookService.js";
import { ComprasService } from "../services/compras/comprasService.js";

// Extende a tipagem de Request para carregar o buffer bruto do corpo
interface AuthenticatedRequest extends Request {
  rawBody?: Buffer;
}

export function createHttpServer(
  routerOrClient: MessageRouter | Client,
  config: Config,
  optionalRouter?: MessageRouter,
  webhookService: DiscordWebhookService = new DiscordWebhookService(),
  comprasService: ComprasService = new ComprasService()
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

    const { type, data, token, application_id } = req.body;

    // Discord Ping (Tipo 1) -> Responde com Pong
    if (type === 1) {
      res.status(200).json({ type: 1 });
      return;
    }

    // Discord Slash Commands (Tipo 2)
    if (type === 2 && data?.name) {
      const appId = application_id || config.DISCORD_CLIENT_ID;

      // Se 'token' estiver presente (chamada real do Discord), responde imediatamente
      // com Type 5 (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE) para evitar o timeout de 3 segundos
      // do Discord ("Esta interação falhou"), e em seguida processa e atualiza a resposta.
      if (token && appId) {
        const command = commands.find((cmd) => cmd.data.name === data.name);
        const isEphemeral = command?.ephemeral || false;

        // 1. Responde de imediato ao Discord (< 100ms)
        res.status(200).json({
          type: 5,
          ...(isEphemeral ? { data: { flags: 64 } } : {}),
        });

        // 2. Processa a execução do comando em background e edita a mensagem original
        (async () => {
          try {
            const commandResponse = await executeCommandHttp(
              data.name,
              router,
              data.options,
              undefined,
              comprasService
            );
            if (!commandResponse) {
              await webhookService.editOriginalResponse(appId, token, {
                content: `❌ Comando \`/${data.name}\` não encontrado.`,
              });
              return;
            }

            await webhookService.editOriginalResponse(appId, token, commandResponse);
          } catch (err) {
            console.error(`[Interactions:Deferred] Erro ao processar comando /${data.name}:`, err);
            try {
              await webhookService.editOriginalResponse(appId, token, {
                content: "❌ Ocorreu um erro interno ao processar o comando.",
              });
            } catch (patchErr) {
              console.error("[Interactions:Deferred] Falha ao enviar erro para o Discord:", patchErr);
            }
          }
        })();

        return;
      }

      // Fallback síncrono para testes ou requisições locais sem token do Discord
      try {
        const commandResponse = await executeCommandHttp(
          data.name,
          router,
          data.options,
          undefined,
          comprasService
        );
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

    // Discord Component Interactions (Tipo 3 - Buttons e Select Menus)
    if (type === 3 && data?.custom_id) {
      const customId: string = data.custom_id;
      const author = req.body.member?.user?.username || req.body.user?.username || "Usuário";
      const values: string[] = Array.isArray(data.values) ? data.values : [];

      try {
        if (customId === "shopping_check_item") {
          await comprasService.checkMultipleItems(values, author, true);
          const activeList = await comprasService.getActiveList();
          if (activeList) {
            const { embed, components } = comprasService.buildActiveListEmbed(activeList);
            res.status(200).json({
              type: 7, // UPDATE_MESSAGE
              data: { embeds: [embed], components },
            });
            return;
          }
        }

        if (customId === "shopping_create_all") {
          const newList = await comprasService.createListFromStage(undefined, "all", author);
          const { embed, components } = comprasService.buildActiveListEmbed(newList);
          res.status(200).json({
            type: 7,
            data: {
              content: `🎉 Lista de compras **"${newList.name}"** criada!`,
              embeds: [embed],
              components,
            },
          });
          return;
        }

        if (customId === "shopping_stage_clear") {
          await comprasService.clearStage();
          const { embed, components } = comprasService.buildStageEmbed([]);
          res.status(200).json({
            type: 7,
            data: { embeds: [embed], components },
          });
          return;
        }

        if (customId === "shopping_finish_menu") {
          const activeList = await comprasService.getActiveList();
          if (activeList) {
            const { embed, components } = comprasService.buildFinishOptionsEmbed(activeList);
            res.status(200).json({
              type: 7,
              data: { embeds: [embed], components },
            });
            return;
          }
        }

        if (customId === "shopping_finish_keep") {
          await comprasService.finishActiveList("keep", author);
          res.status(200).json({
            type: 7,
            data: {
              content: "📦 Lista de compras arquivada mantendo o histórico de itens!",
              embeds: [],
              components: [],
            },
          });
          return;
        }

        if (customId === "shopping_finish_new") {
          const { newList } = await comprasService.finishActiveList("new_list_missing", author);
          if (newList) {
            const { embed, components } = comprasService.buildActiveListEmbed(newList);
            res.status(200).json({
              type: 7,
              data: {
                content: `🔄 Nova lista ativa **"${newList.name}"** criada com os itens faltantes!`,
                embeds: [embed],
                components,
              },
            });
            return;
          }
          res.status(200).json({
            type: 7,
            data: {
              content: "🎉 Todos os itens foram comprados! Nenhuma pendência.",
              embeds: [],
              components: [],
            },
          });
          return;
        }

        if (customId === "shopping_finish_stage") {
          const { returnedToStageCount } = await comprasService.finishActiveList(
            "return_to_stage",
            author
          );
          res.status(200).json({
            type: 7,
            data: {
              content: `📥 **${returnedToStageCount}** item(ns) pendente(s) foram devolvidos ao Stage!`,
              embeds: [],
              components: [],
            },
          });
          return;
        }

        if (customId === "shopping_refresh_list") {
          const activeList = await comprasService.getActiveList();
          if (activeList) {
            const { embed, components } = comprasService.buildActiveListEmbed(activeList);
            res.status(200).json({
              type: 7,
              data: { embeds: [embed], components },
            });
            return;
          }
          res.status(200).json({
            type: 7,
            data: {
              content: "ℹ️ Nenhuma lista de compras ativa no momento.",
              embeds: [],
              components: [],
            },
          });
          return;
        }

        // Se customId desconhecido
        res.status(200).json({
          type: 4,
          data: { content: `Componente desconhecido: ${customId}`, flags: 64 },
        });
        return;
      } catch (err: any) {
        console.error(`[Interactions:Component] Erro ao processar customId ${customId}:`, err);
        res.status(200).json({
          type: 4,
          data: {
            content: `❌ Erro ao processar ação: ${err?.message || "Erro inesperado."}`,
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

    const response = await executeCommandHttp(name, router, options, undefined, comprasService);
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

  // =========================================================================
  // 5. Endpoints REST da Lista de Compras (Stage, Lista Ativa, Check, Finish)
  // =========================================================================
  app.get("/api/compras/stage", async (_req: Request, res: Response) => {
    const stage = await comprasService.getStage();
    res.status(200).json({ success: true, count: stage.length, stage });
  });

  app.post("/api/compras/stage", async (req: Request, res: Response) => {
    const { items, author } = req.body || {};
    if (!items) {
      res.status(400).json({ success: false, error: "O campo 'items' é obrigatório." });
      return;
    }
    const added = await comprasService.addToStage(items, author || "API");
    res.status(200).json({ success: true, count: added.length, added });
  });

  app.delete("/api/compras/stage", async (req: Request, res: Response) => {
    const { items } = req.body || {};
    if (Array.isArray(items) && items.length > 0) {
      const removed = await comprasService.removeFromStage(items);
      res.status(200).json({ success: true, removedCount: removed.length, removed });
      return;
    }
    const count = await comprasService.clearStage();
    res.status(200).json({ success: true, clearedCount: count });
  });

  app.get("/api/compras/lists/active", async (_req: Request, res: Response) => {
    const activeList = await comprasService.getActiveList();
    res.status(200).json({ success: true, activeList });
  });

  app.post("/api/compras/lists", async (req: Request, res: Response) => {
    const { name, items, author } = req.body || {};
    try {
      const list = await comprasService.createListFromStage(name, items || "all", author || "API");
      res.status(201).json({ success: true, list });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || "Erro ao criar lista." });
    }
  });

  app.post("/api/compras/lists/active/check", async (req: Request, res: Response) => {
    const { item, items, itemName, itemIds, checked = true, author } = req.body || {};
    const targets: string[] = [];
    if (item) targets.push(item);
    if (itemName) targets.push(itemName);
    if (Array.isArray(items)) targets.push(...items);
    if (Array.isArray(itemIds)) targets.push(...itemIds);

    if (targets.length === 0) {
      res.status(400).json({ success: false, error: "Informe pelo menos um item para atualizar." });
      return;
    }

    try {
      const list = await comprasService.checkMultipleItems(targets, author || "API", Boolean(checked));
      res.status(200).json({ success: true, list });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || "Erro ao atualizar itens." });
    }
  });

  app.post("/api/compras/lists/active/finish", async (req: Request, res: Response) => {
    const { action, author } = req.body || {};
    if (!action || !["keep", "new_list_missing", "return_to_stage"].includes(action)) {
      res.status(400).json({
        success: false,
        error: "O campo 'action' deve ser 'keep', 'new_list_missing' ou 'return_to_stage'.",
      });
      return;
    }

    try {
      const result = await comprasService.finishActiveList(action, author || "API");
      res.status(200).json({ success: true, result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || "Erro ao finalizar lista." });
    }
  });

  return app;
}
