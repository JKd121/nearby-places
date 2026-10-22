import type { Metadata } from "next";
import ExplorePrototype from "../../../src/components/prototype/explore-prototype";
import "./prototype.css";

export const metadata: Metadata = { title: "Explore 视觉原型 · 阶段 A", robots: { index: false, follow: false } };

export default function PrototypePage() {
  return <ExplorePrototype />;
}
