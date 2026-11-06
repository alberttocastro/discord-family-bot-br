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

export interface CommandHttpResponse {
  content?: string;
  embeds?: any[];
  ephemeral?: boolean;
}

/**
 * Executa um comando de barra diretamente via chamada HTTP/Interactions, sem necessidade de WebSocket.
 */
export async function executeCommandHttp(
  commandName: string,
  router: MessageRouter,
  _options: Record<string, any> = {}
): Promise<CommandHttpResponse | null> {
  const command = commands.find((cmd) => cmd.data.name === commandName);
  if (!command) {
    return null;
  }

  let finalResponse: CommandHttpResponse = {};

  const simulatedInteraction = {
    commandName,
    createdTimestamp: Date.now(),
    client: {
      ws: { ping: 0 },
    },
    reply: async (payload: any) => {
      finalResponse = typeof payload === "string" ? { content: payload } : { ...payload };
      return {
        createdTimestamp: Date.now(),
      };
    },
    editReply: async (payload: any) => {
      finalResponse = typeof payload === "string" ? { content: payload } : { ...payload };
      return finalResponse;
    },
  } as unknown as ChatInputCommandInteraction;

  await command.execute(simulatedInteraction, { router });
  return finalResponse;
}

export interface RegisterCommandsOptions {
  guildId?: string;
  global?: boolean;
  clear?: boolean;
}

export interface RegisterCommandsResult {
  success: boolean;
  count: number;
  mode: "guild" | "global";
  targetId: string;
  error?: unknown;
}

export async function registerSlashCommands(
  config: Config,
  options?: RegisterCommandsOptions
): Promise<RegisterCommandsResult | null> {
  if (!config.DISCORD_CLIENT_ID || !config.DISCORD_TOKEN) {
    console.warn("⚠️ DISCORD_CLIENT_ID ou DISCORD_TOKEN não definidos; pulando registro de Slash Commands.");
    return null;
  }

  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
  const commandData = options?.clear ? [] : commands.map((cmd) => cmd.data.toJSON());

  const targetGuildId = options?.global ? undefined : (options?.guildId ?? config.DISCORD_GUILD_ID);
  const mode = targetGuildId ? "guild" : "global";
  const targetId = targetGuildId || config.DISCORD_CLIENT_ID;

  try {
    console.log(`[SlashCommands] Atualizando ${commandData.length} comando(s) no modo ${mode} (${targetId})...`);
    if (targetGuildId) {
      await rest.put(
        Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, targetGuildId),
        { body: commandData }
      );
      console.log(`[SlashCommands] ${commandData.length} comandos registrados no Guild ${targetGuildId}.`);
    } else {
      await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), {
        body: commandData,
      });
      console.log(`[SlashCommands] ${commandData.length} comandos globais registrados com sucesso.`);
    }

    return {
      success: true,
      count: commandData.length,
      mode,
      targetId,
    };
  } catch (error) {
    console.error("[SlashCommands] Erro ao registrar comandos:", error);
    return {
      success: false,
      count: commandData.length,
      mode,
      targetId,
      error,
    };
  }
}
