import { ChannelHandler, MessageContext } from "../../routing/types.js";
import { config } from "../../config/index.js";
import { SefazParser } from "../../services/sefazParser.js";
import { GoogleDriveService } from "../../services/googleDriveService.js";
import { EmbedBuilder } from "discord.js";

export class NotasFiscaisHandler implements ChannelHandler {
  public readonly name = "NotasFiscaisHandler";
  public readonly description = "Detecta links de NFC-e/SEFAZ, extrai itens e persiste no Google Drive / Sheets";

  private sefazRegex = /(https?:\/\/[^\s]+(?:sefaz|nfe|nfce|danfe|fazenda)[^\s]*)/i;
  private sefazParser: SefazParser;
  private driveService: GoogleDriveService;

  constructor(sefazParser?: SefazParser, driveService?: GoogleDriveService) {
    this.sefazParser = sefazParser || new SefazParser();
    this.driveService = driveService || new GoogleDriveService();
  }

  public canHandle(context: MessageContext): boolean {
    if (config.CHANNEL_NOTAS_FISCAIS_ID && context.channelId === config.CHANNEL_NOTAS_FISCAIS_ID) {
      return true;
    }
    if (context.channelName.toLowerCase().includes("nota") || context.channelName.toLowerCase().includes("fiscal")) {
      return true;
    }
    return this.sefazRegex.test(context.content);
  }

  public async handle(context: MessageContext): Promise<void> {
    const urlMatch = context.content.match(this.sefazRegex);
    if (!urlMatch) {
      // Mensagem no canal de notas fiscais, mas sem link reconhecível
      await context.message.reply({
        content: "⚠️ Não encontrei um link de Nota Fiscal (NFC-e / SEFAZ) válido nesta mensagem. Por favor, envie a URL ou o link do QR Code da nota.",
      });
      return;
    }

    const nfeUrl = urlMatch[1];
    console.log(`[NotasFiscaisHandler] Processando nota fiscal enviada por ${context.authorUsername}: ${nfeUrl}`);

    // Reage na mensagem para indicar início do processamento
    try {
      await context.message.react("⏳");
    } catch {
      // Ignora falha de permissão de reação
    }

    try {
      // 1. Parsing dos dados da SEFAZ
      const invoice = await this.sefazParser.parseUrl(nfeUrl);

      // 2. Persistência no Google Sheets / Drive
      const syncResult = await this.driveService.syncInvoice(invoice);

      // 3. Monta resumo dos itens (máximo 8 itens para não estourar o limite de caracteres do embed)
      const previewItems = invoice.items.slice(0, 8);
      const itemsText = previewItems
        .map(
          (item) =>
            `• **${item.name}**\n  └ ${item.quantity} ${item.unit} × R$ ${item.unitPrice.toFixed(2)} = **R$ ${item.totalPrice.toFixed(2)}**`
        )
        .join("\n");

      const remainingCount = invoice.items.length - previewItems.length;
      const remainingText = remainingCount > 0 ? `\n*...e mais ${remainingCount} item(ns)*` : "";

      // 4. Formata status do Google Drive / Sheets
      let driveStatusText = "";
      if (syncResult.isSimulated) {
        driveStatusText = "ℹ️ *Google Drive/Sheets não configurado em .env (modo offline)*";
      } else {
        const parts: string[] = [];
        if (syncResult.sheetAppended) parts.push("📊 Planilha Google Sheets atualizada");
        if (syncResult.fileCreated) {
          parts.push(
            syncResult.fileUrl
              ? `📁 [Comprovante salvo no Drive](${syncResult.fileUrl})`
              : "📁 Comprovante salvo no Google Drive"
          );
        }
        driveStatusText = parts.length > 0 ? parts.join("\n") : "⚠️ Nenhuma sincronização realizada";
      }

      // 5. Criação do Embed do Discord
      const embed = new EmbedBuilder()
        .setTitle("🧾 Nota Fiscal Processada com Sucesso!")
        .setColor(0x2ecc71)
        .addFields(
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
          }
        );

      if (invoice.cnpj) {
        embed.addFields({ name: "📄 CNPJ", value: invoice.cnpj, inline: true });
      }

      if (invoice.issuedAt) {
        embed.addFields({
          name: "📅 Emissão",
          value: invoice.issuedAt.toLocaleDateString("pt-BR"),
          inline: true,
        });
      }

      embed.addFields({
        name: "🛒 Itens Comprados",
        value: itemsText + remainingText || "Nenhum item discriminado.",
      });

      embed.addFields({
        name: "☁️ Armazenamento",
        value: driveStatusText,
      });

      embed.setFooter({
        text: `Enviado por ${context.authorUsername}`,
      });
      embed.setTimestamp();

      // Atualiza reação para concluído
      try {
        await context.message.reactions.removeAll();
        await context.message.react("✅");
      } catch {
        // Ignora
      }

      await context.message.reply({ embeds: [embed] });
    } catch (error) {
      console.error("[NotasFiscaisHandler] Erro ao processar nota fiscal:", error);

      try {
        await context.message.reactions.removeAll();
        await context.message.react("❌");
      } catch {
        // Ignora
      }

      await context.message.reply({
        content:
          "❌ Ocorreu um erro ao consultar ou processar a Nota Fiscal. Verifique se o link da SEFAZ está acessível e tente novamente.",
      });
    }
  }
}
