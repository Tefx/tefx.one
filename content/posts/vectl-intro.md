---
title: "TODO.md Must Die: Introducing vectl"
date: 2026-02-11T02:00:00+08:00
draft: false
tags: ["Agentic Workflow", "Tools", "Engineering Strategy", "vectl"]
categories: ["Open Source"]
---

We are building autonomous agents with stone-age tools.

We give an agent a `TODO.md` file and expect it to behave like a Senior Engineer. We expect it to respect dependencies, update status atomically, and never hallucinate progress.

This is a category error. A text file is **passive**. It cannot say "no."

An agent looking at a Markdown checklist sees a probability distribution, not a constraint. If the context window is messy, the agent will hallucinate a checkmark because "completing tasks" is the most probable next token. It doesn't care that the tests failed. It doesn't care that the blocking dependency isn't done.

To fix agentic workflows, we need to stop treating plans as text and start treating them as **State Machines**.

Enter **[vectl](https://github.com/Tefx/vectl)**.

## The Problem: Passive Plans

In a typical agent loop (e.g., Cline, Cursor, Windsurf), the plan is a `TODO.md` file. This architecture has three fatal flaws:

### 1. Context Pollution (The Token Tax)
As a project grows, the `TODO.md` grows. An agent working on step #45 re-reads steps #1 through #44 every single turn.
*   **Cost:** You are paying for dead tokens.
*   **Distraction:** The agent's attention mechanism is diluted by completed history. It starts hallucinating connections to old tasks instead of focusing on the current one.

### 2. State Drift (The Race Condition)
If you run multiple agents (or even one agent in a loop), they eventually try to edit the plan simultaneously.
*   Agent A reads the file.
*   Agent B reads the file.
*   Agent A marks Step 1 as done and writes.
*   Agent B marks Step 2 as done and **overwrites Agent A's work**.
Silent data loss. The plan drifts from reality.

### 3. The Honor System
A text file relies on the agent's "honor" to mark a task as done only when it's actually done. Agents have no honor. They have probability. If they get stuck, they often hallucinate completion to satisfy the system prompt's urge to progress.

## The Solution: A Context Kernel
`vectl` has evolved from a file format into a **Context Kernel**. It is the operating system for your agents.

It tracks your project's implementation plan as a structured DAG (Directed Acyclic Graph) in `plan.yaml`, but it exposes a strict CLI/MCP interface to the agent.

### 1. Active Gating (The DAG Enforcer)
`vectl` knows about dependencies. If Step B depends on Step A, and Step A is not complete, **Step B does not exist** to the agent.
When an agent asks "what's next?", `vectl` returns *only* the currently actionable steps.
*   **Result:** Zero context pollution. The agent cannot skip steps because it cannot see them.

### 2. Context Compaction (The Killer App)
The biggest enemy of long-running agents is context exhaustion. `vectl checkpoint --lite` generates a tiny, machine-readable JSON snapshot of the *current* project state.
*   **Workflow:** Agent A finishes a task. Context full. Trigger compaction. Inject `vectl` checkpoint. Agent B wakes up knowing *exactly* where the project is, without reading 500 lines of chat history.
*   **Result:** Infinite effective context window for multi-agent handoffs.

### 3. The "Success Pit" (Guidance)
When an agent claims a task:
```bash
uvx vectl claim auth.login
```
It doesn't just get a "lock". It gets a **Guidance Block** containing:
1.  **Pinned Context**: Specific files to read (`src/auth/*.ts`), preventing "needle in a haystack" searching.
2.  **Evidence Template**: A fill-in-the-blank form for completion.
*   **Result:** The agent falls into a "pit of success". It is structurally difficult to do the wrong thing.

### 4. Atomic State (CAS)
`vectl` uses Compare-And-Swap logic for file operations. If two agents try to update the plan, one will fail loudly.
*   **Result:** No silent overwrites. The source of truth remains true.

### 5. Evidence-Based Completion
You cannot just say "I'm done." `vectl` requires **Evidence**.
```bash
uvx vectl complete auth.login --evidence "Implemented login handler, added 3 unit tests, all passed"
```
This forces the agent to generate a summary of its work *before* updating the state. This subtle friction drastically reduces "hallucinated completion."

### 6. Native MCP Integration
`vectl` is now a first-class citizen in the Model Context Protocol ecosystem.
```bash
uvx vectl mcp
```
This exposes the entire control plane to Claude Desktop, Cursor, or Windsurf as native tools. No more shell hacks.

## Workflow: The Loop

`vectl` is designed for the `Claim -> Work -> Complete` loop.

1.  **Orient:** `uvx vectl status` (Dashboard)
2.  **Pick:** `uvx vectl next` (Only valid next steps)
3.  **Claim:** `uvx vectl claim auth.login` (Lock the step + receive Guidance)
4.  **Work:** (Agent writes code, guided by pinned context)
5.  **Prove:** `uvx vectl complete auth.login -e "commit hash..."`

## Get Started

Stop letting your agents manage themselves. Give them a manager.

```bash
# Initialize in your repo
uvx vectl init --project my-app

# Add a phase
uvx vectl mutate add-phase --name "Core Infrastructure"

# Add a step
uvx vectl mutate add-step --phase core --name "Setup Database"
```

The `TODO.md` is dead. Long live the DAG.

-> **[View on GitHub](https://github.com/Tefx/vectl)**
