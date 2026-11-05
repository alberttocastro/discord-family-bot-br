import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z
    .string()
    .default("8080")
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  
  // Discord Credentials
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),

  // Canas e Fóruns de Roteamento (Opcionais no boot, configuráveis via env)
  CHANNEL_FINANCEIRO_ID: z.string().optional(),
  CHANNEL_COMPRAS_ID: z.string().optional(),
  CHANNEL_NOTAS_FISCAIS_ID: z.string().optional(),
  CHANNEL_COMPROMISSOS_ID: z.string().optional(),
  CHANNEL_CARRO_ID: z.string().optional(),
  FORUM_VIAGENS_ID: z.string().optional(),

  // Google Cloud Run & Scheduling Secret (para proteger endpoints de cron)
  CRON_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Em ambiente de teste, fornece valores dummy se não existirem
  if (env.NODE_ENV === "test") {
    return envSchema.parse({
      NODE_ENV: "test",
      PORT: "8080",
      DISCORD_TOKEN: env.DISCORD_TOKEN || "mock-test-token",
      ...env,
    });
  }

  const result = envSchema.safeParse(env);
  if (!result.success) {
    console.error("❌ Erro na validação das variáveis de ambiente:");
    console.error(result.error.format());
    throw new Error("Configuração de ambiente inválida");
  }

  return result.data;
}

export const config = loadConfig();
