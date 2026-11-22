#!/usr/bin/env node
import { config, loadConfig } from "../config/index.js";
import { commands, registerSlashCommands, RegisterCommandsOptions } from "../commands/index.js";

function printHelp(): void {
  console.log(`
Uso: npm run deploy:commands [opções]

Opções:
  --guild <id>    Registra os comandos em um servidor (Guild) específico
  --global        Força o registro de comandos globalmente (visível em todos os servidores)
  --clear         Remove todos os comandos registrados no destino selecionado
  -h, --help      Exibe esta mensagem de ajuda

Exemplos:
  npm run deploy:commands                  # Usa DISCORD_GUILD_ID do .env se existir, senão global
  npm run deploy:commands -- --guild 1234  # Registra na guilda 1234
  npm run deploy:commands -- --global      # Registra globalmente
  npm run deploy:commands -- --clear       # Limpa comandos
`);
}

export async function runDeploy(args: string[] = process.argv.slice(2)): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return 0;
  }

  console.log("======================================================");
  console.log("⚡ Discord Family Bot - Atualizador de Slash Commands");
  console.log("======================================================");

  // Recarrega configuração para garantir dados mais recentes do ambiente
  const activeConfig = loadConfig();

  if (!activeConfig.DISCORD_TOKEN) {
    console.error("❌ Erro: DISCORD_TOKEN não foi configurado no arquivo .env.");
    console.error("👉 Defina DISCORD_TOKEN para poder registrar comandos no Discord.");
    return 1;
  }

  if (!activeConfig.DISCORD_CLIENT_ID) {
    console.error("❌ Erro: DISCORD_CLIENT_ID não foi configurado no arquivo .env.");
    console.error("👉 Defina DISCORD_CLIENT_ID (Application ID do bot no Discord Portal).");
    return 1;
  }

  const isGlobal = args.includes("--global");
  const isClear = args.includes("--clear");
  const guildArgIndex = args.indexOf("--guild");
  const specificGuildId =
    guildArgIndex !== -1 && args[guildArgIndex + 1] ? args[guildArgIndex + 1] : undefined;

  const options: RegisterCommandsOptions = {
    global: isGlobal,
    clear: isClear,
    guildId: specificGuildId,
  };

  const targetGuild = isGlobal ? undefined : specificGuildId || activeConfig.DISCORD_GUILD_ID;

  console.log(`\n📋 Comandos disponíveis no projeto (${commands.length}):`);
  for (const cmd of commands) {
    console.log(`   • /${cmd.data.name.padEnd(12)} - ${cmd.data.description}`);
  }

  console.log("\n🎯 Destino da publicação:");
  if (targetGuild) {
    console.log(`   Modo: Servidor Específico (Guild ID: ${targetGuild})`);
    console.log("   ⚡ Comandos de servidor são atualizados instantaneamente no Discord.");
  } else {
    console.log("   Modo: Global (todos os servidores onde o bot está presente)");
    console.log("   ⏳ Comandos globais podem levar até 1 hora para propagar no cache do Discord.");
  }

  if (isClear) {
    console.log("   ⚠️ ATENÇÃO: Flag --clear ativada. Todos os comandos do destino serão removidos!");
  }

  console.log("\n🚀 Enviando comandos para a API do Discord REST...");
  const result = await registerSlashCommands(activeConfig, options);

  if (!result || !result.success) {
    console.error("\n❌ Falha ao atualizar slash commands na API do Discord.");
    return 1;
  }

  console.log("\n======================================================");
  if (isClear) {
    console.log("✅ Comandos removidos com sucesso!");
  } else {
    console.log(`✅ Sucesso! ${result.count} slash command(s) publicado(s) com sucesso.`);
  }
  console.log("======================================================");

  return 0;
}

// Executa automaticamente se chamado como script principal
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith("deployCommands.ts") || process.argv[1].endsWith("deployCommands.js"));

if (isDirectExecution) {
  runDeploy()
    .then((code) => {
      if (code !== 0) process.exit(code);
    })
    .catch((err) => {
      console.error("💥 Erro inesperado ao executar deployCommands:", err);
      process.exit(1);
    });
}

