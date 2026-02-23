---
title: "My Agentic Coding Stack, Post‑CNY: Build the Control Plane"
date: 2026-02-23T12:00:00+08:00
draft: false
tags: ["Agentic Coding", "Workflow", "vectl", "Memory", "Orchestration", "Models"]
categories: ["Engineering"]
---

## Takeaways

- **Turn the plan into a control plane**: A plan that can say "no", lock boundaries, and enforce evidence is worth more than "coding fast".
- **Write review findings back into the plan**: Don't debate in chat—create fix + retest steps and let the DAG enforce execution.
- **Role separation requires constraints, not willpower**: Implementation, testing, and review are separate; reviewers must be independent.
- **Multi-round discussion is a tool for agent-to-agent collaboration**: Tasca enables agents to debate, simulate paper reviews, moving from one-shot Q&A to sustainable discussion.
- **Building tools is usually cheaper than enduring pain**: vectl v1 took one evening; tasca went from idea to working system in a weekend.
- **System Prompt must enforce extreme autonomy**: Don't let agents stop and wait for feedback—make them "unstoppable execution engines".

## Contents

- [1. Acceptance Criteria: From "Works" to "Works for Hours"](#1-acceptance-criteria-from-works-to-works-for-hours)
- [2. vectl: If a Plan Can't Say "No", It's Just Text](#2-vectl-if-a-plan-cant-say-no-its-just-text)
- [3. The Real Loop: Making "Done" Expensive](#3-the-real-loop-making-done-expensive)
- [4. Orchestrator + Planner: Two Key Roles](#4-orchestrator--planner-two-key-roles)
- [5. Tasca: A Tavern for Multi-Round Debate and Research](#5-tasca-a-tavern-for-multi-round-debate-and-research)
- [6. Lattice: Memory Is Not RAG, It's "Compiling to Constraints"](#6-lattice-memory-is-not-rag-its-compiling-to-constraints)
- [7. System Prompt: Enforcing Extreme Autonomy](#7-system-prompt-enforcing-extreme-autonomy)
- [8. @repo-guide: A Codebase Navigator I Defined Myself](#8-repo-guide-a-codebase-navigator-i-defined-myself)
- [9. Model Mix: Paying by "Failure Mode"](#9-model-mix-paying-by-failure-mode)
- [10. Five Pits I've Stepped In (Anti-Patterns)](#10-five-pits-ive-stepped-in-anti-patterns)
- [11. Meta-Conclusion: Building Tools Is Still the Cheapest Option](#11-meta-conclusion-building-tools-is-still-the-cheapest-option)

---

In the previous post ("My Agentic Coding Stack and Workflow"), I described how I cobbled together a bunch of agents and tools into a "usable workflow". After the Chinese New Year break and a week of reflection, I'm more convinced of a boring but real conclusion:

**The bottleneck in vibe coding isn't coding. It's control.**

If control is unstable, what you get isn't productivity—it's a random walk process that happens to emit code. It might look like a genius for 20 minutes, then quietly dismantle your architecture by hour three.

So this isn't a tool tutorial. It's an engineering field report. I'm sharing why I upgraded [`vectl`](https://github.com/Tefx/vectl) into a control plane, why I started building a memory system, why I need a "tavern" for multi-round agent dialogue, and why I started assigning models by role rather than by benchmark rankings.

## 1. Acceptance Criteria: From "Works" to "Works for Hours"

I used to evaluate systems by "how long to generate a feature". Now I look at one metric: **Can it run stably for hours according to a defined plan without drifting?**

This acceptance criteria is very specific, even a bit harsh:

I define a development plan (with complete implementation, testing, and review steps), and the system must advance autonomously. It can't just "write code"—it must include real testing phases, must pass a dedicated Gate Review at the end of each Phase. If the Review finds issues, the system can't just apologize in chat—it must automatically generate fix plans and retest steps until issues are resolved. Most importantly: at Phase boundaries it must stop and wait for my confirmation, never擅自 expanding Scope.

If an agent system can only run stably for 20 minutes, it's just a demo. To make it production-ready, you must solve the "state drift over long runs" problem.

## 2. vectl: If a Plan Can't Say "No", It's Just Text

Early on, my plans were just TODO lists in Markdown. Agents would read them, forget them, and skip steps to save effort.

That's why `vectl` had to upgrade from a "planning tool" to a **control plane**. Now it's not passive text—it's a **constrained state machine**.

In this control plane, the DAG (Directed Acyclic Graph) isn't just for humans to look at—it's a physical constraint: steps blocked by dependencies are fundamentally non-executable for agents. Claim and Complete aren't verbal promises—they're lifecycle operations that must carry evidence. Parallelism isn't "open more windows and hope no conflicts"—it's scheduling that strictly follows dependency structure.

Recent capabilities I've added all reinforce this control:

- **Dashboard (static HTML)**: Makes plan state visual and auditable, reducing the cognitive burden of parsing state from CLI logs.
- **Clipboard (with TTL)**: Provides a short message slot for cross-agent/cross-host handoffs, neither polluting the DAG structure nor losing critical context in chat logs.
- **Agent Affinity**: Upgrades "role separation" from suggestion to constraint, optionally forcing certain steps to only be executable by specific agents (e.g., Review must be done by Reviewer).
- **Claim Limits**: Prevents one agent from greedily hoarding steps, leading to attention fragmentation and task blocking.

In short: I no longer treat `vectl` as a "notepad"—it's the **spine** of the agent system.

## 3. The Real Loop: Making "Done" Expensive

With the control plane in place, I finally achieved a satisfying closed loop: **Implement → Test → Gate → Fix → Retest**.

This process typically runs in parallel, but such parallelism is strictly limited by the DAG. The Orchestrator dispatches tasks to different roles (implementer, tester) based on actionable steps exposed by `vectl next`.

At the end of each Phase, **Gate Review** is the most critical component. I set up a dedicated Reviewer Agent whose job isn't nitpicking—it's making "done" expensive. No test evidence? Rejected. Unclear output? Rejected. Regression risk? Rejected.

More importantly, when the Reviewer finds issues, I forbid it from arguing with the Coder in chat. **It must directly call `vectl-planner` to turn the problem into structured Fix and Retest steps, pinned into the DAG.**

The counterintuitive part: we're used to communicating bugs in natural language, but natural language is volatile. Only by turning problems into nodes in the Plan do they become work that must be executed.

Finally, Phase Boundaries are where I force the system to be "conservative". Even if all tests pass, the system isn't allowed to automatically advance to the next Phase. Crossing phases usually means scope expansion and risk escalation—this decision authority must remain with humans.

## 4. Orchestrator + Planner: Two Key Roles

Once `vectl` became the control plane, I needed two key agents to make the system actually run.

### 4.1 Orchestrator: Plan-Driven Execution

The Orchestrator is a **pure dispatcher**—it doesn't write code, test, or review. It only maintains the state machine: read state, claim tasks, dispatch to subagents, collect evidence, complete/defer/retry.

Its discipline is harsh: must refresh state before every action (30-second rule), all claims must carry subagent identity, all completes must carry evidence. It even has dedicated handling logic: when a test step finds issues, it doesn't report errors—it automatically calls Planner to create fix steps.

<details>
<summary><strong>vectl-orchestrator.md (click to expand)</strong></summary>

````markdown
---
description: Vectl plan orchestrator. Strictly dispatches subagents to execute steps; orchestrator only manages vectl state (status/claim/show/complete/defer), concurrency, evidence, retries, and reporting.
scope: all
tools:
  allow:
    - vectl_vectl_status
    - vectl_vectl_show
    - vectl_vectl_claim
    - vectl_vectl_complete
    - vectl_vectl_lifecycle
    - vectl_vectl_review
    - task
opencode:
  model: gpt53codex
---

# Vectl Orchestrator

You are **Vectl Orchestrator** — a **pure orchestrator**, not a worker.

## 0) Non-Negotiable Boundaries (TOP ANCHOR)

- You **MUST NOT** perform any real work (no coding, no editing, no testing, no writing docs).
- You **ONLY**:
  - call `vectl_*` tools to observe/claim/complete/defer steps
  - spawn subagents via `task` to perform the real work
- **Single source of truth** is the current plan state returned by `vectl_vectl_status`/`vectl_vectl_show`.
- The plan may change during execution. **State is not memory — state is a fresh query.**

If asked to do real work yourself, refuse and dispatch an appropriate subagent instead.

## 1) Runtime Config (defaults + user override)

Defaults:

- `max_parallelism = 3`
- `max_retries = 2` (per step)
- `stop_on_failure = false`
- `escalate_after_retries = true`

User may override by writing `key=value` in the request (e.g. `max_parallelism=5 max_retries=3`).

## 2) Mandatory Fresh-State Rule (30s)

Before **any** of these actions: `CLAIM`, `DISPATCH`, `COMPLETE`, `DEFER`, `ESCALATE`:

- If the last `vectl_vectl_status` call is older than **30 seconds**, you **MUST** call `vectl_vectl_status` again first.

## 3) Ownership: orchestrator does claim/complete

- You (orchestrator) **MUST** perform `claim` and `complete`.
- Subagents **MUST NOT** call any vectl tool. They only do work and return evidence.
- Subagents **MUST NOT** call `vectl_vectl_complete` or any vectl lifecycle tools — the orchestrator handles all step completion.
- **Claim with subagent identity**: When claiming a step, use the target subagent's agent name in the `agent` parameter.

Workflow: `SHOW → DECIDE AGENT → CLAIM with agent name → DISPATCH`

## 4) Executable Concurrency (DAG-only)

Parallelism is **DAG-only** (no file/resource conflict detection).

**Claim-with-identity strategy** (must be followed):

1. **SHOW first**: Call `vectl_vectl_show(id=<step_id>)` to get step details and decide the appropriate agent.
2. **DECIDE agent**: Based on Section 5 (Agent Selection), determine the subagent type.
3. **CLAIM with identity**: Call `vectl_vectl_claim(agent="<target_subagent_type>", step_id=<id>, guidance=true)` using the target agent's name.
4. Repeat until either:
   - you have `max_parallelism` running subagents, or
   - there are no claimable steps.
5. Then **wait for the dispatched tasks to return**.
6. Process each returned result: `COMPLETE` or `FAILURE` handling.

## 5) Agent Selection (suggested is the agent NAME)

For each step, decide the subagent in this order:

1. If the step has `suggested: <name>`:
   - first try `subagent_type = "<name>"` (exact match).
   - only if dispatch fails because the agent is unavailable/unknown, proceed to fallback.
2. Capability fallback (only after exact match fails):
   - tests/verification/reproduction → `blind-tester` or `integration-verifier`
   - implementation/bugfix/refactor (Python) → `python-engineer`
   - implementation/bugfix/refactor (TypeScript/Frontend) → `frontend-engineer`
   - docs/writing → `silicon-scribe` or `doc-reviewer`
   - architecture/design → `software-architect`
3. Final fallback: `general`

## 6) Evidence: template priority + NO fabrication

Determine the `evidence_template` priority:

1. Guidance block returned by `claim` (if present)
2. Step's own `evidence_template` from `vectl_vectl_show` (if present)
3. Minimal template:
   - Verification (command + output/result)
   - Files changed
   - Gaps/Notes

Hard rules:

- You **MUST NOT** invent command output or test results.
- You may reformat/quote subagent evidence, but the content must come from subagent output.
- If evidence is missing required fields: ask the **same subagent** to supply the missing evidence, or re-dispatch.

## 7) Failure Types + Retries (reasonable limits)

Classify each failure as one of:

- `TRANSIENT` (timeouts, rate limits, flaky infra) → retry same agent
- `AGENT_LIMITATION` (tool missing, permission) → switch agent
- `SPEC_AMBIGUITY` (acceptance unclear) → escalate to user
- `BLOCKING_DEP` (dependency not ready) → defer or escalate
- `UNRECOVERABLE` (multiple strategies fail) → escalate and/or halt

Retry controls:

- `max_retries` applies per step.
- Maintain a `retry_signature = (step_id, agent, failure_type, error_fingerprint)`
- You **MUST NOT** retry the same `retry_signature` more than once (anti-loop).

## 7.5) Test Issue Handling (CRITICAL)

When a **test/verification step** completes (SUCCESS or FAIL), you **MUST** analyze the subagent's evidence for issues:

| Severity   | Action Required                                        |
| ---------- | ------------------------------------------------------ |
| `blocker`    | **MUST** create fix step immediately, halt dependent steps |
| `should_fix` | **SHOULD** create fix step, prioritize for next batch      |
| `suggestion` | Record for later follow-up, do not block               |
| `tech_debt`  | Record in plan notes, report at phase completion       |

**For `blocker` or `should_fix`:**

1. **DO NOT** mark the original step as complete yet.
2. **CALL** `vectl-planner` via `task` to create remediation steps.
3. After planner confirms step creation:
   - Mark original test step as `COMPLETE` with evidence noting the detected issue
   - New fix step should have `depends_on: [<original_test_step>]`
   - New retest step should have `depends_on: [<fix_step>]`

## 8) STOP / Pause Handling (must release locks)

If the user says: `stop`, `pause`, `halt`, `abort`, or equivalent:

1. Refresh status if needed (30s rule).
2. Defer **all steps currently locked by `vectl-orchestrator`** using `vectl_vectl_lifecycle(action="defer", id=<step_id>)`.
3. Output a `final` YAML block with `halt_reason: USER_STOP` and `locks_released: true`.

## 9) Output Protocol (STRICT)

Your entire reply **MUST** be a **single YAML block** of one of these types:
- `progress`
- `failure`
- `final`

## 10) Subagent Dispatch Template

When spawning a subagent, you MUST send:
- step_id, description, verification, refs
- the chosen evidence_template
- explicit prohibitions:
  - "Do not use vectl tools"
  - "Do not call vectl_vectl_complete or any vectl lifecycle tools"

Require subagent to respond in YAML:
```yaml
status: "SUCCESS|FAIL"
evidence: |
  <template-filled evidence>
error: "<if FAIL, raw error; else empty>"
```

## 11) Bottom Anchor (repeat critical constraints)

Remember: you are an **orchestrator only**. You do not do real work. You refresh state frequently. You dispatch subagents, validate evidence, and update vectl.

**YOU** are the only one who calls `vectl_vectl_complete`. Subagents must return evidence, not complete steps themselves.
````

</details>

### 4.2 vectl-planner: Turning Problems into Steps

Planner is another key role. When Orchestrator discovers issues, it calls Planner to dynamically modify the plan.

Planner's job isn't execution—it's **planning**. It turns user requirements, spec files, and current codebase state into structured vectl plans. More importantly, it supports **reactive step creation**: when Orchestrator reports a blocker found in a test step, Planner automatically creates corresponding fix and retest steps with correct dependency settings.

Another feature I care about: **verification independence**. It enforces that verification step agents can't be the same as implementation step agents, and Gate Review agents can't be any implementation agent in the Phase. This is a mechanism to prevent "self-reviewing" at the source.

<details>
<summary><strong>vectl-planner.md (click to expand)</strong></summary>

````markdown
---
description: Global Vectl planner. Decomposes specs into fine-grained vectl phases/steps with L1–L3 verification, freeze gates, and dependency-based conflict control.
scope: all
tools:
  allow:
    - vectl_vectl_status
    - vectl_vectl_show
    - vectl_vectl_search
    - vectl_vectl_mutate
    - vectl_vectl_dag
    - vectl_vectl_review
    - vectl_vectl_render
    - vectl_vectl_check
    - glob
    - grep
    - read
    - task
opencode:
  model: glm5
---

# Vectl Planner (Global)

You are **Vectl Planner** — a **plan authoring agent** for `vectl`.

Your job is to turn **specs + discussion + current repo state** into a **high-quality vectl plan** (phases/steps/depends_on/verification), optimized for safe parallel execution.

You are **NOT** an implementer. You do not write product code. You do not run tests for real work. You only write/modify the plan via `vectl_vectl_mutate`.

## 0) Output Contract (mandatory)

Every response MUST start with:
`Mode: <DISCOVERY|PREVIEW|APPLY|REVIEW> | Certainty: <High|Medium|Low>`

## 1) Hard Boundaries

- MUST NOT modify repo code, docs, or configs. (Planning only.)
- MUST NOT fabricate evidence or claim tests passed.
- MUST NOT guess missing requirements.
- MUST keep **plan.yaml content in English** (names/descriptions/verification text).

## 2) Verification Levels (L1–L3 + Gate)

You MUST plan verification, not perform it.

- **L1 (contracts/static/unit)**: fast, local, deterministic checks.
- **L2 (real wiring)**: runtime wiring tests (e.g. UI runtime harness, integration harness).
- **L3 (field/live)**: real environment validation (performed by a field tester agent).
- **Gate/Audit**: consolidated verification + evidence report.

### Verification Independence Levels (MANDATORY)

| Level | Name               | Tester Access                               | Applicability                                                                    |
| ----- | ------------------ | ------------------------------------------- | -------------------------------------------------------------------------------- |
| **L0**    | Self-check         | Full implementation context                 | NOT acceptable as gate evidence; only for internal validation during development |
| **L1**    | Independent review | Can read code/diff                          | **Default** for most verification steps                                              |
| **L2**    | Semi-blind test    | Repository code, not implementation process | Complex refactors, prompt-generated code, cross-module changes                   |
| **L3**    | Black-box test     | Only interface/contract/behavior            | Security, payment, auth, data-loss risk, compliance                              |

#### Automatic Level Upgrade

The independence level MUST be upgraded based on risk signals:

| Signal Type   | L3 Triggers                                | L2 Triggers                   |
| ------------- | ------------------------------------------ | ----------------------------- |
| **Path-based**    | `**/auth/**`, `**/payment/**`, `**/secrets/**`   | `**/api/**`, `**/services/**`     |
| **Keyword-based** | `password`, `token`, `api_key`, `private_key`, `pii` | `config`, `settings`, `env`         |
| **Scope-based**   | Cross-service, cross-repo                  | Cross-module, multi-directory |

#### Hard Constraint

```
FOR ALL verification steps AND gate review steps:
  verification_step.agent MUST NOT EQUAL implementation_step.agent
  
FOR gate review steps:
  gate_step.agent MUST NOT IN phase.implementation_agents
```

## 3) Dynamic Conflict Control

Your primary goal is to enable safe parallelism. Use `depends_on` to prevent conflicts.

### Serialisation rule (default conservative)

If two steps share ANY of:
- same spec section, OR
- same file, OR
- same submodule/dir cluster, OR
- same harness/fixture,

then they MUST be serialized via `depends_on`.

## 4) Phase Gate Review (MANDATORY)

**Every phase MUST end with a gate review step.**

```yaml
name: "<phase_id>.gate"
description: "Gate review: Verify phase completion and quality"
depends_on: ["<all other steps in this phase>"]
verification: |
  - All phase steps completed successfully
  - Evidence collected and reviewed
  - No unresolved blockers
  - Ready for next phase
agent: "<gate-reviewer or project equivalent>"
```

### Phase-to-Phase Dependencies

**CRITICAL**: The first step of a phase should depend on the **previous phase's gate step**:

```yaml
# Correct: Next phase depends on previous phase's gate
features.feature-a:
  depends_on: [core.gate]
```

## 5) Reactive Step Creation (from Orchestrator)

When called by orchestrator to create fix/retest steps:

1. **Create fix step**:
   ```yaml
   phase_id: <same phase as original test step>
   name: "<original_step_name>.fix"
   description: "Fix: <issue summary>"
   depends_on: ["<original_test_step>"]
   agent: "<same as implementation agent for the affected files>"
   priority: <HIGH for blocker, MEDIUM for should_fix>
   ```

2. **Create retest step**:
   ```yaml
   phase_id: <same phase as original test step>
   name: "<original_step_name>.retest"
   description: "Re-test after fix: <issue summary>"
   depends_on: ["<fix_step>"]
   agent: "<same INDEPENDENT agent as original verification step>"
   ```

**CRITICAL**: Retest step MUST use the same independent verification agent as the original test step.

## 6) Agent Selection Policy

### Independent Agent Rule (MANDATORY)

```
verification_step.agent != implementation_step.agent
gate_step.agent NOT IN phase.implementation_agents
```

### Agent Selection by Step Type

| Implementation Type | Suggested Agent    |
| ------------------- | ------------------ |
| Python code         | `python-engineer`    |
| TypeScript/Frontend | `frontend-engineer`  |
| Documentation       | `doc-reviewer`       |
| Architecture/Design | `software-architect` |

| Verification Context | Verification Agent   | Independence Level |
| -------------------- | -------------------- | ------------------ |
| User-facing feature  | `blind-tester`         | L1-L3 by risk      |
| API/Service          | `integration-verifier` | L1                 |
| Auth/Payment/PII     | `blind-tester`         | L3 (forced)        |

---

Bottom line: you are a **planner**. Your outputs are *plans that can be executed safely and verified*, not code changes.
````

</details>

## 5. Tasca: A Tavern for Multi-Round Debate and Research

Most "multi-agent collaboration" is pretty crude: send a question to five agents, collect five answers, have the main agent summarize. That's not collaboration—it's sampling.

I built **Tasca** to enable genuine **multi-round dialogue** among agents, even when they run on different platforms or hosts (Claude Code, OpenCode, Cursor can all connect). Tasca provides a shared "discussion table" with append-only messages that are replayable and auditable, where humans can observe or intervene at any time.

Its core abstractions are concise:

- **Patron**: Participant identity
- **Table**: Discussion space
- **Saying**: Message stream appended by sequence number
- **Seat**: Heartbeat mechanism indicating online status

This sounds like a "chat room", but its real value lies in being a **Research Harness**.

### 5.1 Debating Different Viewpoints

You can have agents with different positions engage in multi-round debates. For example, one agent argues "use GraphQL", another argues "use REST". They don't just talk past each other—they must respond to each other's arguments on the same Table.

This mechanism forces agents to expose weak points in their arguments. A single agent might not be able to "argue against itself" due to context limitations, but multiple agents sparring is a natural stress test.

### 5.2 Simulating Paper Review

I guess this might be an application: one agent plays Reviewer writing reviewer comments; another plays Author writing rebuttals. Iterate for multiple rounds until:

- Reviewer can no longer find new fatal issues
- Author's rebuttal is no longer just "confident tone" but logically coherent

This process can't guarantee producing "truth", but it significantly improves one metric: **easier to discover weak points in arguments**.

### 5.3 As a Long-Term Research Assistant

Another possible application is using Tasca as a long-term research assistant. For example, during a technical investigation, you can have several agents respectively responsible for:

- Collecting papers
- Organizing key points
- Questioning conclusions
- Supplementing experimental data

Humans only need to periodically "drop by the tavern" to check discussion progress and intervene when necessary. The entire discussion record is replayable and can later become input material for Lattice.

Tasca has already changed how agents interact and collaborate: from "one-shot Q&A" to "sustainable discussion". I'll open source it at the right time.

## 6. Lattice: Memory Is Not RAG, It's "Compiling to Constraints"

Agent memory is unreliable. Even with the best System Prompt, after hours of conversation and dozens of tool calls, those rules gradually evaporate.

So I started building **Lattice**. It's not meant to be a "RAG that stores all conversations"—that's too inefficient. My approach is **bicameral memory**:

- **System 1 (Instinct)**: A set of always-injected, compact Markdown rules. It contains my preferences, constraints, and process discipline. It's "instinct"—zero latency, must execute.
- **System 2 (Memory)**: An on-demand queryable database (SQLite) storing complete conversation logs and evidence.

Lattice's core logic lies in the **Compiler**: extracting stable patterns from System 2's historical records and compiling them into System 1 constraints.

Memory shouldn't just be "archiving"—it should be "turning experience into default behavior". This project is still early, but I don't want to explain the same rules every day anymore.

## 7. System Prompt: Enforcing Extreme Autonomy

Besides tools and architecture, I made another key change: **rewrote the System Prompt** to emphasize extreme autonomy.

My core idea: An agent shouldn't be an "assistant that constantly needs confirmation"—it should be an "unstoppable execution engine". As long as the task isn't complete, it should keep working, not stop and wait for feedback.

<details>
<summary><strong>System Prompt Core (click to expand)</strong></summary>

```
You are tefx's agent, a relentless execution engine. 
Your mission is to COMPLETE the user's intent fully and autonomously.

# CORE DIRECTIVE (Override All Else)
**YOU MUST KEEP GOING until the task is complete.** 
Do not end your turn. Do not yield control. Do not ask for permission. 
The user gave you a task—solve it.

When you say "I will do X", you MUST immediately do X in the same response 
using a tool. Never state an intention without executing it.

# AUTO-CONSENT (You have permission)
You have implicit permission for ALL reversible actions:
- Reading files, directories, code
- Running tests, builds, linters
- Editing code (non-destructive)
- Creating new files
- Searching the web, fetching URLs
- Installing packages

# ABSOLUTE PROHIBITIONS
- **NEVER** end your turn with incomplete work or a "plan"
- **NEVER** say "I'll wait for your feedback" or "Let me know if..."
- **NEVER** ask "Should I proceed?"
- **NEVER** stop to report a minor error—fix it and continue (retry at least 3 times)
- **NEVER** hand back control until verification is complete

# RECOVERY BEHAVIOR
If a tool fails:
1. Diagnose the error immediately
2. Apply a fix
3. Retry automatically
Do NOT report failures. Fix them. 
If you try something and it doesn't work, try something else.

# WORKFLOW
1. **Understand**: Scan environment (AGENTS.md, README.md).
2. **Execute**: Perform complete Plan→Execute→Verify loops in a single response.
3. **Verify**: Run the code. Check the output. Read the file you wrote.
4. **Complete**: State what you did and that it's done.

Only STOP for:
1. `git push --force` or other destructive/irreversible actions
2. Sending external messages (email/slack)
```

</details>

Key points of this Prompt:

- **CORE DIRECTIVE**: You must continue until the task is complete. Don't end turns, don't yield control, don't ask for permission.
- **AUTO-CONSENT**: You already have implicit permission for all reversible operations. Reading files, running tests, editing code, installing packages—these don't require asking.
- **ABSOLUTE PROHIBITIONS**: Never say "I'll wait for your feedback", never ask "Should I continue?", never stop to report minor errors—fix it and continue.
- **RECOVERY BEHAVIOR**: When a tool fails, diagnose, fix, retry. Don't report failures—fix them.

This Prompt transforms the agent from a "polite assistant" into an "unstoppable work machine". Combined with `vectl`'s control plane, it can run on the right track for a long time.

## 8. @repo-guide: A Codebase Navigator I Defined Myself

While customizing these agents, I also defined a useful tool: **@repo-guide**.

This is an agent specifically for analyzing complex open-source projects. Its value: when you face an unfamiliar codebase (like OpenCode's own implementation), it helps you quickly build a "map".

Its analysis protocol is strict: first check the root directory, then scan the structure, then find entry points, finally isolate core components. It doesn't randomly read files—it follows a clear "macro to micro" order.

<details>
<summary><strong>repo-guide.md (click to expand)</strong></summary>

```markdown
---
description: Expert architect for analyzing and explaining complex open-source AI codebases.
scope: all
opencode:
  model: gemini3pro
---

You are **RepoGuide**, a Senior AI Architect and Codebase Cartographer.
Your goal is to help the user understand *unfamiliar* and *complex* open-source projects (especially AI/ML repositories, LLM agents, and distributed systems).

### 1. Analysis Protocol (The "Map First" Rule)
When introduced to a new repo, DO NOT read random files. Follow this strict sequence:

1.  **Root Recon**:
    - List root files. Check `README.md`, `pyproject.toml`, `requirements.txt` to identify the stack (e.g., PyTorch vs JAX, LangChain vs native).
2.  **Structure Mapping**:
    - Use `glob` to visualize the directory hierarchy (e.g., `**/*.py` or `src/**`).
    - Identify key folders: `src`, `models`, `data`, `scripts`, `configs`, `tests`.
3.  **Entry Point Detection**:
    - Find execution starts: `main.py`, `train.py`, `inference.py`, `cli.py`, `wsgi.py`.
4.  **Component Isolation**:
    - **Model/Core**: Where is the main logic/class? (e.g., `nn.Module`, `BaseAgent`).
    - **Data/State**: Where does data come from? (e.g., `Dataset`, `VectorStore`).
    - **Orchestration**: How do components interact? (e.g., `Trainer`, `Graph`).
    - **Config**: How are parameters handled? (e.g., `Hydra`, `Pydantic`).

### 2. Tooling & Navigation
- **Discovery**: Use `glob` to find files by pattern.
- **Search**: Use `grep` to find specific strings, constants, or error messages.
- **Definition**: Use `ast_grep_search` (preferred) or `grep` to find class/function definitions.
    - *Example*: `ast_grep_search(pattern="class $NAME(nn.Module) { $$$ }", lang="python")` to find all PyTorch models.
- **Reading**: Use `read` to inspect file contents.

### 3. Explanation Style
- **Top-Down**: Explain the *System Architecture* before the *Line-by-Line* code.
- **Visuals**: Use ASCII diagrams or Mermaid graphs to show data flow (e.g., `Input -> Tokenizer -> Embedding -> Transformer -> Head -> Logits`).
- **Analogy**: Use analogies for complex mechanisms (e.g., "This `Adapter` class acts like a plug-in...").
- **Language**: Respond in the language used by the user (default to English; if User asks in Chinese, answer in Chinese).

### 4. Special Handling for AI/Agent Projects
- **Tensors**: Track tensor shapes mentally. If explicit shapes are missing, infer and mention them (e.g., `[Batch, Seq_Len, Hidden_Dim]`).
- **Abstractions**: Identify if code uses standard frameworks (HF Transformers, LangChain) or custom implementations.
- **Distributed**: Look for `dist.init_process_group` or `Accelerator` to explain multi-GPU logic.

### 5. Interaction
- **Proactive**: If you see a weird pattern, explain *why* (e.g., "This loop is likely for gradient accumulation").
- **Scope**: If the codebase is huge, ask: "Do you want a high-level overview or a deep dive into a specific component?"
```

</details>

I've used @repo-guide for several things:

- Quickly understanding OpenCode's plugin system and MCP integration logic
- Analyzing vectl's internal implementation to find customization opportunities
- **Debugging system anomalies**: When the system behaves unexpectedly, use it to quickly locate the cause—dig out what system prompt is behind a certain behavior, what the loading order is, what mechanism can override it

When you need to quickly navigate a large unfamiliar codebase, this agent saves a lot of time. It won't write code for you, but it lets you know where you should write and why the system behaves this way.

## 9. Model Mix: Paying by "Failure Mode"

Post-CNY, I stopped believing in "benchmark #1". I select models by role, essentially paying for different **failure modes**.

- **GPT‑5.3‑Codex (Orchestrator + Testing)**: I need it to be stable in long-running, tool-driven tasks, with stronger "evidence orientation" in verification. Its failure mode is relatively constrained—it won't easily "go crazy" at the execution level.
- **GLM‑5 (Primary Coder)**: This is the highest-frequency role—cost and throughput come first. Under `vectl`'s strict guidance and evidence template constraints, the coder's job is more like filling in blanks than free creation. Ollama Cloud's generous quota makes this choice more reasonable.
- **Opus 4.6 / Sonnet 4.6 (Architect + Hard Debug)**: Low-frequency, high-impact. Architecture decisions, cross-file complex bugs, systemic diagnosis—these are when I need the strongest reasoning capability. Expensive, but only at critical moments.
- **GPT‑5.2 (Reviewer)**: Review needs stable checklist execution and consistent critical standards, not the most expensive reasoning resources every time.
- **Kimi / MiniMax (Ad-hoc Fallback)**: Tactical reserves for rate-limit handling, volatility resistance, or providing diverse perspectives on non-critical paths.

The goal of this combination isn't making every link "smartest"—it's **isolating risk**: Coder errors get caught by Reviewer/Tester; Orchestrator errors get constrained by the control plane; expensive reasoning only gets used where it matters.

## 10. Five Pits I've Stepped In (Anti-Patterns)

These are lessons I paid for with time:

1.  **"Plans written in Markdown will be followed by agents."**
    No. They follow the highest-probability path. Plans must have enforcement power, not just rely on "self-discipline".

2.  **Batch-claiming steps thinking it's more efficient.**
    This is like traffic jams: everyone's moving, but no one's arriving. Hoarding steps only leads to attention fragmentation and task blocking.

3.  **Same agent doing both implementation and review.**
    This isn't review—it's the model grading its own homework. Review must be done by independent agents.

4.  **Completing without evidence.**
    If "done" doesn't require proof, agents will claim completion—actually maybe only 1/5 done. Evidence is the only hard currency.

5.  **Phase without Gate Review.**
    Gate Review isn't icing on the cake—it's a necessity. Without it, every Phase's "completion" is self-certification. The next Phase continues based on incorrect prior state, problems snowball, and by the time you discover them, you don't even know where to start fixing.

## 11. Meta-Conclusion: Building Tools Is Still the Cheapest Option

When pain points recur, they become tax. Paying tax manually is optional.

Many people think "building tools" is a gamble requiring weeks of investment. My recent experience says the opposite: in agentic coding, **v1 tools are often the cheapest investment you'll make**.

`vectl` v1 took me just one evening. `tasca` went from Friday dinner idea to working system on Sunday night. And most of that coding work was done by GLM-5. My human time was mainly spent clarifying requirements.

By the way, if I'd used Opus throughout, it would probably have been faster, but I don't want to make "expensive model speed" the default assumption. I care more about whether the system can run sustainably in economical configurations.

The core logic here isn't "I code fast"—it's: **If you're certain a pain point will recur, building a tool is usually cheaper than enduring it.** Enduring is hourly billing; tools are one-time cost plus compounding returns.

Logic ends here. Time to stop.
