# Graphic design rules

These rules govern all UI work. Follow them when adding or modifying any visual component. Source of truth is [`CLAUDE.md`](https://github.com/alfmunny/book-reader-ai/blob/main/CLAUDE.md#graphic-design-rules).

## Icon system

- **Never use emoji as UI icons.** Emoji render inconsistently across OS/browser and fail accessibility.
- All interactive icons come from `@/components/Icons.tsx` (SVG, `currentColor`, `aria-hidden="true"`).
- When adding a new icon need, add it to `Icons.tsx` first, then import it.

## Colour and tokens

- The palette is parchment / amber / ink. Key values are CSS custom properties in `globals.css` `:root`.
- Prefer semantic class names (`text-ink`, `bg-parchment`, `border-amber-200`) over raw hex.
- Dark-mode overrides live in `[data-theme="dark"]` in `globals.css` — add new tokens there, not as inline styles.

## Typography

- Body text: Georgia serif (`font-serif`) for reading content.
- UI chrome (buttons, labels, counts): system sans-serif via Tailwind default.
- Scale: `text-xs` (labels/counts) → `text-sm` (UI) → `text-base` / `text-lg` (headings) → `text-xl`+ (hero).

## Spacing

- **Touch targets minimum 44×44 px on mobile.** Use `min-h-[44px]` or equivalent.
- Card padding: `p-3` for compact cards, `p-4`–`p-6` for modals.
- Section spacing: `space-y-10` between major sections, `gap-4` between grid items.

## Shadows and elevation

- Cards use `--shadow-card` (CSS variable in `:root`). On hover: `--shadow-card-hover`.
- Never hardcode `shadow-sm` / `shadow-md` directly on cards — use the CSS variable via inline style.

## Motion

- Entrances: `animate-fade-in` (toolbars) or `animate-slide-up` (bottom sheets).
- Hover lifts: `hover:-translate-y-0.5 transition-all duration-200` on cards.
- Progress bars: `transition-all duration-200` minimum.
- Keep all animations under 300 ms. Prefer `ease-out`.

## Empty states

Every empty state has: a subtle SVG illustration or icon (not emoji), a headline (`font-serif`), sub-text explanation, and a primary CTA button.

## Accessibility

- All icon-only buttons need `aria-label`.
- Decorative SVGs need `aria-hidden="true"`.
- Color contrast must meet WCAG AA (4.5:1 for normal text).

## Design change tracking

- All significant design changes are logged in `docs/design-improvement-plan.md` under the Change Log table.
- UX issues that can't be fixed immediately go into the "UX Issues" section with a checkbox.
