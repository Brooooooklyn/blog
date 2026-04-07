---
title: 'Why Qwen3.5 Falls Into Infinite Thinking — and How to Fix It'
date: 2026-04-02
author: '太狼'
postname: reasoning-control-flow
description: 'Why Qwen3.5 models get stuck in infinite reasoning loops, how vLLM-style budget enforcement stops overthinking at the decode loop level, and the full control flow from request to token generation.'
header_img: 'cover.jpg'
lang: en
tags:
  - MLX
  - Rust
  - LLM
  - Qwen3.5
  - Reasoning
---

**Token-level budget enforcement that stops reasoning models from thinking forever — implemented in the decode loop, not as post-hoc truncation**

## The Problem

If you've run Qwen3.5 models locally, you've probably seen this: the model starts thinking... and never stops. It generates thousands of reasoning tokens inside `<think>...</think>` blocks until it hits `max_tokens`, and you get either an empty response or a truncated thought with no actual answer.

This isn't a rare edge case. [QwenLM/Qwen3.5#88](https://github.com/QwenLM/Qwen3.5/issues/88) measured it: **17.4% of outputs on LiveCodeBench had truncated thinking** (no `</think>` emitted before the token budget ran out). Of those truncated outputs, **84% showed repetition rates above 30%** — the model gets stuck repeating phrases in its reasoning phase until tokens run out, never producing an answer.

The problem is worse on harder questions. Easy problems see ~6% truncation; hard problems hit 27.5%.

Users across every local inference framework report this:

- ![LM Studio](/icons/lmstudio.svg) **LM Studio** [#1559](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1559): no UI toggle for Qwen3.5 thinking mode (`enable_thinking=false` works but requires manual API config)
- ![Ollama](/icons/ollama.svg) **Ollama** [#14421](https://github.com/ollama/ollama/issues/14421): Qwen3.5:35b enters endless loops
- ![Jan](/icons/jan.png) **Jan** [#7645](https://github.com/janhq/jan/issues/7645): thinking mode not working with Qwen3.5

---

## Root Cause: The `</think>` Token Is Probabilistic

To understand why this happens, you need to understand how Qwen3.5's thinking mode works at the token level.

### How the template enters thinking mode

Qwen3.5's [chat template](https://huggingface.co/Qwen/Qwen3.5-4B/blob/main/chat_template.jinja) has a boolean control called `enable_thinking`. When **enabled** (the default), the template appends this to the prompt:

```
<|im_start|>assistant
<think>
```

This `<think>\n` prefix is part of the **prompt**, not the generation. It tells the model: "start generating reasoning tokens." The model then produces its chain-of-thought, and at some point, it's supposed to emit `</think>` to transition to the actual answer.

When **disabled** (`enable_thinking=false`), the template instead appends:

```
<|im_start|>assistant
<think>

</think>

```

A closed, empty think block. The model starts directly in content mode — no reasoning phase.

### The fundamental problem

`</think>` is just another token in the vocabulary (token ID `248069` for Qwen3.5). The model generates it based on a probability distribution over the vocabulary at each decode step. There's no hard guarantee it will ever emit it.

Several factors make `</think>` emission unreliable:

1. **Complex prompts** extend the reasoning chain. The model keeps exploring different approaches, losing track of when to stop.
2. **Repetition loops** form inside thinking. Once the model starts repeating a phrase, the repetitive pattern reinforces itself and the probability of `</think>` drops further.
3. **Quantization** shifts the probability distribution. Lower precision (Q3, Q4) subtly degrades the model's ability to produce low-frequency tokens like `</think>` at the right moment.
4. **Short context windows** (Ollama dynamically defaults to 4k/32k/256k based on VRAM) can cut off the model before it can naturally finish thinking, producing truncated output with no answer.

### `max_tokens` is the wrong safety net

Every inference framework has `max_tokens` as a hard ceiling. But `max_tokens` is shared between thinking and content. If the model spends 4,000 tokens thinking in a 4,096 token limit, you get 96 tokens of answer. If `max_tokens` is hit *during* thinking, you get **zero answer** — just an incomplete reasoning chain and `finish_reason: "length"`.

This is the core of the community complaint: the model thinks until the budget is gone, and the user gets nothing useful.

---

## What Local Frameworks Do (and Don't Do)

### [mlx-lm](https://github.com/ml-explore/mlx-lm): Awareness without enforcement

mlx-lm (the Python MLX library behind LM Studio's MLX backend) is **aware** of thinking tokens but does nothing to enforce limits.

In `tokenizer_utils.py`, it detects `<think>`/`</think>` at init time:

```python
THINK_TOKENS = [
    ("<think>", "</think>"),
    ("<longcat_think>", "</longcat_think>"),
]
for think_start, think_end in THINK_TOKENS:
    if think_start in vocab and think_end in vocab:
        self._think_start_id = vocab[think_start]
        self._think_end_id = vocab[think_end]
        break
```

In the server, a `SequenceStateMachine` uses these to **label** output as "reasoning" vs "normal" for the OpenAI-compatible API response. But this is presentation-only logic. The generate loop in `generate.py` has exactly two stopping conditions:

```python
while True:
    if n == max_tokens:
        break
    # ...
    yield y.item(), logprobs
    n += 1
```

Total token count, and EOS. No separate thinking counter, no budget, no forced `</think>`. The `enable_thinking` parameter is passed through to `apply_chat_template()` to change the prompt — it adds zero runtime enforcement.

### [Ollama](https://github.com/ollama/ollama): No budget, disable was broken

Ollama has `--think`/`--nothink` toggles [PR #10584](https://github.com/ollama/ollama/pull/10584), but:

- **No thinking budget** — [Issue #10925](https://github.com/ollama/ollama/issues/10925) is an open feature request that remains unimplemented.
- **`think=false` was broken in generate API** — [Issue #14793](https://github.com/ollama/ollama/issues/14793) (closed March 23, 2026) reported thinking tokens silently consuming the entire `num_predict` budget, producing an **empty response field**.

### [llama.cpp](https://github.com/ggml-org/llama.cpp): Budget added, but buggy

llama.cpp recently added `--reasoning-budget N` ([PR #20297](https://github.com/ggml-org/llama.cpp/commit/acb7c790698fa28a0fbfc0468804926815b94de3)). This is the closest any local framework has come to solving the problem, but it has significant issues:

- **`enable_thinking: false` broken for Qwen3.5** — [Issue #20182](https://github.com/ggml-org/llama.cpp/issues/20182)
- **Tool parser fails when text precedes `<tool_call>` in thinking/tool-calling flows** — [Issue #20260](https://github.com/ggml-org/llama.cpp/issues/20260)
- **Grammar enforcement was inactive during thinking** — [Issue #20345](https://github.com/ggml-org/llama.cpp/issues/20345) (closed March 10, 2026)
- **Raw truncation reduces answer quality** — [Issue #20632](https://github.com/ggml-org/llama.cpp/issues/20632) discusses the need for graceful termination

### Summary

| Framework | Budget Enforcement | Disable Thinking | Tool Isolation |
|---|---|---|---|
| **mlx-lm** | None | Template-only | N/A |
| **Ollama** | None | Was broken (generate API, now fixed) | N/A |
| **llama.cpp** | `--reasoning-budget` (recent) | Broken for Qwen3.5 | Parser issues |
| **vLLM** | `ThinkingTokenBudgetLogitsProcessor` | Works | Enforced |
| **mlx-node** | `ReasoningTracker` | `reasoningEffort` API | Enforced |

---

## The [vLLM](https://github.com/vllm-project/vllm) Solution: Logits-Level Budget Enforcement

[vLLM](https://github.com/vllm-project/vllm) solves this with a [`ThinkingTokenBudgetLogitsProcessor`](https://github.com/vllm-project/vllm/blob/main/vllm/v1/sample/logits_processor/builtin.py) — a token-level intervention during decoding, not post-generation truncation. (See the [reasoning outputs docs](https://github.com/vllm-project/vllm/blob/main/docs/features/reasoning_outputs.md) for details.)

### How it works

The processor maintains per-request state:

```python
class ThinkingTokenBudgetLogitsProcessor:
    in_think: bool          # Currently inside <think> block?
    think_count: int        # Thinking tokens generated so far
    in_end: bool            # Currently forcing the end sequence?
    end_count: int          # Progress through end-token sequence
    budget: int             # Maximum thinking tokens allowed
```

During each decode step:
1. The processor scans newly generated tokens for `<think>`/`</think>` transitions
2. While `in_think` is true, it increments `think_count`
3. When `think_count >= budget`, it flips `in_end = True`
4. While `in_end` is true, it **overrides logits**: assigns a huge value to the next token in the `</think>` sequence, effectively forcing the model to emit `</think>`
5. Once the full end sequence is emitted, generation continues normally in content mode

This is a **hard decoding-time intervention**. The model has no choice — when the budget is hit, `</think>` is emitted and content generation begins.

### The key design principle

> **Budget enforcement must happen during generation, not after.** Post-hoc truncation doesn't work because (1) in streaming mode, clients have already seen the extra reasoning tokens, and (2) the model needs to actually transition to content mode — you can't just chop off thinking and expect coherent content to follow.

Forcing `</think>` at the token level gives the model the proper transition signal. The model "sees" the `</think>` token in its context and generates content accordingly, as if it had decided to stop thinking on its own.

---

## The [mlx-node](https://github.com/mlx-node/mlx-node) Solution: ReasoningTracker + Decode Loop Enforcement

[mlx-node](https://github.com/mlx-node/mlx-node) implements the same principle — token-level budget enforcement during decoding — but adapts it to the realities of a pipelined, compiled Metal decode loop rather than vLLM's logits processor infrastructure.

### Why not a logits processor?

vLLM has a general-purpose logits processor pipeline because it serves many models with different requirements. mlx-node targets Qwen3/Qwen3.5 specifically and runs on a single Apple Silicon device. The decode loop is pipelined and the forward pass can be compiled to a Metal graph via `mlx::core::compile`. Inserting a logits processor would break the compiled graph and add overhead for a feature that only needs a simple token-level check.

Instead, budget enforcement is built directly into the decode loop as a token substitution.

### The ReasoningTracker state machine

```rust
pub(crate) struct ReasoningTracker {
    in_thinking: bool,           // Currently in reasoning mode?
    thinking_token_count: i32,   // Tokens generated while thinking
    budget: Option<i32>,         // Max thinking tokens (None = unlimited)
    think_end_id: Option<u32>,   // Token ID for </think>
    force_think_end: bool,       // Budget exhausted, force next step
    end_scheduled: bool,         // Forced token is in the pipeline
}
```

Three operations drive the state machine:

**`observe_token(token_id) -> bool`** — Called after extracting each token. Returns whether the token is reasoning content. When it sees `think_end_id`, it transitions `in_thinking` to `false`. While `in_thinking`, it increments the counter and sets `force_think_end` when the budget is reached.

**`should_force_think_end() -> bool`** — Checked after the forward pass, before penalties and sampling. When true, the decode loop bypasses penalty calculation and sampling, directly producing the `think_end_id` token. The forward pass still runs to keep KV caches consistent. Consumes the flag (returns true at most once).

**`forced_token_id() -> u32`** — Returns the `</think>` token ID to inject.

### Initialization

The tracker is initialized from the same `enable_thinking` value used to render the prompt template:

```rust
let enable_thinking = resolve_enable_thinking(&config);

let starts_in_thinking = enable_thinking.unwrap_or(true);

let tracker = ReasoningTracker::new(
    starts_in_thinking,
    config.thinking_token_budget,
    think_end_id,
);
```

This satisfies vLLM's hard invariant: **the tracker configuration must match the template state.** When `enable_thinking=false`, the template injects a closed `<think>\n\n</think>\n\n` block and the tracker starts with `in_thinking=false`. When `enable_thinking=true` (default), the template injects `<think>\n` and the tracker starts in thinking mode. The `think_end_id` is passed separately to the tracker — if `None` (tokenizer lacks a single `</think>` token), budget enforcement is disabled but the tracker still enters thinking mode, falling back to text-level `</think>` detection at finalization.

---

## Full Control Flow in [mlx-node](https://github.com/mlx-node/mlx-node): Request to Token

Here is the complete path a chat request takes through [mlx-node](https://github.com/mlx-node/mlx-node) reasoning-aware decode loop.

### Step 1: Resolve reasoning effort

The user-facing API is `reasoningEffort`, which [mlx-node](https://github.com/mlx-node/mlx-node) maps to `enable_thinking` for the chat template. Note that vLLM also exposes `reasoning_effort` as an API parameter, but for Qwen models the template itself only reads `enable_thinking` — vLLM passes `reasoning_effort` through as a template kwarg that Qwen templates ignore. [mlx-node](https://github.com/mlx-node/mlx-node) takes the opinionated approach of mapping `reasoningEffort` to `enable_thinking` directly:

```rust
fn resolve_enable_thinking(config: &ChatConfig) -> Option<bool> {
    match config.reasoning_effort.as_deref() {
        Some("none") | Some("low") => Some(false),
        Some("medium") | Some("high") => Some(true),
        _ => None, // template decides (typically true)
    }
}
```

`reasoning_effort: "none"` also defaults `include_reasoning` to `false`, meaning the thinking field is suppressed in the output.

### Step 2: Render the prompt

The resolved `enable_thinking` is passed to the Jinja2 chat template:

```rust
let tokens = tokenizer.apply_chat_template_sync(
    &messages, Some(true), tool_defs, enable_thinking,
);
```

The template outputs either `<think>\n` (thinking enabled) or `<think>\n\n</think>\n\n` (thinking disabled) before the assistant's generation position.

### Step 3: Initialize the tracker

```rust
let starts_in_thinking = enable_thinking.unwrap_or(true);

let mut tracker = ReasoningTracker::new(
    starts_in_thinking,
    config.thinking_token_budget,  // e.g., Some(1024)
    think_end_id,                   // e.g., Some(248069)
);
```

Special case: `budget=0` sets `force_think_end=true` in the constructor, so `</think>` is forced on the very first decode step.

### Step 4: Prefill

The full token sequence (prompt + `<think>\n`) is forwarded through the model in one batch. This populates the KV caches and produces the first logits. The first token is sampled normally.

### Step 5: The pipelined decode loop

This is the heart of the system. The decode loop is **pipelined**: step N+1's forward graph is submitted to the GPU before step N's result is extracted from the GPU. This overlaps compute and data transfer for maximum throughput.

```
┌─────────────────────────────────────────────────────────────┐
│ Pipelined Decode Loop                                       │
│                                                             │
│ for step in 0..max_new_tokens:                              │
│                                                             │
│   ┌─ Phase A: Build step N+1's graph ─────────────────────┐ │
│   │                                                       │ │
│   │  forward(y) → logits          ← always runs           │ │
│   │                                                       │ │
│   │  tracker.should_force_think_end()?                    │ │
│   │    ├─ YES: produce think_end_id as constant tensor    │ │
│   │    │       (skip penalties + sample)                  │ │
│   │    └─ NO:  penalties(logits) → sample                 │ │
│   │                                                       │ │
│   │  eval_step(next_token, logits)  ← async GPU submit    │ │
│   └───────────────────────────────────────────────────────┘ │
│                                                             │
│   ┌─ Phase B: Extract step N's result ────────────────────┐ │
│   │                                                       │ │
│   │  y.eval()                       ← block on GPU        │ │
│   │  token_id = y.item_at_int32(0)  ← copy to CPU         │ │
│   │  tracker.observe_token(token_id) → is_reasoning       │ │
│   │                                                       │ │
│   │  [streaming: emit delta with is_reasoning tag]        │ │
│   │                                                       │ │
│   │  if token_id == eos: break                            │ │
│   │  if repetition_cutoff: break                          │ │
│   └───────────────────────────────────────────────────────┘ │
│                                                             │
│   y = next_y  ← advance pipeline                            │
└─────────────────────────────────────────────────────────────┘
```

The critical ordering: Phase A (build next graph) happens **before** Phase B (extract current result). This means:

1. Budget exhaustion is detected in Phase B via `observe_token()`
2. The forced `</think>` takes effect in the **next iteration's** Phase A
3. But the current iteration's Phase A already submitted a normal forward graph **before** we knew the budget was hit

This creates a 1-token pipeline lag: with `budget=N`, the model generates `N+1` thinking tokens before `</think>` appears. This matches vLLM's behavior, where the logits processor also operates with a scan-and-apply delay.

### Step 6: Budget enforcement detail

When `should_force_think_end()` returns true:

```rust
// Forward always runs first — keeps KV caches consistent
let logits = forward(&next_ids, &embedding_weight)?;

let (next_token, budget_forced) =
    if tracker.should_force_think_end() {
        let forced_id = tracker.forced_token_id() as i32;
        (MxArray::from_int32(&[forced_id], &[1])?, true)
    } else {
        // Normal: penalties → sample
        let logits = apply_all_penalties(logits, &token_history, &params)?;
        let token = sample(&logits, sampling_config)?;
        (token, false)
    };
```

The forward pass **always** runs to keep KV caches consistent. The forced token is a **constant tensor** — no penalty calculation, no sampling. The model processes the `</think>` token through its attention layers and generates content tokens normally afterward.

**Compiled C++ path detail:** When using the compiled Metal forward pass (`mlx::core::compile`), the forced constant token has no graph dependency on the forward pass. The GPU must still evaluate the forward graph to update KV caches. An explicit `logits.eval()` call ensures this when `budget_forced` is true:

```rust
eval_step(&next_token, &logits, budget_forced);
// Inside eval_step, when budget_forced:
//   logits.eval();  // force forward graph materialization
//   next_token.eval();
```

### Step 7: The `end_scheduled` flag

The `end_scheduled` flag prevents a subtle bug in the pipelined loop. After `should_force_think_end()` is consumed (returns true once), the pipeline still extracts the over-budget thinking token from the previous step. Without `end_scheduled`, `observe_token()` would see that `count > budget` and set `force_think_end` again, causing a double `</think>`:

```rust
fn observe_token(&mut self, token_id: u32) -> bool {
    // ...
    self.thinking_token_count += 1;
    if let Some(budget) = self.budget
        && self.thinking_token_count >= budget
        && !self.end_scheduled  // ← prevents re-triggering
    {
        self.force_think_end = true;
    }
    true
}
```

Timeline with `budget=3`:

```
Step 0: Build(normal) → Extract token A → count=1
Step 1: Build(normal) → Extract token B → count=2
Step 2: Build(normal) → Extract token C → count=3, force=true
Step 3: Build(FORCED </think>) → Extract token D (from step 2's build, before force)
        ↑ end_scheduled=true     → count=4, but no re-trigger
Step 4: Build(normal content) → Extract </think> → in_thinking=false
Step 5: Build(normal content) → Extract content token → is_reasoning=false
```

Token D is the pipeline lag — it was already in flight when we detected the budget at step 2. The `end_scheduled` flag absorbs it cleanly.

### Step 8: Finalization

After the decode loop completes, generated tokens are decoded to text and split into reasoning vs content:

```rust
fn parse_thinking_and_tools(text, generated_tokens, thinking_enabled, ...) {
    if !thinking_enabled {
        // No-thinking mode: all text is content
        parse_tool_calls(text)
    } else if has_think_end_token(generated_tokens, think_end_id) {
        // Token-confirmed </think>: split at boundary
        split_at_think_end(text, think_end_str)
    } else if think_end_id.is_some() {
        // Truncated: no </think> before EOS/max_tokens
        // All text is reasoning, no content
        (String::new(), vec![], Some(thinking_text))
    } else {
        // No think_end_id in vocab: text-level fallback
        split_at_think_end(text, None)
    }
}
```

Four-way branching ensures correct classification in every case:

1. **No-thinking mode**: template disabled thinking, all output is content. Any literal `<think>` is normal text.
2. **Token-confirmed `</think>`**: the model (or budget enforcement) emitted `</think>`. Split at the boundary. Tool calls are parsed only from content.
3. **Truncated thinking**: thinking was enabled but generation ended without `</think>`. All output is reasoning, no content produced.
4. **No `think_end_id`**: tokenizer doesn't have a single `</think>` token (shouldn't happen for Qwen3.5, but handled for safety). Falls back to text-level parsing.

### Step 9: Output suppression

If `include_reasoning` is false (explicitly set, or implied by `reasoning_effort: "none"`), the `thinking` field is set to `None`:

```rust
let thinking = if include_reasoning { thinking } else { None };
```

In streaming mode, delta chunks still carry `is_reasoning: bool` tags so consumers can filter in real-time, but the final accumulated `thinking` field is suppressed.

---

## Streaming: The `isReasoning` Tag

In streaming mode, each delta chunk carries an `isReasoning` boolean:

```typescript
interface ChatStreamDelta {
  text: string;
  done: boolean;
  isReasoning?: boolean;  // true = reasoning, false = content
  // ...
}
```

This maps to vLLM's `delta.reasoning` / `delta.content` distinction. Consumers route text to the appropriate display channel based on this tag:

```typescript
for await (const event of model.chatStream(messages, config)) {
  if (!event.done) {
    if (event.isReasoning) {
      renderThinking(event.text);  // collapsible thinking UI
    } else {
      renderContent(event.text);   // main answer
    }
  }
}
```

The tag is derived from the `ReasoningTracker` state at the time of emission — no text parsing needed during streaming. The tracker operates at the token level, so the tag is always correct even when the text spans a `</think>` boundary.

---

## The API

Three controls:

### `reasoningEffort` — The top-level control

```typescript
const result = await model.chat(messages, {
  reasoningEffort: 'low',  // 'none' | 'low' | 'medium' | 'high'
});
```

| Value | `enable_thinking` | Effect |
|---|---|---|
| `"none"` | `false` | No thinking. `include_reasoning` defaults to `false`. |
| `"low"` | `false` | No thinking. Reasoning still included if requested. |
| `"medium"` | `true` | Normal thinking enabled. |
| `"high"` | `true` | Normal thinking enabled. |
| *(unset)* | *(template default, typically `true`)* | Normal thinking enabled. |

`"none"` vs `"low"`: both disable thinking via the template, but `"none"` also suppresses the reasoning field in the output by defaulting `include_reasoning` to `false`.

### `thinkingTokenBudget` — The hard cap

```typescript
const result = await model.chat(messages, {
  thinkingTokenBudget: 1024,  // Max thinking tokens before forced </think>
});
```

When the budget is reached, the decode loop forces `</think>` and the model transitions to content generation. The effective thinking length is `budget + 1` tokens due to pipeline lag.

Special values:
- `0` — Force `</think>` immediately. The model gets zero thinking tokens.
- `undefined` / not set — Unlimited thinking. The model thinks until it naturally emits `</think>` or hits `max_tokens`.

### `includeReasoning` — Output policy

```typescript
const result = await model.chat(messages, {
  includeReasoning: false,  // Suppress thinking in output
});
```

When `false`, the `thinking` field on the result is `None`. The model still thinks internally (unless `reasoningEffort` is `"none"` or `"low"`), but the reasoning text is not returned to the caller.

---

## Edge Cases

### Budget=0 vs budget=1

With **budget=0**, `force_think_end` is set in the constructor — before any token is observed. The very first decode step forces `</think>`. Due to pipeline lag, exactly 1 thinking token is generated (the one already in flight from prefill).

With **budget=1**, the first thinking token is observed, count reaches 1, and the force is set. Due to pipeline lag, 2 thinking tokens are generated.

### No `think_end_id` in vocabulary

If the tokenizer doesn't have `</think>` as a single token, `think_end_id` is `None` and `should_force_think_end()` always returns `false`. The budget is silently ignored. The tracker still enters thinking mode (driven by `enable_thinking` alone), but falls back to text-level `</think>` detection during finalization via `split_at_think_end(text, None)`.

### Old templates that emit `<think>` in generated text

Starting with Qwen3.5, the chat template puts `<think>` into the **prompt**, so generation only produces `</think>`. Older Qwen3 templates may emit `<think>` in the generated text. The `ReasoningTracker` only watches for `think_end_id` — it ignores `<think>` tokens entirely. Post-generation parsing handles both patterns.

### Tool calls after thinking

Tool parsing operates exclusively on content after `</think>`. The `split_at_think_end()` function separates at the boundary before calling `parse_tool_calls()`. This satisfies vLLM's requirement: **tool extraction never sees reasoning text**.

```
<think>
Let me check the weather API...
I should call get_weather with location="Tokyo"
</think>

<tool_call>{"name": "get_weather", "arguments": {"location": "Tokyo"}}</tool_call>
```

Only the `<tool_call>` after `</think>` is parsed. The reasoning mention of `get_weather` is ignored.

### `</longcat_think>` variant

Some fine-tuned Qwen models use `<longcat_think>...</longcat_think>` instead of `<think>...</think>`. The tokenizer detection checks both variants at load time and stores whichever is present. All parsing functions handle both.

---

## Support My Work

[mlx-node](https://github.com/mlx-node/mlx-node) is an open-source effort to bring high-performance ML to the JavaScript/TypeScript ecosystem. Here's what we're working on:

1. **Post-training LLMs in Node.js** — Production-ready GRPO and SFT training, enabling reinforcement learning and fine-tuning entirely in JavaScript
2. **WebGPU backend for MLX** — Enabling MLX-Node to run directly in the browser, making on-device machine learning inference available to all web developers. We have developed a private fork of MLX with a working prototype and are actively polishing it.
3. **Broader model support** — Beyond Qwen family and PaddleOCR, expanding to more LLM/VLM architectures

If you or your organization are interested in sponsoring this research, please check here [GitHub Sponsors](https://github.com/sponsors/Brooooooklyn).
