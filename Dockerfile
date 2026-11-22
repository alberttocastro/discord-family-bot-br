# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copia manifestos de dependência
COPY package*.json tsconfig.json ./

# Instala todas as dependências (incluindo dev para compilação)
RUN npm ci

# Copia o código-fonte
COPY src/ ./src/

# Compila o TypeScript para JavaScript em dist/
RUN npm run build

# Remove dependências de dev para manter apenas prod
RUN npm prune --production

# ------------------------------------------------------------------
# Stage 2: Runtime para o Google Cloud Run
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Cria usuário não-root por segurança
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copia apenas o necessário do estágio de build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Ajusta permissões
USER appuser

# Porta esperada pelo Google Cloud Run
EXPOSE 8080

# Inicia a aplicação
CMD ["node", "dist/index.js"]
