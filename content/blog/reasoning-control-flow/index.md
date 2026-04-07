---
title: '为什么 Qwen3.5 会陷入无限思考 —— 以及如何解决'
date: 2026-04-02
author: '太狼'
postname: reasoning-control-flow
description: '解析 Qwen3.5 模型陷入无限推理循环的根本原因，以及 vLLM 风格的预算执行机制如何在解码循环层面阻止过度思考。'
header_img: 'cover.jpg'
lang: zh
tags:
  - MLX
  - Rust
  - LLM
  - Qwen3.5
  - Reasoning
---

**在解码循环中实现 token 级别的预算执行，而非事后截断 —— 阻止推理模型无限思考**

## 问题

如果你在本地跑过 Qwen3.5 模型，大概率遇到过这个问题：模型开始思考……然后永远停不下来。它在 `<think>...</think>` 块中生成数千个推理 token，直到耗尽 `max_tokens`，最终你要么得到一个空响应，要么得到一段截断的思考内容，没有任何实际回答。

这并不是偶发的现象, [QwenLM/Qwen3.5#88](https://github.com/QwenLM/Qwen3.5/issues/88) 做了实测: 在 LiveCodeBench 上**有 17.4% 的输出出现了思考截断**（在 token 预算耗尽前没有生成 `</think>`）。在这些截断输出中，**84% 的重复率超过了 30%** —— 模型在推理阶段陷入了重复短语的循环，直到 token 用完，从未产出答案。

问题在困难问题上更严重：简单问题截断率约 6%，困难问题高达 27.5%。

各个本地推理框架的用户都在反馈这个问题：

- ![LM Studio](/icons/lmstudio.svg) **LM Studio** [#1559](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1559)：Qwen3.5 缺少思考模式 UI 开关（`enable_thinking=false` 可用但需手动 API 配置）
- ![Ollama](/icons/ollama.svg) **Ollama** [#14421](https://github.com/ollama/ollama/issues/14421)：Qwen3.5:35b 进入无限循环
- ![Jan](/icons/jan.png) **Jan** [#7645](https://github.com/janhq/jan/issues/7645)：Qwen3.5 9B 思考模式无法工作

---

## 根本原因：`</think>` Token 是概率性的

要理解为什么会这样，需要理解 Qwen3.5 思考模式在 token 层面是如何工作的。

### 模板如何进入思考模式

Qwen3.5 的 [chat template](https://huggingface.co/Qwen/Qwen3.5-4B/blob/main/chat_template.jinja) 有一个布尔控制项 `enable_thinking`。当**启用**（默认）时，模板在 prompt 末尾追加：

```
<|im_start|>assistant
<think>
```

这个 `<think>\n` 前缀是 **prompt 的一部分**，不是生成的内容。它告诉模型："开始生成推理 token。"模型随后产出思维链内容，在某个时刻，它应该生成 `</think>` 来过渡到实际回答。

当**禁用**（`enable_thinking=false`）时，模板追加：

```
<|im_start|>assistant
<think>

</think>

```

一个已关闭的空思考块。模型直接从内容模式开始 —— 没有推理阶段。

### 根本问题

`</think>` 只是词表中的一个普通 token（Qwen3.5 中的 token ID `248069`）。模型在每个解码步骤中基于词表的概率分布来生成它。**没有任何硬性保证它一定会被生成。**

几个因素导致 `</think>` 的生成不可靠：

1. **复杂的 prompt** 延长推理链。模型不断探索不同方案，失去了何时停止的感知。
2. **重复循环**在思考中形成。一旦模型开始重复某个短语，重复模式会自我强化，`</think>` 的概率进一步降低。
3. **量化**改变概率分布。低精度（Q3、Q4）会微妙地削弱模型在正确时刻产生低频 token（如 `</think>`）的能力。
4. **短上下文窗口**（Ollama 根据 VRAM 动态默认 4k/32k/256k）可能在模型能自然完成思考之前就截断了输出，产生没有回答的截断内容。

### `max_tokens` 是错误的保护方案

每个推理框架都有 `max_tokens` 作为硬上限。但 `max_tokens` 是思考和内容**共享的**。如果模型在 4096 token 的限制中花了 4000 个 token 思考，你只能得到 96 个 token 的回答。如果 `max_tokens` 在思考**过程中**被耗尽，你得到的是**零回答** —— 只有一段不完整的推理链和 `finish_reason: "length"`。

这就是社区投诉的核心：模型一直思考直到预算用完，用户什么有用的都没得到。

---

## 本地框架做了什么（以及没做什么）

### [`mlx-lm`](https://github.com/ml-explore/mlx-lm)：有感知但无执行

mlx-lm（LM Studio MLX 后端底层的 Python MLX 库）**能感知**思考 token，但不做任何限制执行。

在 `tokenizer_utils.py` 中，它在初始化时检测 `<think>`/`</think>`：

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

在 server 中，一个 `SequenceStateMachine` 用这些 token 纯粹将输出**标记**为 "reasoning" 或 "normal"，用于 OpenAI 兼容的 API 响应。但这只是展示逻辑。`generate.py` 中的生成循环只有两个停止条件：

```python
while True:
    if n == max_tokens:
        break
    # ...
    yield y.item(), logprobs
    n += 1
```

总 token 计数和 EOS。没有单独的思考计数器，没有预算，没有强制 `</think>`。`enable_thinking` 参数只是透传给 `apply_chat_template()` 来改变 prompt —— 零运行时执行。

### [Ollama](https://github.com/ollama/ollama)：无预算控制功能，禁用功能也曾有 bug

Ollama 有 `--think`/`--nothink` 开关（[PR #10584](https://github.com/ollama/ollama/pull/10584)），但是：

- **没有思考预算** — [Issue #10925](https://github.com/ollama/ollama/issues/10925) 是一个未实现的功能请求。
- **generate API 中 `think=false` 曾不生效** — [Issue #14793](https://github.com/ollama/ollama/issues/14793)（已于 2026 年 3 月 23 日关闭）报告思考 token 默默消耗了整个 `num_predict` 预算，产生**空的 response 字段**。

### [`llama.cpp`](https://github.com/ggml-org/llama.cpp)：有 Reasoning 预算功能，但有 bug

llama.cpp 最近添加了 `--reasoning-budget N`（[PR #20297](https://github.com/ggml-org/llama.cpp/commit/acb7c790698fa28a0fbfc0468804926815b94de3)）。这是本地框架中最接近解决问题的，但存在显著问题：

- **Qwen3.5 的 `enable_thinking: false` 不工作** — [Issue #20182](https://github.com/ggml-org/llama.cpp/issues/20182)
- **工具解析器在思考/工具调用流中 `<tool_call>` 前出现文本时失败** — [Issue #20260](https://github.com/ggml-org/llama.cpp/issues/20260)
- **思考启用时语法约束曾失效** — [Issue #20345](https://github.com/ggml-org/llama.cpp/issues/20345)（已于 2026 年 3 月 10 日关闭）

### 对比总结

| 框架 | 预算执行 | 禁用思考 | 工具隔离 |
|---|---|---|---|
| **mlx-lm** | 无 | 仅模板层 | 无 |
| **Ollama** | 无 | generate API 曾有 bug（已修复） | 无 |
| **llama.cpp** | `--reasoning-budget`（最近添加） | Qwen3.5 上有 bug | 解析器有问题 |
| **vLLM** | `ThinkingTokenBudgetLogitsProcessor` | 正常工作 | 已实现 |
| **mlx-node** | `ReasoningTracker` | `reasoningEffort` API | 已实现 |

---

## [vLLM](https://github.com/vllm-project/vllm) 的解决方案：Logits 级别的预算执行

vLLM 通过 [`ThinkingTokenBudgetLogitsProcessor`](https://github.com/vllm-project/vllm/blob/main/vllm/v1/sample/logits_processor/builtin.py) 解决这个问题 —— 解码时的 token 级别干预，而非生成后截断。（详见 [reasoning outputs 文档](https://github.com/vllm-project/vllm/blob/main/docs/features/reasoning_outputs.md)。）

### 工作原理

该处理器维护每个请求的状态：

```python
class ThinkingTokenBudgetLogitsProcessor:
    in_think: bool          # 当前在 <think> 块内？
    think_count: int        # 已生成的思考 token 数
    in_end: bool            # 当前正在强制结束序列？
    end_count: int          # 结束 token 序列的进度
    budget: int             # 允许的最大思考 token 数
```

在每个解码步骤中：
1. 处理器扫描新生成的 token，检查 `<think>`/`</think>` 状态转换
2. 当 `in_think` 为 true 时，递增 `think_count`
3. 当 `think_count >= budget` 时，翻转 `in_end = True`
4. 当 `in_end` 为 true 时，**覆盖 logits**：对 `</think>` 序列中的下一个 token 赋予极大值，强制模型生成 `</think>`
5. 完整的结束序列生成后，正常继续内容模式的生成

这是一个**硬解码时干预**。模型别无选择 —— 当预算耗尽时，`</think>` 被生成，内容生成开始。

### 核心设计原则

> **预算执行必须发生在生成过程中，而非事后。** 事后截断不可行，因为 (1) 在流式模式中，客户端已经看到了多余的推理 token，(2) 模型需要实际过渡到内容模式 —— 你不能只是砍掉思考就指望连贯的内容跟上来。

在 token 级别强制 `</think>` 给模型提供了正确的过渡信号。模型在其上下文中"看到" `</think>` token 并据此正常生成内容，就好像它自己决定停止思考一样。

---

## [mlx-node](https://github.com/mlx-node/mlx-node) 的解决方案：ReasoningTracker + 解码循环执行

[mlx-node](https://github.com/mlx-node/mlx-node) 实现了相同的原则 —— 解码过程中的 token 级别预算执行 —— 但将其适配到流水线化的、编译过的 Metal 解码循环的现实中，而不是 vLLM 的 logits 处理器基础设施。

### 为什么不用 logits 处理器？

vLLM 有通用的 logits 处理器管线，因为它服务于许多不同需求的模型。mlx-node 专门针对 Qwen3/Qwen3.5，运行在单个 Apple Silicon 设备上。解码循环是流水线化的，前向传播可以通过 `mlx::core::compile` 编译为 Metal 图。插入 logits 处理器会打破编译图并增加开销。

取而代之的是，预算执行作为 token 替换直接内建到解码循环中。

### ReasoningTracker 状态机

```rust
pub(crate) struct ReasoningTracker {
    in_thinking: bool,           // 当前在推理模式中？
    thinking_token_count: i32,   // 思考时生成的 token 数
    budget: Option<i32>,         // 最大思考 token 数（None = 无限）
    think_end_id: Option<u32>,   // </think> 的 token ID
    force_think_end: bool,       // 预算耗尽，强制下一步
    end_scheduled: bool,         // 强制 token 已在流水线中
}
```

三个操作驱动状态机：

**`observe_token(token_id) -> bool`** — 在提取每个 token 后调用。返回该 token 是否是推理内容。当看到 `think_end_id` 时，将 `in_thinking` 转换为 `false`。在 `in_thinking` 期间递增计数器，当达到预算时设置 `force_think_end`。

**`should_force_think_end() -> bool`** — 在前向传播之后、惩罚和采样之前检查。为 true 时，解码循环跳过惩罚计算和采样，直接产出 `think_end_id` token。前向传播仍然执行以保持 KV 缓存一致性。消耗该标志（最多返回一次 true）。

**`forced_token_id() -> u32`** — 返回要注入的 `</think>` token ID。

---

## [mlx-node](https://github.com/mlx-node/mlx-node) 内 reasoning 开关完整控制流：从请求到 Token

以下是一个聊天请求在 [mlx-node](https://github.com/mlx-node/mlx-node) 推理感知解码循环中经过的完整路径。

### 步骤 1：解析 reasoning effort

面向用户的 API 是 `reasoningEffort`，[mlx-node](https://github.com/mlx-node/mlx-node) 将其映射为 chat template 的 `enable_thinking`。注意 vLLM 也暴露了 `reasoning_effort` API 参数，但对于 Qwen 模型，模板本身只读取 `enable_thinking` —— vLLM 将 `reasoning_effort` 作为模板 kwarg 透传，但 Qwen 模板忽略它。mlx-node 采取了明确的映射方式：

```rust
fn resolve_enable_thinking(config: &ChatConfig) -> Option<bool> {
    match config.reasoning_effort.as_deref() {
        Some("none") | Some("low") => Some(false),
        Some("medium") | Some("high") => Some(true),
        _ => None, // 模板决定（通常为 true）
    }
}
```

### 步骤 2：渲染 prompt

解析后的 `enable_thinking` 传递给 Jinja2 chat template：

```rust
let tokens = tokenizer.apply_chat_template_sync(
    &messages, Some(true), tool_defs, enable_thinking,
);
```

### 步骤 3：初始化 tracker

```rust
let starts_in_thinking = enable_thinking.unwrap_or(true);

let mut tracker = ReasoningTracker::new(
    starts_in_thinking,
    config.thinking_token_budget,  // 例如 Some(1024)
    think_end_id,                   // 例如 Some(248069)
);
```

特殊情况：`budget=0` 在构造函数中设置 `force_think_end=true`，所以 `</think>` 在第一个解码步骤就被强制生成。

### 步骤 4：Prefill

完整的 token 序列（prompt + `<think>\n`）通过模型一次性前向传播。这填充了 KV 缓存并产生第一个 logits。

### 步骤 5：流水线化解码循环

解码循环是**流水线化的**：第 N+1 步的前向图在第 N 步的结果从 GPU 提取之前就已经提交。这让计算和数据传输重叠以获得最大吞吐量。

```
┌───────────────────────────────────────────────────────────────┐
│ 流水线化解码循环                                              │
│                                                               │
│ for step in 0..max_new_tokens:                                │
│                                                               │
│   ┌─ 阶段 A：构建第 N+1 步的图 ─────────────────────────────┐ │
│   │                                                         │ │
│   │  forward(y) → logits            ← 始终执行              │ │
│   │                                                         │ │
│   │  tracker.should_force_think_end()?                      │ │
│   │    ├─ YES：产出 think_end_id 作为常量张量               │ │
│   │    │       （跳过惩罚 + sample）                        │ │
│   │    └─ NO： 惩罚(logits) → sample                        │ │
│   │                                                         │ │
│   │  eval_step(next_token, logits)  ← 异步 GPU 提交         │ │
│   └─────────────────────────────────────────────────────────┘ │
│                                                               │
│   ┌─ 阶段 B：提取第 N 步的结果 ─────────────────────────────┐ │
│   │                                                         │ │
│   │  y.eval()                       ← 阻塞等待 GPU          │ │
│   │  token_id = y.item_at_int32(0)  ← 拷贝到 CPU            │ │
│   │  tracker.observe_token(token_id) → is_reasoning         │ │
│   │                                                         │ │
│   │  [流式：发射带 is_reasoning 标签的 delta]               │ │
│   │                                                         │ │
│   │  if token_id == eos: break                              │ │
│   └─────────────────────────────────────────────────────────┘ │
│                                                               │
│   y = next_y  ← 推进流水线                                    │
└───────────────────────────────────────────────────────────────┘
```

关键时序：阶段 A（构建下一步图）发生在阶段 B（提取当前结果）**之前**。这意味着：

1. 预算耗尽在阶段 B 通过 `observe_token()` 检测到
2. 强制的 `</think>` 在**下一次迭代的**阶段 A 生效
3. 但当前迭代的阶段 A 已经在我们知道预算耗尽**之前**提交了一个正常的前向图

这产生了 1 个 token 的流水线延迟：`budget=N` 时，模型在 `</think>` 出现前生成 `N+1` 个思考 token。这与 vLLM 的行为一致。

### 步骤 6：`end_scheduled` 标志

`end_scheduled` 标志防止流水线化循环中的一个微妙 bug。在 `should_force_think_end()` 被消耗后（返回一次 true），流水线仍然从前一步提取超预算的思考 token。没有 `end_scheduled`，`observe_token()` 会看到 `count > budget` 并再次设置 `force_think_end`，导致双重 `</think>`：

```
budget=3 的时间线：

Step 0: Build(正常) → Extract token A → count=1
Step 1: Build(正常) → Extract token B → count=2
Step 2: Build(正常) → Extract token C → count=3, force=true
Step 3: Build(强制 </think>) → Extract token D（来自 step 2 的构建，在 force 之前）
        ↑ end_scheduled=true     → count=4，但不会重新触发
Step 4: Build(正常内容) → Extract </think> → in_thinking=false
Step 5: Build(正常内容) → Extract 内容 token → is_reasoning=false
```

Token D 是流水线延迟 —— 它在我们检测到预算时已经在途中。`end_scheduled` 标志干净地吸收了它。

### 步骤 7：最终化

解码循环完成后，生成的 token 被解码为文本并分为推理和内容：

```rust
fn parse_thinking_and_tools(text, generated_tokens, thinking_enabled, ...) {
    if !thinking_enabled {
        // 无思考模式：所有文本都是内容
        parse_tool_calls(text)
    } else if has_think_end_token(generated_tokens, think_end_id) {
        // Token 确认的 </think>：在边界处分割
        split_at_think_end(text, think_end_str)
    } else if think_end_id.is_some() {
        // 截断：在 EOS/max_tokens 之前没有 </think>
        // 所有文本都是推理，没有内容
        (String::new(), vec![], Some(thinking_text))
    } else {
        // 词表中没有 think_end_id：文本级别的回退
        split_at_think_end(text, None)
    }
}
```

四路分支确保在每种情况下都能正确分类。

---

## 流式传输：`isReasoning` 标签

在流式模式中，每个 delta 块携带一个 `isReasoning` 布尔值：

```typescript
interface ChatStreamDelta {
  text: string;
  done: boolean;
  isReasoning?: boolean;  // true = 推理，false = 内容
}
```

这对应 vLLM 的 `delta.reasoning` / `delta.content` 区分。消费者根据此标签将文本路由到相应的显示通道：

```typescript
for await (const event of model.chatStream(messages, config)) {
  if (!event.done) {
    if (event.isReasoning) {
      renderThinking(event.text);  // 可折叠的思考 UI
    } else {
      renderContent(event.text);   // 主要回答
    }
  }
}
```

---

## API

三个控制项：

### `reasoningEffort` — 顶层控制

```typescript
const result = await model.chat(messages, {
  reasoningEffort: 'low',  // 'none' | 'low' | 'medium' | 'high'
});
```

| 值 | `enable_thinking` | 效果 |
|---|---|---|
| `"none"` | `false` | 无思考。`include_reasoning` 默认为 `false`。 |
| `"low"` | `false` | 无思考。如果请求仍会包含推理。 |
| `"medium"` | `true` | 正常思考启用。 |
| `"high"` | `true` | 正常思考启用。 |
| *（未设置）* | *（模板默认，通常 `true`）* | 正常思考启用。 |

### `thinkingTokenBudget` — 硬上限

```typescript
const result = await model.chat(messages, {
  thinkingTokenBudget: 1024,  // 强制 </think> 前的最大思考 token 数
});
```

当预算耗尽时，解码循环强制 `</think>`，模型过渡到内容生成。由于流水线延迟，实际思考长度为 `budget + 1` 个 token。

### `includeReasoning` — 输出策略

```typescript
const result = await model.chat(messages, {
  includeReasoning: false,  // 在输出中隐藏思考内容
});
```

当为 `false` 时，结果上的 `thinking` 字段为 `None`。模型仍然内部思考（除非 `reasoningEffort` 为 `"none"` 或 `"low"`），但推理文本不返回给调用者。

---

## 支持我的工作

[mlx-node](https://github.com/mlx-node/mlx-node) 是一个将高性能 ML 带入 JavaScript/TypeScript 生态系统的开源项目。以下是我们正在做的：

1. **在 Node.js 中后训练 LLM** — 生产就绪的 GRPO 和 SFT 训练，完全在 JavaScript 中实现强化学习和微调
2. **MLX 的 WebGPU 后端** — 使 MLX-Node 直接在浏览器中运行，让设备端机器学习推理面向所有 Web 开发者。我们已经开发了一个 MLX 的私有 fork，有一个可用的原型并在积极优化中。
3. **更广泛的模型支持** — 除了 Qwen 家族和 PaddleOCR，扩展到更多 LLM/VLM 架构

如果你或你的组织有兴趣赞助这项研究，请查看 [GitHub Sponsors](https://github.com/sponsors/Brooooooklyn)。
