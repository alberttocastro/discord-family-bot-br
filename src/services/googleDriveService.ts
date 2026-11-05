import { google, sheets_v4, drive_v3 } from "googleapis";
import { InvoiceData } from "./sefazParser.js";
import { Config, config as globalConfig } from "../config/index.js";
import { Readable } from "node:stream";

export interface GoogleSyncResult {
  sheetAppended: boolean;
  fileCreated: boolean;
  fileId?: string;
  fileUrl?: string;
  rowsAdded: number;
  isSimulated: boolean;
  message?: string;
}

export class GoogleDriveService {
  private config: Config;
  private sheetsClient?: sheets_v4.Sheets;
  private driveClient?: drive_v3.Drive;

  constructor(customConfig?: Config) {
    this.config = customConfig || globalConfig;
    this.initializeClients();
  }

  private initializeClients(): void {
    const email = this.config.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawKey = this.config.GOOGLE_PRIVATE_KEY;

    if (!email || !rawKey) {
      // Clientes não inicializados; operará em modo de simulação/offline
      return;
    }

    try {
      // Normaliza quebras de linha em chaves privadas salvas em variáveis de ambiente
      const privateKey = rawKey.replace(/\\n/g, "\n");

      const auth = new google.auth.JWT({
        email,
        key: privateKey,
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive",
        ],
      });

      this.sheetsClient = google.sheets({ version: "v4", auth });
      this.driveClient = google.drive({ version: "v3", auth });
    } catch (error) {
      console.error("[GoogleDriveService] Falha ao autenticar Google Service Account:", error);
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.sheetsClient || this.driveClient);
  }

  /**
   * Sincroniza a nota fiscal: adiciona os itens na Planilha e/ou salva resumo no Drive.
   */
  public async syncInvoice(invoice: InvoiceData): Promise<GoogleSyncResult> {
    const spreadsheetId = this.config.GOOGLE_SHEETS_SPREADSHEET_ID;
    const folderId = this.config.GOOGLE_DRIVE_FOLDER_ID;

    // Se as credenciais do Google não estiverem configuradas, opera em modo simulado
    if (!this.isConfigured()) {
      console.warn(
        "[GoogleDriveService] Credenciais do Google não configuradas. Simulação de persistência realizada."
      );
      return {
        sheetAppended: Boolean(spreadsheetId),
        fileCreated: Boolean(folderId),
        rowsAdded: invoice.items.length,
        isSimulated: true,
        message: "Google Drive/Sheets não configurado em .env (modo offline)",
      };
    }

    let sheetAppended = false;
    let fileCreated = false;
    let fileId: string | undefined;
    let fileUrl: string | undefined;

    // 1. Adiciona itens na Planilha do Google Sheets
    if (this.sheetsClient && spreadsheetId) {
      try {
        await this.appendItemsToSheet(spreadsheetId, invoice);
        sheetAppended = true;
      } catch (err) {
        console.error("[GoogleDriveService] Erro ao inserir linhas no Google Sheets:", err);
      }
    }

    // 2. Salva arquivo de comprovante no Google Drive
    if (this.driveClient && folderId) {
      try {
        const driveFile = await this.uploadInvoiceToDrive(folderId, invoice);
        fileCreated = true;
        fileId = driveFile.id || undefined;
        fileUrl = driveFile.webViewLink || undefined;
      } catch (err) {
        console.error("[GoogleDriveService] Erro ao salvar arquivo no Google Drive:", err);
      }
    }

    return {
      sheetAppended,
      fileCreated,
      fileId,
      fileUrl,
      rowsAdded: invoice.items.length,
      isSimulated: false,
    };
  }

  /**
   * Insere cabeçalho e cada item da nota como uma linha na planilha do Google Sheets.
   */
  private async appendItemsToSheet(
    spreadsheetId: string,
    invoice: InvoiceData
  ): Promise<void> {
    if (!this.sheetsClient) return;

    const sheetName = "Notas Fiscais";
    const dateFormatted = invoice.issuedAt
      ? invoice.issuedAt.toLocaleDateString("pt-BR")
      : new Date().toLocaleDateString("pt-BR");

    const header = [
      "Data",
      "Estabelecimento",
      "CNPJ",
      "Código",
      "Item",
      "Quantidade",
      "Unidade",
      "Valor Unitário (R$)",
      "Valor Total Item (R$)",
      "Valor Total Nota (R$)",
      "Chave de Acesso",
      "Link",
    ];

    // Verifica se a planilha já possui cabeçalho
    try {
      const getRes = await this.sheetsClient.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:L1`,
      });
      if (!getRes.data.values || getRes.data.values.length === 0) {
        await this.sheetsClient.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [header] },
        });
      }
    } catch {
      // Se a aba específica não existir ou der erro no get, tenta inserir na aba padrão
    }

    // Monta as linhas de cada item
    const rows = invoice.items.map((item) => [
      dateFormatted,
      invoice.establishmentName,
      invoice.cnpj || "",
      item.code || "",
      item.name,
      item.quantity,
      item.unit,
      item.unitPrice,
      item.totalPrice,
      invoice.totalAmount,
      invoice.accessKey || "",
      invoice.sourceUrl || "",
    ]);

    await this.sheetsClient.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:L`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });
  }

  /**
   * Faz upload de um documento markdown consolidado da nota para a pasta no Google Drive.
   */
  private async uploadInvoiceToDrive(
    folderId: string,
    invoice: InvoiceData
  ): Promise<drive_v3.Schema$File> {
    if (!this.driveClient) throw new Error("Drive client não inicializado");

    const dateStr = invoice.issuedAt
      ? invoice.issuedAt.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const safeName = invoice.establishmentName
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 30);
    const fileName = `Nota_${dateStr}_${safeName}_R$${invoice.totalAmount.toFixed(2)}.md`;

    // Constrói conteúdo legível em Markdown
    let md = `# Comprovante de Compra - ${invoice.establishmentName}\n\n`;
    md += `- **Data**: ${invoice.issuedAt ? invoice.issuedAt.toLocaleString("pt-BR") : "Não informada"}\n`;
    md += `- **CNPJ**: ${invoice.cnpj || "Não identificado"}\n`;
    md += `- **Valor Total**: R$ ${invoice.totalAmount.toFixed(2)}\n`;
    if (invoice.accessKey) {
      md += `- **Chave de Acesso**: \`${invoice.accessKey}\`\n`;
    }
    if (invoice.sourceUrl) {
      md += `- **URL Original**: [Link da Nota](${invoice.sourceUrl})\n`;
    }
    md += `\n## Itens Comprados (${invoice.items.length})\n\n`;
    md += `| Item | Qtd | Un | Unitário | Total |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    for (const item of invoice.items) {
      md += `| ${item.name} | ${item.quantity} | ${item.unit} | R$ ${item.unitPrice.toFixed(2)} | R$ ${item.totalPrice.toFixed(2)} |\n`;
    }

    const stream = new Readable();
    stream.push(md);
    stream.push(null);

    const response = await this.driveClient.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType: "text/markdown",
      },
      media: {
        mimeType: "text/markdown",
        body: stream,
      },
      fields: "id, name, webViewLink",
    });

    return response.data;
  }
}
