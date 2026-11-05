import { describe, it, expect } from "vitest";
import { loadConfig } from "./index.js";

describe("Config Module", () => {
  it("deve carregar configuração padrão em ambiente de teste", () => {
    const config = loadConfig({ NODE_ENV: "test" });
    expect(config.NODE_ENV).toBe("test");
    expect(config.PORT).toBe(8080);
    expect(config.DISCORD_TOKEN).toBe("mock-test-token");
  });

  it("deve converter string de PORT para número", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      PORT: "9000",
      DISCORD_TOKEN: "any-token",
    });
    expect(config.PORT).toBe(9000);
  });

  it("deve lançar erro se DISCORD_TOKEN não for informado em produção", () => {
    expect(() => {
      loadConfig({
        NODE_ENV: "production",
        PORT: "8080",
        DISCORD_TOKEN: "",
      });
    }).toThrow();
  });

  it("deve aceitar canais opcionais de roteamento", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      CHANNEL_FINANCEIRO_ID: "123456",
      CHANNEL_NOTAS_FISCAIS_ID: "654321",
    });
    expect(config.CHANNEL_FINANCEIRO_ID).toBe("123456");
    expect(config.CHANNEL_NOTAS_FISCAIS_ID).toBe("654321");
  });
});
