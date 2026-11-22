import { google, sheets_v4 } from "googleapis";
import { Config, config as globalConfig } from "../../config/index.js";
import { IComprasRepository } from "./comprasRepository.js";
import { ShoppingData, ShoppingItem, ShoppingList } from "./types.js";

export class GoogleSheetsComprasRepository implements IComprasRepository {
  private config: Config;
  private sheetsClient?: sheets_v4.Sheets;
  private spreadsheetId?: string;
  private cache: ShoppingData | null = null;
  private cacheExpiresAt = 0;
  private sheetsEnsured = false;

  constructor(customConfig?: Config, customClient?: sheets_v4.Sheets) {
    this.config = customConfig || globalConfig;
    this.spreadsheetId =
      this.config.GOOGLE_COMPRAS_SPREADSHEET_ID || this.config.GOOGLE_SHEETS_SPREADSHEET_ID;

    if (customClient) {
      this.sheetsClient = customClient;
    } else {
      this.initializeClient();
    }
  }

  private initializeClient(): void {
    const email = this.config.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawKey = this.config.GOOGLE_PRIVATE_KEY;

    if (!email || !rawKey || !this.spreadsheetId) {
      return;
    }

    try {
      const privateKey = rawKey.replace(/\\n/g, "\n");
      const auth = new google.auth.JWT({
        email,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      this.sheetsClient = google.sheets({ version: "v4", auth });
    } catch (error) {
      console.error("[GoogleSheetsComprasRepository] Erro ao autenticar no Google Sheets:", error);
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.sheetsClient && this.spreadsheetId);
  }

  private getDefaultData(): ShoppingData {
    return {
      stage: [],
      activeList: null,
      history: [],
    };
  }

  /**
   * Garante que as abas 'Stage', 'Lista Ativa' e 'Histórico' existam na planilha.
   */
  public async ensureSheetsExist(): Promise<void> {
    if (this.sheetsEnsured || !this.sheetsClient || !this.spreadsheetId) {
      return;
    }

    try {
      const meta = await this.sheetsClient.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const existingTitles = (meta.data.sheets || [])
        .map((s) => s.properties?.title)
        .filter((t): t is string => Boolean(t));

      const requiredSheets = ["Stage", "Lista Ativa", "Histórico"];
      const sheetsToAdd = requiredSheets.filter((req) => !existingTitles.includes(req));

      if (sheetsToAdd.length > 0) {
        await this.sheetsClient.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: sheetsToAdd.map((title) => ({
              addSheet: {
                properties: { title },
              },
            })),
          },
        });
      }

      this.sheetsEnsured = true;
    } catch (err) {
      console.error("[GoogleSheetsComprasRepository] Falha ao verificar/criar abas:", err);
    }
  }

  public async getData(forceRefresh = false): Promise<ShoppingData> {
    if (!this.isConfigured()) {
      if (this.cache) return JSON.parse(JSON.stringify(this.cache));
      return this.getDefaultData();
    }

    const now = Date.now();
    if (!forceRefresh && this.cache && now < this.cacheExpiresAt) {
      return JSON.parse(JSON.stringify(this.cache));
    }

    try {
      await this.ensureSheetsExist();

      const response = await this.sheetsClient!.spreadsheets.values.batchGet({
        spreadsheetId: this.spreadsheetId!,
        ranges: ["Stage!A2:D", "'Lista Ativa'!A2:E2", "'Lista Ativa'!A5:E"],
      });

      const valueRanges = response.data.valueRanges || [];
      const stageRows = valueRanges[0]?.values || [];
      const listMetaRow = valueRanges[1]?.values?.[0] || [];
      const listItemsRows = valueRanges[2]?.values || [];

      // 1. Parse do Stage
      const stage: ShoppingItem[] = stageRows
        .filter((r) => r && r[1] && String(r[1]).trim().length > 0)
        .map((row) => ({
          id: String(row[0] || `stg_${Date.now()}`),
          name: String(row[1]).trim(),
          addedBy: String(row[2] || "Família"),
          addedAt: String(row[3] || new Date().toISOString()),
          checked: false,
        }));

      // 2. Parse da Lista Ativa
      let activeList: ShoppingList | null = null;
      if (listMetaRow.length > 0 && listMetaRow[0] && String(listMetaRow[4]).toLowerCase() === "active") {
        const items: ShoppingItem[] = listItemsRows
          .filter((r) => r && r[1] && String(r[1]).trim().length > 0)
          .map((row) => {
            const rawChecked = String(row[2] || "").toUpperCase();
            const checked = rawChecked === "SIM" || rawChecked === "TRUE" || rawChecked === "VERDADEIRO";
            return {
              id: String(row[0] || `item_${Date.now()}`),
              name: String(row[1]).trim(),
              checked,
              checkedBy: row[3] ? String(row[3]) : undefined,
              checkedAt: row[4] ? String(row[4]) : undefined,
              addedBy: listMetaRow[2] || "Família",
              addedAt: listMetaRow[3] || new Date().toISOString(),
            };
          });

        activeList = {
          name: String(listMetaRow[0]),
          id: String(listMetaRow[1] || `lst_${Date.now()}`),
          createdBy: String(listMetaRow[2] || "Família"),
          createdAt: String(listMetaRow[3] || new Date().toISOString()),
          status: "active",
          items,
        };
      }

      this.cache = {
        stage,
        activeList,
        history: this.cache?.history || [],
      };
      this.cacheExpiresAt = now + 15000; // Cache de 15 segundos para performance

      return JSON.parse(JSON.stringify(this.cache));
    } catch (error) {
      console.error("[GoogleSheetsComprasRepository] Erro ao ler dados do Google Sheets:", error);
      if (this.cache) return JSON.parse(JSON.stringify(this.cache));
      return this.getDefaultData();
    }
  }

  public async saveData(data: ShoppingData): Promise<void> {
    this.cache = JSON.parse(JSON.stringify(data));
    this.cacheExpiresAt = Date.now() + 30000;

    if (!this.isConfigured()) {
      return;
    }

    try {
      await this.ensureSheetsExist();

      // Monta os dados para a aba Stage
      const stageValues = [
        ["ID", "Produto", "Adicionado Por", "Data de Adição"],
        ...data.stage.map((item) => [item.id, item.name, item.addedBy, item.addedAt]),
      ];

      // Monta os dados para a aba Lista Ativa
      const activeListValues: string[][] = [];
      if (data.activeList && data.activeList.status === "active") {
        activeListValues.push(
          ["Nome da Lista", "ID da Lista", "Criado Por", "Criado Em", "Status"],
          [
            data.activeList.name,
            data.activeList.id,
            data.activeList.createdBy,
            data.activeList.createdAt,
            data.activeList.status,
          ],
          ["", "", "", "", ""],
          ["ID do Item", "Produto", "Comprado?", "Comprado Por", "Data Compra"],
          ...data.activeList.items.map((item) => [
            item.id,
            item.name,
            item.checked ? "SIM" : "NÃO",
            item.checkedBy || "",
            item.checkedAt || "",
          ])
        );
      } else {
        activeListValues.push(
          ["Nome da Lista", "ID da Lista", "Criado Por", "Criado Em", "Status"],
          ["Nenhuma lista ativa", "", "", "", "finished"]
        );
      }

      // Limpa os ranges antigos antes de reescrever
      await this.sheetsClient!.spreadsheets.values.batchClear({
        spreadsheetId: this.spreadsheetId!,
        requestBody: {
          ranges: ["Stage!A1:D", "'Lista Ativa'!A1:E"],
        },
      });

      // Grava os novos dados nas abas
      await this.sheetsClient!.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId!,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: [
            {
              range: "Stage!A1",
              values: stageValues,
            },
            {
              range: "'Lista Ativa'!A1",
              values: activeListValues,
            },
          ],
        },
      });
    } catch (error) {
      console.error("[GoogleSheetsComprasRepository] Erro ao salvar dados no Google Sheets:", error);
    }
  }
}
