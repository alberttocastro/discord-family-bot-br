import fs from "node:fs/promises";
import path from "node:path";
import { ShoppingData } from "./types.js";
import { Config, config as globalConfig } from "../../config/index.js";
import { GoogleSheetsComprasRepository } from "./googleSheetsComprasRepository.js";

export interface IComprasRepository {
  getData(): Promise<ShoppingData>;
  saveData(data: ShoppingData): Promise<void>;
}

export { GoogleSheetsComprasRepository };

export function createComprasRepository(customConfig?: Config): IComprasRepository {
  const currentConfig = customConfig || globalConfig;
  const spreadsheetId =
    currentConfig.GOOGLE_COMPRAS_SPREADSHEET_ID || currentConfig.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (
    spreadsheetId &&
    currentConfig.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    currentConfig.GOOGLE_PRIVATE_KEY
  ) {
    return new GoogleSheetsComprasRepository(currentConfig);
  }

  return new JsonComprasRepository();
}

export class InMemoryComprasRepository implements IComprasRepository {
  private data: ShoppingData;

  constructor(initialData?: Partial<ShoppingData>) {
    this.data = {
      stage: initialData?.stage ? [...initialData.stage] : [],
      activeList: initialData?.activeList ? { ...initialData.activeList } : null,
      history: initialData?.history ? [...initialData.history] : [],
    };
  }

  public async getData(): Promise<ShoppingData> {
    return JSON.parse(JSON.stringify(this.data));
  }

  public async saveData(data: ShoppingData): Promise<void> {
    this.data = JSON.parse(JSON.stringify(data));
  }
}

export class JsonComprasRepository implements IComprasRepository {
  private filePath: string;
  private cache: ShoppingData | null = null;

  constructor(filePath = path.join(process.cwd(), "data", "compras.json")) {
    this.filePath = filePath;
  }

  private getDefaultData(): ShoppingData {
    return {
      stage: [],
      activeList: null,
      history: [],
    };
  }

  public async getData(): Promise<ShoppingData> {
    if (this.cache) {
      return JSON.parse(JSON.stringify(this.cache));
    }

    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(content) as ShoppingData;
      this.cache = {
        stage: parsed.stage || [],
        activeList: parsed.activeList || null,
        history: parsed.history || [],
      };
      return JSON.parse(JSON.stringify(this.cache));
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        const defaultData = this.getDefaultData();
        await this.saveData(defaultData);
        return defaultData;
      }
      console.warn(`[JsonComprasRepository] Arquivo inválido ou corrompido em ${this.filePath}. Inicializando vazio.`);
      const defaultData = this.getDefaultData();
      await this.saveData(defaultData);
      return defaultData;
    }
  }

  public async saveData(data: ShoppingData): Promise<void> {
    this.cache = JSON.parse(JSON.stringify(data));
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tempPath = `${this.filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tempPath, this.filePath);
  }
}
