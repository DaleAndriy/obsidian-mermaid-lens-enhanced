import { App, setIcon } from "obsidian";
import { t } from "./i18n";
import type { OpenTrigger } from "./settings";
import { MermaidViewerModal } from "./viewer";
import { enhanceNativeFlowchart } from "./flowchart-style";

const HOST_SELECTOR = ".mermaid, .mermaid-preview";
const MOUNTED_CLASS = "mermaid-lens-host";

interface RegistryOptions {
  getTrigger(): OpenTrigger;
  showExpandButton(): boolean;
}

interface HostHandlers {
  click: (this: void, event: MouseEvent) => void;
  doubleClick: (this: void, event: MouseEvent) => void;
}

type ViewerOpener = (app: App, svg: SVGSVGElement) => void;

const openViewer: ViewerOpener = (app, svg) => new MermaidViewerModal(app, svg).open();

function asElement(value: EventTarget | null): Element | null {
  return value !== null && typeof (value as Element).closest === "function"
    ? value as Element
    : null;
}

export class DiagramRegistry {
  private readonly app: App;
  private readonly options: RegistryOptions;
  private readonly viewerOpener: ViewerOpener;
  private readonly handlers = new WeakMap<HTMLElement, HostHandlers>();
  private readonly observers = new Map<ParentNode, MutationObserver>();

  constructor(app: App, options: RegistryOptions, viewerOpener: ViewerOpener = openViewer) {
    this.app = app;
    this.options = options;
    this.viewerOpener = viewerOpener;
  }

  scan(root: ParentNode): void {
    this.observe(root);
    this.scanNow(root);
  }

  refresh(roots: ParentNode[]): void {
    for (const root of roots) {
      this.scan(root);
      root.querySelectorAll<HTMLElement>(`.${MOUNTED_CLASS}`).forEach((host) => {
        this.syncHostState(host);
      });
    }
  }

  dispose(roots: ParentNode[]): void {
    for (const root of roots) {
      for (const [observedRoot, observer] of this.observers) {
        if (observedRoot === root || root.contains(observedRoot)) {
          observer.disconnect();
          this.observers.delete(observedRoot);
        }
      }
      const hosts = root.nodeType === 1 && (root as Element).matches(`.${MOUNTED_CLASS}`)
        ? [root as HTMLElement, ...Array.from(root.querySelectorAll<HTMLElement>(`.${MOUNTED_CLASS}`))]
        : Array.from(root.querySelectorAll<HTMLElement>(`.${MOUNTED_CLASS}`));
      hosts.forEach((host) => this.unmount(host));
    }
  }

  disposeAll(): void {
    for (const observer of this.observers.values()) observer.disconnect();
    this.observers.clear();
  }

  private observe(root: ParentNode): void {
    if (this.observers.has(root)) return;
    const document = root.nodeType === 9 ? root as Document : (root as Node).ownerDocument;
    const Observer = document?.defaultView?.MutationObserver;
    if (!Observer) return;
    const observer = new Observer((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target.nodeType === 1 ? mutation.target as Element : mutation.target.parentElement;
        this.scanNow(target?.closest(HOST_SELECTOR) ?? mutation.target as ParentNode);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    this.observers.set(root, observer);
  }

  private scanNow(root: ParentNode): void {
    if (root.nodeType === 1) {
      const element = root as HTMLElement;
      if (element.matches(HOST_SELECTOR)) this.mount(element);
    }
    root.querySelectorAll<HTMLElement>(HOST_SELECTOR).forEach((host) => this.mount(host));
  }

  private unmount(host: HTMLElement): void {
    const handlers = this.handlers.get(host);
    if (handlers) {
      host.removeEventListener("click", handlers.click);
      host.removeEventListener("dblclick", handlers.doubleClick);
      this.handlers.delete(host);
    }
    host.querySelector(":scope > .mermaid-lens-expand")?.remove();
    host.removeAttribute("data-mermaid-lens-trigger");
    host.removeClass(MOUNTED_CLASS);
  }

  private mount(host: HTMLElement): void {
    const svg = host.querySelector<SVGSVGElement>("svg");
    if (!svg) return;
    enhanceNativeFlowchart(svg);
    if (!this.handlers.has(host)) {
      const handlers: HostHandlers = {
        click: (event) => this.handleOpenEvent(host, event, "single"),
        doubleClick: (event) => this.handleOpenEvent(host, event, "double")
      };
      this.handlers.set(host, handlers);
      host.addEventListener("click", handlers.click);
      host.addEventListener("dblclick", handlers.doubleClick);
      host.addClass(MOUNTED_CLASS);
    }
    this.syncHostState(host);
  }

  private syncHostState(host: HTMLElement): void {
    host.dataset.mermaidLensTrigger = this.options.getTrigger();
    let button = host.querySelector<HTMLButtonElement>(":scope > .mermaid-lens-expand");

    if (!this.options.showExpandButton()) {
      button?.remove();
      return;
    }
    if (button) return;

    button = host.createEl("button", {
      cls: "mermaid-lens-expand",
      attr: { "aria-label": t("diagram.openViewer"), title: t("diagram.openLarge") }
    });
    setIcon(button, "expand");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.open(host);
    });
  }

  private handleOpenEvent(host: HTMLElement, event: MouseEvent, eventTrigger: OpenTrigger): void {
    if (this.options.getTrigger() !== eventTrigger) return;
    const target = asElement(event.target);
    if (!target || target.closest("a, button")) return;
    event.preventDefault();
    event.stopPropagation();
    this.open(host);
  }

  private open(host: HTMLElement): void {
    const svg = host.querySelector<SVGSVGElement>("svg");
    if (svg) this.viewerOpener(this.app, svg);
  }
}
