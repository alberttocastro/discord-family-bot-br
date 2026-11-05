import { describe, it, expect, vi } from "vitest";
import { SefazParser, InvoiceItem } from "./sefazParser.js";
import axios from "axios";

describe("SefazParser", () => {
  const parser = new SefazParser();

  describe("parsePtBrNumber", () => {
    it("deve converter valores no formato brasileiro corretamente", () => {
      expect(SefazParser.parsePtBrNumber("1.234,56")).toBe(1234.56);
      expect(SefazParser.parsePtBrNumber("R$ 49,90")).toBe(49.90);
      expect(SefazParser.parsePtBrNumber("2,500")).toBe(2.5);
      expect(SefazParser.parsePtBrNumber("10")).toBe(10);
      expect(SefazParser.parsePtBrNumber("")).toBe(0);
      expect(SefazParser.parsePtBrNumber(null)).toBe(0);
    });
  });

  describe("extractAccessKey", () => {
    it("deve extrair chave de 44 dígitos do parâmetro p de QR Code", () => {
      const url = "http://nfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx?p=29240501234567890123456789012345678901234567|2|1|1|ABCD123";
      expect(SefazParser.extractAccessKey(url)).toBe("29240501234567890123456789012345678901234567");
    });

    it("deve extrair chave pura de 44 dígitos no texto", () => {
      const text = "Chave: 29240501234567890123456789012345678901234567";
      expect(SefazParser.extractAccessKey(text)).toBe("29240501234567890123456789012345678901234567");
    });
  });

  describe("consolidateItems", () => {
    it("deve consolidar produtos repetidos passados separadamente no caixa", () => {
      const rawItems: InvoiceItem[] = [
        {
          code: "1001",
          name: "SABONETE DOVE 90G",
          quantity: 1,
          unit: "UN",
          unitPrice: 3.50,
          totalPrice: 3.50,
        },
        {
          code: "2002",
          name: "CREME DENTAL 90G",
          quantity: 2,
          unit: "UN",
          unitPrice: 6.00,
          totalPrice: 12.00,
        },
        {
          code: "1001",
          name: "sabonete dove 90g",
          quantity: 3,
          unit: "UN",
          unitPrice: 3.50,
          totalPrice: 10.50,
        },
      ];

      const consolidated = SefazParser.consolidateItems(rawItems);

      expect(consolidated.length).toBe(2);

      const dove = consolidated.find((i) => i.code === "1001");
      expect(dove).toBeDefined();
      expect(dove?.quantity).toBe(4); // 1 + 3
      expect(dove?.totalPrice).toBe(14.00); // 3.50 + 10.50
      expect(dove?.unitPrice).toBe(3.50);

      const creme = consolidated.find((i) => i.code === "2002");
      expect(creme).toBeDefined();
      expect(creme?.quantity).toBe(2);
      expect(creme?.totalPrice).toBe(12.00);
    });

    it("deve consolidar por nome e preço quando o produto não tem código", () => {
      const rawItems: InvoiceItem[] = [
        {
          name: "BANANA PRATA",
          quantity: 0.500,
          unit: "KG",
          unitPrice: 8.00,
          totalPrice: 4.00,
        },
        {
          name: "BANANA PRATA",
          quantity: 0.300,
          unit: "KG",
          unitPrice: 8.00,
          totalPrice: 2.40,
        },
      ];

      const consolidated = SefazParser.consolidateItems(rawItems);
      expect(consolidated.length).toBe(1);
      expect(consolidated[0].quantity).toBe(0.800);
      expect(consolidated[0].totalPrice).toBe(6.40);
      expect(consolidated[0].unitPrice).toBe(8.00);
    });
  });

  describe("parseHtml (Padrão ENCAT SEFAZ)", () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <div class="txtTopo">SUPERMERCADO FAMILIA FELIZ LTDA</div>
          <div class="text">CNPJ: 12.345.678/0001-90</div>
          <div>Emissão: 05/11/2026 14:30:00</div>
          <table id="tabResult">
            <tr id="Item + 1">
              <td>
                <span class="txtTit">ARROZ TIPO 1 5KG</span>
                <span class="RCod">(Código: 789123456)</span>
                <span class="Rqty">Qtde.: 2</span>
                <span class="RUN">UN: UN</span>
                <span class="RvlUnit">Vl. Unit.: 25,00</span>
                <span class="valor">50,00</span>
              </td>
            </tr>
            <tr id="Item + 2">
              <td>
                <span class="txtTit">FEIJAO CARIOCA 1KG</span>
                <span class="RCod">(Código: 789987654)</span>
                <span class="Rqty">Qtde.: 3</span>
                <span class="RUN">UN: UN</span>
                <span class="RvlUnit">Vl. Unit.: 8,00</span>
                <span class="valor">24,00</span>
              </td>
            </tr>
            <!-- Item repetido passado mais adiante no caixa -->
            <tr id="Item + 3">
              <td>
                <span class="txtTit">ARROZ TIPO 1 5KG</span>
                <span class="RCod">(Código: 789123456)</span>
                <span class="Rqty">Qtde.: 1</span>
                <span class="RUN">UN: UN</span>
                <span class="RvlUnit">Vl. Unit.: 25,00</span>
                <span class="valor">25,00</span>
              </td>
            </tr>
          </table>
          <div id="totalNota">
            <span class="txtMax">99,00</span>
          </div>
          <span class="chave">29240512345678000190650010000012341000012345</span>
        </body>
      </html>
    `;

    it("deve extrair estabelecimento, cnpj, data, itens consolidados e total corretamente", () => {
      const invoice = parser.parseHtml(mockHtml);

      expect(invoice.establishmentName).toBe("SUPERMERCADO FAMILIA FELIZ LTDA");
      expect(invoice.cnpj).toBe("12.345.678/0001-90");
      expect(invoice.totalAmount).toBe(99.00);
      expect(invoice.itemsCount).toBe(2); // ARROZ consolidado (2+1) e FEIJAO (3)
      expect(invoice.totalUnitsCount).toBe(6); // 3 arrozes + 3 feijões
      expect(invoice.accessKey).toBe("29240512345678000190650010000012341000012345");

      expect(invoice.items[0]).toEqual({
        code: "789123456",
        name: "ARROZ TIPO 1 5KG",
        quantity: 3, // consolidado de 2 + 1
        unit: "UN",
        unitPrice: 25.00,
        totalPrice: 75.00, // 50.00 + 25.00
      });

      expect(invoice.items[1]).toEqual({
        code: "789987654",
        name: "FEIJAO CARIOCA 1KG",
        quantity: 3,
        unit: "UN",
        unitPrice: 8.00,
        totalPrice: 24.00,
      });
    });

    it("deve baixar URL com axios e realizar parsing", async () => {
      vi.spyOn(axios, "get").mockResolvedValueOnce({
        data: mockHtml,
      });

      const invoice = await parser.parseUrl("http://nfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx?p=...");
      expect(invoice.establishmentName).toBe("SUPERMERCADO FAMILIA FELIZ LTDA");
      expect(invoice.items.length).toBe(2);
      expect(invoice.totalUnitsCount).toBe(6);
      expect(invoice.sourceUrl).toBe("http://nfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx?p=...");
    });
  });
});
