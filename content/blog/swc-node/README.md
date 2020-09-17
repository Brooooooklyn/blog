---
layout: post
title: swc-node, 最快的 TypeScript/JavaScript compiler
date: 2020-07-31
author: '太狼'
postname: swc-node
header_img: 'head.jpg'
tags:
  - Rust
  - N-API
  - NodeJS
  - TypeScript
  - Babel
  - esbuild
  - swc
  - swc-node
---

## 最快的 TypeScript 编译工具

如果大家对 [deno](https://github.com/denoland/deno) 有所关注会发现 deno 围绕 TypeScript 生态扩展了很多用 Rust 实现的高性能工具链，比如 deno_lint 和 deno_fmt。

而这些工具链都是建立 [swc-project/swc](https://github.com/swc-project/swc) 项目上，swc 是用 Rust 实现的一套 TypeScript/JavaScript compiler，性能较 babel/ts 快 5 ～ 20 倍。

swc 官方提供了 node binding，但是官方版本使用起来有几个问题:

- ~~使用 [neon](https://github.com/neon-bindings/neon) 来实现 NodeJS 的 binding，neon 在 binding 层性能相较于 NodeJS 的 n-api 有一定的劣势，并且不是 ABI stable。这意味着针对多个 Node/V8 版本要编译多个 binary~~ 作者已经在我的帮助下 migrate 到了 [napi-rs](https://github.com/napi-rs/napi-rs) ，在 [swc 支持 native 插件之后](https://github.com/swc-project/swc/issues/1048)，[@swc-node](https://github.com/Brooooooklyn/swc-node) 会直接使用官方的 node 实现。
- prebuilt 的 binary 在 postinstall 的时候从 Github assets 下载进行分发，在 +86 地区会被 GFW 制裁。
- 在 native 层做了太上层的抽象，（Class 封装，参数的一层层 serialize/deserialize）进一步降低了性能。

为了解决这些问题，诞生了 swc-node 项目: [swc-node](https://github.com/Brooooooklyn/swc-node)

与官方的 @swc/core 相比，swc-node 有以下几个优势:

- 使用 `N-API` 实现，兼容 8.9+ 所有的 NodeJS 版本
- ~~没有 postinstall，所有的内容都最小化的从 npm 下载，很方便的使用各种 npm 源加速~~
- ~~性能更强~~
- 对 node 各种生态有更好的支持，比如 [jest](https://github.com/Brooooooklyn/swc-node/tree/master/packages/jest) 和 [swc-register](https://github.com/Brooooooklyn/swc-node/tree/master/packages/register) （未来还会有 swc-loader 等其它工具链的支持）

在性能上，Github 的项目中有一个简单的 benchmark，将 RxJS 的 AjaxObservable.ts 编译成 ES2015 + CommonJS 的 JavaScript（这里不用 ES5 target 是因为 esbuild 不支持 target ES5）:

**硬件信息**:

```bash
Model Name: MacBook Pro
Model Identifier: MacBookPro15,1
Processor Name: 6-Core Intel Core i7
Processor Speed: 2.6 GHz
Number of Processors: 1
Total Number of Cores: 6
L2 Cache (per Core): 256 KB
L3 Cache: 12 MB
Hyper-Threading Technology: Enabled
Memory: 16 GB
```

- Transform Sync

```bash
@swc-node/core x 368 ops/sec ±4.18% (84 runs sampled)
esbuild x 42.16 ops/sec ±1.76% (55 runs sampled)
typescript x 24.52 ops/sec ±14.38% (51 runs sampled)
babel x 22.08 ops/sec ±10.17% (44 runs sampled)
Transform rxjs/AjaxObservable.ts benchmark bench suite: Fastest is @swc-node/core
```

- Transform Async Parallel

```bash
@swc-node/core x 946 ops/sec ±2.36% (74 runs sampled)
esbuild x 931 ops/sec ±3.56% (65 runs sampled)
Transform rxjs/AjaxObservable.ts parallel benchmark bench suite: Fastest is @swc-node/core,esbuild
```

而使用 [@swc-node/jest](https://www.npmjs.com/package/@swc-node/jest) 之后，我目前在公司负责的一个纯 TypeScript 项目测试运行时间也大大降低:

```javascript
// jest.config.js

module.exports = {
  verbose: true,
  transform: {
    '^.+\\.(t|j)sx?$': '@swc-node/jest',
  },
}
```

**ts-jest:**

```bash
Test Suites: 48 passed, 48 total
Tests:       239 passed, 239 total
Snapshots:   49 passed, 49 total
Time:        49.808 s
Ran all test suites.
✨  Done in 54.35s.
```

**@swc-node/jest:**

```bash
Test Suites: 49 passed, 49 total
Tests:       250 passed, 250 total
Snapshots:   53 passed, 53 total
Time:        9.921 s
Ran all test suites.
✨  Done in 15.79s.
```

## 问题:

虽然 swc 又快又好，但是还是有一些毛病的，在使用之前你需要有一些取舍:

**编译产物还没有经过大规模验证:**

由于是从零开始编写的 TypeScript 编译器，swc 毕竟被使用的时间还太短了，在我接入公司项目的过程中就发现了好几个编译 bug，所以目前不推荐用来编译生产环境代码，用在 dev 环境或者用来编译测试代码都是不错的选择。

在 [@swc-node](https://github.com/Brooooooklyn/swc-node) 项目中，如果使用过程中发现编译有问题的文件，可以通过 **fallbackToTs** 选项让特定的文件 fallback 到 TypeScript 编译。

**目前只支持 linux-gnu-64/ macOS / Win 64 三个平台**

如果你想在 Android 设备，~~linux musl 环境~~ (已经支持 linux musl) 或者 Windows ARM/ia64 上使用 `@swc-node` 可能需要等上一段时间了
