import type { CategoryKey, CategoryGroup } from "../../amap/types.js";

export type CategoryGlyph = CategoryKey | CategoryGroup;
/** Shared path data for React controls and the native map's DOM markers. */
const shapes = {
  bed: ["M3 18V6m18 12v-7H3m0 5h18M7 11V8h5v3m0 0V8h6l3 3"],
  bag: ["M5 8h14l1 13H4L5 8Z", "M8 9V6a4 4 0 0 1 8 0v3"],
  food: ["M4 3v7m3-7v7m3-7v7m-6 0a3 3 0 0 0 6 0M7 13v8m11-18c-4 3-4 8 0 9v9m0-18v9"],
  game: ["M7 7h10a4 4 0 0 1 4 3l1 7a2 2 0 0 1-3 2l-4-3H9l-4 3a2 2 0 0 1-3-2l1-7a4 4 0 0 1 4-3Z", "M6 11h4m-2-2v4m8-3h.01m2 3h.01"],
  hotel: ["M5 21V4h14v17M3 21h18M9 21v-5h6v5M8 8h2m4 0h2M8 12h2m4 0h2"],
  mall: ["M3 21V9h18v12M2 9l3-6h14l3 6M7 9v3m5-3v3m5-3v3M9 21v-5h6v5"],
  hotpot: ["M4 11h16l-2 8H6l-2-8ZM2 13h3m14 0h3M8 21h8M8 3c-3 3 3 3 0 6m4-6c-3 3 3 3 0 6m4-6c-3 3 3 3 0 6"],
  bakery: ["M3 13c0-5 4-8 9-8s9 3 9 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z", "m7 9 2 4m2-5 2 4m2-4 2 4"],
  dessert: ["M4 13h16v8H4v-8Zm0 0 13-7 3 7M4 17h16M13 8V4m-1-1h2"],
  ktv: ["M15 3a4 4 0 0 1 6 6l-4 4-6-6 4-4Zm-4 4-6 9 3 3 9-6M5 16l-3 6 6-3M14 4l6 6"],
  billiards: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M15 8.5a3 2.5 0 1 1-6 0 3 2.5 0 0 1 6 0Zm0 6.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
  gym: ["M7 12h10M3 9v6m4-9v12m10-12v12m4-9v6M3 12h4m10 0h4"],
  bus: ["M5 19V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14H5ZM5 11h14M8 19v2m8-2v2M8 7h8M8 15h1m6 0h1"],
  subway: ["M5 16V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3ZM5 11h14M9 6v5m6-5v5M8 15h1m6 0h1M8 19l-2 3m10-3 2 3M8 21h8"],
};
const groupShape = { stay: "bed", shopping: "bag", food: "food", entertainment: "game", transit: "bus" } as const;
export function categoryPaths(glyph: CategoryGlyph): readonly string[] {
  return shapes[(groupShape[glyph as CategoryGroup] ?? glyph) as keyof typeof shapes];
}
export function categorySvgElement(glyph: CategoryGlyph): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", width: "20", height: "20", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(name, value);
  for (const shape of categoryPaths(glyph)) {
    const path = document.createElementNS(svg.namespaceURI, "path"); path.setAttribute("d", shape); svg.append(path);
  }
  return svg;
}
