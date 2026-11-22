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

  it("deve sanitizar e truncar embeds e campos que excederem o limite do Discord", async () => {
    vi.mocked(axios.patch).mockResolvedValueOnce({ status: 200, data: {} });

    const hugeString = "A".repeat(2000);
    const hugeDescription = "D".repeat(5000);
    const hugeTitle = "T".repeat(300);

    await service.editOriginalResponse("app-123", "token-abc", {
      content: "C".repeat(2500),
      embeds: [
        {
          title: hugeTitle,
          description: hugeDescription,
          fields: [
            {
              name: "N".repeat(300),
              value: hugeString,
              inline: true,
            },
          ],
        },
      ],
    });

    expect(axios.patch).toHaveBeenCalledTimes(1);
    const calledBody = vi.mocked(axios.patch).mock.calls[0][1] as any;

    expect(calledBody.content.length).toBeLessThanOrEqual(2000);
    expect(calledBody.embeds[0].title.length).toBeLessThanOrEqual(256);
    expect(calledBody.embeds[0].description.length).toBeLessThanOrEqual(4096);
    expect(calledBody.embeds[0].fields[0].name.length).toBeLessThanOrEqual(256);
    expect(calledBody.embeds[0].fields[0].value.length).toBeLessThanOrEqual(1024);
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
