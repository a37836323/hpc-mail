# HPC Mail frontend

The frontend uses Vue 3, Reka UI primitives, Lucide icons, and Element Plus for
complex data controls. The redesigned composer intentionally retains the
existing self-hosted TinyMCE editor and its draft/attachment integration.
Tiptap and Tailwind are not part of the current implementation.

Useful checks:

```sh
pnpm test
pnpm run build
pnpm audit --prod
```
