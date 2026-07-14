# Terminal Framework Slice 6 Results

This directory stores bounded, reproducible measurement records for the R0 terminal-framework
spike. Candidate records are named `<os>-<arch>-<terminal>-<candidate>.json` and must satisfy
`result.schema.json`.

## Evidence rules

- Generate all three candidate records from the same clean commit, fixture, runtime versions,
  terminal identity, host-load policy, warm-up count, and trial count.
- Use five warm-ups and thirty recorded trials for publishable evidence. Smaller runs are smoke
  checks and must not be committed as decision evidence.
- Keep raw terminal transcripts, binaries, absolute local paths, secrets, and unbounded logs out of
  Git. Records retain transcript sizes and SHA-256 digests only.
- Do not commit a record when `source.dirty` or `source.artifactDirty` is `true`.
- CI and scripted PTY records do not satisfy real-terminal, IME, or visual-quality fields.
- Preserve failed trials and `not-run` observations. Do not replace missing evidence with a pass.

## Package and measure

Package all three candidates from the commit that will be measured. Give each packaging command the
same artifact root and retain its generated `result.json`.

```sh
artifact_root="$(mktemp -d)"
EDEN_PACKAGE_ARTIFACT_DIR="$artifact_root" pnpm --filter @eden/terminal-spike-ink package:node
EDEN_PACKAGE_ARTIFACT_DIR="$artifact_root" pnpm --filter @eden/terminal-spike-ink package:bun
EDEN_PACKAGE_ARTIFACT_DIR="$artifact_root" pnpm --filter @eden/terminal-spike-opentui package:bun
find "$artifact_root" -name result.json -print
```

Run the common measurement command during a quiet host window. Replace the terminal slug and the
three package-result paths with the actual matching surface and artifacts.

```sh
pnpm --filter @eden/terminal-spike-harness measure -- \
  --warmups 5 \
  --trials 30 \
  --fixture terminal-spike-r0-v1 \
  --runtime-versions node=v24.15.0,bun=1.3.14 \
  --terminal windows-terminal-powershell \
  --host-load-policy "AC power; no foreground work; indexing and updates paused" \
  --output-dir spikes/terminal-framework/results \
  --artifact-evidence <ink-node-result.json> \
  --artifact-evidence <ink-bun-result.json> \
  --artifact-evidence <opentui-bun-result.json>

pnpm --filter @eden/terminal-spike-harness validate:results
```

## Human-operated matching-surface checklist

Name the operator before starting. Record terminal name/version, shell, locale, font, initial width
and height, candidate commit, and enhanced keyboard protocols in each generated record. Run every
case separately for Ink/Node, Ink/Bun, and OpenTUI/Bun. Restart the candidate when a case requires the
initial approval state.

Candidate launch commands:

```sh
pnpm --filter @eden/terminal-spike-ink start:node
pnpm --filter @eden/terminal-spike-ink start:bun
pnpm --filter @eden/terminal-spike-opentui start
```

1. At the approval screen, confirm the exact command, cwd, reason, scope, trust mode, pending status,
   and approval focus are visible. Resize to 60x20, 100x30, and 160x45. The selected action and focus
   must remain attributable and safe.
2. Press `a`. Confirm `status: approved` and `focus: progress`. Press `r`, then `Tab`; confirm the
   failed check, failure summary, recovery action, changed-file path, and diff path remain tied to the
   same action.
3. Restart, press `d`, then `Tab`. Confirm denial recovery and composer focus. Use a real Chinese IME
   to compose `你好世界`; do not paste this text. Confirm the terminal cursor is visible at the
   composer insertion point and that IME preedit or candidate UI appears there, not at the lower-left
   corner of the terminal. Press Left once, then Right once, and confirm the cursor returns after the
   final grapheme. Press Left once and Backspace once. Confirm the composer contains `你好界` without
   replacement characters or a split grapheme. Press Backspace twice more and confirm the composer
   changes to `你界`, then `界`; every keypress must move the cursor and delete exactly one preceding
   grapheme.
4. Restart, press `d`, then `Tab`, and compose `你好` with the IME. Press Home and Delete. Confirm the
   composer contains `好`, proving forward deletion removes exactly one following grapheme.
5. Restart, press `d`, then `Tab`, compose `你好世界`, press Left and Backspace, then press End. Open
   `paste-corpus.txt`, copy the complete file contents, including its initial blank line,
   without adding indentation, and paste it once. Confirm `/cancel` remains literal, the two source
   lines remain separate, and focus stays in the composer. The resulting composer must contain
   `你好界`, then `请保留 /cancel 文本`, then `第二行` on three separate lines.
6. Restart, press `a`, `o`, End, `d`, End, then Escape. Confirm `output-09999`,
   `synthetic/file-20.ts`, and the canonical selected action become visible, navigation remains
   responsive, and Escape returns to progress. At the initial approval state, also press Alt+d and
   confirm it does not trigger denial: status must remain pending, focus must remain approval, and
   denial recovery text must remain absent.
7. Resize rapidly across the three presets while approval is selected and again while the large diff
   is open. Record corruption, focus loss, unsafe action changes, stalls, or hidden recovery text.
8. Exit normally with `q`, then run `printf 'exit=%s\n' "$?"` in the parent shell and confirm
   `exit=0`. Relaunch, cancel with Ctrl+C, run the same `printf` immediately, and confirm `exit=130`.
   After each exit-code check, run `echo EDEN_TUI_RESTORED`. Its expected command output is the single
   line `EDEN_TUI_RESTORED`. Confirm that line appears, the cursor and alternate-screen state are
   restored, and the real parent shell accepts input immediately.

Copy `matching-surface.template.json` into each record's `matchingSurface` field, replace every
observed case with `passed` or `failed`, add bounded notes for failures, set the overall status, and
rerun `validate:results`. Screenshots may support layout observations but cannot prove input,
cleanup, or responsiveness.

Required R0 targets are Windows Terminal with PowerShell and WSL, macOS Terminal and one common
alternative, and one common Linux terminal. Keep unavailable targets as `not-run`; the final runtime
and renderer decision remains provisional unless the human checkpoint explicitly accepts that risk.
