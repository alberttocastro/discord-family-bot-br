import crypto from "node:crypto";

/**
 * Valida a assinatura Ed25519 enviada pelo Discord nas requisições HTTP de Interactions.
 */
export function verifyDiscordSignature(
  rawBody: Buffer | string,
  signature: string,
  timestamp: string,
  clientPublicKey: string
): boolean {
  if (!signature || !timestamp || !clientPublicKey) {
    return false;
  }

  try {
    const spkiHeader = Buffer.from("302a300506032b6570032100", "hex");
    const keyBuf = Buffer.concat([spkiHeader, Buffer.from(clientPublicKey, "hex")]);
    const publicKey = crypto.createPublicKey({ key: keyBuf, format: "der", type: "spki" });

    const messageBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf-8");
    const timestampBuffer = Buffer.from(timestamp, "utf-8");
    const dataToVerify = Buffer.concat([timestampBuffer, messageBuffer]);

    const signatureBuffer = Buffer.from(signature, "hex");

    return crypto.verify(null, dataToVerify, publicKey, signatureBuffer);
  } catch (error) {
    return false;
  }
}

