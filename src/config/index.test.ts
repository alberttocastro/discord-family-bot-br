import { describe, it, expect } from "vitest";
import { loadConfig } from "./index.js";

describe("Config Module", () => {
  it("deve carregar configuração padrão mesmo sem variáveis definidas", () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe("development");
    expect(config.PORT).toBe(8080);
    expect(config.DISCORD_TOKEN).toBeUndefined();
    expect(config.GOOGLE_SERVICE_ACCOUNT_EMAIL).toBeUndefined();
  });

  it("deve carregar com sucesso em produção sem DISCORD_TOKEN ou Google configurados", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      PORT: "8080",
    });
    expect(config.NODE_ENV).toBe("production");
    expect(config.PORT).toBe(8080);
    expect(config.DISCORD_TOKEN).toBeUndefined();
    expect(config.GOOGLE_SERVICE_ACCOUNT_EMAIL).toBeUndefined();
  });

  it("deve converter strings vazias ou com espaços para undefined", () => {
    const config = loadConfig({
      DISCORD_TOKEN: "   ",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "",
      GOOGLE_PRIVATE_KEY: "",
    });
    expect(config.DISCORD_TOKEN).toBeUndefined();
    expect(config.GOOGLE_SERVICE_ACCOUNT_EMAIL).toBeUndefined();
    expect(config.GOOGLE_PRIVATE_KEY).toBeUndefined();
  });

  it("deve converter string de PORT para número", () => {
    const config = loadConfig({
      PORT: "9000",
    });
    expect(config.PORT).toBe(9000);
  });

  it("deve lançar erro se PORT for inválida", () => {
    expect(() => {
      loadConfig({
        PORT: "-1",
      });
    }).toThrow();
  });

  it("deve aceitar canais opcionais de roteamento", () => {
    const config = loadConfig({
      CHANNEL_FINANCEIRO_ID: "123456",
      CHANNEL_NOTAS_FISCAIS_ID: "654321",
    });
    expect(config.CHANNEL_FINANCEIRO_ID).toBe("123456");
    expect(config.CHANNEL_NOTAS_FISCAIS_ID).toBe("654321");
  });
});
