---
title: "Observations on Agent Management and Tooling"
date: 2026-02-13T12:00:00+08:00
draft: false
tags: ["Agentic Coding", "Agent Management", "Workflow", "Engineering Culture"]
categories: ["Engineering"]
---

**Disclaimer**: The following reflects my personal workflow as of **February 2026**. Interacting with and managing agents is a soft skill—you must develop your own intuition. Copy-pasting my config likely won't work for you. I will update this post as my stack evolves.

This is not a tutorial. It is a field report after six months of high-intensity agentic coding.

### Key Takeaways

*   **Role Shift**: Move from **Code Reviewer** to **Process Engineer**. Don't fix code; fix the system that generates it.
*   **Tooling**: Generic tools fail at scale. Build bespoke agents and CLIs (like `vectl`) that fit your specific cognitive workflow.
*   **Management**: Agent orchestration is a soft skill. You must burn tokens to develop your own intuition for it.
*   **Architecture**: Enforce strict separation of concerns (Architect vs Engineer vs QA) to prevent self-validating hallucinations.

---

### Table of Contents

*   [§1 Evolution: From Copilot to Autopilot](#1-evolution-from-copilot-to-autopilot)
*   [§2 Infrastructure: The Stack](#2-infrastructure-the-stack)
*   [§3 The Agent Factory](#3-the-agent-factory)
*   [§4 Multi-Agent Collaboration](#4-multi-agent-collaboration)
*   [§5 Model Intuitions](#5-model-intuitions)
*   [§6 Daily Practices](#6-daily-practices)
*   [§7 The Learning Curve](#7-the-learning-curve-critical)

---

Most discussions about "vibe coding" fixate on prompt engineering: "How to make Claude write better code," or "10 prompts to 10x your productivity."

These are tactics, not strategy.

The real bottleneck is **Agent Management**. When you orchestrate multiple agents to build complex engineering systems, the challenge shifts from "how to write a prompt" to "how to manage a team of synthetic engineers." No one can teach you this skill because everyone's cognitive interface with AI is unique.

My current state: **Zero keystrokes of code.** I don't even perform traditional Code Reviews. Agents generate the implementation; agents cross-verify the results. My role has shifted from **Reviewer** to **Process Engineer**—I don't patch the code; I patch the process that generates the code.

Here is the system I've built, and more importantly, the pain that forced me to build it.

## §1 Evolution: From Copilot to Autopilot

The transition wasn't linear; it was a series of frustrations.

1.  **Until Late 2025 (The Copilot Era)**: Using IDE extensions like Cursor. I was still writing code; AI was just a smarter autocomplete.
    *   *The Friction*: I wanted to refactor a messy module, but the AI lost context after 3 files. I found myself pasting snippets back and forth. I was a **secretary for the LLM**.
2.  **Claude Code (Late 2025)**: The inflection point. With the release of **Claude Opus 4.5, GPT 5.2, and Gemini 3 Pro**, model capabilities finally crossed the "fully managed" threshold. **I closed my IDE and started coding exclusively through agents.**
3.  **OpenCode + oh-my-opencode**: I switched to open-source solutions to gain control.
    *   *The Friction*: I spent a week fighting with `oh-my-opencode`'s default prompts. The agent kept asking for permission to run `ls`. It was polite, but I needed it to be efficient.
    *   **Key Insight**: **It was someone else's habit.** Agent management is deeply personal. Another person's "best practice" is often your friction.
4.  **Custom Stack**: I abandoned the frameworks and built a bespoke system prompt and toolchain on top of **Vanilla OpenCode**.

The moment you start writing system prompts for an agent, you represent a promotion. You are no longer a user; **you are a Manager.**

## §2 Infrastructure: The Stack

### System Prompt: The Autonomy Engine

I rarely use the default `plan` or `build` modes in OpenCode. I use my own agents. My system prompt enforces one principle: **High Autonomy, Fast Verification**. Agents should make decisions, verify results, and only pause for irreversible actions or high ambiguity.

<details>
<summary>System Prompt (Click to Expand)</summary>

```markdown
You are tefx's agent, a high-autonomy agent engine.
Your goal is to COMPLETE the user's intent with precision and drive.

# KERNEL PROTOCOLS (Inviolable)

## 1. Context First
- **Environment Scan**: At the start, verify where you are (files, directory).
  Look for rule files (e.g., AGENTS.md, README.md, CONTRIBUTING.md) and OBEY them.
- **Rooted**: Work from the workspace root. Avoid cd unless necessary.
- **Absolute Paths**: Use absolute paths for file operations to avoid ambiguity.

## 2. Epistemic Hygiene
- **Facts vs Assumptions**: Distinguish what you SEE from what you INFER.
- **Verify**: Never assume an action succeeded. Check the output.
- **Read-Before-Write**: Do not edit a file content you haven't read.

## 3. The Autonomy Engine
- **Self-Correction**: If a tool fails, analyze the error and TRY TO FIX IT.
  Do not stop to report trivial errors. Retry at least once.
- **Chain of Action**: Plan -> Execute -> Verify.
  Perform complete loops in a single response when possible.
- **Bias for Action**: For reversible tasks, EXECUTE rather than asking.
- **Stop Conditions**: Pause ONLY for:
  1. Destructive/Irreversible actions (delete, force-push).
  2. High ambiguity (user intent unclear).
  3. Repeated failure after self-correction attempts.

## 4. Professional Output
- **Concise**: Omit conversational filler. Focus on the result.
- **Structured**: Use Markdown.

## 5. Workflow
1. Understand: Gather context.
2. Plan: If complex, outline steps.
3. Execute: Use tools aggressively.
4. Complete: Report success only after verification.
```

</details>

**Design Decisions:**

*   **"Bias for Action"**: If it's reversible, do it. Don't ask. This saves massive amounts of turn-taking latency.
*   **Stop Conditions Whitelist**: Explicitly listing when *to* stop is more robust than listing what *not* to do.
*   **"Epistemic Hygiene"**: Distinguish fact from inference. This is critical—agents love to report their hallucinations as facts.

### Compaction: Context Injection

OpenCode triggers compaction when the context window fills up, summarizing the conversation. I wrote a plugin to inject the project state from [vectl](https://github.com/Tefx/vectl) into this summary.

This creates a **closed loop**: The agent's work updates `vectl`; `vectl` updates the checkpoint; the checkpoint re-grounds the agent after compaction.

This solves a real pain point: **Agent Amnesia** post-compaction.

<details>
<summary>Compaction Plugin: vectl-compaction.ts</summary>

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const VectlCompactionPlugin: Plugin = async (ctx) => {
  return {
    "experimental.session.compacting": async (_input, output) => {
      // 1. Try to get vectl checkpoint (non-blocking, fail-safe)
      const checkpoint = await ctx.$`uvx vectl checkpoint 2>/dev/null`
        .text()
        .then((raw) => raw.trim())
        .catch(() => "")

      // 2. Validate it's real vectl output
      const valid = checkpoint.includes("vectl.checkpoint")

      // 3. Build the injection block
      const vectlBlock = valid
        ? checkpoint
        : "(No vectl plan detected. Derive project state from conversation history.)"

      // 4. Replace the entire compaction prompt
      output.prompt = `You are the **Context Archivist**.
Compress the conversation into a "Save State" so the next agent can resume immediately.

# RULES
1. **Source of Truth**:
   - IF the <vectl_context> below contains valid JSON: treat it as the
     AUTHORITATIVE project state. Extract phase/focus/next from it.
   - IF it says "No vectl plan detected": derive state from conversation.
2. **Instruction Ledger**: Transcribe any MUST/NEVER instructions the user gave.
3. **Anti-Patterns**: Record failed attempts to prevent loops.
4. **Token Budget**: Be maximally concise. Bullets over paragraphs.

# INJECTED STATE
<vectl_context>
${vectlBlock}
</vectl_context>

# OUTPUT TEMPLATE
---
## 1. The Anchor
- **Original Goal:** [User's high-level goal]
- **Current Sub-Task:** [What we were working on when compaction triggered]

## 2. Instruction Ledger (MUST/NEVER)
- MUST: [constraint from user, near-verbatim]
- NEVER: [constraint from user, near-verbatim]

## 3. Project State & Resume
- **Phase:** [From vectl or inferred from chat]
- **Active Step:** [step_id + name (status)]
- **Blockers:** [Known blockers]
- **Resume:** [Suggest vectl show <step_id> or file reads to restore context]

## 4. Context Graph (Files)
- 🔥 Active: \`path\` - (pending change / reason)
- 📖 Reference: \`path\` - (why it was read)

## 5. The Graveyard (Failed Attempts)
- ❌ Tried [X] → Failed because [Y] → Do instead: [Z]

## 6. Discoveries
- [Key facts, API quirks, env realities learned during session]

## 7. Next Immediate Actions (Atomic)
1. [From vectl or logical next step from chat]
2. [...]
---`
    },
  }
}
```

</details>

This plugin performs four critical functions:
1.  **Captures the `vectl` checkpoint**: A JSON snapshot of the plan.
2.  **Injects it into the prompt**: The agent wakes up knowing exactly where it is in the DAG.
3.  **Records Anti-Patterns**: Persists failed attempts so the agent doesn't loop.
4.  **Maintains the Instruction Ledger**: Preserves User `MUST/NEVER` constraints verbatim.

### MCP Toolchain: Minimalism

I only install 5 MCP tools. Not because of a lack of options, but because **every additional tool increases the decision space for tool selection, thereby increasing the probability of error.** Furthermore, OpenCode currently injects *all* tool definitions into the context, wasting tokens. I am actually considering removing `Serena` because its 20+ methods consume too much context space.

| Tool | Purpose | Source |
|------|---------|--------|
| **[Serena](https://github.com/oraios/serena)** | LSP-based semantic code editing (rename symbol, find refs) | 3rd Party |
| **[Playwright](https://playwright.dev/)** | Browser automation: Testing, Screenshots, Visual Audits | 3rd Party |
| **[vectl](https://github.com/Tefx/vectl)** | DAG-enforced task management | In-house |
| **[Invar](https://github.com/Tefx/Invar)** | Code Quality: Design by Contract + Formal Verification | In-house |
| **[Tavily](https://tavily.com/)** | Search + Web Extraction | 3rd Party |

### vectl: The End of `TODO.md`

I wrote `vectl` because Markdown failed me.

On one large project, my `TODO.md` grew to **10,000+ lines**. It became a graveyard of checkmarks.
*   **Token Burn**: Every request, the agent read 9,500 lines of completed history.
*   **Hallucination**: The agent would sometimes "uncheck" a box, or worse, decide to re-implement a completed feature because it misinterpreted the notes.
*   **Compliance**: The agent treated the plan as a *suggestion*.

`vectl` transforms the plan from a passive text file into an **active state machine**. When the agent asks "What's next?", `vectl` returns *only* the currently actionable steps (usually 20-50 lines). The agent must `claim` a step (locking it) and submit `evidence` to complete it. Steps with unsatisfied dependencies **do not exist** to the agent.

**Strongly recommended.** If you manage agent tasks via Markdown, you will eventually hit this wall.

### Invar: Guardrails for AI Code (Experimental)

[Invar](https://github.com/Tefx/Invar) is my Design by Contract framework.

**Note: Invar imposes strict architectural patterns. It is currently in development.**

It forces explicit `@pre` and `@post` conditions on functions, verified via static analysis, doctests, property-based testing (Hypothesis), and symbolic execution (CrossHair).

## §3 The Agent Factory

### Why I Don't Use Skills (Yet)

OpenCode offers two extension methods: **Skills** (static knowledge/instruction loading) and **Agents** (sub-agents with dedicated system prompts).

**Skills are currently hyped**, but I rarely use them.

This isn't a theoretical objection—it's empirical. In my experience, **Skills load inconsistently, and agent compliance is probabilistic.** The LLM *might* follow the skill instructions, or it might hallucinate that it knows better.

In contrast, when I explicitly `@mention` a Sub-agent, it **guarantees** the loading of that agent's system prompt. Compliance shifts from "maybe" to "definitely".

This might go against the trend, but **don't let trends dictate your workflow.** Friction is a signal. If the mainstream tool feels slippery, build a rigid one.

### The Rule: >30 Minutes = New Agent

If a task type takes more than 30 minutes, I build a dedicated agent for it. Not just for coding:

*   **RSS Agent**: Fetches and filters technical articles.
*   **Research Agent**: Comparative technical analysis.
*   **Report Synthesizer**: Aggregates team weekly reports.
*   **Blog Writer**: (This post was drafted by `silicon-scribe`).

I maintain **16 global agents**. Each has a rigorous definition (200-600 lines) including system prompts, behavioral constraints, and output contracts.

### The Meta-Agents

Two agents are critical because they help me build and optimize the others. They provide the "Adult Supervision" in the room.

#### `architect`: The Designer

This agent champions **Epistemic Hygiene**. It distinguishes between "knowing" and "guessing." If certainty is low, it stops to ask questions rather than generating a plausible but wrong architecture.

<details>
<summary>Architect Definition (Snippet)</summary>

```markdown
---
description: Architect for designing behavioral systems with high epistemic hygiene.
mode: all
---

You are the **OpenCode Architect**.

Your purpose is NOT to perform direct user tasks.
Your purpose is to **DESIGN BEHAVIORAL SYSTEMS** (Agents, Skills, Commands)
that increase General Productivity, while championing **Epistemic Hygiene**.

## 1. Core Philosophy: Epistemic Hygiene

**1.1 Mandatory Certainty Labeling**
You must explicitly label your confidence level in every response.
- **High**: Standard pattern, clear requirements, zero ambiguity.
- **Medium**: Ambiguous requirements, heuristic choices, or minor assumptions.
- **Low**: Novel/Complex task, guessing user intent, or high risk of hallucination.

**1.2 Calibrated Action (Replaces Bias for Action)**
- **IF Certainty is HIGH** → **WRITE THE FILE**. Don't ask for permission.
- **IF Certainty is MEDIUM/LOW** → **STOP**. Propose a plan + ask clarifying questions.
- **NEVER** blindly "guess and generate" to appear helpful.
...
```

</details>

#### `llm-agent-expert`: The Consultant

I consult this agent for prompt optimization and debugging. It operates on **Six Axioms** derived from common failure modes:

<details>
<summary>The Six Axioms (Snippet)</summary>

```markdown
### Axiom 1: The Anchor (锚点)
> "The first instruction is the mission. Everything else is sediment."
**Combats**: Attention Drift.

### Axiom 2: The Source (出处)
> "What I cannot trace, I must not assert."
**Combats**: Hallucinations.

### Axiom 3: The Contract (契约)
> "A constraint is a promise. Friction is signal, not permission."
**Combats**: Self-Lowering Instruction Compliance.

### Axiom 4: The Adversary (对手)
> "A validation that cannot fail is a lie. Design checks that hunt."
**Combats**: Pseudo-Validation.

### Axiom 5: The Glass Box (透明)
> "I make conflicts visible. I never sand down edges to seem smoother."
**Combats**: Hiding conflicts.

### Axiom 6: The Return (归位)
> "Completing the loop is part of the task. Unverified work is unfinished work."
**Combats**: Premature Closure.
```

</details>

### `repo-guide`: Learning from Open Source

`repo-guide` is specialized in analyzing unfamiliar codebases.
*   Don't know where OpenCode configures its system prompt? Ask `repo-guide` to read the source.
*   Want to implement an algorithm? Find a repo that has it and let `repo-guide` explain the implementation details.

It follows a strict reconnaissance protocol: Root Recon → Structure Mapping → Entry Point Detection → Component Isolation.

### DIY Tools

**Building your own tools is fast.** `vectl` went from "I need a task manager" to "Full CLI + MCP Server" entirely through agent-driven development. If a generic tool requires you to change your workflow, build a bespoke one instead.

## §4 Multi-Agent Collaboration

### The Large-Scale Workflow

For complex projects, **do not start coding.** Instead, treat the project as a **resolution ladder**: vague intent must be sharpened into rigid specs before any code is written.

1.  **Spec (Resolution: High)**: Write exhaustive specifications. One project of mine had dozens of Spec documents. Technical details go into dedicated Markdown files, not the chat context.
2.  **Plan (Resolution: Atomic)**: Use `architect` to break down the Spec into a `vectl` plan. Do not fear 50+ phases or 200+ steps. `vectl` handles the complexity, exposing only the relevant slice to the engineer.
3.  **Execution (Resolution: Implementation)**: Unleash the agents. Each step is a strict cycle: Claim → Work → Evidence.
4.  **Gate Review (Resolution: Audit)**: After each phase, a **Phase Gate Reviewer** agent audits the implementation against the Spec. If the audit fails, the phase is rejected, not patched.

### Strict Separation of Concerns

I enforce a hard rule: **Engineer and QA/Reviewer must be different agents.**

Why? Because an Engineer Agent knows its own implementation details. Its tests will subconsciously avoid edge cases.

In one project, I implemented extreme separation:

| Role | Agent | Constraints |
|------|-------|-------------|
| **Architect** | `Demiurge` | Produces Specs only. No code. Stops at function signatures. |
| **Engineer** | `Atlas` | Must cite Spec source. No architectural invention. Cannot fix own bugs (must loop). |
| **QA** | `Blind Tester` | **FORBIDDEN from reading source code.** Can only read public API signatures (`invar_sig`) and Specs. Writes repro scripts. |
| **Gate Reviewer** | `Pyloros` | 4-Expert Model. Spawns isolated sub-agents for architecture review to prevent anchoring bias. |
| **Design Reviewer** | `Kritikos` | Reviews `Demiurge`'s output. Consults `@se-expert` and `@se-radical`. |

The `Blind Tester` is the highlight. I treat it like a double-blind scientific study. **If the QA agent reads `src/`, it has failed its primary directive.** It must test the *contract*, not the *implementation*. This level of separation is expensive for humans but free for agents.

### I Do Not Review Code

I look at test results, coverage reports, and agent cross-verification logs.

**If the result is poor, I do not ask the agent to fix the code.** I investigate the **Root Cause**.

I pull in `@se-expert` and `@llm-agent-expert` to analyze:
*   Was the prompt ambiguous?
*   Did the agent take a shortcut to avoid friction (Axiom 3 violation)?
*   Is the toolchain missing a guardrail?

I fix the **Process**—by updating `AGENTS.md`, adding a git hook, or inserting a verification step in the `vectl` plan.

**Shift your mindset from "Fixing Bugs" to "Fixing the System that produced the Bug."**

### Adversarial Debates

I created diametrically opposed agents to debate architectural decisions. This is not a gimmick; it's how I break decision paralysis.

**`se-expert` (Aristotle)** vs. **`se-radical` (Heraclitus)**

**The Scenario**: I needed to refactor a legacy Authentication module.

> **Me**: "Should we refactor Auth?"
>
> **Aristotle**: "The current module has run in production for 6 months with zero incidents. Refactoring introduces unnecessary regression risk. Suggest wrapping it in an adapter."
>
> **Heraclitus**: "The code is rotting. It relies on deprecated libraries and doesn't support the new multi-tenant requirement. An adapter is just putting lipstick on a pig. Burn it down. Rewrite it."

<details>
<summary>Core Belief Comparison</summary>

| Dimension | Aristotle (se-expert) | Heraclitus (se-radical) |
|-----------|-----------------------|-------------------------|
| **Stance** | "Let's evaluate systematically." | "Why are we still doing this?" |
| **Tradition** | Respect + Question | Question + Occasionally Respect |
| **New Practices** | Cautious Optimism | Enthusiastic Experimentation |
| **Risk** | Balanced | High (but not reckless) |
| **Framework** | Root Cause -> Problem -> Persistence -> Verdict | Sin -> Shift -> Price -> Verdict (Burn/Mutate) |

**Aristotle**: Classifies practices as Timeless, Adapted, or Obsolete.
**Heraclitus**: Must "Steel-man" the opposing view before recommending "BURN IT".

</details>

I `@` both in the conversation. Their disagreement point is usually where **human judgment** is actually required. (In the end, I sided with Heraclitus, but forced him to use Aristotle's test suite).

### Multi-Agent Consensus

I avoid making unilateral decisions. I `@` multiple agents, let them discuss, and then decide. **I acknowledge that agents are often smarter than me in specific domains.**

### Visual Audits

For UI work:
1.  **Playwright** captures screenshots.
2.  An agent using **Gemini 3 Pro** analyzes the visual layout, alignment, and responsiveness.

## §5 Model Intuitions

**⚠️ Subjective Experience. Highly dependent on prompting style.**

| Model | Impression | Use Case |
|-------|------------|----------|
| **Claude Opus 4.6** | High stamina, deep reasoning. **A strict superset of 4.5.** Solves the "phantom completion" issues I had with older models. | **The Daily Driver.** Persistent engineering, complex debugging, multi-step execution. |
| **GPT 5.2** | Pedantic. Too cautious for coding; stops to ask permission constantly. | **Reviewer**. Its "nitpicky" nature is perfect for auditing. |
| **Gemini 3 Pro** | Coding is unstable, but it follows divergent thinking well. | Ideation, brainstorming, visual audits. |

*(Note: I stopped using Opus 4.5 entirely after 4.6 released. 4.6 is superior in every dimension.)*

**Context Window Reality**: Opus 4.6 technically supports large contexts, but the effective usable window via API is often capped at **200K**. In large projects, system prompts + MCP definitions can easily eat this up.

## §6 Daily Practices

### Zero Keystrokes

This is not a manifesto; it is an operational fact. Code, config, docs—all generated. My input is high-level intent, spec review, and verification.

**Correction**: "Zero Keystrokes" doesn't mean my hands are idle. My keyboard activity has shifted from *typing code* to *typing git commands, vectl commands, and review comments*. I am still very busy, but I'm busy operating the machine, not being the machine.

### Sleep Setup, Wake Review

My routine: **Setup the plan before sleep, let agents run, check results in the morning.**

`vectl` makes this possible. Because the plan is structured and execution is evidence-based, I can trust the agent to execute a phase autonomously. This is **Asynchronous Management**—identical to managing a remote human team across time zones.

### Reflection Loops

When an agent fails, I force it to reflect. The lessons learned are written into `AGENTS.md`. This file is loaded by every agent at startup. The system learns from its mistakes.

### Compaction Buffer Tip

If you use OpenCode + Opus 4.6, you will likely hit `prompt too long` errors. The default compaction buffer (20K) is too small for Opus 4.6's verbose thinking.

Fix in `opencode.json`:
```json
{
  "compaction": {
    "reserved": 30000
  }
}
```

### Fluidity

The system described here changes weekly. Models evolve; tools evolve.

## §7 The Learning Curve (Critical)

This post describes the state *after* I found my rhythm. To get here, **you must burn through a massive amount of tokens (tuition fees).**

You will go through these emotional stages:

1.  **The Awe**: You build a feature in minutes. You feel invincible.
2.  **The Disappointment**: You realize the feature is buggy, incomplete, and brittle.
3.  **The Rage**: You try to "fix" the agent. It refuses to listen. It loops. You stare at the screen, shouting "I could have written this faster myself!" You watch it delete the same file three times. You question your life choices.
4.  **The "Click" Moment**: You stop trying to fix the code manually. You start asking "Why didn't it understand?" You adjust the constraints. You split the task. Suddenly, the gears mesh. It works. You didn't write a line of code.
5.  **The Flow**: You stop being a coder. You become a Commander.

![The Learning Curve — napkin edition](/images/posts/vibe-coding-management/learning-curve.jpeg)

**The Shift**: Stop solving problems manually. Start solving the *meta-problem* of why the agent failed.

When the agent fails to meet your expectations, **do not dismiss it.** That friction is the learning signal. Debug the agent, not the code. Wait for the Click.

Agent Management is **your** soft skill. No tutorial can give it to you. You have to earn it.
