import axios from "axios";
import { CommandHttpResponse } from "../commands/index.js";

export class DiscordWebhookService {
  private apiBaseUrl: string;

  constructor(apiBaseUrl = "https://discord.com/api/v10") {
    this.apiBaseUrl = apiBaseUrl;
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
      body.content = response.content;
    }
    if (response.embeds !== undefined) {
      body.embeds = response.embeds;
    }

    await axios.patch(url, body, {
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
