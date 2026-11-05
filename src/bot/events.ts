import { Client, Events, Interaction, Message, MessageReaction, User } from "discord.js";
import { MessageRouter } from "../routing/router.js";
import { Config } from "../config/index.js";
import { commands, registerSlashCommands } from "../commands/index.js";

export function setupBotEvents(client: Client, router: MessageRouter, config: Config): void {
  // Evento Ready
  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ [DiscordBot] Conectado como ${readyClient.user.tag}`);
    console.log(`🚀 [DiscordBot] Servindo em ${readyClient.guilds.cache.size} servidor(es)`);
    await registerSlashCommands(config);
  });

  // Evento MessageCreate (Mensagens nos canais)
  client.on(Events.MessageCreate, async (message: Message) => {
    await router.dispatch(message);
  });

  // Evento InteractionCreate (Slash commands)
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.find((cmd) => cmd.data.name === interaction.commandName);
    if (!command) {
      console.warn(`[DiscordBot] Comando não encontrado: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction, { router });
    } catch (error) {
      console.error(`[DiscordBot] Erro ao executar comando /${interaction.commandName}:`, error);
      const replyPayload = {
        content: "❌ Ocorreu um erro interno ao processar este comando.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyPayload);
      } else {
        await interaction.reply(replyPayload);
      }
    }
  });

  // Evento MessageReactionAdd (Reações a mensagens)
  client.on(Events.MessageReactionAdd, async (reaction: MessageReaction | any, user: User | any) => {
    if (user.bot) return;

    // Se a mensagem for parcial, busca os dados completos
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error("[DiscordBot] Falha ao carregar reação parcial:", error);
        return;
      }
    }

    console.log(`[Reactions] Usuário ${user.username} reagiu com ${reaction.emoji.name} no canal ${reaction.message.channelId}`);
    // Ponto de extensão para tarefas como "Lista de compras inteligente" (ex: marcar com ✅)
  });

  // Eventos de Diagnóstico
  client.on(Events.Warn, (info) => console.warn(`⚠️ [DiscordBot Warn]: ${info}`));
  client.on(Events.Error, (error) => console.error(`❌ [DiscordBot Error]:`, error));
  client.on(Events.ShardDisconnect, (_, shardId) =>
    console.warn(`🔌 [DiscordBot Shard ${shardId}] Desconectado`)
  );
  client.on(Events.ShardResume, (shardId) =>
    console.log(`🔄 [DiscordBot Shard ${shardId}] Reconectado com sucesso`)
  );
}
