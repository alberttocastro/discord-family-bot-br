import axios from "axios";
import { CommandHttpResponse } from "../commands/index.js";

export class DiscordWebhookService {
  private apiBaseUrl: string;

  constructor(apiBaseUrl = "https://discord.com/api/v10") {
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * Sanitiza os embeds para respeitar os limites rígidos da API do Discord (evitando erro 400 - Code 50035):
   * - title: max 256 caracteres
   * - description: max 4096 caracteres
   * - fields: max 25 campos
   * - field.name: max 256 caracteres
   * - field.value: max 1024 caracteres
   */
  public sanitizeEmbeds(embeds?: any[]): any[] | undefined {
    if (!embeds || !Array.isArray(embeds)) return embeds;

    return embeds.slice(0, 10).map((embed) => {
      const sanitized: any = { ...embed };

      if (typeof sanitized.title === "string" && sanitized.title.length > 256) {
        sanitized.title = sanitized.title.slice(0, 253) + "...";
      }

      if (typeof sanitized.description === "string" && sanitized.description.length > 4096) {
        sanitized.description = sanitized.description.slice(0, 4093) + "...";
      }

      if (Array.isArray(sanitized.fields)) {
        sanitized.fields = sanitized.fields.slice(0, 25).map((field: any) => ({
          name:
            typeof field.name === "string"
              ? field.name.length > 256
                ? field.name.slice(0, 253) + "..."
                : field.name
              : "",
          value:
            typeof field.value === "string"
              ? field.value.length > 1024
                ? field.value.slice(0, 1020) + "..."
                : field.value
              : "",
          inline: Boolean(field.inline),
        }));
      }

      return sanitized;
    });
  }

  /**
   * Atualiza a resposta original diferida (Type 5: DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE)
   * através do endpoint oficial de webhooks do Discord:
   * PATCH /webhooks/<application_id>/<interaction_token>/messages/@original
   */
  async editOriginalResponse(
    applicationId: string,
    interactionToken: string,
    response: CommandHttpResponse
  ): Promise<void> {
    const url = `${this.apiBaseUrl}/webhooks/${applicationId}/${interactionToken}/messages/@original`;

    const body: Record<string, any> = {};
    if (response.content !== undefined) {
      body.content =
        typeof response.content === "string" && response.content.length > 2000
          ? response.content.slice(0, 1997) + "..."
          : response.content;
    }
    if (response.embeds !== undefined) {
      body.embeds = this.sanitizeEmbeds(response.embeds);
    }
    if (response.components !== undefined) {
      body.components = response.components;
    }

    await axios.patch(url, body, {
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
