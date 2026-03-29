---
title: 'Unsloth MLX: 将 Dynamic 2.0 逐张量量化移植到 Apple Silicon'
date: 2026-03-24
author: '太狼'
postname: unsloth-quantize-recipe
description: '将 Unsloth Dynamic 2.0 逐张量量化方案移植到 MLX，基于 AWQ 混合位宽量化 Qwen3.5 模型，在 Apple Silicon 上以原生 mlx-node 速度运行。'
header_img: 'unsloth-mlx.jpg'
lang: zh
tags:
  - MLX
  - Rust
  - Quantization
  - LLM
  - Unsloth
---

**基于 Unsloth KLD 研究和开源 `imatrix` 数据的逐张量量化，以原生 MLX 速度运行**

## 模型

所有量化模型均已发布在 Hugging Face 上：

<div class="hf-card">
  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
    <img src="https://huggingface.co/front/assets/huggingface_logo.svg" alt="HF" style="height: 28px; width: 28px;" />
    <div>
      <div class="hf-title">Qwen 3.5 Unsloth MLX Collection</div>
      <div class="hf-subtitle">Brooooooklyn &middot; Hugging Face</div>
    </div>
  </div>
  <p class="hf-desc">使用 Unsloth Dynamic 2.0 方案与 AWQ 预缩放的逐张量量化 Qwen3.5 模型，针对 Apple Silicon 的 MLX 优化。</p>
  <a href="https://huggingface.co/collections/Brooooooklyn/qwen-35-unsloth-mlx" target="_blank" rel="noopener" class="hf-btn">查看合集 &rarr;</a>
</div>

## 问题：均匀量化会破坏混合架构模型

Qwen3.5 采用混合架构，交替使用**全自注意力**层和 **GatedDeltaNet**（线性注意力/SSM）层。这种混合设计给量化带来了根本性挑战：不同的架构组件对精度损失的敏感度差异巨大。

均匀 4-bit 量化——对每个权重施加相同的位宽——在标准 Transformer 上尚可接受。但 Qwen3.5 的混合层中，各张量在同一量化方案下的 KL 散度贡献范围从 **0.05（几乎无损）** 到 **6.0（灾难性）** 不等。一视同仁意味着在不敏感的权重上浪费了位数，同时摧毁了敏感的权重。

[Unsloth](https://unsloth.ai/docs/models/qwen3.5/gguf-benchmarks) 用 **Dynamic 2.0** 解决了这个问题：一种基于 150 多项 KLD 基准测试（覆盖 121 种配置）的逐张量量化策略。我们将他们的方法论移植到了 MLX-Node 的原生 Rust 管线中，并加入了 AWQ（激活感知权重量化）预缩放，进一步提升质量。

---

## Unsloth 方案的工作原理

该方案基于两个标准为每个权重张量分配精度级别：

1. **KLD 敏感度** —— 量化该张量会在多大程度上降低输出质量？
2. **AWQ 可校正性** —— 能否通过前置归一化层对该张量的列进行预缩放来改善量化效果？

在默认的 3-bit 基准下，方案产生如下分配：

| 权重类别 | 位数 | AWQ | 理由 |
|---|---|---|---|
| `embed_tokens` | 5 | — | Q5_K 下 KLD ~0.15，属最不敏感的张量 |
| `lm_head` | 6 | — | KLD ~0.05，整个模型中最安全的张量 |
| 路由门控 | 8 | — | MoE 路由精度要求高精度 |
| `self_attn.q/k/v_proj` | 5 | 是（C 组） | KLD ~1.5–2.9，可通过 `input_layernorm` 进行 AWQ 恢复 |
| `linear_attn.in_proj_qkv` | 5 | 是（D 组） | KLD ~2.9，可通过 `input_layernorm` 进行 AWQ |
| `linear_attn.in_proj_z` | 5 | 是（D 组） | MXFP4 下表现差；可通过 AWQ 校正 |
| `self_attn.o_proj` | bf16（跳过） | 否 | KLD ~1.5，无前置归一化层 → 不可 AWQ 校正 |
| `linear_attn.out_proj` | bf16（跳过） | 否 | KLD ~6.0，最差的张量，无法校正 |
| `mlp.down_proj` | 4 | 是（B 组） | 比其他 FFN 权重略敏感 |
| `mlp.gate_proj`、`mlp.up_proj` | 3 | 是（A 组） | 3-bit 下通常安全 |
| 归一化层、`A_log`、`dt_bias`、conv1d、视觉 | bf16（跳过） | — | 必须保持全精度 |

关键洞察：**在 `embed_tokens` 和 `lm_head` 上多花几个 bit（不到总模型大小的 1%）对文件大小影响微乎其微，但能显著减少输出退化。** 同时，将 MLP gate/up 投影激进地压缩到 3-bit 是可行的，因为这些权重本身对量化噪声具有更强的鲁棒性。

---

## AWQ 预缩放：秘密武器

Unsloth 方案*要求*提供重要性矩阵（imatrix），因为注意力/SSM 投影的 5-bit 量化只有在结合 AWQ 校正时才能达到可接受的质量。以下是其工作原理。

### 核心思想

AWQ（激活感知权重量化）观察到，在推理过程中，一小部分权重通道承载着不成比例的重要性。通过放大权重矩阵中重要的通道，并在前置归一化层中用逆操作补偿，我们使量化将有限的精度"集中"在最重要的通道上。

关键约束：**这仅在归一化层直接位于线性投影之前时才有效**，因为我们需要一个地方来吸收逆缩放，而不改变模型的数学行为。

### imatrix 如何提供重要性

imatrix 文件（由 [Unsloth](https://huggingface.co/unsloth) 在其开源 GGUF 仓库中发布，使用高质量对话和编程数据校准）包含逐权重通道的统计数据：

```c++
importance[channel] = sum_of_squared_activations[channel] / calibration_token_count
```

这告诉我们每个输入通道对输出的贡献程度。重要性分数高的通道需要更多的量化精度。

### 四个 AWQ 缩放组

我们对每层应用四组 AWQ，每组利用一对 norm→projection：

**A 组：`post_attention_layernorm` → `gate_proj` + `up_proj`**

```c++
scales = element_max(importance(gate_proj), importance(up_proj))
gate_proj.weight[:, j] *= scales[j]
up_proj.weight[:, j]   *= scales[j]
post_attention_layernorm.weight[j] /= scales[j]
```

**B 组：`up_proj` 输出 → `down_proj` 输入**

```c++
scales = importance(down_proj)
down_proj.weight[:, j] *= scales[j]
up_proj.weight[j, :]   /= scales[j]   // 行，不是列
```

**C 组：`input_layernorm` → `self_attn.q/k/v_proj`**（仅全注意力层）

```c++
scales = element_max(importance(q_proj), importance(k_proj), importance(v_proj))
q_proj.weight[:, j] *= scales[j]
k_proj.weight[:, j] *= scales[j]
v_proj.weight[:, j] *= scales[j]
input_layernorm.weight[j] /= scales[j]
```

**D 组：`input_layernorm` → `linear_attn.in_proj_qkv` + `in_proj_z`**（仅 GatedDeltaNet 层）

```c++
scales = element_max(importance(in_proj_qkv), importance(in_proj_z))
in_proj_qkv.weight[:, j] *= scales[j]
in_proj_z.weight[:, j]   *= scales[j]
input_layernorm.weight[j] /= scales[j]
```

C 组和 D 组互斥——Qwen3.5 在全注意力层和 GatedDeltaNet 层之间交替。

### 为什么 `o_proj` 和 `out_proj` 保持 bf16

这是唯一**未被** AWQ 覆盖的注意力/SSM 投影：

- `self_attn.o_proj` 接收来自注意力计算的输入，而非归一化层
- `linear_attn.out_proj` 接收来自 GatedDeltaNet 计算的输入

没有前置归一化层来吸收逆缩放，所以 AWQ 无法发挥作用。鉴于它们较高的 KLD 敏感度（分别为 1.5 和 6.0），唯一安全的选择是保持全精度。

### 缩放公式

```rust
fn compute_normalized_scales(importance: &[f32], ratio: f32) -> Vec<f32> {
    // ratio = 0.5（重要性的平方根）
    let scales: Vec<f32> = importance.iter()
        .map(|x| x.max(1e-8).powf(ratio))
        .collect();

    // 通过 sqrt(max * min) 归一化以保持权重幅度
    let normalizer = (max(scales) * min(scales)).sqrt();
    scales.iter().map(|s| s / normalizer).collect()
}
```

`ratio = 0.5` 意味着我们取重要性的平方根——一种较温和的缩放方式，避免过度放大离群通道。通过 `sqrt(max * min)` 的归一化保持整体权重幅度稳定，防止量化过程中的数值问题。

---

## 完整控制流

### 步骤 1：CLI 调用

```bash
mlx convert \
  --input Qwen/Qwen3.5-35B-A3B \
  --output ./Qwen3.5-35B-A3B-unsloth-mlx \
  --quantize \
  --q-recipe unsloth \
  --imatrix-path imatrix.gguf
```

CLI（`packages/cli/src/commands/convert.ts`）强制执行两个约束：
- unsloth 方案**要求** `--imatrix-path`（缺失则报错退出）
- 默认基准位数为 **3**（可通过 `--q-bits` 覆盖）

### 步骤 2：加载权重

根据输入格式有两条路径：
- **GGUF → SafeTensors**：解析 GGUF 二进制文件，通过 `gguf_name_to_hf()` 将 GGUF 命名（如 `blk.0.ffn_gate.weight`）映射为 HuggingFace 命名（如 `model.layers.0.mlp.gate_proj.weight`）
- **SafeTensors 直接加载**：通过 MLX 的惰性加载器加载（单文件或分片）

### 步骤 3：模型清理

对于 Qwen3.5 MoE 模型：通过 `sanitize_qwen35_moe()` 进行 FP8 反量化、键名映射和专家权重堆叠。这必须在量化之前运行，因为堆叠后的 FP8 再量化会产生乱码——必须先反量化。

### 步骤 4：AWQ 预缩放

将 imatrix GGUF 文件解析为逐通道重要性分数。AWQ 预缩放**就地**修改所有四组权重，将逆缩放融合到归一化层中。这在量化**之前**完成，使修改后的权重量化更准确。

### 步骤 5：构建方案

`build_unsloth_recipe()` 返回一个闭包，将每个权重键映射到 `QuantDecision`：

```rust
pub enum QuantDecision {
    Skip,                                    // 保持 bf16
    Default,                                 // 使用基准位数（3）
    Custom { bits, group_size, mode },       // 逐张量覆盖
}
```

关键顺序：`embed_tokens` 和 `lm_head` 在 `should_quantize()` **之前**检查，因为该函数默认会跳过它们。这是 Unsloth 方案独有的设计。

### 步骤 6：量化

对每个权重，谓词决定执行动作：
1. `Skip` → 权重保持不变（bf16）
2. `Default` → `mlx_quantize(weight, group_size=64, bits=3, mode="affine")`
3. `Custom` → `mlx_quantize(weight, custom_group_size, custom_bits, custom_mode)`

MLX 的量化函数将权重打包为 uint32，附带 `scales` 和 `biases` 辅助张量。

### 步骤 7：写入输出

- **SafeTensors**：量化权重写入 `.safetensors` 分片
- **config.json**：更新为包含逐层量化覆盖，以确保模型在推理时正确加载：

```json
{
  "quantization": {
    "bits": 3,
    "group_size": 64,
    "mode": "affine",
    "language_model.model.embed_tokens": { "bits": 5, "group_size": 64 },
    "language_model.model.lm_head": { "bits": 6, "group_size": 64 },
    "language_model.model.layers.0.self_attn.q_proj": { "bits": 5, "group_size": 64 },
    "language_model.model.layers.0.mlp.down_proj": { "bits": 4, "group_size": 64 }
  }
}
```

---

## 运行时：混合位宽模型如何加载和执行

编译后的 C++ 前向路径在推理时自动处理混合位宽权重。`mlx_qwen35_common.h` 中的 `linear_proj()` 函数逐张量自动检测量化格式：

```cpp
// 简化自 mlx_qwen35_common.h:linear_proj()
if (has_scales && has_biases) {
    int bits = infer_affine_bits(weight_shape, scales_shape, group_size);
    return quantized_matmul(x, weight, scales, biases, /*transpose=*/true, group_size, bits);
} else if (has_scales) {
    // MXFP8 路径
    return gather_qmm(x, weight, scales, /*transpose=*/true, group_size, /*bits=*/8);
} else {
    // bf16 — 未量化的张量（o_proj、out_proj）
    return matmul(x, transpose(weight));
}
```

这意味着**不需要特殊的运行时配置**——模型在同一前向传播中无缝处理 3-bit 的 gate_proj、5-bit 的 q_proj 和 bf16 的 o_proj。

MoE 编译前向（`mlx_qwen35_moe.cpp`）特别指出了这一设计：

```cpp
// 使用 linear_proj（逐张量自动检测位数），因为 down_proj 可能与
// gate_proj/up_proj 有不同的位数（例如 unsloth 方案）
```

---

## 实际使用

### 从 Unsloth 下载 imatrix 数据

Unsloth 发布了使用高质量对话和编程数据校准的预计算 imatrix 文件。直接从其 GGUF 仓库下载：

```bash
yarn mlx download model \
  -m unsloth/Qwen3.5-35B-A3B-GGUF \
  --cache-dir ./.cache/huggingface \
  -g "imatrix_unsloth.gguf_file"
```

这仅下载 imatrix 文件（不包含完整模型权重），使用 `-g` glob 过滤器。Unsloth 的 imatrix 使用长上下文对话、编程和工具调用示例校准——对于指令模型来说，显著优于基于 Wikipedia 的校准。

### 使用 Unsloth 方案转换

```bash
# 从官方 Qwen 模型
mlx convert \
  --input Qwen/Qwen3.5-35B-A3B \
  --output ./Qwen3.5-35B-A3B-unsloth-mlx \
  --quantize \
  --q-recipe unsloth \
  --imatrix-path imatrix.gguf_file
```

### 覆盖基准位数

```bash
# 4-bit 基准：down=5b, embed=6b, lm_head=8b, attn=6b
mlx convert ... --q-recipe unsloth --q-bits 4

# 2-bit 基准：down=3b, embed=4b, lm_head=5b, attn=4b
mlx convert ... --q-recipe unsloth --q-bits 2
```

`snap_bits` 函数将计算值映射到 MLX 支持的位宽（2、3、4、5、6、8）。值得注意的是，7 会向上取整到 8，因为 MLX 不支持 7-bit 量化。

---

## 致谢

Unsloth 量化方案基于 [Unsloth 的 Dynamic 2.0 方法论](https://unsloth.ai/docs/models/qwen3.5/gguf-benchmarks)，该方法在 121 种量化配置上进行了 150 多项 KLD 基准测试，以确定 Qwen3.5 混合模型的最优逐张量位分配。他们在张量敏感度方面的开放研究——特别是发现 `linear_attn.out_proj` 是最敏感的张量（KLD ~6.0），而 `lm_head` 是最安全的（KLD ~0.05）——直接影响了本实现中的位分配和 AWQ 组设计。

---

## 基准测试

我们正在积极开展全面的基准测试，比较我们的 MLX Affine quantization 与 Unsloth 的 GGUF k-quants——包括 KLD 测量、标准基准上的评估准确率（MMLU Pro、LiveCodeBench、GPQA、[PinchBench](https://pinchbench.com)）以及跨 Apple Silicon 各代的推理速度。结果将在完成后发布于此。

---

## 支持我的工作

[mlx-node](https://github.com/mlx-node/mlx-node) 是一个开源项目，致力于将高性能机器学习引入 JavaScript/TypeScript 生态系统。以下是我们正在做的事情：

1. **在 Node.js 中进行 LLM 后训练** —— 生产就绪的 GRPO 和 SFT 训练，完全在 JavaScript 中实现强化学习和微调
2. **MLX 的 WebGPU 后端** —— 让 MLX-Node 直接在浏览器中运行，使所有 Web 开发者都能进行设备端机器学习推理。我们已开发了一个 MLX 的私有分支，拥有可工作的原型，正在积极打磨中。
3. **更广泛的模型支持** —— 除 Qwen 系列和 PaddleOCR 外，扩展到更多 LLM/VLM 架构

**我们需要的：** 更强大的硬件来推动设备端 ML 研究的边界——M5 Max 和 M5 Ultra（希望它很快发布）设备，以及 RTX Pro 6000 Blackwell 工作站。

如果您或您的组织有兴趣赞助这项研究，请通过 [GitHub Sponsors](https://github.com/sponsors/Brooooooklyn) 赞助。
