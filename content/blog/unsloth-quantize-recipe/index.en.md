---
title: 'Unsloth MLX: Bring Dynamic 2.0 Per-Tensor Quantization to Apple Silicon'
date: 2026-03-24
author: '太狼'
postname: unsloth-quantize-recipe
description: 'Bring Unsloth Dynamic 2.0 per-tensor quantization to MLX. Mixed-bit AWQ quantization for Qwen3.5 models running natively on Apple Silicon with mlx-node.'
header_img: 'unsloth-mlx.jpg'
lang: en
tags:
  - MLX
  - Rust
  - Quantization
  - LLM
  - Unsloth
---

**Per-tensor quantization informed by Unsloth's KLD research and open-source `imatrix` data, running at full MLX speed**

## Models

All quantized models are available on Hugging Face:

<div class="hf-card">
  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
    <img src="https://huggingface.co/front/assets/huggingface_logo.svg" alt="HF" style="height: 28px; width: 28px;" />
    <div>
      <div class="hf-title">Qwen 3.5 Unsloth MLX Collection</div>
      <div class="hf-subtitle">Brooooooklyn &middot; Hugging Face</div>
    </div>
  </div>
  <p class="hf-desc">Per-tensor quantized Qwen3.5 models using Unsloth Dynamic 2.0 recipe with AWQ pre-scaling, optimized for Apple Silicon via MLX.</p>
  <a href="https://huggingface.co/collections/Brooooooklyn/qwen-35-unsloth-mlx" target="_blank" rel="noopener" class="hf-btn">View Collection &rarr;</a>
</div>

## The Problem: Uniform Quantization Destroys Hybrid Models

Qwen3.5 is a hybrid architecture that alternates between **full self-attention** layers and **GatedDeltaNet** (linear attention/SSM) layers. This hybrid design creates a fundamental challenge for quantization: different architectural components have wildly different sensitivity to precision loss.

Uniform 4-bit quantization — applying the same bit-width to every weight — works acceptably for standard transformers. But Qwen3.5's hybrid layers contain tensors whose KL Divergence contribution ranges from **0.05 (nearly lossless)** to **6.0 (catastrophic)** under the same quantization scheme. Treating them equally wastes bits on insensitive weights while destroying sensitive ones.

[Unsloth](https://unsloth.ai) solved this with **Dynamic 2.0**: a per-tensor quantization strategy informed by over 150 KLD benchmarks across 121 configurations. We ported their methodology into MLX-Node's native Rust pipeline, adding AWQ (Activation-Aware Weight Quantization) pre-scaling to push quality even further.

---

## What the Unsloth Recipe Does

The recipe assigns each weight tensor a precision level based on two criteria:

1. **KLD sensitivity** — How much does quantizing this tensor degrade output quality?
2. **AWQ correctability** — Can we pre-scale this tensor's columns using a preceding norm layer to improve quantization?

At its default 3-bit base, the recipe produces this allocation:

| Weight Class | Bits | AWQ | Rationale |
|---|---|---|---|
| `embed_tokens` | 5 | — | KLD ~0.15 at Q5_K. Among least sensitive tensors |
| `lm_head` | 6 | — | KLD ~0.05. Safest tensor in the entire model |
| Router gates | 8 | — | MoE routing accuracy requires high precision |
| `self_attn.q/k/v_proj` | 5 | Yes (Group C) | KLD ~1.5–2.9. AWQ via `input_layernorm` recovers quality |
| `linear_attn.in_proj_qkv` | 5 | Yes (Group D) | KLD ~2.9. AWQ via `input_layernorm` |
| `linear_attn.in_proj_z` | 5 | Yes (Group D) | Performs poorly with MXFP4; AWQ-correctable |
| `self_attn.o_proj` | bf16 (skip) | No | KLD ~1.5. No preceding norm → not AWQ-correctable |
| `linear_attn.out_proj` | bf16 (skip) | No | KLD ~6.0. Worst tensor by far. Cannot be corrected |
| `mlp.down_proj` | 4 | Yes (Group B) | Slightly more sensitive than other FFN weights |
| `mlp.gate_proj`, `mlp.up_proj` | 3 | Yes (Group A) | Generally safe at 3-bit |
| Norms, `A_log`, `dt_bias`, conv1d, vision | bf16 (skip) | — | Must stay full precision |

The key insight: **spending a few extra bits on `embed_tokens` and `lm_head` (< 1% of total model size) has negligible impact on file size but dramatically reduces output degradation.** Meanwhile, aggressively compressing MLP gate/up projections to 3-bit works because those weights are inherently more robust to quantization noise.

---

## AWQ Pre-Scaling: The Secret Weapon

The Unsloth recipe *requires* an importance matrix (imatrix) because 5-bit quantization of attention/SSM projections only achieves acceptable quality when combined with AWQ correction. Here's how it works.

### The Core Idea

AWQ (Activation-Aware Weight Quantization) observes that a small fraction of weight channels carry disproportionate importance during inference. By amplifying important channels in the weight matrix and compensating with the inverse in the preceding normalization layer, we make quantization "focus" its limited precision on the channels that matter most.

The key constraint: **this only works when a norm layer directly precedes the linear projection**, because we need somewhere to absorb the inverse scaling without changing the model's mathematical behavior.

### How the imatrix Provides Importance

The imatrix file (published by [Unsloth](https://unsloth.ai/docs/models/qwen3.5/gguf-benchmarks) in their open-source GGUF repos, calibrated on high-quality conversational and coding data) contains per-weight-channel statistics:

```c++
importance[channel] = sum_of_squared_activations[channel] / calibration_token_count
```

This tells us how much each input channel contributes to the output. Channels with high importance scores need more quantization precision.

### The Four AWQ Scale Groups

We apply AWQ in four groups per layer, each exploiting a norm→projection pair:

**Group A: `post_attention_layernorm` → `gate_proj` + `up_proj`**

```c++
scales = element_max(importance(gate_proj), importance(up_proj))
gate_proj.weight[:, j] *= scales[j]
up_proj.weight[:, j]   *= scales[j]
post_attention_layernorm.weight[j] /= scales[j]
```

**Group B: `up_proj` output → `down_proj` input**

```c++
scales = importance(down_proj)
down_proj.weight[:, j] *= scales[j]
up_proj.weight[j, :]   /= scales[j]   // rows, not columns
```

**Group C: `input_layernorm` → `self_attn.q/k/v_proj`** (full-attention layers only)

```c++
scales = element_max(importance(q_proj), importance(k_proj), importance(v_proj))
q_proj.weight[:, j] *= scales[j]
k_proj.weight[:, j] *= scales[j]
v_proj.weight[:, j] *= scales[j]
input_layernorm.weight[j] /= scales[j]
```

**Group D: `input_layernorm` → `linear_attn.in_proj_qkv` + `in_proj_z`** (GatedDeltaNet layers only)

```c++
scales = element_max(importance(in_proj_qkv), importance(in_proj_z))
in_proj_qkv.weight[:, j] *= scales[j]
in_proj_z.weight[:, j]   *= scales[j]
input_layernorm.weight[j] /= scales[j]
```

Groups C and D are mutually exclusive — Qwen3.5 alternates between full-attention and GatedDeltaNet layers.

### Why `o_proj` and `out_proj` Stay at bf16

These are the only attention/SSM projections **not** covered by AWQ:

- `self_attn.o_proj` receives its input from the attention computation, not from a norm layer
- `linear_attn.out_proj` receives its input from the GatedDeltaNet computation

There's no preceding norm to absorb inverse scales, so AWQ can't help. Given their high KLD sensitivity (1.5 and 6.0 respectively), the only safe option is keeping them at full precision.

### The Scale Formula

```rust
fn compute_normalized_scales(importance: &[f32], ratio: f32) -> Vec<f32> {
    // ratio = 0.5 (square root of importance)
    let scales: Vec<f32> = importance.iter()
        .map(|x| x.max(1e-8).powf(ratio))
        .collect();

    // Normalize by sqrt(max * min) to preserve weight magnitude
    let normalizer = (max(scales) * min(scales)).sqrt();
    scales.iter().map(|s| s / normalizer).collect()
}
```

The `ratio = 0.5` means we take the square root of importance — a gentler scaling that avoids over-amplifying outlier channels. The normalization by `sqrt(max * min)` keeps the overall weight magnitude stable, preventing numerical issues during quantization.

---

## Full Control Flow

### Step 1: CLI Invocation

```bash
mlx convert \
  --input Qwen/Qwen3.5-35B-A3B \
  --output ./Qwen3.5-35B-A3B-unsloth-mlx \
  --quantize \
  --q-recipe unsloth \
  --imatrix-path imatrix.gguf
```

The CLI (`packages/cli/src/commands/convert.ts`) enforces two constraints:
- The unsloth recipe **requires** `--imatrix-path` (exits with error if missing)
- Default base bits is **3** (override with `--q-bits`)

### Step 2: Load Weights

Two paths depending on input format:
- **GGUF → SafeTensors**: Parse GGUF binary, remap keys from GGUF naming (e.g., `blk.0.ffn_gate.weight`) to HuggingFace naming (e.g., `model.layers.0.mlp.gate_proj.weight`) via `gguf_name_to_hf()`
- **SafeTensors direct**: Load via MLX's lazy loader (single file or sharded)

### Step 3: Model Sanitization

For Qwen3.5 MoE models: FP8 dequantization, key remapping, and expert weight stacking via `sanitize_qwen35_moe()`. This runs before quantization because FP8 re-quantization after stacking produces gibberish — dequant must happen first.

### Step 4: AWQ Pre-Scaling

The imatrix GGUF file is parsed into per-channel importance scores. AWQ pre-scaling modifies weights **in-place** across all four groups, fusing inverse scales into norm layers. This happens **before** quantization so the modified weights quantize more accurately.

### Step 5: Build Recipe Predicate

`build_unsloth_recipe()` returns a closure that maps each weight key to a `QuantDecision`:

```rust
pub enum QuantDecision {
    Skip,                                    // Leave at bf16
    Default,                                 // Use base bits (3)
    Custom { bits, group_size, mode },       // Per-tensor override
}
```

The critical ordering: `embed_tokens` and `lm_head` are checked **before** `should_quantize()`, because that function would skip them by default. This is unique to the unsloth recipe.

### Step 6: Quantize

For each weight, the predicate determines the action:
1. `Skip` → weight stays untouched (bf16)
2. `Default` → `mlx_quantize(weight, group_size=64, bits=3, mode="affine")`
3. `Custom` → `mlx_quantize(weight, custom_group_size, custom_bits, custom_mode)`

MLX's quantize function packs weights into uint32 with `scales` and `biases` side-car tensors. Memory is cleared every 50 tensors via `synchronize_and_clear_cache()`.

### Step 7: Write Output

- **SafeTensors**: Quantized weights written to `.safetensors` shards
- **config.json**: Updated with per-layer quantization overrides so the model loads correctly at inference time:

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

## Runtime: How Mixed-Bit Models Load and Execute

The compiled C++ forward paths automatically handle mixed-bit weights at inference time. The `linear_proj()` function in `mlx_qwen35_common.h` auto-detects the quantization format per-tensor:

```cpp
// Simplified from mlx_qwen35_common.h:linear_proj()
if (has_scales && has_biases) {
    int bits = infer_affine_bits(weight_shape, scales_shape, group_size);
    return quantized_matmul(x, weight, scales, biases, /*transpose=*/true, group_size, bits);
} else if (has_scales) {
    // MXFP8 path
    return gather_qmm(x, weight, scales, /*transpose=*/true, group_size, /*bits=*/8);
} else {
    // bf16 — unquantized tensor (o_proj, out_proj)
    return matmul(x, transpose(weight));
}
```

This means **no special runtime configuration is needed** — the model seamlessly handles 3-bit gate_proj, 5-bit q_proj, and bf16 o_proj all within the same forward pass.

The MoE compiled forward (`mlx_qwen35_moe.cpp`) specifically notes this design:

```cpp
// Use linear_proj (auto-detects bits per tensor) since down_proj may have
// different bits than gate_proj/up_proj (e.g. unsloth recipe)
```

---

## Practical Usage

### Download imatrix data from Unsloth

Unsloth publishes pre-computed imatrix files calibrated on high-quality conversational and coding data. Download them directly from their GGUF repos:

```bash
yarn mlx download model \
  -m unsloth/Qwen3.5-35B-A3B-GGUF \
  --cache-dir ./.cache/huggingface \
  -g "imatrix_unsloth.gguf_file"
```

This downloads only the imatrix file (not the full model weights) using the `-g` glob filter. Unsloth's imatrix is calibrated on long-context chat, coding, and tool-calling examples — significantly better than Wikipedia-based calibration for instruct models.

### Convert with the Unsloth recipe

```bash
# From Official Qwen Model
mlx convert \
  --input Qwen/Qwen3.5-35B-A3B \
  --output ./Qwen3.5-35B-A3B-unsloth-mlx \
  --quantize \
  --q-recipe unsloth \
  --imatrix-path imatrix.gguf_file
```

### Override the base bits

```bash
# 4-bit base: down=5b, embed=6b, lm_head=8b, attn=6b
mlx convert ... --q-recipe unsloth --q-bits 4

# 2-bit base: down=3b, embed=4b, lm_head=5b, attn=4b
mlx convert ... --q-recipe unsloth --q-bits 2
```

The `snap_bits` function maps computed values to MLX-supported widths (2, 3, 4, 5, 6, 8). Notably, 7 snaps up to 8 since MLX doesn't support 7-bit quantization.

---

## Acknowledgments

The unsloth quantize recipe is based on [Unsloth's Dynamic 2.0 methodology](https://unsloth.ai/docs/models/qwen3.5/gguf-benchmarks), which conducted 150+ KLD benchmarks across 121 quantization configurations to determine optimal per-tensor bit allocation for Qwen3.5 hybrid models. Their open research into tensor sensitivity — particularly the discovery that `linear_attn.out_proj` is the most sensitive tensor (KLD ~6.0) while `lm_head` is the safest (KLD ~0.05) — directly informed the bit allocation and AWQ group design in this implementation.

---

## Benchmarks

We're actively working on comprehensive benchmarks comparing our MLX affine quantization against Unsloth's GGUF k-quants — including KLD measurements, eval accuracy on standard benchmarks (MMLU Pro, LiveCodeBench, GPQA, [PinchBench](https://pinchbench.com)), and inference speed across Apple Silicon generations. Results will be published here as they become available.

---

## Support My Work

[mlx-node](https://github.com/mlx-node/mlx-node) is an open-source effort to bring high-performance ML to the JavaScript/TypeScript ecosystem. Here's what we're working on:

1. **Post-training LLMs in Node.js** — Production-ready GRPO and SFT training, enabling reinforcement learning and fine-tuning entirely in JavaScript
2. **WebGPU backend for MLX** — Enabling MLX-Node to run directly in the browser, making on-device machine learning inference available to all web developers. We have developed a private fork of MLX with a working prototype and are actively polishing it.
3. **Broader model support** — Beyond Qwen family and PaddleOCR, expanding to more LLM/VLM architectures

**What we need:** More powerful hardware to push the boundaries of on-device ML research — M5 Max and M5 Ultra (Hope it will be released soon) devices, and an RTX Pro 6000 Blackwell workstation.

If you or your organization are interested in sponsoring this research, please check here [GitHub Sponsors](https://github.com/sponsors/Brooooooklyn).
