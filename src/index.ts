import { config } from "./config/index.js";
import { MessageRouter } from "./routing/router.js";
import { createHttpServer } from "./server/index.js";
import { GeneralHelperHandler } from "./handlers/domain/generalHelperHandler.js";
import { FinanceiroHandler } from "./handlers/domain/financeiroHandler.js";
import { NotasFiscaisHandler } from "./handlers/domain/notasFiscaisHandler.js";

async function main() {
  console.log("--------------------------------------------------");
  console.log("🚀 Iniciando Discord Family Bot (Modo 100% HTTP)...");
  console.log(`📦 Ambiente: ${config.NODE_ENV}`);
  console.log(`🌐 Porta HTTP: ${config.PORT}`);
  console.log(`⚡ Modo Socket: DESATIVADO (Operando exclusivamente via HTTP)`);
  console.log(`☁️ Google Drive/Sheets: ${config.GOOGLE_SERVICE_ACCOUNT_EMAIL ? "Configurado" : "Não configurado (modo offline/simulado)"}`);
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

  // 2. Inicializar Servidor HTTP (Sem conexão WebSocket / Zero socket)
  const app = createHttpServer(router, config);
  const server = app.listen(config.PORT, () => {
    console.log(`📡 Servidor HTTP escutando na porta ${config.PORT}`);
    console.log("🔗 Endpoints HTTP prontos para receber comandos e testes:");
    console.log("   • POST /api/interactions        (Webhook oficial do Discord para Slash Commands)");
    console.log("   • POST /api/commands/:name      (Execução direta de slash commands via HTTP)");
    console.log("   • POST /api/channels/messages   (Envio de comandos/mensagens simulando canais)");
    console.log("   • POST /api/cron/:job           (Triggers agendados do Cloud Scheduler)");
    console.log("   • GET  /healthz & /ready        (Probes do Google Cloud Run)");
  });

  // 3. Encerramento Gracioso (Graceful Shutdown para Cloud Run)
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Recebido sinal ${signal}. Encerrando graciosamente...`);

    server.close(() => {
      console.log("🔒 Servidor HTTP encerrado com sucesso.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("💥 Erro fatal no bootstrap da aplicação:", err);
  process.exit(1);
});
