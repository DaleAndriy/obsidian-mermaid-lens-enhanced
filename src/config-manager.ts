import { loadMermaid } from "obsidian";
import { MermaidConfig, mergeConfig } from "./config-utils";
import { t } from "./i18n";
import { renderBeautifulDiagram } from "./beautiful-renderer";

export { parseConfigJson } from "./config-utils";

export interface MermaidApi {
  initialize: (config: MermaidConfig) => void;
  getConfig?: () => MermaidConfig;
  render?: (id: string, source: string, ...args: unknown[]) => Promise<unknown>;
}


type MermaidLoader = () => Promise<MermaidApi>;

async function loadObsidianMermaid(): Promise<MermaidApi> {
  const loaded: unknown = await loadMermaid();
  if (loaded === null || typeof loaded !== "object" || !("initialize" in loaded)
    || typeof loaded.initialize !== "function") {
    throw new Error("Obsidian returned an invalid Mermaid API");
  }
  const api = loaded as MermaidApi;
  return api;
}

/**
 * Wraps Obsidian's shared Mermaid instance. The wrapper becomes a transparent
 * pass-through after dispose, even when another plugin wrapped it afterwards.
 */
export class MermaidConfigManager {
  private readonly load: MermaidLoader;
  private api?: MermaidApi;
  private originalInitialize?: MermaidApi["initialize"];
  private wrapper?: MermaidApi["initialize"];
  private baseConfig: MermaidConfig = {};
  private customConfig: MermaidConfig = {};
  private active = false;
  private originalRender?: MermaidApi["render"];
  private renderWrapper?: MermaidApi["render"];

  constructor(load: MermaidLoader = loadObsidianMermaid) {
    this.load = load;
  }

  async install(config: MermaidConfig): Promise<void> {
    if (this.active) {
      this.apply(config);
      return;
    }

    const api = await this.load();
    const original = api.initialize;
    this.api = api;
    this.originalInitialize = original;
    this.baseConfig = this.readCurrentConfig(api);
    this.customConfig = config;
    this.active = true;

    const wrapper = (incoming: MermaidConfig): void => {
      const nextBase = incoming !== null && typeof incoming === "object" && !Array.isArray(incoming)
        ? incoming
        : {};
      if (!this.active) {
        original(nextBase);
        return;
      }
      this.baseConfig = nextBase;
      original(mergeConfig(nextBase, this.customConfig));
    };
    this.wrapper = wrapper;
    api.initialize = wrapper;

    const originalRender = api.render;
    if (originalRender) {
      this.originalRender = originalRender;
      const renderWrapper: NonNullable<MermaidApi["render"]> = async (id, source, ...args) => {
        if (!this.active) return originalRender(id, source, ...args);
        const container = args[0] as { ownerDocument?: Document } | undefined;
        const ownerDocument = container?.ownerDocument ?? (typeof document === "undefined" ? undefined : document);
        if (ownerDocument) {
          try {
            const svg = renderBeautifulDiagram(id, source, ownerDocument, this.customConfig);
            if (svg) return { svg };
          } catch (error) {
            console.warn("[mermaid-lens] beautiful-mermaid could not render this syntax; using native fallback", error);
          }
        }
        return originalRender(id, source, ...args);
      };
      this.renderWrapper = renderWrapper;
      api.render = renderWrapper;
    }

    try {
      original(mergeConfig(this.baseConfig, config));
    } catch (error) {
      this.active = false;
      if (api.initialize === wrapper) api.initialize = original;
      if (api.render === this.renderWrapper && this.originalRender) api.render = this.originalRender;
      this.clearReferences();
      throw error;
    }
  }

  apply(config: MermaidConfig): void {
    if (!this.api || !this.originalInitialize || !this.active) {
      throw new Error(t("error.managerNotInitialized"));
    }

    const previous = this.customConfig;
    try {
      this.originalInitialize(mergeConfig(this.baseConfig, config));
      this.customConfig = config;
    } catch (error) {
      try {
        this.originalInitialize(mergeConfig(this.baseConfig, previous));
      } catch (restoreError) {
        console.error("[mermaid-lens] Failed to restore Mermaid config", restoreError);
      }
      throw error;
    }
  }

  dispose(): void {
    const api = this.api;
    const original = this.originalInitialize;
    const wrapper = this.wrapper;
    this.active = false;

    if (api && original) {
      if (api.render === this.renderWrapper && this.originalRender) api.render = this.originalRender;
      if (wrapper && api.initialize === wrapper) api.initialize = original;
      try {
        original(this.baseConfig);
      } catch (error) {
        console.error("[mermaid-lens] Failed to restore Obsidian Mermaid config", error);
      }
    }
    this.clearReferences();
  }

  private readCurrentConfig(api: MermaidApi): MermaidConfig {
    try {
      const config = api.getConfig?.();
      return config !== null && typeof config === "object" && !Array.isArray(config) ? config : {};
    } catch {
      return {};
    }
  }

  private clearReferences(): void {
    this.api = undefined;
    this.originalInitialize = undefined;
    this.wrapper = undefined;
    this.originalRender = undefined;
    this.renderWrapper = undefined;
    this.baseConfig = {};
    this.customConfig = {};
  }
}
