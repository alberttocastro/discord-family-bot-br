import { describe, it, expect } from "vitest";
import { GoogleDriveService } from "./googleDriveService.js";
import { InvoiceData } from "./sefazParser.js";
import { Config } from "../config/index.js";

describe("GoogleDriveService", () => {
  const dummyInvoice: InvoiceData = {
    establishmentName: "Mercado Teste",
    cnpj: "00.000.000/0001-00",
    totalAmount: 100.00,
    itemsCount: 1,
    items: [
      {
        name: "Item 1",
        quantity: 1,
        unit: "UN",
        unitPrice: 100.00,
        totalPrice: 100.00,
      },
    ],
  };

  it("deve operar em modo simulado/offline se credenciais do Google não forem informadas", async () => {
    const unconfiguredConfig: Config = {
      NODE_ENV: "test",
      PORT: 8080,
      DISCORD_TOKEN: "dummy",
    };

    const service = new GoogleDriveService(unconfiguredConfig);
    expect(service.isConfigured()).toBe(false);

    const result = await service.syncInvoice(dummyInvoice);
    expect(result.isSimulated).toBe(true);
    expect(result.rowsAdded).toBe(1);
  });
});
