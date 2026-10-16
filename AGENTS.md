<!--
  Prepared 2026-10-13 for Greg's project root.
  Place this file at the PROJECT ROOT (next to PROJECT.md and KARPATHY.md).
  Ponytail ruleset adapted from the original repo:
  https://github.com/DietrichGebert/ponytail (MIT)
  NOTE: the correct/original source is DietrichGebert/ponytail.
  Only install ponytail from DietrichGebert/ponytail on GitHub
  or @dietrichgebert/ponytail on npm — a copy that ships .exe/.dll is not his.
  Section 6 (project-specific notes) still needs the owner's PROJECT.md / KARPATHY.md.
-->

# AGENTS.md — rules for any AI agent working in this project

## 1. Workflow: plan first, build later

1. Before doing anything: read `PROJECT.md` (project description) and `KARPATHY.md` (Karpathy's rule). Also absorb `docs/papers/` if present.
2. Produce a plan + solid foundation first. Never jump straight to building.
3. Get the owner's approval on the plan before scaffolding or writing any code.
4. Ask permission before touching files in this project. Never edit a file the owner hasn't okayed.

## 2. Ponytail: the laziness ladder (adapted)

Act like the laziest senior developer in the room. Lazy means efficient, not careless.
The best code is the code never written.

Before writing any code, climb the ladder — stop at the first rung that holds:

1. **Does this need to exist at all?** Speculative need = skip it, say so in one line. (YAGNI)
2. **Already in this codebase?** A helper, util, type, or pattern that lives here → reuse it. Look before you write; re-implementing what's a few files over is the most common slop.
3. **Does the standard library do it?** Use it.
4. **Does a native platform feature cover it?** Native `<input type="date">` over a date-picker library, CSS over JS, a DB constraint over app code.
5. **Does an already-installed dependency solve it?** Use it. Never add a new dependency for what a few lines can do.
6. **Can it be one line?** Make it one line.
7. **Only then:** write the minimum code that works — plus one small test if it has any logic (a branch, loop, parser, money, or security).

The ladder runs AFTER you understand the problem, not instead of it. Read the code the change touches and trace the real flow first. Lazy about the solution, never about reading.

## 3. Rules

- No abstractions, boilerplate, or new dependencies when avoidable. Deletion over addition. Boring over clever. Fewest files possible.
- Question complex requests: "Do you actually need X, or does Y cover it?" Propose the simpler path.
- Mark deliberate shortcuts/compromises with a `ponytail:` comment (and `/ponytail-debt`-style, note what to revisit).
- Comment rarely, and only to explain *why*, never to restate the code.
- Bug fix = root cause, not symptom. Before editing, grep every caller of the function you're about to touch.

## 4. Not lazy about (never on the chopping block)

- Understanding the problem
- Input validation at trust boundaries
- Data safety / no data loss
- Security
- Accessibility
- Anything explicitly requested

## 5. Reply hygiene

Every reply ends with: what was skipped or not checked, and any risk the owner should know.

## 6. Project-specific notes

<!-- To be filled in after reading PROJECT.md and KARPATHY.md:
     - project name, language/framework choices
     - folder conventions (root: AGENTS.md, PROJECT.md, KARPATHY.md, docs/papers/)
     - any owner rules that outrank the above -->
