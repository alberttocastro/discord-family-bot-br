# 🤖 Guia de Desenvolvimento para Agentes de IA (AGENTS.md)

Este documento contém as diretrizes, padrões arquiteturais e convenções obrigatórias para qualquer agente autônomo ou assistente de IA trabalhando no repositório **discord-family-bot-br**.

---

## 📌 Visão Geral do Projeto

O **discord-family-bot-br** é um bot de Discord modular voltado para automação e organização familiar (gestão financeira, conciliação de notas fiscais/NFC-e, compras, agenda compartilhada, lembretes de manutenção residencial e veicular).

A aplicação foi concebida para execução em contêiner no **Google Cloud Run** em arquitetura **100% HTTP / Serverless** (sem conexão de WebSocket/Gateway socket contínua), permitindo auto-scaling para zero, recebimento de comandos via Webhook e testes rápidos por requisições HTTP REST.

---

## ⚡ Regra Mandatória: Zero Socket (HTTP-First)
- **NUNCA use ou reative o modo socket (Discord Gateway WebSocket)**.
- O bot opera exclusivamente via HTTP REST e Webhooks de Interactions.
- Todos os comandos, interações e simulações de canais devem ser testáveis e executáveis através dos endpoints HTTP da aplicação:
  - `POST /api/interactions`: Webhook oficial do Discord para Slash Commands.
  - `POST /api/commands/:name`: Execução e testes diretos de comandos via HTTP.
  - `POST /api/channels/messages`: Envio e testes de comandos/mensagens simulando canais.

---

## 🏛 Arquitetura e Estrutura de Pastas

```text
.
├── Dockerfile                  # Multi-stage build otimizado para o Google Cloud Run
├── README.md                   # Documentação do projeto para humanos
├── AGENTS.md                   # Diretrizes para agentes de IA (este arquivo)
├── package.json                # Dependências e scripts npm
├── tsconfig.json               # Configurações do compilador TypeScript
├── vitest.config.ts            # Configurações da suíte de testes Vitest
├── src/
│   ├── index.ts                # Bootstrap da aplicação e Graceful Shutdown
│   ├── config/                 # Validação de variáveis de ambiente com Zod
│   │   ├── index.ts
│   │   └── index.test.ts
│   ├── server/                 # Servidor Express para Cloud Run Probes e Cron Webhooks
│   │   ├── index.ts
│   │   └── index.test.ts
│   ├── bot/                    # Cliente do Discord e registro de eventos
│   │   ├── client.ts           # Inicialização do Client com Intents e Partials
│   │   └── events.ts           # Listeners (Ready, MessageCreate, InteractionCreate, etc.)
│   ├── commands/               # Slash Commands (/ping, /status)
│   │   └── index.ts
│   ├── routing/                # Roteamento desacoplado de canais e tópicos de fóruns
│   │   ├── types.ts            # Interfaces MessageContext e ChannelHandler
│   │   ├── router.ts           # Dispatcher e isolamento de erros
│   │   └── router.test.ts
│   └── handlers/               # Implementações de regras de negócio específicas
│       └── domain/
│           ├── generalHelperHandler.ts
│           ├── financeiroHandler.ts
│           ├── notasFiscaisHandler.ts
│           └── notasFiscaisHandler.test.ts
```

---

## ⚡ Regras de Ouro e Padrões Arquiteturais

### 1. Compatibilidade com Google Cloud Run
- **Porta HTTP**: O Cloud Run requer que a aplicação escute na porta definida por `process.env.PORT` (padrão `8080`). Nunca remova ou desative o servidor HTTP em `src/server/index.ts`.
- **Health Checks**: Os endpoints `/healthz` (liveness) e `/ready` (readiness) devem permanecer operacionais.
- **Graceful Shutdown**: Sempre trate sinais `SIGTERM` e `SIGINT` (desconectando o client do Discord e fechando o servidor HTTP) para evitar corrupção de estado durante deploys ou auto-scaling.
- **Trabalhos Periódicos (Cron)**: Disparos agendados devem utilizar o endpoint `POST /api/cron/:job`, autenticado via cabeçalho `Authorization: Bearer <CRON_SECRET>`.

### 2. Roteamento de Mensagens via `MessageRouter`
- **Não crie lógica de negócio monolítica** dentro do evento `client.on(Events.MessageCreate)`.
- Toda nova funcionalidade de canal ou fórum deve implementar a interface `ChannelHandler`:
  ```typescript
  export interface ChannelHandler {
    readonly name: string;
    readonly description: string;
    canHandle(context: MessageContext): boolean;
    handle(context: MessageContext): Promise<void>;
  }
  ```
- O `MessageRouter` isola falhas: se um handler falhar, os demais continuam funcionando normalmente. Sempre faça log estruturado dos erros.

### 3. Padrão TypeScript e Módulos ESM
- O projeto utiliza `"type": "module"` (ESM nativo).
- **Importações locais relativas DEVEM incluir a extensão `.js`** (ex: `import { config } from "./config/index.js";`).
- Mantenha `strict: true` ativado no `tsconfig.json` e nunca use `any` sem justificativa documentada.

### 4. Boas Práticas de Testes (Vitest)
- Todo novo handler, serviço ou comando criado **deve vir acompanhado de seu respectivo teste unitário** (`*.test.ts`).
- Execute sempre `npm test` e `npm run typecheck` antes de finalizar qualquer intervenção.

---

## 🗺 Roadmap de Implementação das Tarefas (TickTick)

Ao implementar as próximas tarefas do roadmap listadas no TickTick, siga este guia de design:

| Tarefa | Onde Implementar | Dependências / Serviços |
| :--- | :--- | :--- |
| **Parser de Nota Fiscal** | `src/handlers/domain/notasFiscaisHandler.ts` + `src/services/sefazParser.ts` | Cheerio / Puppeteer / Axios + Google Drive API |
| **Integração Meu Dinheiro** | `src/handlers/domain/financeiroHandler.ts` + `src/services/meuDinheiro.ts` | API do Meu Dinheiro (auth, criação de lançamentos) |
| **Chat de Compromissos** | `src/handlers/domain/compromissosHandler.ts` + `src/services/googleCalendar.ts` | Google Calendar API + date-fns ou Chrono |
| **Lista de Compras** | `src/handlers/domain/comprasHandler.ts` + reações em `src/bot/events.ts` | TickTick API / MCP ou banco local |
| **Alertas de Boletos (8h)** | `src/server/index.ts` (job `alerta-boletos`) | Cloud Scheduler -> `POST /api/cron/alerta-boletos` |
| **Resumo Semanal (Domingos)**| `src/server/index.ts` (job `resumo-semanal`) | Cloud Scheduler -> `POST /api/cron/resumo-semanal` |
| **Registro de Carro** | `src/handlers/domain/carroHandler.ts` | Armazenamento de abastecimento e cálculo de km/L |
| **Fórum de Viagens** | `src/handlers/domain/viagensHandler.ts` | Threads de Fórum (`context.isThread` e `context.parentId`) |

---

## 🛠 Comandos de Verificação

Execute estes comandos para assegurar integridade a qualquer alteração:

```bash
# Executar suíte de testes completa
npm test

# Executar com relatório de cobertura de código
npm run test:coverage

# Checagem de tipagem estática sem emitir arquivos
npm run typecheck

# Compilar projeto para produção (dist/)
npm run build
```
