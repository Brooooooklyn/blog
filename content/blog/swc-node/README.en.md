---
layout: post
title: swc-node, the Fastest TypeScript/JavaScript Compiler
date: 2020-07-31
author: '太狼'
postname: swc-node
header_img: 'head.jpg'
lang: en
tags:
  - Rust
  - N-API
  - Node.js
  - TypeScript
  - Babel
  - esbuild
  - swc
  - swc-node
---

## The Fastest TypeScript Compilation Tool

If you've been following [deno](https://github.com/denoland/deno), you may have noticed that deno has expanded its TypeScript ecosystem with many high-performance toolchains implemented in Rust, such as deno_lint and deno_fmt.

These toolchains are all built on top of the [swc-project/swc](https://github.com/swc-project/swc) project. swc is a TypeScript/JavaScript compiler implemented in Rust, delivering 5 to 20 times better performance than babel/ts.

swc officially provides a node binding, but the official version has several issues:

- ~~It uses [neon](https://github.com/neon-bindings/neon) for the Node.js binding. neon has some performance disadvantages compared to Node.js's n-api at the binding layer and is not ABI stable. This means multiple binaries need to be compiled for different Node/V8 versions.~~ The author has already migrated to [napi-rs](https://github.com/napi-rs/napi-rs) with my help. Once [swc supports native plugins](https://github.com/swc-project/swc/issues/1048), [@swc-node](https://github.com/Brooooooklyn/swc-node) will directly use the official node implementation.
- Prebuilt binaries are distributed by downloading from GitHub assets during postinstall, which is blocked by the GFW in mainland China.
- Too many high-level abstractions are done in the native layer (class wrappers, multiple layers of serialize/deserialize for parameters), which further degrades performance.

To address these issues, the swc-node project was created: [swc-node](https://github.com/Brooooooklyn/swc-node)

Compared to the official @swc/core, swc-node has the following advantages:

- Implemented using `N-API`, compatible with all Node.js versions 8.9+
- ~~No postinstall — everything is downloaded in a minimal form from npm, making it easy to use various npm registry mirrors for faster downloads~~
- ~~Better performance~~
- Better support for the Node.js ecosystem, such as [jest](https://github.com/Brooooooklyn/swc-node/tree/master/packages/jest) and [swc-register](https://github.com/Brooooooklyn/swc-node/tree/master/packages/register) (with future support for swc-loader and other toolchains)

In terms of performance, there is a simple benchmark in the GitHub repo that compiles RxJS's AjaxObservable.ts to ES2015 + CommonJS JavaScript (ES5 target is not used here because esbuild does not support targeting ES5):

**Hardware Info**:

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

After adopting [@swc-node/jest](https://www.npmjs.com/package/@swc-node/jest), the test execution time for a pure TypeScript project I'm responsible for at work was significantly reduced:

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

## Caveats:

Although swc is fast and capable, it still has some rough edges. You should be aware of the following trade-offs before using it:

**Compilation output has not been validated at large scale:**

Since the TypeScript compiler was written from scratch, swc simply hasn't been in use long enough. During the process of integrating it into projects at work, I discovered several compilation bugs. Therefore, it is currently not recommended for compiling production code. Using it in dev environments or for compiling test code are both good choices.

In the [@swc-node](https://github.com/Brooooooklyn/swc-node) project, if you encounter files with compilation issues, you can use the **fallbackToTs** option to have specific files fall back to TypeScript compilation.

**Currently only supports three platforms: linux-gnu-64 / macOS / Win 64**

If you want to use `@swc-node` on Android devices, ~~linux musl environments~~ (linux musl is now supported), or Windows ARM/ia64, you may need to wait a while.
