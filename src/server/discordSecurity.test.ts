import { describe, it, expect } from "vitest";
import { verifyDiscordSignature } from "./discordSecurity.js";
import crypto from "node:crypto";

describe("Discord Security (Ed25519 Signature Verification)", () => {
  it("deve validar com sucesso assinatura Ed25519 gerada com chave correspondente", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const rawPublicKeyHex = publicKey
      .export({ type: "spki", format: "der" })
      .subarray(-32)
      .toString("hex");

    const timestamp = "1700000000";
    const body = JSON.stringify({ type: 1 });
    const message = Buffer.concat([Buffer.from(timestamp, "utf-8"), Buffer.from(body, "utf-8")]);
    const signature = crypto.sign(null, message, privateKey).toString("hex");

    const isValid = verifyDiscordSignature(body, signature, timestamp, rawPublicKeyHex);
    expect(isValid).toBe(true);
  });

  it("deve rejeitar assinatura inválida ou adulterada", () => {
    const { publicKey } = crypto.generateKeyPairSync("ed25519");
    const rawPublicKeyHex = publicKey
      .export({ type: "spki", format: "der" })
      .subarray(-32)
      .toString("hex");

    const isValid = verifyDiscordSignature(
      JSON.stringify({ type: 1 }),
      "deadbeef".repeat(8),
      "1700000000",
      rawPublicKeyHex
    );
    expect(isValid).toBe(false);
  });

  it("deve retornar false se qualquer parâmetro for nulo ou vazio", () => {
    expect(verifyDiscordSignature("", "", "", "")).toBe(false);
  });
});

