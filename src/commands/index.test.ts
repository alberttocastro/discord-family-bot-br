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
});

