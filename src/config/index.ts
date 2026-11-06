import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const optionalString = z
  .string()
  .optional()
  .transform((val) => (val && val.trim().length > 0 ? val.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z
    .string()
    .default("8080")
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  
  // Discord Credentials (opcionais: permite inicialização em modo HTTP standalone ou ambiente de dev)
  DISCORD_TOKEN: optionalString,
  DISCORD_CLIENT_ID: optionalString,
  DISCORD_GUILD_ID: optionalString,
  DISCORD_PUBLIC_KEY: optionalString,

  // Canais e Fóruns de Roteamento (Opcionais no boot, configuráveis via env)
  CHANNEL_FINANCEIRO_ID: optionalString,
  CHANNEL_COMPRAS_ID: optionalString,
  CHANNEL_NOTAS_FISCAIS_ID: optionalString,
  CHANNEL_COMPROMISSOS_ID: optionalString,
  CHANNEL_CARRO_ID: optionalString,
  FORUM_VIAGENS_ID: optionalString,

  // Google Cloud Run & Scheduling Secret (para proteger endpoints de cron)
  CRON_SECRET: optionalString,

  // Google Drive & Sheets Integration (opcionais: permite operar em modo offline/simulado)
  GOOGLE_SERVICE_ACCOUNT_EMAIL: optionalString,
  GOOGLE_PRIVATE_KEY: optionalString,
  GOOGLE_DRIVE_FOLDER_ID: optionalString,
  GOOGLE_SHEETS_SPREADSHEET_ID: optionalString,
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    console.error("❌ Erro na validação das variáveis de ambiente:");
    console.error(result.error.format());
    throw new Error("Configuração de ambiente inválida");
  }

  return result.data;
}

export const config = loadConfig();
