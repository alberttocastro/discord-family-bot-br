import { describe, expect, it, vi, beforeEach } from "vitest";
import { GoogleSheetsComprasRepository } from "./googleSheetsComprasRepository.js";
import { Config } from "../../config/index.js";

describe("GoogleSheetsComprasRepository", () => {
  const mockConfig: Config = {
    NODE_ENV: "test",
    PORT: 8080,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "bot@test.iam.gserviceaccount.com",
    GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3\n-----END PRIVATE KEY-----\n",
    GOOGLE_SHEETS_SPREADSHEET_ID: "spreadsheet-123",
  };

  let mockSheetsClient: any;

  beforeEach(() => {
    mockSheetsClient = {
      spreadsheets: {
        get: vi.fn().mockResolvedValue({
          data: {
            sheets: [
              { properties: { title: "Página1" } },
            ],
          },
        }),
        batchUpdate: vi.fn().mockResolvedValue({ data: {} }),
        values: {
          batchGet: vi.fn().mockResolvedValue({
            data: {
              valueRanges: [
                {
                  values: [
                    ["stg_1", "Leite Integral", "Albertto", "2026-11-20T10:00:00.000Z"],
                    ["stg_2", "Café em Pó", "Maria", "2026-11-20T10:05:00.000Z"],
                  ],
                },
                {
                  values: [
                    ["Mercado Semanal", "lst_1", "Albertto", "2026-11-20T11:00:00.000Z", "active"],
                  ],
                },
                {
                  values: [
                    ["item_1", "Azeite", "SIM", "Albertto", "2026-11-20T11:10:00.000Z"],
                    ["item_2", "Pão", "NÃO", "", ""],
                  ],
                },
              ],
            },
          }),
          batchClear: vi.fn().mockResolvedValue({ data: {} }),
          batchUpdate: vi.fn().mockResolvedValue({ data: {} }),
          update: vi.fn().mockResolvedValue({ data: {} }),
        },
      },
    };
  });

  it("deve reportar isConfigured() corretamente", () => {
    const unconfigured = new GoogleSheetsComprasRepository({
      NODE_ENV: "test",
      PORT: 8080,
    });
    expect(unconfigured.isConfigured()).toBe(false);

    const configured = new GoogleSheetsComprasRepository(mockConfig, mockSheetsClient);
    expect(configured.isConfigured()).toBe(true);
  });

  it("deve criar abas necessárias caso não existam", async () => {
    const repo = new GoogleSheetsComprasRepository(mockConfig, mockSheetsClient);
    await repo.ensureSheetsExist();

    expect(mockSheetsClient.spreadsheets.get).toHaveBeenCalledWith({
      spreadsheetId: "spreadsheet-123",
    });

    expect(mockSheetsClient.spreadsheets.batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: "spreadsheet-123",
        requestBody: {
          requests: [
            { addSheet: { properties: { title: "Stage" } } },
            { addSheet: { properties: { title: "Lista Ativa" } } },
            { addSheet: { properties: { title: "Histórico" } } },
          ],
        },
      })
    );
  });

  it("deve carregar dados de Stage e Lista Ativa do Google Sheets", async () => {
    const repo = new GoogleSheetsComprasRepository(mockConfig, mockSheetsClient);
    const data = await repo.getData(true);

    expect(data.stage).toHaveLength(2);
    expect(data.stage[0].name).toBe("Leite Integral");
    expect(data.stage[1].name).toBe("Café em Pó");

    expect(data.activeList).not.toBeNull();
    expect(data.activeList?.name).toBe("Mercado Semanal");
    expect(data.activeList?.items).toHaveLength(2);

    const azeite = data.activeList?.items[0];
    expect(azeite?.name).toBe("Azeite");
    expect(azeite?.checked).toBe(true);
    expect(azeite?.checkedBy).toBe("Albertto");

    const pao = data.activeList?.items[1];
    expect(pao?.name).toBe("Pão");
    expect(pao?.checked).toBe(false);
  });

  it("deve salvar dados no Google Sheets formatando valores e limpando dados antigos", async () => {
    const repo = new GoogleSheetsComprasRepository(mockConfig, mockSheetsClient);

    await repo.saveData({
      stage: [
        {
          id: "stg_99",
          name: "Detergente",
          addedBy: "Albertto",
          addedAt: "2026-11-20T12:00:00.000Z",
        },
      ],
      activeList: {
        id: "lst_99",
        name: "Limpeza",
        status: "active",
        createdBy: "Albertto",
        createdAt: "2026-11-20T12:10:00.000Z",
        items: [
          {
            id: "item_99",
            name: "Sabão em pó",
            checked: true,
            checkedBy: "Albertto",
            checkedAt: "2026-11-20T12:15:00.000Z",
            addedBy: "Albertto",
            addedAt: "2026-11-20T12:00:00.000Z",
          },
        ],
      },
      history: [],
    });

    // Limpeza dos ranges antigos
    expect(mockSheetsClient.spreadsheets.values.batchClear).toHaveBeenCalledWith({
      spreadsheetId: "spreadsheet-123",
      requestBody: {
        ranges: ["Stage!A1:D", "'Lista Ativa'!A1:E"],
      },
    });

    // Atualização com os novos dados
    expect(mockSheetsClient.spreadsheets.values.batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: "spreadsheet-123",
        requestBody: expect.objectContaining({
          valueInputOption: "USER_ENTERED",
        }),
      })
    );
  });
});
