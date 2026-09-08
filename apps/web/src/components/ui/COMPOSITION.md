# Composition rules for Sure UI primitives (apps/web)

Audience: feature teams building auth, navigation, forms, tables,
overlays, and feedback on the alternate frontend. These rules keep one
accessible shape per intent — duplicate hand-rolled shapes are a
close/rewrite review finding.

## The rule

Import from `~/components/ui` (the barrel). Never deep-import a primitive
file, never copy a primitive's internals into a feature, and never build
a parallel shape with raw elements or a second component library.

```tsx
import { SureButton, SureDialog, SureTextField } from "~/components/ui";
```

## Shape map (intent → primitive, no substitutes)

| Intent                         | Primitive                                    |
| ------------------------------ | -------------------------------------------- |
| Actions                        | `SureButton` (`variant`, `size`, `isPending`) |
| Navigation links               | `SureLink` (`default` / `subtle`)            |
| Text input / textarea          | `SureTextField` (`multiline`)                |
| Short fixed choice             | `SureSelect`                                 |
| Long / filterable choice       | `SureCombobox`                               |
| Boolean / multi-select         | `SureCheckbox` (incl. `isIndeterminate`)     |
| On/off preference              | `SureSwitch`                                 |
| Modal task / confirm           | `SureDialog` (`trigger` + `title` + `footer`) |
| Contextual info bubble         | `SurePopover` (always `label`)               |
| Action list                    | `SureMenu` (trigger names the menu)          |
| Tabbed content                 | `SureTabs`                                   |
| Assertive/polite page feedback | `SureAlert` (`tone` picks role)              |
| Status text                    | `SureBadge` (never for alerts)               |
| Grouped content                | `SureCard*` composition                      |
| Loading placeholder            | `SureSkeleton` (`label`, `aria-busy`)        |
| Zero state                     | `SureEmptyState` (title + optional action)   |
| Transient notification         | `SureToastProvider` + `useSureToast()`       |

## Non-negotiables

1. **Tokens, not palette.** Only the semantic `vars` from
   `~/styles/sure-tokens.stylex` (the `no-raw-palette` test fails on hex
   literals anywhere else, stories included).
2. **Labels and errors are props, not suggestions.** `label` is required
   on fields/selects/comboboxes; `errorMessage` (paired with `isInvalid`)
   is the only failure channel — never plain-text errors.
3. **No new button variants in features.** Need a new intent? Extend
   `SureButtonVariant` in `button.tsx` with tokens + stories + tests.
4. **Overlays stay in primitives.** No raw fixed-position divs, no
   hand-rolled focus traps, no custom dropdown lists.
5. **One toast system.** Wrap once in `SureToastProvider`; feature code
   calls `toast()` — never renders its own live region. Toasts announce
   assertively (React Aria alert content); `tone` is styling only.
6. **Motion is opt-out by default.** Shimmer/entrance animations run only
   under `prefers-reduced-motion: no-preference`; the global guard in
   `sure-theme.css` backstops transitions.

## Stories and tests for new primitives

Every new primitive ships with: Storybook stories covering variants,
both themes (toolbar), a narrow (320 px) story, a long-text story, and a
failure story; vitest interaction + axe suites for anything with keyboard
behavior, focus management, or live regions (see `*.test.tsx` next to each
primitive); and a row in the shape map above.

Coverage split: jsdom suites exclude `color-contrast` (no layout, so the
rule cannot complete there) — contrast is covered instead by the automated
browser Storybook check (`pnpm --filter @sure/web test:browser`), which
runs axe with all rules in real Chromium against the static Storybook
build. See `scripts/storybook-browser-check.mjs`.
