import {
  ChatInputCommandInteraction,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { Config } from "../config/index.js";
import { MessageRouter } from "../routing/router.js";

export interface Command {
  data: SlashCommandBuilder;
  execute(interaction: ChatInputCommandInteraction, context: { router: MessageRouter }): Promise<void>;
}

export const pingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Verifica a latência do bot e status de conexão"),
  async execute(interaction) {
    const sent = await interaction.reply({ content: "Calculando ping...", fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const wsPing = interaction.client.ws.ping;
    await interaction.editReply(
      `🏓 **Pong!**\n- Latência da mensagem: \`${latency}ms\`\n- Latência do WebSocket: \`${wsPing}ms\``
    );
  },
};

export const statusCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Exibe o status de execução do bot e handlers carregados"),
  async execute(interaction, { router }) {
    const handlers = router.getHandlers();
    const handlerList = handlers.map((h) => `• **${h.name}**: ${h.description}`).join("\n");
    const uptimeMinutes = Math.floor(process.uptime() / 60);

    await interaction.reply({
      embeds: [
        {
          title: "🤖 Status do Bot da Família",
          color: 0x3498db,
          fields: [
            { name: "Ambiente", value: process.env.NODE_ENV || "development", inline: true },
            { name: "Tempo Online", value: `${uptimeMinutes} minutos`, inline: true },
            { name: "Plataforma", value: "Google Cloud Run / Node.js", inline: true },
            { name: "Handlers Ativos", value: handlerList || "Nenhum handler registrado." },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    });
  },
};

export const commands: Command[] = [pingCommand, statusCommand];

export async function registerSlashCommands(config: Config): Promise<void> {
  if (!config.DISCORD_CLIENT_ID || !config.DISCORD_TOKEN) {
    console.warn("⚠️ DISCORD_CLIENT_ID ou DISCORD_TOKEN não definidos; pulando registro de Slash Commands.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
  const commandData = commands.map((cmd) => cmd.data.toJSON());

  try {
    console.log(`[SlashCommands] Registrando ${commandData.length} comandos...`);
    if (config.DISCORD_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
        { body: commandData }
      );
      console.log(`[SlashCommands] Comandos registrados no Guild ${config.DISCORD_GUILD_ID}.`);
    } else {
      await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), {
        body: commandData,
      });
      console.log("[SlashCommands] Comandos globais registrados.");
    }
  } catch (error) {
    console.error("[SlashCommands] Erro ao registrar comandos:", error);
  }
}
