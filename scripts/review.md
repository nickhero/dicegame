# Multi-Model Code Review — v2/multiplayer-backend

Run this review with: `copilot review` or paste this prompt.

## Instructions

Review all changes on `v2/multiplayer-backend` vs `development` using **3 different models** for breadth. For each model, focus on a different angle. Compile findings into a single report with defect tickets.

### Step 1: Get the diff

```bash
git --no-pager diff development..HEAD --stat
git --no-pager diff development..HEAD -- packages/server/src/ packages/shared/src/ packages/client/src/
```

### Step 2: Run 3 parallel code reviews

Launch 3 `code-review` agents in parallel, each doing a **full review** with a different model. The value is diverse perspectives — different models catch different things.

#### Agent A — `claude-opus-4.6`
Full review of all changes. Look for bugs, security issues, architecture problems, resource leaks, race conditions, missing validation.

#### Agent B — `gpt-5.4`
Full review of all changes. Look for bugs, security issues, architecture problems, resource leaks, race conditions, missing validation.

#### Agent C — `gemini-3-pro-preview`
Full review of all changes. Look for bugs, security issues, architecture problems, resource leaks, race conditions, missing validation.

### Step 3: Compile defect tickets

From all 3 reviews, create defect tickets in `.tickets/phase-11-defects/01-bugfixes.md` (append to existing list). Use this format:

```markdown
- [ ] N **Short title** — Description. Severity: critical/high/medium/low. Found by: Agent A/B/C.
```

Only file real defects — not style nits, not "consider doing X", not theoretical concerns. A defect is:
- A bug that will cause incorrect behavior at runtime
- A security vulnerability that can be exploited
- A resource leak that will degrade the server over time
- A race condition that will produce wrong results under load

### Step 4: Verify critical defects

For any critical/high severity defects, verify they're real by examining the code with `view` tool. False positives waste time.

### Step 5: Summary

Produce a table:

| # | Severity | Title | File(s) | Found by |
|---|----------|-------|---------|----------|
| ... | ... | ... | ... | ... |

And a brief assessment: Is this branch safe to merge? What must be fixed first?
