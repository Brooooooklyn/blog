---
layout: post
title: Introduction to the Sigi Framework
date: 2020-02-15
author: '太狼'
postname: sigi-introduction
header_img: 'sigi-introduction.jpg'
lang: en
tags:
  - TypeScript
  - RxJS
  - Sigi
---

> This article only covers the design philosophy of the `Sigi framework` and the problems it aims to solve. It will not go into detailed descriptions of each `API`. If you want to start learning and using the `Sigi framework`, please visit https://sigi.how/zh/basic

## Born from Redux

In the Redux era, countless people worked hard to reduce the amount of **boilerplate code** in their applications. Early on, we used utility libraries like `redux-actions` and `redux-toolkit` to cut down on boilerplate. Without considering `TypeScript`, these tools provided excellent abstractions — their documentation showcases the significant improvements they bring to `JavaScript` projects. But with the arrival of `TypeScript`, much of that effort went to waste. People discovered that in addition to the `Action/Reducer/Middleware` boilerplate associated with `Redux`, the **type** code connecting these three parts was equally overwhelming.

### Fragmented Business Logic

The fragmentation of business logic manifests in two ways: broken **code paths** and **disconnected type inference**.

`Redux`'s separation of `Action`, `Reducer`, and `Side effect` makes it easier to write clean, side-effect-free components and helps us better separate the responsibilities of different parts of the business logic. However, without proper encapsulation, this design leads to excessively long **code paths**, making it difficult to read code and understand business logic **coherently**, which increases maintenance costs. The [Rails-style](https://redux.js.org/faq/code-structure#what-should-my-file-structure-look-like-how-should-i-group-my-action-creators-and-reducers-in-my-project-where-should-my-selectors-go) organization pattern popular in the early community (placing action/reducer/side effect code in separate folders) amplified this problem even further.

As community practices matured, people found that organizing business logic following the [Domain style/Ducts](https://redux.js.org/faq/code-structure#code-structure) pattern was more suitable for large `Redux` applications than the `Rails style`. But it still didn't fully solve the problem of overly long and fragmented `code paths`. Let's look at a typical `Redux` application organized with `redux-actions` and the `Ducts` style:

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
export const reducer = handleActions(
  {
    [`${ADD_COUNT}`]: (state: CountStateProps, { payload }: Action<number>) => {
      return { ...state, count: state.count + payload }
    },
  },
  { count: 0 },
)
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
export const Count = connect(mapStateToProps, (dispatch) =>
  bindActionCreators(
    {
      addCount: ADD_COUNT,
    } as CountDispatchProps,
    dispatch,
  ),
)(CountComponent)
```

When reading the business logic of this simple component, if you want to see what business logic is behind `this.props.addCount`, you first need to find how this `prop` is passed into the component in `connect`, then find the corresponding `Action` for this `dispatch prop`, then jump to the `count.module.ts` file, find the `Action` definition, and finally use the file search feature to locate which `Reducer/Side effect` handles this `Action`. To summarize:

- Find the corresponding `Action` in `mapDispatchToProps`
- Find the corresponding `Action` in the `module` file
- Search for the `Reducer/Side effect` that handles the `Action`

Furthermore, in `TypeScript` projects, the types defined at the `Action` are not automatically propagated to the places that consume the `Action`. For example, in the code above, `ADD_COUNT` defines the `payload` type as `number`, but in the `reducer` that consumes this `Action`, the `payload` type must be specified again, and even if there's a mismatch, `TypeScript` won't catch it.

### Fractal Architecture

At the center of `Redux` is a singleton `Store` object, and any component based on `Redux` must be connected to this `Store` to function properly. This means that when writing a component with business logic, if we want to use `Redux` to abstract some complex logic or reuse existing `Redux`-based generic code, we have to consider the usability of the exposed `API`. In these cases, simply exposing the component is not enough — consumers must also integrate your `reducer/side effect` logic into the `Store`, and deal with **naming conflict** issues.

In other words, it's **very difficult to build fractal components** with `Redux`.

## Sigi's Design

### Logic Coherence

The core of `Sigi` draws from `Redux`'s design — all high-level concepts are built on top of `Action/Reducer/Side effect` abstractions. In business code, our `API` design philosophy is similar to `Redux`, enforcing separate writing of `Dispatcher/Reducer/Side effect` code to keep the logic clean. But behind this thorough separation, we also maintain logical coherence. Unlike most `Redux` wrappers, `Sigi`'s `dispatch props` can be navigated directly to their corresponding logic using `TypeScript`'s `jump to definition` feature:

[Try it!](https://codesandbox.io/s/sigi-recipes-cancellation-46otl)

```ts
// index.tsx
import 'reflect-metadata'
import React from 'react'
import { render } from 'react-dom'
import { useEffectModule } from '@sigi/react'
import { initDevtool } from '@sigi/devtool'

import { AppModule } from './app.module'

function App() {
  const [state, dispatcher] = useEffectModule(AppModule)

  const loading = state.loading ? <div>loading</div> : null

  const list = (state.list || []).map((value) => <li key={value}>{value}</li>)
  return (
    <div>
      <h1>Hello CodeSandbox</h1>
      <button onClick={dispatcher.fetchList}>fetchList</button>
      <button onClick={dispatcher.cancel}>cancel</button>
      {loading}
      <ul>{list}</ul>
    </div>
  )
}

const rootElement = document.getElementById('app')
render(<App />, rootElement)

initDevtool()
```

```ts
import { Module, EffectModule, Reducer, Effect, Action } from '@sigi/core'
import { Observable } from 'rxjs'
import {
  exhaustMap,
  takeUntil,
  map,
  tap,
  startWith,
  endWith,
} from 'rxjs/operators'

import { HttpClient } from './http.service'

interface AppState {
  loading: boolean
  list: string[] | null
}

@Module('App')
export class AppModule extends EffectModule<AppState> {
  defaultState: AppState = {
    list: null,
    loading: false,
  }

  constructor(private readonly httpClient: HttpClient) {
    super()
  }

  @Reducer()
  cancel(state: AppState) {
    return { ...state, ...this.defaultState }
  }

  @Reducer()
  setLoading(state: AppState, loading: boolean) {
    return { ...state, loading }
  }

  @Reducer()
  setList(state: AppState, list: string[]) {
    return { ...state, list }
  }

  @Effect()
  fetchList(payload$: Observable<void>): Observable<Action> {
    return payload$.pipe(
      exhaustMap(() => {
        return this.httpClient.get(`/resources`).pipe(
          tap(() => {
            console.info('Got response')
          }),
          map((response) => this.getActions().setList(response)),
          startWith(this.getActions().setLoading(true)),
          endWith(this.getActions().setLoading(false)),
          takeUntil(this.getAction$().cancel),
        )
      }),
    )
  }
}
```

In this code example, `dispatcher.fetchList` in the component can jump directly to the `fetchList` implementation in the `EffectModule`, and the type signatures automatically match each other. For example, declaring a `Reducer` like this:

```ts
@Reducer()
addCount(state: State, payload: number) {
  return { ...state, count: state.count + payload }
}
```

The corresponding `dispatcher.addCount` signature becomes `(payload: number) => void`. If you accidentally pass a `payload` of the wrong type, `TypeScript` will immediately tell you the reason for the error. In `Sigi`'s `EffectModule`, `Effect` and `ImmerReducer` have the same behavior.

### Fractal Architecture

`Sigi` has no concept of a global `Store`. The only global constraint is that each `EffectModule` must have a unique name. This is done to make it easier to trace the flow of asynchronous events in the `devtool`, and to facilitate passing data from `Node` to the client in `SSR` scenarios.

In practice, you can heavily rely on `Sigi` to abstract **business components** with complex business logic, encapsulating various complex states locally. The externally exposed `API` is simply an ordinary `React` component.

### Testing

`Sigi` has a lightweight [Dependencies injection](https://sigi.how/zh/basic/dependencies-injection) implementation under the hood, so when using `Sigi`, we recommend organizing most complex business logic through `Class`es and composing them via `DI`. This approach has several benefits, the most important of which is the convenience it brings to testing.

The following two code snippets demonstrate the difference in writing tests with and without `DI`:

```ts
import { stub, useFakeTimers, SinonFakeTimers, SinonStub } from 'sinon'
import { Store } from 'redux'
import { noop } from 'lodash'
const fakeAjax = {
  getJSON: noop,
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

As you can see from the examples, writing tests for `Sigi` has significant advantages when it comes to `Mock/Stub/Spy`, and the test code maintains logical and type coherence with the business code, making it easier to maintain. In practice, we recommend writing comprehensive `unit tests` for `Sigi`'s `EffectModule`, while keeping the `component` logic as simple and clean as possible. This can greatly reduce the maintenance and execution cost of tests (pure `EffectModule` tests with mocked external dependencies run extremely fast!).

You can also experience the convenience of writing tests with `Sigi` hands-on at [Sigi Documentation - Writing Tests](https://sigi.how/zh/recipes/writting-tests).

### SSR

For projects that need `SEO` or want to improve the user's first-screen experience, `SSR` is an unavoidable consideration. `Sigi` has designed a powerful and easy-to-use set of `SSR` APIs.

#### Running Side Effects on the Server

The `@sigi/ssr` module provides a function called `emitSSREffects` with the following signature:

```ts
function emitSSREffects<Context>(ctx: Context, modules: Constructor<EffectModule<unkown>>[]) => Promise<StateToPersist>
```

`Sigi`'s `Effect` can be reused in SSR mode simply by swapping the corresponding Decorator to `SSREffect`. The difference between the Server side and the Client side is that an `Effect`'s **Payload** is obtained from the component context — things like **Props/State/Router** and other client-specific state within the component scope. On the Server side, `SSREffect` provides a `payloadGetter` option to obtain the `payload`. Its signature is:

```ts
payloadGetter: (ctx: Context, skip: () => typeof SKIP_SYMBOL) => Payload | Promise<Payload> | typeof SKIP_SYMBOL
```

The first parameter `ctx` is the first argument passed to `emitSSREffects`. Typically, in `Express` you would pass the `Request` object, and in `Koa` you would pass the `Context` object.

The second parameter `skip` is a function. If under certain business conditions, such as a permission error, you directly `return skip()`, `Sigi` will skip this `Effect` and stop waiting for its value.

Because `Sigi` is designed on top of `RxJS`, within an application's lifecycle, each `Effect` can potentially **emit multiple values**. So in `Effect` logic that requires SSR, we also need to ensure that after obtaining the data needed for `SSR`, we emit a `TERMINATE_ACTION` to tell `Sigi` that this `Effect` has finished running.

The `emitSSREffects` function waits until all `SSREffect`s from all the passed-in `EffectModule`s have emitted a `TERMINATE_ACTION`, and then returns their `state`.

At that point, when you `render` the components that contain `Sigi EffectModule`s, they will directly use the component state from the `Module` after `emitSSREffects`, rendering the corresponding `HTML`. As for the `StateToPersist` object returned by `emitSSREffects`, you can call its `renderToJSX` method to embed it in the rendered `HTML`. After doing this, the data fetched on the server will be passed through the `HTML` to the client, so that when the same `Effect` is triggered for the **first time** on the client, it will be skipped, saving requests and computation. Of course, this behavior can also be disabled via the `skipFirstClientDispatch` option in `SSREffect`.

In the [SSR example](https://github.com/sigi-framework/ssr-example), there is a simple `EffectModule` that illustrates this process well:

```ts
import {
  Module,
  EffectModule,
  ImmerReducer,
  TERMINATE_ACTION,
} from '@sigi/core'
import { SSREffect } from '@sigi/ssr'
import { Observable, of } from 'rxjs'
import {
  exhaustMap,
  map,
  startWith,
  delay,
  endWith,
  mergeMap,
} from 'rxjs/operators'
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
      mergeMap((hashed) =>
        of(this.getActions().setSigiMd5(hashed), TERMINATE_ACTION),
      ),
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
    fs.readFileSync(resolve(__dirname, '../client/output-stats.json'), {
      encoding: 'utf8',
    }),
  )
  const scripts = (stats.assets || []).map((asset) => (
    <script key={asset.name} src={`/${asset.name}`} />
  ))

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

We recommend downloading and running the [SSR example](https://github.com/sigi-framework/ssr-example) project to get a hands-on feel for `Sigi`'s design in `SSR` scenarios.

#### Tree Shaking

When using isomorphic `SSR` frameworks, we sometimes run into an awkward situation: code containing a large amount of **server-side business logic** gets bundled into the `Client`-side output by the build tool. This logic typically includes a lot of `request/cache` logic, and sometimes even `require`s large third-party libraries that are only suitable for use in `Node`. We usually need very complex engineering measures to eliminate the impact of this logic.

`Sigi` provides only one logical entry point on the isomorphic side: the `payloadGetter` option of `SSREffect`. Based on this premise, we provide `@sigi/ts-plugin` to strip out this logic at compile time. This way, even if you write a lot of `Node only` logic when building `SSR` features, it will be easily eliminated when compiling `Client`-side code.

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

You can download the [SSR example](https://github.com/sigi-framework/ssr-example) project and run the `yarn build:client` command to see the result after `Tree shaking`.

#### Dependency Replacement

Another major difference between the `Node` side and the `Client` side is: the Client typically uses `HTTP` requests to fetch data, while on the `Node` side we can use more efficient methods like `RPC` or even direct database/cache reads.

Because `Sigi` is built on `DI`, we can easily replace the `Service` responsible for making requests/fetching data with a more efficient implementation in `SSR` scenarios, without any intrusion into the existing business logic. Here is a simple example showing the shape of the **dependency replacement** `API`:

[Sigi Documentation - Dependency Replacement](https://sigi.how/zh/recipes/dependencies-replacement)

```ts
import '@abraham/reflection'
import React from 'react'
import { render } from 'react-dom'
import { ClassProvider } from '@sigi/di'
import { useEffectModule, InjectionProvidersContext } from '@sigi/react'
import { HttpErrorClient } from './http-with-error.service'
import { HttpBetterClient } from './http-better.service'

import { AppModule } from './app.module'

const AppContainer = React.memo(({ appTitle }: { appTitle: string }) => {
  const [list, dispatcher] = useEffectModule(AppModule, {
    selector: (state) => state.list,
  })
  const loading = !list ? <div>loading</div> : null

  const title =
    list instanceof Error ? <h1>{list.message}</h1> : <h1>{appTitle}</h1>

  const listNodes = Array.isArray(list)
    ? list.map((value) => <li key={value}>{value}</li>)
    : null
  return (
    <div>
      {title}
      <button onClick={dispatcher.fetchList}>fetchList</button>
      <button onClick={dispatcher.cancel}>cancel</button>
      {loading}
      <ul>{listNodes}</ul>
    </div>
  )
})

function App() {
  const betterHttpProvider: ClassProvider<HttpErrorClient> = {
    provide: HttpErrorClient,
    useClass: HttpBetterClient,
  }
  return (
    <>
      <AppContainer appTitle="Always error" />
      <InjectionProvidersContext providers={[betterHttpProvider]}>
        <AppContainer appTitle="Better http client" />
      </InjectionProvidersContext>
    </>
  )
}

const rootElement = document.getElementById('app')
render(<App />, rootElement)
```

## Limitations

### Only React Hooks API is Supported

Currently, `Sigi` only supports the `React hooks` style API.

We have no plans to provide support for `React class component` at this time.

For `Vue 2/3`, we already have plans in the works and are actively developing it. If all goes well, it should be available soon.

### Optimized Only for TypeScript Projects

We currently have no timeline for supporting pure `JavaScript` projects based on `Babel` or `Flow` projects, but we plan to support them in the future. The main cost involves smoothing out the differences in `Decorator` implementations between `Babel` and `TypeScript`, and figuring out how to provide an API equivalent to `TypeScript`'s `emitDecoratorMetadata` feature for pure `JavaScript` projects.

### Bundle Size

Although `Sigi`'s source code has been kept as lean as possible, due to its heavy reliance on `RxJS` features, `Sigi` plus its dependencies comes to about `16k` gzipped (`immer ~ 6.29kb`, `rxjs ~ 6.8kb`, `sigi ~ 2.96kb`). However, if you use it in a large project, `Sigi`'s high level of abstraction and powerful features will certainly save you far more in **business code size** than it costs.

In the future, we will gradually decouple some of `RxJS`'s larger dependencies like `BehaviorSubject` and `ReplaySubject` to further optimize the bundle size.
