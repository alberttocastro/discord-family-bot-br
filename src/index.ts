import { config } from "./config/index.js";
import { createDiscordClient } from "./bot/client.js";
import { setupBotEvents } from "./bot/events.js";
import { MessageRouter } from "./routing/router.js";
import { createHttpServer } from "./server/index.js";
import { GeneralHelperHandler } from "./handlers/domain/generalHelperHandler.js";
import { FinanceiroHandler } from "./handlers/domain/financeiroHandler.js";
import { NotasFiscaisHandler } from "./handlers/domain/notasFiscaisHandler.js";

async function main() {
  console.log("--------------------------------------------------");
  console.log("🚀 Iniciando Discord Family Bot...");
  console.log(`📦 Ambiente: ${config.NODE_ENV}`);
  console.log(`🌐 Porta HTTP: ${config.PORT}`);
  console.log("--------------------------------------------------");

  // 1. Inicializar o Router de Mensagens e Canais
  const router = new MessageRouter();
  router
    .register(new GeneralHelperHandler())
    .register(new FinanceiroHandler())
    .register(new NotasFiscaisHandler());

  console.log(
    `[Router] ${router.getHandlers().length} handler(s) de canais registrado(s): ` +
      router.getHandlers().map((h) => h.name).join(", ")
  );

  // 2. Inicializar o Cliente Discord
  const client = createDiscordClient();
  setupBotEvents(client, router, config);

  // 3. Inicializar Servidor HTTP (Obrigatório para o Google Cloud Run)
  const app = createHttpServer(client, config);
  const server = app.listen(config.PORT, () => {
    console.log(`📡 Servidor HTTP escutando na porta ${config.PORT} (Health checks ativos em /healthz e /ready)`);
  });

  // 4. Conectar ao Gateway do Discord
  try {
    console.log("🔑 Efetuando login no Discord Gateway...");
    await client.login(config.DISCORD_TOKEN);
  } catch (error) {
    console.error("❌ Falha crítica ao conectar no Discord Gateway:", error);
    // Em produção no Cloud Run, se o token estiver errado, o container deve falhar rapidamente
    if (config.NODE_ENV !== "test") {
      process.exit(1);
    }
  }

  // 5. Encerramento Gracioso (Graceful Shutdown para Cloud Run)
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Recebido sinal ${signal}. Encerrando graciosamente...`);

    server.close(() => {
      console.log("🔒 Servidor HTTP encerrado.");
    });

    try {
      client.destroy();
      console.log("🔌 Cliente Discord desconectado.");
    } catch (err) {
      console.error("Erro ao destruir cliente Discord:", err);
    }

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("💥 Erro fatal no bootstrap da aplicação:", err);
  process.exit(1);
});
