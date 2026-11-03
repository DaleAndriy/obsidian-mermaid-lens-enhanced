import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  App,
  ButtonComponent,
  DropdownComponent,
  notices,
  Setting,
  settingComponents,
  TextAreaComponent,
  ToggleComponent
} from "./mocks/obsidian";
import { DEFAULT_CONFIG, DEFAULT_SETTINGS, MermaidLensSettingTab, normalizeSettings } from "../src/settings";

describe("default Mermaid config", () => {
  it("uses the light-blue palette and Chinese-capable font stack", () => {
    expect(DEFAULT_CONFIG.themeVariables.fontFamily).toContain("PingFang SC");
    expect(DEFAULT_CONFIG.themeVariables.primaryColor).toBe("#E7F3FC");
    expect(DEFAULT_CONFIG.themeVariables.primaryTextColor).toBe("#1769AA");
    expect(DEFAULT_CONFIG.themeVariables.edgeLabelBackground).toBe("#F4F9FD");
  });
});

describe("normalizeSettings", () => {
  it("uses defaults for null, missing, and invalid values", () => {
    expect(DEFAULT_SETTINGS.openTrigger).toBe("single");
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ openTrigger: "invalid" as never, configJson: 1 as never, showExpandButton: "yes" as never }))
      .toEqual(DEFAULT_SETTINGS);
  });

  it.each(["single", "double", "button"] as const)("accepts the %s trigger", (openTrigger) => {
    expect(normalizeSettings({ configJson: "{}", openTrigger, showExpandButton: false })).toEqual({
      configJson: "{}",
      openTrigger,
      showExpandButton: false
    });
  });
});

describe("MermaidLensSettingTab", () => {
  beforeEach(() => {
    settingComponents.length = 0;
    notices.length = 0;
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  function display() {
    const plugin = {
      settings: { ...DEFAULT_SETTINGS },
      applyConfig: vi.fn().mockResolvedValue(undefined),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      refreshDiagramControls: vi.fn()
    };
    const tab = new MermaidLensSettingTab(new App() as never, plugin as never);
    tab.display();
    return { plugin, tab };
  }

  it("provides searchable 1.13 definitions that render the existing controls", async () => {
    const plugin = {
      settings: { ...DEFAULT_SETTINGS },
      applyConfig: vi.fn().mockResolvedValue(undefined),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      refreshDiagramControls: vi.fn()
    };
    const tab = new MermaidLensSettingTab(new App() as never, plugin as never);
    const definitions = tab.getSettingDefinitions();

    expect(definitions.map((definition) => "name" in definition ? definition.name : undefined)).toEqual([
      "全局 Mermaid 配置",
      "应用配置",
      "打开大图的操作",
      "显示展开按钮"
    ]);

    for (const definition of definitions) {
      if ("render" in definition && typeof definition.render === "function") {
        definition.render(new Setting(tab.containerEl) as never, {} as never);
      }
    }

    const text = settingComponents[0] as TextAreaComponent;
    const apply = settingComponents[1] as ButtonComponent;
    await text.onChangeHandler?.('{"theme":"forest"}');
    await apply.onClickHandler?.();
    expect(plugin.applyConfig).toHaveBeenCalledWith('{"theme":"forest"}');
    expect(settingComponents).toHaveLength(5);
    expect(tab.containerEl.querySelector(".mermaid-lens-config-setting")).not.toBeNull();
  });

  it("applies the edited draft and reports success", async () => {
    const { plugin, tab } = display();
    const text = settingComponents[0] as TextAreaComponent;
    const apply = settingComponents[1] as ButtonComponent;
    await text.onChangeHandler?.('{"theme":"forest"}');
    await apply.onClickHandler?.();
    expect(plugin.applyConfig).toHaveBeenCalledWith('{"theme":"forest"}');
    expect(notices).toContain("Mermaid 配置已应用");
    expect(tab.containerEl.querySelector("h2")).toBeNull();
  });

  it("reports apply and reset failures and can restore defaults", async () => {
    const { plugin } = display();
    const apply = settingComponents[1] as ButtonComponent;
    const reset = settingComponents[2] as ButtonComponent;
    plugin.applyConfig.mockRejectedValueOnce(new Error("bad JSON"));
    await apply.onClickHandler?.();
    expect(notices).toContain("Mermaid 配置无效：bad JSON");

    plugin.applyConfig.mockResolvedValueOnce(undefined);
    await reset.onClickHandler?.();
    expect(plugin.applyConfig).toHaveBeenLastCalledWith(DEFAULT_SETTINGS.configJson);
    expect(notices).toContain("已恢复默认 Mermaid 配置");

    expect((settingComponents[0] as TextAreaComponent).value).toBe(DEFAULT_SETTINGS.configJson);

    plugin.applyConfig.mockRejectedValueOnce(new Error("failed"));
    await reset.onClickHandler?.();
    expect(notices).toContain("恢复默认配置失败，请查看开发者控制台");
  });

  it("persists trigger and button changes and refreshes controls", async () => {
    const { plugin } = display();
    const dropdown = settingComponents[3] as DropdownComponent;
    const toggle = settingComponents[4] as ToggleComponent;
    await dropdown.onChangeHandler?.("single");
    await toggle.onChangeHandler?.(false);
    expect(plugin.settings.openTrigger).toBe("single");
    expect(plugin.settings.showExpandButton).toBe(false);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    expect(plugin.refreshDiagramControls).toHaveBeenCalledTimes(2);
  });
});
