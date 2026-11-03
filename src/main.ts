import { MarkdownView, Notice, Plugin } from "obsidian";
import { MermaidConfigManager, parseConfigJson } from "./config-manager";
import { DiagramRegistry } from "./diagram-registry";
import { t } from "./i18n";
import {
  DEFAULT_SETTINGS,
  MermaidLensSettings,
  MermaidLensSettingTab,
  normalizeSettings
} from "./settings";

interface ScheduledTimer {
  ownerWindow: Window;
  id: number;
}

export default class MermaidLensPlugin extends Plugin {
  settings: MermaidLensSettings = { ...DEFAULT_SETTINGS };
  private readonly configManager = new MermaidConfigManager();
  private registry?: DiagramRegistry;
  private readonly timers = new Set<ScheduledTimer>();
  private loaded = false;
  private activeConfigJson = DEFAULT_SETTINGS.configJson;

  async onload(): Promise<void> {
    this.loaded = true;
    await this.loadSettings();
    this.addSettingTab(new MermaidLensSettingTab(this.app, this));

    let initialConfigJson = this.settings.configJson;
    let initialConfig;
    try {
      initialConfig = parseConfigJson(initialConfigJson);
    } catch (error) {
      initialConfigJson = DEFAULT_SETTINGS.configJson;
      initialConfig = parseConfigJson(initialConfigJson);
      new Notice(t("notice.savedConfigInvalid"));
      console.error("[mermaid-lens] Invalid saved config", error);
    }

    try {
      await this.configManager.install(initialConfig);
      this.activeConfigJson = initialConfigJson;
    } catch (error) {
      console.error("[mermaid-lens] Failed to apply saved config", error);
      new Notice(t("notice.applySavedConfigFailed"));
      await this.configManager.install(parseConfigJson(DEFAULT_SETTINGS.configJson));
      this.activeConfigJson = DEFAULT_SETTINGS.configJson;
    }

    this.registry = new DiagramRegistry(this.app, {
      getTrigger: () => this.settings.openTrigger,
      showExpandButton: () => this.settings.showExpandButton
    });

    this.registerMarkdownPostProcessor((element) => {
      this.registry?.scan(element);
      this.scheduleScan(element);
    });

    this.registerEvent(this.app.workspace.on("layout-change", () => this.scanOpenViews()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scanOpenViews()));

    this.app.workspace.onLayoutReady(() => {
      if (!this.loaded) return;
      this.rerenderOpenMarkdownViews();
      this.scanOpenViews();
      for (const delay of [50, 250, 750]) this.scheduleScanOpenViews(delay);
    });
  }

  onunload(): void {
    this.loaded = false;
    this.clearTimers();
    const roots = this.getMarkdownRoots();
    this.registry?.dispose(roots);
    this.registry?.disposeAll();
    this.registry = undefined;
    this.configManager.dispose();
    this.rerenderOpenMarkdownViews();
  }

  async loadSettings(): Promise<void> {
    const saved = await this.loadData() as Partial<MermaidLensSettings> | null;
    this.settings = normalizeSettings(saved);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async applyConfig(json: string): Promise<void> {
    const candidate = parseConfigJson(json);
    const previousJson = this.settings.configJson;
    const previousActiveJson = this.activeConfigJson;
    const previous = parseConfigJson(previousActiveJson);
    this.configManager.apply(candidate);
    this.settings.configJson = json;
    this.activeConfigJson = json;
    try {
      await this.saveSettings();
    } catch (error) {
      this.settings.configJson = previousJson;
      this.activeConfigJson = previousActiveJson;
      this.configManager.apply(previous);
      throw error;
    }
    this.rerenderOpenMarkdownViews();
    this.scanOpenViews();
    for (const delay of [50, 250, 750]) this.scheduleScanOpenViews(delay);
  }

  refreshDiagramControls(): void {
    this.registry?.refresh(this.getMarkdownRoots());
  }

  private getMarkdownViews(): MarkdownView[] {
    const views: MarkdownView[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView) views.push(leaf.view);
    });
    return views;
  }

  private getMarkdownRoots(): ParentNode[] {
    return this.getMarkdownViews().map((view) => view.containerEl);
  }

  private scanOpenViews(): void {
    const registry = this.registry;
    if (!registry) return;
    for (const root of this.getMarkdownRoots()) registry.scan(root);
  }

  private scheduleScan(root: ParentNode, delay = 100): void {
    const document = root.nodeType === 9
      ? root as Document
      : (root as Node).ownerDocument;
    const ownerWindow = document?.defaultView ?? window;
    const timer: ScheduledTimer = { ownerWindow, id: 0 };
    timer.id = ownerWindow.setTimeout(() => {
      this.timers.delete(timer);
      this.registry?.scan(root);
    }, delay);
    this.timers.add(timer);
  }

  private scheduleScanOpenViews(delay: number): void {
    const ownerWindow = window;
    const timer: ScheduledTimer = { ownerWindow, id: 0 };
    timer.id = ownerWindow.setTimeout(() => {
      this.timers.delete(timer);
      this.scanOpenViews();
    }, delay);
    this.timers.add(timer);
  }

  private clearTimers(): void {
    for (const timer of this.timers) timer.ownerWindow.clearTimeout(timer.id);
    this.timers.clear();
  }

  /**
   * Obsidian has no public API for rerendering one Live Preview code block.
   * Preserve public editor state while forcing only views that contain Mermaid.
   */
  private rerenderOpenMarkdownViews(): void {
    for (const view of this.getMarkdownViews()) {
      if (!view.containerEl.querySelector(".mermaid, .mermaid-preview")) continue;
      if (view.getMode() === "preview") {
        view.previewMode.rerender(true);
        continue;
      }
      const cursor = view.editor.getCursor();
      const scroll = view.editor.getScrollInfo();
      view.setViewData(view.getViewData(), false);
      view.editor.setCursor(cursor);
      view.editor.scrollTo(scroll.left, scroll.top);
    }
  }
}
