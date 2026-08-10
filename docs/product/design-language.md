# Product Design Language

## Goal

Visual quality means reduced uncertainty, not decorative complexity. The interface should feel calm, dense, and trustworthy during long-running work.

## Principles

- Use stable hierarchy and a restrained palette.
- Reserve semantic colors for status and pair color with text or symbols.
- Prefer structured cards for actions, approvals, checks, and artifacts.
- Show progress summaries rather than raw reasoning.
- Make keyboard paths complete; add mouse support without changing semantics.
- Use motion sparingly and never to imply unverified progress.
- Preserve readability for wide characters, Chinese IME, pasted blocks, and narrow terminals.

## Core components

The first design system covers session row, phase badge, progress card, tool card, approval card, changed-file row, diff view, check result, artifact row, error recovery panel, composer, command palette, and shortcut help.

R2 adds a persistent authority strip, profile/readiness block, context-source summary, model-attempt block,
and read-only semantic-tool card. Spacing, borders, semantic status, emphasis, density, focus,
disabled/awaiting state, and narrow fallbacks use shared tokens rather than component-local decoration.

R3-B turns these elements into one composable product shell: session navigation, transcript, persistent multiline composer, authority/status bar, contextual review drawer, overlays, and a typed tool-card registry. The shared tokens cover semantic color, spacing, border, typography hierarchy, focus, density, disabled state, awaiting state, and theme variants. Component-local values require a measured exception rather than becoming a second design language.

User input and complete model answers remain the primary reading flow. Repository, command, diff, check, approval, recovery, and evidence activity use compact summaries with progressive detail. A shared card envelope controls hierarchy and interaction but never erases typed authority, source, budget, outcome, or recovery facts.

## Accessibility

Support terminal contrast variation, color-blind-safe status encoding, visible focus, screen-reader-friendly text where the renderer permits it, reduced motion, and complete keyboard navigation.
