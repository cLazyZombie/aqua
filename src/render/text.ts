// UI 글자(타이틀·자막·도감)를 캔버스 위 DOM으로 그린다. 후처리 밖이라 창 해상도로 또렷하다.
// 위치·크기는 엔진 UI Text처럼 창 논리 좌표의 상자 안에서 세로 가운데 정렬한다.

import type { Rgba, TextItem } from "./draw";

function css([r, g, b, a]: Rgba): string {
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

export class TextLayer {
  private readonly nodes: HTMLDivElement[] = [];

  constructor(private readonly root: HTMLElement) {}

  update(items: TextItem[]): void {
    while (this.nodes.length < items.length) {
      const node = document.createElement("div");
      node.className = "ui-text";
      const span = document.createElement("span");
      node.appendChild(span);
      this.root.appendChild(node);
      this.nodes.push(node);
    }
    this.nodes.forEach((node, index) => {
      const item = items[index];
      if (!item) {
        node.style.display = "none";
        return;
      }
      node.style.display = "flex";
      node.style.left = `${item.x}px`;
      node.style.top = `${item.y}px`;
      node.style.width = `${item.w}px`;
      node.style.height = `${item.h}px`;
      node.style.justifyContent = item.align === "center" ? "center" : "flex-start";
      node.style.fontFamily = item.bold ? "GalmuriBold" : "Galmuri";
      node.style.fontSize = `${item.fontSize}px`;
      node.style.color = css(item.color);
      node.style.textShadow = item.shadow ? `${item.shadow.dx}px ${item.shadow.dy}px 0 ${css(item.shadow.color)}` : "none";
      const span = node.firstChild as HTMLSpanElement;
      if (span.textContent !== item.text) span.textContent = item.text;
    });
  }
}
