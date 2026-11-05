import * as cheerio from "cheerio";
import axios from "axios";

export interface InvoiceItem {
  code?: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

export interface InvoiceData {
  accessKey?: string;
  establishmentName: string;
  cnpj?: string;
  issuedAt?: Date;
  totalAmount: number;
  itemsCount: number;
  items: InvoiceItem[];
  sourceUrl?: string;
}

export class SefazParser {
  /**
   * Converte strings de moeda/quantidade brasileiras ("1.234,56" ou "2,500") em números float.
   */
  public static parsePtBrNumber(val: string | null | undefined): number {
    if (!val) return 0;
    const cleaned = val
      .replace(/[^\d,.-]/g, "") // remove "R$", espaços, etc.
      .trim();

    if (!cleaned) return 0;

    // Se tiver vírgula, assume padrão BR (1.234,56 -> 1234.56)
    if (cleaned.includes(",")) {
      const normalized = cleaned.replace(/\./g, "").replace(",", ".");
      const parsed = parseFloat(normalized);
      return isNaN(parsed) ? 0 : parsed;
    }

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Extrai a chave de acesso (44 dígitos) de uma URL ou texto.
   */
  public static extractAccessKey(input: string): string | undefined {
    // Parâmetro 'p' com 44 dígitos no início (comum em QR Codes da SEFAZ)
    const paramMatch = input.match(/[?&]p=([0-9]{44})/i);
    if (paramMatch) return paramMatch[1];

    // Chave pura de 44 dígitos
    const keyMatch = input.match(/\b([0-9]{44})\b/);
    if (keyMatch) return keyMatch[1];

    return undefined;
  }

  /**
   * Baixa o HTML a partir de uma URL da SEFAZ e faz o parsing.
   */
  public async parseUrl(url: string): Promise<InvoiceData> {
    const response = await axios.get<string>(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    const invoice = this.parseHtml(response.data);
    invoice.sourceUrl = url;
    if (!invoice.accessKey) {
      invoice.accessKey = SefazParser.extractAccessKey(url);
    }
    return invoice;
  }

  /**
   * Faz o parsing do HTML da NFC-e (compatível com padrão ENCAT/SEFAZ BA, SP, RS, RJ, etc.).
   */
  public parseHtml(html: string): InvoiceData {
    const $ = cheerio.load(html);

    // 1. Extrair Nome do Estabelecimento
    let establishmentName = $(
      ".txtTopo, #u20, .ui-header h1, .txtTitTopo, #lblNomeFantasia, .conteudo-topo h1, .txtCenter .linha3"
    )
      .first()
      .text()
      .trim();

    if (!establishmentName) {
      // Fallback para primeiro título ou cabeçalho relevante
      establishmentName = $("h1, h2, .panel-heading")
        .first()
        .text()
        .trim() || "Estabelecimento Desconhecido";
    }

    // 2. Extrair CNPJ
    const fullText = $("body").text();
    const cnpjMatch = fullText.match(/CNPJ[:\s]*([0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2})/i);
    const cnpj = cnpjMatch ? cnpjMatch[1] : undefined;

    // 3. Extrair Data de Emissão
    let issuedAt: Date | undefined;
    const dateMatch = fullText.match(/Emiss[ãa]o[:\s]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})\s*([0-9]{2}:[0-9]{2}:[0-9]{2})?/i);
    if (dateMatch) {
      const [_, datePart, timePart] = dateMatch;
      const [dia, mes, ano] = datePart.split("/").map(Number);
      if (timePart) {
        const [hora, minuto, segundo] = timePart.split(":").map(Number);
        issuedAt = new Date(ano, mes - 1, dia, hora, minuto, segundo);
      } else {
        issuedAt = new Date(ano, mes - 1, dia);
      }
    }

    // 4. Extrair Itens da Nota
    const items: InvoiceItem[] = [];

    // Estratégia 1: Padrão ENCAT (#tabResult tr ou .table tr)
    const rows = $("#tabResult tr, table.table tr, tr[id^='Item']");
    if (rows.length > 0) {
      rows.each((_, el) => {
        const $row = $(el);
        const nameEl = $row.find(".txtTit, .txtTit2, .desc").first();
        if (!nameEl.length) return;

        const name = nameEl.text().trim();
        if (!name) return;

        // Código do item
        const codeText = $row.find(".RCod").text();
        const codeMatch = codeText.match(/([0-9]+)/);
        const code = codeMatch ? codeMatch[1] : undefined;

        // Quantidade (ex: "Qtde.: 1,00" ou texto em .Rqty)
        const qtyText = $row.find(".Rqty, span:contains('Qtde')").text();
        const qtyMatch = qtyText.match(/Qtde\.?[:\s]*([0-9.,]+)/i) || qtyText.match(/([0-9.,]+)/);
        const quantity = qtyMatch ? SefazParser.parsePtBrNumber(qtyMatch[1]) : 1;

        // Unidade (ex: "UN: UN", "UN: KG")
        const unitText = $row.find(".RUN, span:contains('UN')").text();
        const unitMatch = unitText.match(/UN\.?[:\s]*([A-Z0-9]+)/i);
        const unit = unitMatch ? unitMatch[1].trim() : "UN";

        // Valor Unitário (ex: "Vl. Unit.: 12,50")
        const vlUnitText = $row.find(".RvlUnit, span:contains('Vl. Unit')").text();
        const vlUnitMatch = vlUnitText.match(/Vl\.?\s*Unit\.?[:\s]*([0-9.,]+)/i) || vlUnitText.match(/([0-9.,]+)/);
        const unitPrice = vlUnitMatch ? SefazParser.parsePtBrNumber(vlUnitMatch[1]) : 0;

        // Valor Total do Item (ex: class .valor ou .Rval)
        let totalText = $row.find(".valor, .Rval").first().text().trim();
        if (!totalText) {
          const tds = $row.find("td");
          if (tds.length > 1) {
            totalText = tds.last().text().trim();
          }
        }
        let totalPrice = SefazParser.parsePtBrNumber(totalText);

        // Se total deu 0, calcula qte * unitPrice
        if (totalPrice === 0 && quantity > 0 && unitPrice > 0) {
          totalPrice = parseFloat((quantity * unitPrice).toFixed(2));
        }

        items.push({
          code,
          name,
          quantity: quantity || 1,
          unit,
          unitPrice: unitPrice || totalPrice,
          totalPrice,
        });
      });
    }

    // Estratégia 2 (Fallback): Linhas de tabela simples se Estratégia 1 não capturou
    if (items.length === 0) {
      $("table tr").each((_, el) => {
        const tds = $(el).find("td");
        if (tds.length >= 3) {
          const col0 = $(tds[0]).text().trim();
          const colLast = $(tds[tds.length - 1]).text().trim();
          const val = SefazParser.parsePtBrNumber(colLast);
          if (val > 0 && col0.length > 2 && !col0.toLowerCase().includes("total")) {
            items.push({
              name: col0,
              quantity: 1,
              unit: "UN",
              unitPrice: val,
              totalPrice: val,
            });
          }
        }
      });
    }

    // 5. Extrair Valor Total da Nota
    let totalAmount = 0;
    const totalEl = $(
      "#totalNota .txtMax, .totalNFe, #lblTotal, span:contains('Valor a pagar'), span:contains('Valor Total')"
    )
      .last()
      .text();

    totalAmount = SefazParser.parsePtBrNumber(totalEl);

    if (totalAmount === 0) {
      const matchTotal = fullText.match(/Valor\s*(?:a\s*pagar|total|receber)[^0-9]*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/i);
      if (matchTotal) {
        totalAmount = SefazParser.parsePtBrNumber(matchTotal[1]);
      } else if (items.length > 0) {
        // Soma dos itens
        totalAmount = parseFloat(items.reduce((acc, item) => acc + item.totalPrice, 0).toFixed(2));
      }
    }

    // 6. Chave de acesso no HTML
    const chaveEl = $(".chave, span:contains('Chave de acesso')").text();
    const accessKey = SefazParser.extractAccessKey(chaveEl) || SefazParser.extractAccessKey(fullText);

    return {
      accessKey,
      establishmentName,
      cnpj,
      issuedAt,
      totalAmount,
      itemsCount: items.length,
      items,
    };
  }
}
