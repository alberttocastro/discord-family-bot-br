import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { DiscordWebhookService } from "./discordWebhookService.js";

vi.mock("axios");

describe("DiscordWebhookService", () => {
  let service: DiscordWebhookService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DiscordWebhookService("https://discord.com/api/v10");
  });

  it("deve enviar PATCH para o endpoint @original com content e embeds", async () => {
    vi.mocked(axios.patch).mockResolvedValueOnce({ status: 200, data: {} });

    await service.editOriginalResponse("app-123", "token-abc", {
      content: "Mensagem atualizada",
      embeds: [{ title: "Embed Teste" }],
    });

    expect(axios.patch).toHaveBeenCalledTimes(1);
    expect(axios.patch).toHaveBeenCalledWith(
      "https://discord.com/api/v10/webhooks/app-123/token-abc/messages/@original",
      {
        content: "Mensagem atualizada",
        embeds: [{ title: "Embed Teste" }],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  });

  it("deve propagar erro caso axios.patch falhe", async () => {
    vi.mocked(axios.patch).mockRejectedValueOnce(new Error("Network Error"));

    await expect(
      service.editOriginalResponse("app-123", "token-abc", {
        content: "Erro",
      })
    ).rejects.toThrow("Network Error");
  });
});
