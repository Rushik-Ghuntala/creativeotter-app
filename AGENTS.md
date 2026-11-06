<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:code-style-rules -->

# Code style

- **Arrow functions only.** Define every component and module-level function as `const Foo = (...) => { ... }`. Do not use the `function` keyword for components, helpers, or default exports. For default exports, assign to a `const` first so the component keeps its display name:

  ```tsx
  const Page = () => { ... };
  export default Page;
  ```

- **One component per file.** Each file in `src/app/` and `src/components/` should define a single logical component. Exception: shadcn/ui compound primitives in `src/components/ui/` (e.g. `card.tsx`, `dialog.tsx`) are treated as one logical component — their related sub-components stay in the same file to preserve the shadcn upgrade path.
- New app-level components belong in their own file under `src/components/<feature>/<ComponentName>.tsx`.

<!-- END:code-style-rules -->

# Plugin release hygiene

Keep `plugins/creativeotter/` latest-only. Packaging must finish successfully before deleting old CreativeOtter ZIPs and matching checksums. Retain the current package for each supported client and its release metadata; recover historical versions from Git history instead of keeping them in this folder.
