---
layout:     post
title:      TypeScript 中的 Decorator & 元数据反射：从小白到专家（部分 IV）
subtitle:   ""
postname:   TypeScript-Decorator
date:       2016-04-13
author:     "太狼"
header-img: "/images/decorators-metadata-reflection-in-typescript.png"
tags:
  - JavaScript
  - ECMAScript 6
---

本文译自：[Decorators & metadata reflection in TypeScript: From Novice to Expert (Part IV)](http://blog.wolksoftware.com/decorators-metadata-reflection-in-typescript-from-novice-to-expert-part-4)

深入探寻 TypeScript 的装饰器实现，发现它们是如何为 JavaScript 添加令人兴奋的特性，比如反射和依赖注入。

这个系列包含4篇文章：

- 部分 I：方法装饰器
- 部分 II：属性注解与类装饰器
- 部分 III：参数装饰器与装饰器工厂
- 部分 IV：类型的序列化与元数据反射 API

我会假设你已经读过了这个系列的前几篇文章。

在前面的文章中我们已经知道了什么是装饰器和 TypeScript 是怎么实现装饰器的。我们知道了如何在类、方法、属性和参数上使用装饰器，如何创建一个装饰器工厂，如何使用一个装饰器工厂，如何实现一个可配置的装饰器工厂。

<!--more-->

在本篇文章中，我们将会了解到：

1. `我们为什么需要 JavaScript 中的反射`
2. `元数据反射 API`
3. `基本类型序列`
4. `复杂类型序列`

让我们从学习为什么需要 Javascript 中的反射开始。

### 1. 我们为什么需要 JavaScript 中的反射

反射这个词用来描述那些可以检查同一个系统中其它代码(或自己)的代码。

反射在一些用例下非常有用(组合/依赖注入，运行时类型检查，测试)。

我们的 Javascript 应用变得越来越大，我们开始需要一些工具(比如控制反转容器)和功能(运行时类型检测)来管理不断增长的复杂度。问题在于如果 Javascript 没有反射，一些工具和功能就无法实现，或者至少它们不能实现得像它们在 C# 或者 Java 中的那么强大。

一个强大的反射 API 可以让我们在运行时检测一个未知的对象并且得到它的所有信息。我们要能通过反射得到以下的信息:

- 这个实例的名字
- 这个实例的类型
- 这个实例实现了哪个接口
- 这个实例的属性的名字和类型
- 这个实例构造函数的参数名和类型

在 JavaScript 中我们可以通过 [Object.getOwnPropertyDescriptor()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertyDescriptor) 或 [Object.keys()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys) 函数获取一些实例的信息，但是我们还需要反射来实现更加强大的开发工具。

然而事情有所转机，因为 TypeScript 已经开始支持一些反射的功能。让我们看一下这些功能:

### 2. 元数据反射 API

原生 Javascript 对元数据反射的支持处于早期的开发阶段。这里是线上的[装饰器与元数据装饰器需要的 ES7 反射 API 原型的提案](http://rbuckton.github.io/ReflectDecorators/)。

Typescript 团队的一些人已经开始实现 [ES7 反射 API 原型的兼容版本](https://www.npmjs.com/package/reflect-metadata)，Typescript 的编译器已经可以[将一些设计时类型元数据序列化给装饰器](https://github.com/Microsoft/TypeScript/issues/2577)。

我们可以引入 [reflect-metadata](https://www.npmjs.com/package/reflect-metadata) 库来使用元数据反射 API:

```bash
npm install reflect-metadata
```

我们必须随 TypeScript 1.5+ 一起使用这个库并且将编译参数 emitDecoratorMetadata 设为 true。我们也必须包含对 reflect-metadata.d.ts 的引用并加载 Reflect.js 文件。

随后我们可以实现我们自己的装饰器并且使用一个可用的`元数据设计键`。到目前为止，只有三个可用的键:

- `类型元数据`使用元数据键"design:type"
- `参数类型元数据`使用元数据键"design:paramtypes"
- `返回值类型元数据`使用元数据键"design:returntype"

让我们来看一组例子：

#### A) 使用元数据反射 API 获取类型元数据

让我们声明下面的属性装饰器 :

```ts
function logType(target : any, key : string) {
  var t = Reflect.getMetadata("design:type", target, key);
  console.log(`${key} type: ${t.name}`);
}
```

然后我们可以将它应用到类的一个属性上来获取它的类型 :

```ts
class Demo{
  @logType // apply property decorator
  public attr1 : string;
}
```

上面例子在控制台的输出 :

```ts
attr1 type: String
```

#### B) 使用元数据反射 API 获取参数类型元数据

让我们声明如下的参数装饰器 :

```ts
function logParamTypes(target : any, key : string) {
  var types = Reflect.getMetadata("design:paramtypes", target, key);
  var s = types.map(a => a.name).join();
  console.log(`${key} param types: ${s}`);
}
```

然后我们将它应用到类里面的一个方法上来获取它的参数的类型信息：

```ts
class Foo {}
interface IFoo {}

class Demo{
  @logParameters // apply parameter decorator
  doSomething(
    param1 : string,
    param2 : number,
    param3 : Foo,
    param4 : { test : string },
    param5 : IFoo,
    param6 : Function,
    param7 : (a : number) => void,
  ) : number {
      return 1
  }
}
```

上面例子在控制台的输出 :

```ts
doSomething param types: String, Number, Foo, Object, Object, Function, Function
```

#### C) 使用元数据反射 API 获取返回类型元数据

我们也可以使用 ```"design:returntype"``` 元数据键来获取一个方法上的返回类型信息：

```ts
Reflect.getMetadata("design:returntype", target, key);
```

### 3. 基本类型序列化

让我们再来看一次上面的 design:paramtypes 例子。我们注意到接口 IFoo 和字面量对象 ```{ test : string}``` 都序列化为 Object。这是因为 TypeScript 只支持基础类型的序列化。基础类型的序列化规则是：

- number 序列化为 `Number`
- string 序列化为 `String`
- boolean 序列化为 `Boolean`
- any 序列化为 `Object`
- void 序列化为 `undefined`
- Array 序列化为 `Array`
- 如果是一个多元组，序列化为 `Array`
- 如果是一个类，序列化为 `class constructor`
- 如果是一个枚举，序列化为 `Number`
- 如果至少有一个调用签名，序列化为 `Function`
- 其它的序列化为 `Object` (包括接口)


接口和字面量对象在未来可能会被序列化为`复杂类型序列`，但是这个特性现在还不能用。

### 4. 复杂类型序列

TypeScript 团队正致力于一个能让我们生成复杂类型元数据的提案。

这个提案描述了一些复杂的类型如何被序列化。上面的那些序列化规则依然会被用于基本类型序列化，但是复杂的类型序列化使用的是不同的序列化逻辑。这是提案中的一个基本类型用来描述所有可能的类型：

```ts
/**
  * Basic shape for a type.
  */
interface _Type {
  /**
    * Describes the specific shape of the type.
    * @remarks
    * One of: "typeparameter", "typereference", "interface", "tuple", "union",
    * or "function".
    */
  kind: string;
}
```

我们也可以找到一些用来描述所有可能类型的类。比如，我们可以找到序列化范性接口 `interface foo<bar> { /* ... */}` 的类：

```ts
/**
  * Describes a generic interface.
  */
interface InterfaceType extends _Type {
  kind: string; // "interface"

  /**
    * Generic type parameters for the type. May be undefined.
    */
  typeParameters?: TypeParameter[];

  /**
    * Implemented interfaces.
    */
  implements?: Type[];

  /**
    * Members for the type. May be undefined.
    * @remarks Contains property, accessor, and method declarations.
    */
  members?: { [key: string | symbol | number]: Type; };

  /**
    * Call signatures for the type. May be undefined.
    */
  call?: Signature[];

  /**
    * Construct signatures for the type. May be undefined.
    */
  construct?: Signature[];

  /**
    * Index signatures for the type. May be undefined.
    */
  index?: Signature[];
}
```

如同我们在上面看到的，这里有一个属性指出实现了哪些接口：

```ts
/**
  * Implemented interfaces.
  */
implements?: Type[];
```

这种信息可以用来在运行时验证一个实例是否实现了特定的接口，而这个功能对于一个 IoC 容器特别的有用。

我们不知道对复杂类型序列的支持什么时候会被加入到 TypeScript 的功能中，但我们已经迫不及待了因为我们计划用它为我们的 JavaScript IoC 容器：[InversifyJS](http://blog.wolksoftware.com/introducing-inversifyjs) 增加一些碉堡的特性。

### 5. 结论

在本系列中，我们深入浅出的学习了4种可用的装饰器、如何创建一个装饰器工厂和如何使用装饰器工厂实现一个可配置的装饰器。

我们也学会了如何使用元数据反射 API。

我们会保持这个博客的更新并在未来写更多关于元数据反射 API 的文章。如果不想错过，请不要忘了[订阅我们](http://blog.wolksoftware.com/feed)。

你可以通过 [@OweR_ReLoaDeD](https://twitter.com/OweR_ReLoaDeD) 和 [@WolkSoftwareLtd](https://twitter.com/WolkSoftwareLtd) 随意与我们谈论这篇文章。