import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerSlashCommands, commands } from "./index.js";
import { runDeploy } from "../scripts/deployCommands.js";
import { REST } from "discord.js";
import * as configModule from "../config/index.js";

// Mock do discord.js REST
vi.mock("discord.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("discord.js")>();
  const MockREST = vi.fn().mockImplementation(() => ({
    setToken: vi.fn().mockReturnThis(),
    put: vi.fn().mockResolvedValue([]),
  }));
  return {
    ...actual,
    REST: MockREST,
  };
});

describe("Slash Commands Registry & Deploy Script", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("registerSlashCommands()", () => {
    it("deve retornar null se DISCORD_TOKEN não estiver configurado", async () => {
      const result = await registerSlashCommands({
        NODE_ENV: "test",
        PORT: 8080,
        DISCORD_CLIENT_ID: "client-123",
      });

      expect(result).toBeNull();
    });

    it("deve retornar null se DISCORD_CLIENT_ID não estiver configurado", async () => {
      const result = await registerSlashCommands({
        NODE_ENV: "test",
        PORT: 8080,
        DISCORD_TOKEN: "mock-token",
      });

      expect(result).toBeNull();
    });

    it("deve registrar comandos no modo Guild se DISCORD_GUILD_ID for fornecido", async () => {
      const mockConfig = {
        NODE_ENV: "test" as const,
        PORT: 8080,
        DISCORD_TOKEN: "mock-token",
        DISCORD_CLIENT_ID: "client-123",
        DISCORD_GUILD_ID: "guild-456",
      };

      const result = await registerSlashCommands(mockConfig);

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.mode).toBe("guild");
      expect(result?.targetId).toBe("guild-456");
      expect(result?.count).toBe(commands.length);
    });

    it("deve registrar comandos no modo Global se não houver guild definida", async () => {
      const mockConfig = {
        NODE_ENV: "test" as const,
        PORT: 8080,
        DISCORD_TOKEN: "mock-token",
        DISCORD_CLIENT_ID: "client-123",
      };

      const result = await registerSlashCommands(mockConfig);

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.mode).toBe("global");
      expect(result?.targetId).toBe("client-123");
      expect(result?.count).toBe(commands.length);
    });

    it("deve permitir forçar modo global mesmo com DISCORD_GUILD_ID no config", async () => {
      const mockConfig = {
        NODE_ENV: "test" as const,
        PORT: 8080,
        DISCORD_TOKEN: "mock-token",
        DISCORD_CLIENT_ID: "client-123",
        DISCORD_GUILD_ID: "guild-456",
      };

      const result = await registerSlashCommands(mockConfig, { global: true });

      expect(result?.mode).toBe("global");
      expect(result?.targetId).toBe("client-123");
    });

    it("deve enviar lista vazia de comandos se clear for true", async () => {
      const mockConfig = {
        NODE_ENV: "test" as const,
        PORT: 8080,
        DISCORD_TOKEN: "mock-token",
        DISCORD_CLIENT_ID: "client-123",
        DISCORD_GUILD_ID: "guild-456",
      };

      const result = await registerSlashCommands(mockConfig, { clear: true });

      expect(result?.success).toBe(true);
      expect(result?.count).toBe(0);
    });
  });

  describe("runDeploy() CLI script", () => {
    it("deve exibir ajuda e retornar 0 com flag --help", async () => {
      const exitCode = await runDeploy(["--help"]);
      expect(exitCode).toBe(0);
    });

    it("deve retornar 1 se faltarem credenciais no config", async () => {
      vi.spyOn(configModule, "loadConfig").mockReturnValue({
        NODE_ENV: "test",
        PORT: 8080,
      });

      const exitCode = await runDeploy([]);
      expect(exitCode).toBe(1);
    });

    it("deve executar com sucesso quando credenciais estiverem disponíveis", async () => {
      vi.spyOn(configModule, "loadConfig").mockReturnValue({
        NODE_ENV: "test",
        PORT: 8080,
        DISCORD_TOKEN: "valid-token",
        DISCORD_CLIENT_ID: "valid-client-id",
        DISCORD_GUILD_ID: "valid-guild-id",
      });

      const exitCode = await runDeploy([]);
      expect(exitCode).toBe(0);
    });
  });

  describe("Comando /testar-nota (Dry-Run Parser)", () => {
    it("deve retornar erro se URL não começar com http:// ou https://", async () => {
      const { MessageRouter } = await import("../routing/router.js");
      const { executeCommandHttp } = await import("./index.js");
      const router = new MessageRouter();

      const response = await executeCommandHttp("testar-nota", router, {
        url: "ftp://link-invalido.com",
      });

      expect(response).not.toBeNull();
      expect(response?.content).toContain("Por favor, forneça uma URL válida");
    });

    it("deve executar parser e responder com embed no formato resumo", async () => {
      const { MessageRouter } = await import("../routing/router.js");
      const { executeCommandHttp } = await import("./index.js");
      const { SefazParser } = await import("../services/sefazParser.js");
      const router = new MessageRouter();

      const mockParser = new SefazParser();
      vi.spyOn(mockParser, "parseUrl").mockResolvedValue({
        establishmentName: "Mercado Super Teste",
        cnpj: "12.345.678/0001-99",
        issuedAt: new Date("2026-11-18T10:00:00Z"),
        totalAmount: 45.5,
        itemsCount: 2,
        totalUnitsCount: 3,
        accessKey: "12345678901234567890123456789012345678901234",
        items: [
          {
            name: "LEITE INTEGRAL 1L",
            quantity: 2,
            unit: "UN",
            unitPrice: 5.25,
            totalPrice: 10.5,
          },
          {
            name: "CAFE GOURMET 500G",
            quantity: 1,
            unit: "UN",
            unitPrice: 35.0,
            totalPrice: 35.0,
          },
        ],
      });

      const response = await executeCommandHttp(
        "testar-nota",
        router,
        {
          url: "https://nfe.sefaz.ba.gov.br/portal/nfce/qrcode.aspx?p=123",
          formato: "resumo",
        },
        mockParser
      );

      expect(response).not.toBeNull();
      expect(response?.embeds).toBeDefined();
      expect(response?.embeds?.length).toBe(1);

      const embed = response?.embeds?.[0];
      expect(embed.title).toContain("Análise da Nota Fiscal (Modo Teste / Dry-Run)");
      expect(embed.fields.some((f: any) => f.name.includes("Estabelecimento") && f.value.includes("Mercado Super Teste"))).toBe(true);
      expect(embed.fields.some((f: any) => f.name.includes("Total") && f.value.includes("45.50"))).toBe(true);
      expect(embed.fields.some((f: any) => f.name.includes("Produtos Identificados") && f.value.includes("LEITE INTEGRAL"))).toBe(true);
    });

    it("deve responder em bloco de código json se formato for json", async () => {
      const { MessageRouter } = await import("../routing/router.js");
      const { executeCommandHttp } = await import("./index.js");
      const { SefazParser } = await import("../services/sefazParser.js");
      const router = new MessageRouter();

      const mockParser = new SefazParser();
      vi.spyOn(mockParser, "parseUrl").mockResolvedValue({
        establishmentName: "Loja ABC",
        totalAmount: 10.0,
        itemsCount: 1,
        items: [
          {
            name: "PÃO DE QUEIJO",
            quantity: 1,
            unit: "UN",
            unitPrice: 10.0,
            totalPrice: 10.0,
          },
        ],
      });

      const response = await executeCommandHttp(
        "testar-nota",
        router,
        [
          { name: "url", value: "https://sefaz.sp.gov.br/nfce" },
          { name: "formato", value: "json" },
        ],
        mockParser
      );

      expect(response).not.toBeNull();
      expect(response?.content).toContain("```json");
      expect(response?.content).toContain('"establishmentName": "Loja ABC"');
    });

    it("deve capturar e retornar mensagem de erro amigável se parser falhar", async () => {
      const { MessageRouter } = await import("../routing/router.js");
      const { executeCommandHttp } = await import("./index.js");
      const { SefazParser } = await import("../services/sefazParser.js");
      const router = new MessageRouter();

      const mockParser = new SefazParser();
      vi.spyOn(mockParser, "parseUrl").mockRejectedValue(new Error("SEFAZ Timeout / Indisponível"));

      const response = await executeCommandHttp(
        "testar-nota",
        router,
        { url: "https://sefaz.ba.gov.br/offline" },
        mockParser
      );

      expect(response).not.toBeNull();
      expect(response?.content).toContain("Falha ao processar a Nota Fiscal");
      expect(response?.content).toContain("SEFAZ Timeout / Indisponível");
    });
  });

  describe("Comando /compras", () => {
    it("deve executar subcomandos de compras via HTTP", async () => {
      const { MessageRouter } = await import("../routing/router.js");
      const { executeCommandHttp } = await import("./index.js");
      const { ComprasService } = await import("../services/compras/comprasService.js");
      const { InMemoryComprasRepository } = await import("../services/compras/comprasRepository.js");

      const router = new MessageRouter();
      const service = new ComprasService(new InMemoryComprasRepository());

      // 1. Stage inicial (vazio)
      const stageRes = await executeCommandHttp(
        "compras",
        router,
        { subcommand: "stage" },
        undefined,
        service
      );
      expect(stageRes?.embeds?.[0].title).toContain("Stage de Compras");

      // 2. Adicionar itens ao Stage
      const addRes = await executeCommandHttp(
        "compras",
        router,
        { subcommand: "adicionar", itens: "Leite, Pão, Café" },
        undefined,
        service
      );
      expect(addRes?.content).toContain("3** item(ns) adicionado(s)");

      // 3. Criar lista a partir do Stage
      const listRes = await executeCommandHttp(
        "compras",
        router,
        { subcommand: "criar-lista", nome: "Mercado Semanal" },
        undefined,
        service
      );
      expect(listRes?.content).toContain('Lista de compras **"Mercado Semanal"** criada');

      // 4. Ver lista ativa
      const verRes = await executeCommandHttp(
        "compras",
        router,
        { subcommand: "ver" },
        undefined,
        service
      );
      expect(verRes?.embeds?.[0].title).toContain("Lista Ativa: Mercado Semanal");

      // 5. Ticar item
      const ticarRes = await executeCommandHttp(
        "compras",
        router,
        { subcommand: "ticar", item: "Leite" },
        undefined,
        service
      );
      expect(ticarRes?.content).toContain("comprado");

      // 6. Finalizar
      const finRes = await executeCommandHttp(
        "compras",
        router,
        { subcommand: "finalizar" },
        undefined,
        service
      );
      expect(finRes?.embeds?.[0].title).toContain("Finalização da Lista");
    });
  });
});

