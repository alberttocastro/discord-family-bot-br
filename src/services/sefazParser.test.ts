import { describe, it, expect, vi } from "vitest";
import { SefazParser } from "./sefazParser.js";
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
          </table>
          <div id="totalNota">
            <span class="txtMax">74,00</span>
          </div>
          <span class="chave">29240512345678000190650010000012341000012345</span>
        </body>
      </html>
    `;

    it("deve extrair estabelecimento, cnpj, data, itens e total corretamente", () => {
      const invoice = parser.parseHtml(mockHtml);

      expect(invoice.establishmentName).toBe("SUPERMERCADO FAMILIA FELIZ LTDA");
      expect(invoice.cnpj).toBe("12.345.678/0001-90");
      expect(invoice.totalAmount).toBe(74.00);
      expect(invoice.itemsCount).toBe(2);
      expect(invoice.accessKey).toBe("29240512345678000190650010000012341000012345");

      expect(invoice.items[0]).toEqual({
        code: "789123456",
        name: "ARROZ TIPO 1 5KG",
        quantity: 2,
        unit: "UN",
        unitPrice: 25.00,
        totalPrice: 50.00,
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
      expect(invoice.sourceUrl).toBe("http://nfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx?p=...");
    });
  });
});
