# UI source attribution

`src/components/ui/button.tsx` adapts the shadcn/ui button composition; `sidebar.tsx` adapts its provider/mobile Sheet structure. The application shell borrows sidebar-16's sticky site header and below-header sidebar composition. Only the necessary primitives are retained; demo content is omitted and styling is project-owned.

Sources inspected on 2026-10-22:

- https://ui.shadcn.com/r/styles/new-york-v4/sidebar-16.json
- https://ui.shadcn.com/r/styles/new-york-v4/sidebar.json
- https://github.com/shadcn-ui/ui

The components use Radix Dialog/Slot, Lucide icons and class-variance-authority. Dependency licenses remain in their distributed packages.

## shadcn/ui license

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
