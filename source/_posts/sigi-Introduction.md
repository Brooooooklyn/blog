---
layout:     post
title:      Sigi framework introduction
subtitle:   ""
date:       2020-02-15
author:     "太狼"
postname:   Sigi framework introduction
header-img: "/images/sigi-introduction.jpg"
tags:
  - TypeScript
  - RxJS
  - Sigi
---

> 这篇文章只会介绍 `Sigi framework` 的设计理念以及试图解决哪些问题，不会对各个 `API` 有详细的描述，如果你想开始学习并使用 `Sigi framework` 请到 https://sigi.how/zh/basic

## 从 Redux 而来

在 Redux 时代，有无数人努力着让业务中的**样板代码(boilerplate code)** 稍微少一点。最早的时候，我们通过 `redux-actions` `redux-toolkit` 等工具库减少样板代码，在不考虑 `TypeScript` 的情况下这些工具有非常好的抽象效果，在这两个库的文档中可以看到在 `JavaScript` 项目中使用它们之后带来的显著效果。但随着 `TypeScript` 的到来，有很多种方式的努力都付诸东流，因为大家发现除了与 `Redux` 相关的 `Action/Reducer/Middleware` 三件套的样板代码需要去除，连接这三个部分的**类型**代码也同样多如牛毛。

### 业务逻辑割裂

业务逻辑割裂分为两个方面，一个是 **code path** 断裂，一个是 **类型推导割裂**。

`Redux` 分离 `Action`, `Reducer` 与 `Side effect` 的设计能让我们在写业务的时候更容易写出干净无副作用的组件，并且能让我们更好分离各部分业务的职责。而这种设计如果不加以封装则会让代码的 **Code path** 过于冗长，不利于**连贯的**进行代码阅读与业务逻辑理解，提高代码的维护成本。而早期社区推崇的[Rails 风格](https://redux.js.org/faq/code-structure#what-should-my-file-structure-look-like-how-should-i-group-my-action-creators-and-reducers-in-my-project-where-should-my-selectors-go)的抽象方式(将 action/reducer/side effect 的代码分文件夹放在一起) 更是极大的放大了这一问题。

随着社区实践的完善，大家发现遵循 [Domain style/Ducts](https://redux.js.org/faq/code-structure#code-structure) 来组织业务逻辑相对于 `Rails 风格` 更适合大型 `Redux`应用，但它还是没有彻底解决业务逻辑 `Code path` 过长、逻辑割裂的问题。我们以一个典型的基于 `redux-actions` 和 `Ducts` 风格组织的 `Redux` 应用为例:

```ts
// count.module.ts

const ADD_COUNT = createAction<number>('ADD_COUNT')
export interface CountDispatchProps {
  addOne: typeof ADD_COUNT
}
export interface CountStateProps {
  count: number
}

// reducer
export const reducer = handleActions({
  [`${ADD_COUNT}`]: (state: CountStateProps, { payload }: Action<number>) => {
    return { ...state, count: state.count + payload }
  }
}, { count: 0 })
```



```ts
// own props which passed by parent components
interface ÇountOwnProps {
  countToAdd: number
}

type CountProps = CountStateProps & CountDispatchProps & CountOwnProps

class CountComponent extends React.PureComponent<CountProps> {
  
  private onClickAddCount = () => {
    this.props.addCount(this.props.countToAdd)
  }
  
  render() {
    return (
      <div>
      	<button onClick={this.onClickAddCount}>add count</button>
      	{this.props.count}
      </div>
    )
  }
}

// react actions dispatcher
export const Count = connect(mapStateToProps, (dispatch) => bindActionCreators({
  addCount: ADD_COUNT,
} as CountDispatchProps, dispatch))(CountComponent)
```

我们在阅读这个简单的组件的业务逻辑的时候，如果想看 `this.props.addCount`背后到底是什么样的业务逻辑，需要先找到 `connect` 中，这个 `props` 是如何被传入组件的，然后找到这个 `dispatch props` 对应的 `Aciton` 是什么，然后跳转到 `count.module.ts` 文件中，找到 `Aciton` 的定义，再利用文件内搜索功能，找到哪里的 `Reducer/Side effect` 处理了这个 `Action`。归纳下来:

- 找到 `mapDispatchToProps` 中对应的 `Action`
- 找到 `module` 文件中对应的 `Action`
- 搜索 `Action` 对应的 `Reducer/Side effect`

并且随之而来的是，在 `TypeScript` 的项目中，`Action` 处定义的类型并不能自动传递给调用这个 `Action` 的地方。比如在上面的例子中，`ADD_COUNT` 定义的类型 `payload` 为 `number`，而在消费这个 `Action` 的 `reducer` 中，`payload` 类型必须重新指定一次，而且即使不一致也不会被 `TypeScript` 捕获到。

### 分形

`Redux` 的中心是一个单例的 `Store` 对象，任何基于 `Redux` 的组件都必须关联到这个 `Store` 上才能正常使用。这意味着在编写一个带业务逻辑的组件时，如果我们想要使用 `Redux` 抽象一些复杂的逻辑，或者复用已有的一些基于`Redux` 的通用代码时，不得不考虑暴露的 `API ` 的易用性。这些情况下简单的暴露组件是不够的，还必须让使用方把自己的 `reducer/side effect` 等逻辑接入到 `Store` 中，并且还要考虑**命名冲突**等问题。

也就是说基于 `Redux` **很难做出分形的组件**。

## Sigi 的设计

### 逻辑的连贯

`Sigi` 的核心借鉴了 `Redux` 的设计，所有的高层次的概念都是基于 `Action/Reducer/Side effect` 封装而成。在业务代码中我们的 `API` 设计理念跟 `Redux` 也比较类似，强制让业务的 `Dispatcher/Reducer/Side effect` 的代码分开编写，保持逻辑的干净。而在彻底的分离背后，我们也保持了逻辑的连贯。与大多数 `Redux` 封装不一样的是，`Sigi`的 `dispatch props` 可以通过 `TypeScript` 提供的的 `jump to definition` 功能直接跳转到 `dispatcher` 对应的逻辑:

[Try it!](https://codesandbox.io/s/sigi-recipes-cancellation-46otl)

```ts
// index.tsx
import "reflect-metadata";
import React from "react";
import { render } from "react-dom";
import { useEffectModule } from "@sigi/react";
import { initDevtool } from "@sigi/devtool";

import { AppModule } from "./app.module";

function App() {
  const [state, dispatcher] = useEffectModule(AppModule);

  const loading = state.loading ? <div>loading</div> : null;

  const list = (state.list || []).map(value => <li key={value}>{value}</li>);
  return (
    <div>
      <h1>Hello CodeSandbox</h1>
      <button onClick={dispatcher.fetchList}>fetchList</button>
      <button onClick={dispatcher.cancel}>cancel</button>
      {loading}
      <ul>{list}</ul>
    </div>
  );
}

const rootElement = document.getElementById("app");
render(<App />, rootElement);

initDevtool();
```

```ts
import { Module, EffectModule, Reducer, Effect, Action } from "@sigi/core";
import { Observable } from "rxjs";
import {
  exhaustMap,
  takeUntil,
  map,
  tap,
  startWith,
  endWith
} from "rxjs/operators";

import { HttpClient } from "./http.service";

interface AppState {
  loading: boolean;
  list: string[] | null;
}

@Module("App")
export class AppModule extends EffectModule<AppState> {
  defaultState: AppState = {
    list: null,
    loading: false
  };

  constructor(private readonly httpClient: HttpClient) {
    super();
  }

  @Reducer()
  cancel(state: AppState) {
    return { ...state, ...this.defaultState };
  }

  @Reducer()
  setLoading(state: AppState, loading: boolean) {
    return { ...state, loading };
  }

  @Reducer()
  setList(state: AppState, list: string[]) {
    return { ...state, list };
  }

  @Effect()
  fetchList(payload$: Observable<void>): Observable<Action> {
    return payload$.pipe(
      exhaustMap(() => {
        return this.httpClient.get(`/resources`).pipe(
          tap(() => {
            console.info("Got response");
          }),
          map(response => this.getActions().setList(response)),
          startWith(this.getActions().setLoading(true)),
          endWith(this.getActions().setLoading(false)),
          takeUntil(this.getAction$().cancel)
        );
      })
    );
  }
}
```

在这个代码示例中，组件中的 `diaptcher.fetchList` 可以直接跳转到 `EffectModule` 的 `fetchList` 实现，并且类型签名是自动互相匹配的。比如声明这样一个 `Reducer`:

```ts
@Reducer()
addCount(state: State, payload: number) {
  return { ...state, count: state.count + payload }
}
```

它对应的 `dispatcher.addCount` 签名就是 `(payload: number) => void`，在你不小心传入错误类型的 `payload` 之后，`TypeScript` 会直接告诉你错误的原因。在 `Sigi` 的 `EffectModule` 中，`Effect` 和 `ImmerReducer` 也有同样的效果。

### 分形

`Sigi` 没有全局 `Store` 的概念，它在全局唯一的限制是每一个 `EffectModule` 的名字必须不一样，这样做是为了更方便的在 `devtool` 中追踪异步事件的流程，以及方便 `SSR` 场景下将数据从 `Node` 透传到前端。

所以在实践中，你可以大量依赖 `Sigi` 去抽象带复杂业务逻辑的**业务组件**，将各种复杂的状态封装到局部。而对外暴露的 `API` 就仅仅是一个普通的 `React` 组件。

### 测试

`Sigi` 底层有一个小巧的 [Denpendencies injection](https://sigi.how/zh/basic/dependencies-injection) 实现，所以使用 `Sigi` 的时候推荐将大部分复杂的业务通过 `Class` 组织起来，然后通过 `DI` 组合它们。这样做有几个好处，其中最重要的部分就体现在测试的便捷性上。

下面两个代码片段展示了有 `DI` 和没有 `DI` 的时候在编写测试上的区别: 

```ts
import { stub, useFakeTimers, SinonFakeTimers, SinonStub } from 'sinon'
import { Store } from 'redux'
import { noop } from 'lodash'
const fakeAjax = {
  getJSON: noop
}

jest.mock('rxjs/ajax', () => ({ ajax: fakeAjax }))
import { configureStore } from '@demo/app/redux/store'
import { GlobalState } from '@demo/app/redux'
import { REQUESTED_USER_REPOS } from './index'
import { of, timer, throwError } from 'rxjs'
import { mapTo } from 'rxjs/operators'

describe('raw redux-observable specs', () => {
  let store: Store<GlobalState>
  let dispose: () => void
  let fakeTimer: SinonFakeTimers
  let ajaxStub: SinonStub
  const debounce = 300 // debounce in epic

  beforeEach(() => {
    store = configureStore().store
    dispose = store.subscribe(noop)
    fakeTimer = useFakeTimers()
    ajaxStub = stub(fakeAjax, 'getJSON')
  })

  afterEach(() => {
    ajaxStub.restore()
    fakeTimer.restore()
    dispose()
  })

  it('should get empty repos by name', () => {
    const username = 'fake user name'
    ajaxStub.returns(of([]))
    store.dispatch(REQUESTED_USER_REPOS(username))
    fakeTimer.tick(debounce)
    expect(store.getState().raw.repos).toHaveLength(0)
  })

  it('should get repos by name', () => {
    const username = 'fake user name'
    const repos = [{ name: 1 }, { name: 2 }]
    ajaxStub.returns(of(repos))
    store.dispatch(REQUESTED_USER_REPOS(username))
    fakeTimer.tick(debounce)
    expect(store.getState().raw.repos).toEqual(repos)
  })

  it('should set loading and finish loading', () => {
    const username = 'fake user name'
    const delay = 300
    ajaxStub.returns(timer(delay).pipe(mapTo([])))
    store.dispatch(REQUESTED_USER_REPOS(username))
    expect(store.getState().raw.loading).toBe(false)
    fakeTimer.tick(debounce)
    expect(store.getState().raw.loading).toBe(true)
    fakeTimer.tick(delay)
    expect(store.getState().raw.loading).toBe(false)
  })

  it('should catch error', () => {
    const username = 'fake user name'
    const debounce = 300 // debounce in epic
    ajaxStub.returns(throwError(new TypeError('whatever')))
    store.dispatch(REQUESTED_USER_REPOS(username))
    fakeTimer.tick(debounce)
    expect(store.getState().raw.error).toBe(true)
  })
})
```

```ts
import { Test, SigiTestModule, SigiTestStub } from '@sigi/testing'
import { SinonFakeTimers, SinonStub, useFakeTimers, stub } from 'sinon'
import { of, timer, throwError } from 'rxjs'
import { mapTo } from 'rxjs/operators'

import { RepoService } from './service'
import { HooksModule, StateProps } from './index'

class FakeRepoService {
  getRepoByUsers = stub()
}

describe('ayanami specs', () => {
  let fakeTimer: SinonFakeTimers
  let ajaxStream$: 
  let moduleStub: SigiTestStub<AppModule, AppState>
  const debounce = 300 // debounce in epic

  beforeEach(() => {
    fakeTimer = useFakeTimers()
    const testModule = Test.createTestingModule({
      TestModule: SigiTestModule,
    })
      .overrideProvider(RepoService)
      .useClass(FakeRepoService)
      .compile()
    moduleStub = testModule.getTestingStub(HooksModule)
    const ajaxStub = testModule.getInstance(RepoService).getRepoByUsers as SinonStub
    
  })

  afterEach(() => {
    ajaxStub.reset()
    fakeTimer.restore()
  })

  it('should get empty repos by name', () => {
    const username = 'fake user name'
		ajaxStub.returns(of([]))
    moduleStub.dispatcher.fetchRepoByUser(username)
    fakeTimer.tick(debounce)
    expect(moduleStub.getState().repos).toHaveLength(0)
  })

  it('should get repos by name', () => {
    const username = 'fake user name'
    const repos = [{ name: 1 }, { name: 2 }]
    ajaxStub.returns(of(repos))
    moduleStub.dispatcher.fetchRepoByUser(username)
    fakeTimer.tick(debounce)
    expect(moduleStub.getState().repos).toEqual(repos)
  })

  it('should set loading and finish loading', () => {
    const username = 'fake user name'
    const delay = 300
    ajaxStub.returns(timer(delay).pipe(mapTo([])))
    moduleStub.dispatcher.fetchRepoByUser(username)
    expect(moduleStub.getState().loading).toBe(false)
    fakeTimer.tick(debounce)
    expect(moduleStub.getState().loading).toBe(true)
    fakeTimer.tick(delay)
    expect(moduleStub.getState().loading).toBe(false)
  })

  it('should catch error', () => {
    const username = 'fake user name'
    const debounce = 300 // debounce in epic
    ajaxStub.returns(throwError(new TypeError('whatever')))
    moduleStub.dispatcher.fetchRepoByUser(username)
    fakeTimer.tick(debounce)
    expect(moduleStub.getState().error).toBe(true)
  })
})
```

从示例可以看出，编写`Sigi` 的测试在 `Mock/Stub/Spy` 上有非常大的优势，并且在测试中的代码与业务代码在逻辑与类型上也是连贯的，更利于维护。在实践中，我们推荐对 `Sigi` 的 `EffectModule` 进行全面的`单元测试`，而 `组件` 的逻辑尽量保持简单干净，这样可以大大降低测试的维护与运行成本(Mock 掉外部依赖的纯 `EffectModule` 测试代码运行起来非常快!)。

你也可以在 [Sigi 文档 · 编写测试](https://sigi.how/zh/recipes/writting-tests) 中实际运行感受一下 `Sigi` 编写测试的便捷性。

### SSR

对于需要 `SEO` 或者需要提升用户首屏体验的项目来说，`SSR` 是不得不考虑的因素。`Sigi` 设计了一套强大且易用的 `SSR`  API。

#### Server 端运行副作用

`@sigi/ssr` 模块中提供了一个 `emitSSREffects` 的函数，它的签名如下:

```ts
function emitSSREffects<Context>(ctx: Context, modules: Constructor<EffectModule<unkown>>[]) => Promise<StateToPersist>
```

`Sigi` 的 `Effect` 在 SSR 模式下只需要将对应的 Decorator 换成 `SSREffect` 就可以复用了。在 Server 端与在Client 端不一样的是，`Effect` 对应的 **Payload** 的获取上下文是组件，也就是组件作用域内的 **Props/State/Router** 等一系列客户端特有的状态。而在 Server 端，`SSREffect` 提供了 `payloadGetter` option 来在 Server 端获取 `payload`。它的签名如下:

```ts
payloadGetter: (ctx: Context, skip: () => typeof SKIP_SYMBOL) => Payload | Promise<Payload> | typeof SKIP_SYMBOL
```

其中第一个 `ctx` 就是 `emitSSREffects` 中的第一个参数，通常在 `Express` 下你可以传入 `Reqest` 对象，在 `Koa` 下你可以传入 `Context` 对象。

第二个参数 `skip` 是一个函数，如果在某种业务条件下，比如权限错误直接 `return skip()` ，`Sigi` 就会跳过这个 `Effect`，不再等待它的值。

因为 `Sigi` 的设计是基于 `RxJS` 的，在一个应用的生命周期内，每个 `Effect` 都 可能会有**多个值** 被 `emit`。所以在需要 SSR 的`Effect` 的逻辑中，我们还要保证获取到 `SSR` 需要的数据后，`emit` 一个 `TERMINATE_ACTION` 来告诉 `Sigi` 这个 `Effect` 已经运行完成了。

`emitSSREffects` 函数会等待所有传入的 `EffectModule` 的 `SSREffect` 都 `emit` 了一个 `TERMINATE_ACTION` 之后，将它们的 `state` 返回出来。

这个时候，再 `render` 包含 `Sigi EffectModule` 的组件，它们将直接使用 `emitSSREffects` 之后 `Module` 中的组件状态，从而渲染出对应的 `HTML`。而 `emitSSREffects` 返回的 `StateToPersist` 对象，你可以调用上面的 `renderToJSX` 方法将它放到渲染出来的 `HTML` 中。这样做之后在服务端获取过的数据将通过 `HTML` 透传到客户端，从而在客户端**第一次**触发同样的的 `Effect` 的时候直接忽略掉，节省请求和计算。当然这个行为也可以通过 `SSREffect` 的 option 中 `skipFirstClientDispatch` 选项关闭。

在 [SSR example](https://github.com/sigi-framework/ssr-example) 中，有一个简单的 `EffectModule` 模块能比较好的示意这个过程:

```ts
import { Module, EffectModule, ImmerReducer, TERMINATE_ACTION } from '@sigi/core'
import { SSREffect } from '@sigi/ssr'
import { Observable, of } from 'rxjs'
import { exhaustMap, map, startWith, delay, endWith, mergeMap } from 'rxjs/operators'
import { Draft } from 'immer'
import md5 from 'md5'

interface State {
  count: number
  sigiMd5: string | null
}

@Module('demoModule')
export class DemoModule extends EffectModule<State> {
  defaultState = {
    count: 0,
    sigiMd5: null,
  }

  @ImmerReducer()
  setCount(state: Draft<State>, count: number) {
    state.count = count
  }

  @ImmerReducer()
  addOne(state: Draft<State>) {
    state.count++
  }

  @ImmerReducer()
  setSigiMd5(state: Draft<State>, hashed: string) {
    state.sigiMd5 = hashed
  }

  @SSREffect({
    payloadGetter: () => {
      return md5('sigi')
    },
  })
  getSigiMd5(payload$: Observable<string>) {
    return payload$.pipe(
      delay(100), // mock async
      mergeMap((hashed) => of(this.getActions().setSigiMd5(hashed), TERMINATE_ACTION)),
    )
  }

  @SSREffect()
  asyncEffect(payload$: Observable<void>) {
    return payload$.pipe(
      exhaustMap(() =>
        of({ count: 10 }).pipe(
          delay(1000),
          map(({ count }) => this.getActions().setCount(count)),
          startWith(this.getActions().setCount(0)),
          endWith(TERMINATE_ACTION),
        ),
      ),
    )
  }
}
```

```tsx
// renderer.tsx
import 'reflect-metadata'

import { resolve } from 'path'
import fs from 'fs'
import React from 'react'
import { renderToNodeStream } from 'react-dom/server'
import webpack from 'webpack'
import { Request, Response } from 'express'
import { emitSSREffects } from '@sigi/ssr'
import { SSRContext } from '@sigi/react'

import { Home } from '@c/home'
import { DemoModule } from '@c/module'

export async function renderer(req: Request, res: Response) {
  const state = await emitSSREffects(req, [DemoModule])

  const stats: webpack.Stats.ToJsonOutput = JSON.parse(
    fs.readFileSync(resolve(__dirname, '../client/output-stats.json'), { encoding: 'utf8' }),
  )
  const scripts = (stats.assets || []).map((asset) => <script key={asset.name} src={`/${asset.name}`} />)

  const html = renderToNodeStream(
    <html>
      <head>
        <meta charSet="UTF-8" />
        <meta lang="zh-cms-hans" />
        <title>Sigi ssr example</title>
      </head>
      <body>
        <div id="app">
          <SSRContext.Provider value={req}>
            <Home />
          </SSRContext.Provider>
        </div>
        {state.renderToJSX()}
        {scripts}
      </body>
    </html>,
  )

  res.status(200)
  html.pipe(res)
}
```



建议将 [SSR example](https://github.com/sigi-framework/ssr-example) 项目下载并运行，深入感受一下 `Sigi` 在 `SSR` 场景下的设计。

#### Tree shaking

在使用同构(Isomorphic)  `SSR` 框架时，我们有时候会出现这样的尴尬场景: 我们编写的包含大量 **Server 端业务逻辑** 的代码被打包工具打包到了 `Client` 端产物中。这些逻辑里通常包含了很多 `请求/缓存`逻辑，有时候甚至会 `require` 一些只适合在 `Node` 下使用的体积巨大的第三方库，我们通常需要很复杂的工程化手段消除这些逻辑带来的影响。

`Sigi` 在同构侧只提供了唯一的逻辑入口，即 `SSREffect` 的 `payloadGetter` 选项。在这个前提下，我们提供了 `@sigi/ts-plugin` 在编译时将这些逻辑删掉。这样即使是你在编写 `SSR` 业务时编写了大量 `Node only` 的逻辑，在编译 `Client` 端代码的时候，也会被轻松消除掉。

```ts
@Module('A')
export class ModuleA extends EffectModule<AState> {
  @SSREffect({
    skipFirstClientDispatch: true,
    payloadGetter: (req: Request) => {
      return require('md5')('hello')
    },
  })
  whatever(payload$: Observable<string>) {
    return payload$.pipe(
      map(() => this.createNoopAction())
    )
  }
}
  
      ↓ ↓ ↓ ↓ ↓ ↓
// TypeScript after transform:

import { EffectModule, Module } from '@sigi/core';
import { SSREffect } from '@sigi/ssr';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
interface AState {
}
@Module('A')
export class ModuleA extends EffectModule<AState> {
  @SSREffect({})
  whatever(payload$: Observable<string>) {
    return payload$.pipe(map(() => this.createNoopAction()));
  }
}
```

你可以下载 [SSR example](https://github.com/sigi-framework/ssr-example) 项目并运行 `yarn build:client` 命令查看 `Tree shaking` 之后的效果。

#### 依赖替换

`Node` 端与 `Client` 还有一个非常不一样的地方是: Client 端通常使用 `http` 请求获取数据，而在 `Node` 端我们可以使用更高效的 `RPC`方式甚至直接读取数据库、缓存等方式获取数据。

因为 `Sigi` 基于 `DI` 构建，所以我们可以很轻松的在 `SSR`  场景下将发请求/获取数据的 `Service` 替换成更高效的实现，并且完全不会侵入原有的业务逻辑。这里有一个简单的示例来看**依赖替换** `API` 的形态:

[Sigi 文档 · 依赖替换](https://sigi.how/zh/recipes/dependencies-replacement)

```ts
import "@abraham/reflection";
import React from "react";
import { render } from "react-dom";
import { ClassProvider } from "@sigi/di";
import { useEffectModule, InjectionProvidersContext } from "@sigi/react";
import { HttpErrorClient } from "./http-with-error.service";
import { HttpBetterClient } from "./http-better.service";

import { AppModule } from "./app.module";

const AppContainer = React.memo(({ appTitle }: { appTitle: string }) => {
  const [list, dispatcher] = useEffectModule(AppModule, {
    selector: state => state.list
  });
  const loading = !list ? <div>loading</div> : null;

  const title =
    list instanceof Error ? <h1>{list.message}</h1> : <h1>{appTitle}</h1>;

  const listNodes = Array.isArray(list)
    ? list.map(value => <li key={value}>{value}</li>)
    : null;
  return (
    <div>
      {title}
      <button onClick={dispatcher.fetchList}>fetchList</button>
      <button onClick={dispatcher.cancel}>cancel</button>
      {loading}
      <ul>{listNodes}</ul>
    </div>
  );
});

function App() {
  const betterHttpProvider: ClassProvider<HttpErrorClient> = {
    provide: HttpErrorClient,
    useClass: HttpBetterClient
  };
  return (
    <>
      <AppContainer appTitle="Always error" />
      <InjectionProvidersContext providers={[betterHttpProvider]}>
        <AppContainer appTitle="Better http client" />
      </InjectionProvidersContext>
    </>
  );
}

const rootElement = document.getElementById("app");
render(<App />, rootElement);

```

## 局限

### 只支持 React hooks 形式的 API

目前 `Sigi` 只支持 `react hooks` 形式的 API。

对于 `React class component` 我们也暂时不考虑提供相应的支持。

对于 `Vue 2/3`，我们已经有相应的计划，正在紧锣密鼓的进行中，顺利的话很快就能与大家见面。

### 只为 TypeScript 项目优化

我们对基于 `Babel` 的纯 `JavaScript` 项目与 `Flow` 项目的支持目前没有排期，但是将来会支持。其中主要的成本是需要抹平 `Babel` 与 `TypeScript` 在 `Decorator` 实现上的差异，并且要考虑如何向纯 `JavaScript` 项目提供 `TypeScript` 中的 `emitDecoratorMetadata` 功能的 API。

### 体积

虽然 `Sigi` 源码已经尽量精简了，但是由于依赖了 `RxJS` 的大量特性，所以 `Sigi` 加上其依赖之后的体积 `gzip` 之后也达到了 `16k` 左右(`immer ~ 6.29kb`, `rxjs ~ 6.8kb`, `sigi ~ 2.96kb`)。但如果你在大型项目中使用，`Sigi` 高度的抽象和强大的功能一定能给你省下超过这个体积许多的**业务代码体积**。

在未来我们会慢慢剥离一些 `RxJS` 的大体积依赖比如`BehaviorSubject` 与 `ReplaySubject`，进一步优化体积。
