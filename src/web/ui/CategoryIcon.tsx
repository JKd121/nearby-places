import { categoryPaths, type CategoryGlyph } from "./category-shapes";

export function CategoryIcon({ name, className }: { name: CategoryGlyph; className?: string }) {
  return <svg className={className} data-category-icon={name} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {categoryPaths(name).map((path, index) => <path key={index} d={path} />)}
  </svg>;
}
