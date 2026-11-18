import {
  ChatInputCommandInteraction,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { Config } from "../config/index.js";
import { MessageRouter } from "../routing/router.js";
import { SefazParser } from "../services/sefazParser.js";

export interface CommandContext {
  router: MessageRouter;
  parser?: SefazParser;
}

export interface Command {
  data: SlashCommandBuilder | any;
  execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void>;
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

export const testarNotaCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("testar-nota")
    .setDescription("Faz o parsing de uma Nota Fiscal (NFC-e) e exibe os dados sem salvar")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("URL da NFC-e ou do QR Code da SEFAZ")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("formato")
        .setDescription("Formato de exibição: resumo ou json")
        .setRequired(false)
        .addChoices(
          { name: "Resumo Detalhado (Embed)", value: "resumo" },
          { name: "JSON Bruto (Debug)", value: "json" }
        )
    ),
  async execute(interaction, context) {
    if (interaction.deferReply) {
      await interaction.deferReply();
    }

    const respond = async (payload: any) => {
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply(payload);
      }
      return interaction.reply(payload);
    };

    const url = interaction.options.getString("url", true)?.trim();
    const formato = interaction.options.getString("formato") || "resumo";

    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      await respond({
        content: "⚠️ Por favor, forneça uma URL válida de NFC-e começando com `http://` ou `https://`.",
      });
      return;
    }

    try {
      const parser = context.parser || new SefazParser();
      const invoice = await parser.parseUrl(url);

      if (formato === "json") {
        const jsonStr = JSON.stringify(invoice, null, 2);
        if (jsonStr.length <= 1900) {
          await respond({ content: `\`\`\`json\n${jsonStr}\n\`\`\`` });
        } else {
          await respond({
            content: `📄 **JSON da Nota Fiscal** (${invoice.items.length} itens extraídos):\n\`\`\`json\n${jsonStr.slice(0, 1850)}\n... (truncado por limite do Discord)\n\`\`\``,
          });
        }
        return;
      }

      // Formato Resumo (Embed)
      const previewItems = invoice.items.slice(0, 10);
      const itemsText = previewItems
        .map(
          (item) =>
            `• **${item.name}**\n  └ ${item.quantity} ${item.unit} × R$ ${item.unitPrice.toFixed(2)} = **R$ ${item.totalPrice.toFixed(2)}**`
        )
        .join("\n");

      const remainingCount = invoice.items.length - previewItems.length;
      const remainingText = remainingCount > 0 ? `\n*...e mais ${remainingCount} produto(s) na nota.*` : "";

      const embed: any = {
        title: "🔍 Análise da Nota Fiscal (Modo Teste / Dry-Run)",
        description: "Esta nota **não** foi enviada ao Google Drive ou Google Sheets.",
        color: 0x3498db,
        fields: [
          {
            name: "🏪 Estabelecimento",
            value: invoice.establishmentName || "Não identificado",
            inline: true,
          },
          {
            name: "💰 Total da Nota",
            value: `**R$ ${invoice.totalAmount.toFixed(2)}**`,
            inline: true,
          },
          {
            name: "🔢 Total de Itens",
            value:
              invoice.totalUnitsCount && invoice.totalUnitsCount !== invoice.itemsCount
                ? `${invoice.itemsCount} produtos (${invoice.totalUnitsCount} unid.)`
                : `${invoice.itemsCount} produto(s)`,
            inline: true,
          },
        ],
      };

      if (invoice.cnpj) {
        embed.fields.push({ name: "📄 CNPJ", value: invoice.cnpj, inline: true });
      }

      if (invoice.issuedAt) {
        embed.fields.push({
          name: "📅 Emissão",
          value: invoice.issuedAt.toLocaleString("pt-BR"),
          inline: true,
        });
      }

      if (invoice.accessKey) {
        embed.fields.push({
          name: "🔑 Chave de Acesso",
          value: `\`${invoice.accessKey}\``,
          inline: false,
        });
      }

      embed.fields.push({
        name: `🛒 Produtos Identificados (${invoice.items.length})`,
        value: itemsText + remainingText || "Nenhum produto individual identificado na tabela.",
      });

      embed.timestamp = new Date().toISOString();
      embed.footer = { text: "Parser de Nota Fiscal • Modo Teste" };

      await respond({ embeds: [embed] });
    } catch (error: any) {
      console.error("[SlashCommand:testar-nota] Erro ao parsear nota:", error);
      await respond({
        content: `❌ Falha ao processar a Nota Fiscal: ${error?.message || "Verifique se a URL da SEFAZ está acessível."}`,
      });
    }
  },
};

export const commands: Command[] = [pingCommand, statusCommand, testarNotaCommand];

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
  _options: Record<string, any> | any[] = {},
  parser?: SefazParser
): Promise<CommandHttpResponse | null> {
  const command = commands.find((cmd) => cmd.data.name === commandName);
  if (!command) {
    return null;
  }

  let finalResponse: CommandHttpResponse = {};

  const optionsMap = new Map<string, any>();
  if (Array.isArray(_options)) {
    for (const opt of _options) {
      if (opt && opt.name) {
        optionsMap.set(opt.name, opt.value);
      }
    }
  } else if (_options && typeof _options === "object") {
    for (const [key, val] of Object.entries(_options)) {
      optionsMap.set(key, val);
    }
  }

  const simulatedInteraction = {
    commandName,
    createdTimestamp: Date.now(),
    client: {
      ws: { ping: 0 },
    },
    options: {
      getString: (name: string, _required = false) => {
        const val = optionsMap.get(name);
        return val !== undefined && val !== null ? String(val) : null;
      },
      getInteger: (name: string) => {
        const val = optionsMap.get(name);
        return typeof val === "number" ? val : val ? parseInt(val, 10) : null;
      },
      getBoolean: (name: string) => {
        const val = optionsMap.get(name);
        return typeof val === "boolean" ? val : val === "true";
      },
      getNumber: (name: string) => {
        const val = optionsMap.get(name);
        return typeof val === "number" ? val : val ? parseFloat(val) : null;
      },
      get: (name: string) => (optionsMap.has(name) ? { value: optionsMap.get(name) } : null),
    },
    deferReply: async () => ({}),
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
    followUp: async (payload: any) => {
      finalResponse = typeof payload === "string" ? { content: payload } : { ...payload };
      return finalResponse;
    },
  } as unknown as ChatInputCommandInteraction;

  await command.execute(simulatedInteraction, { router, parser });
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
