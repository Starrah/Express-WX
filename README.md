Express-WX
===================
[![NPM Package](https://badge.fury.io/js/express-wx.svg)](https://www.npmjs.com/package/express-wx)
[![Build Status](https://travis-ci.org/Starrah/Express-WX.svg)](https://travis-ci.org/Starrah/Express-WX)

### 搭建微信公众平台后端，如此简单！
Express-WX is an [Express](https://github.com/expressjs/express) Router used for building [Wechat](https://weixin.qq.com/) (an instant messaging software, especially popular in China) Offical Account Message Server easily, supporting loading request (message) handlers dynamically.  
  
Express-WX是一个动态的微信后端组件。它的主体是一个[Express](https://github.com/expressjs/express)的Router，可以像一般的Router一样注册在app的某一个请求路径下。  
按照下述示例，构建Express的app对象，并在其上use我们的WXRouter类的实例，设置好token，部署到服务器上。  
之后在微信公众平台的开发——基本配置里填入该请求路径对应的url并填入上面设置的token，即可完成服务器搭建。  

### 编写和管理消息处理和回复逻辑，如此方便！
Express-WX最独特、最令人称赞一点是采用了**动态路由架构**。只需要在一个指定的文件夹里面放置您的含有消息处理逻辑的.js文件，这个文件就会在运行时被自动加载并调用其中的消息处理逻辑，完成您的需求。  
如果想新增、修改或删除处理逻辑，只需要**直接对含有上述处理逻辑的文件进行增删改**。所有对文件的增删改会实时的应用到程序当中，**完全不需要重启应用的麻烦！**  
此外，您也不用担心会有性能问题。本组件的动态加载处理函数的原理是基于`FileWatcher`的，即监听目录内的文件变化、仅当文件产生变化时才会调用相关逻辑动态加载处理函数。因此对于每一次单独的请求，没有任何动态加载的额外开销！  

## 安装和使用示例
安装：  
```shell script
npm install express-wx --save
```
  
您的项目目录结构，应该大致如下图所示：  
```
project
│
├───handlers
│   ├───helloworld.js (helloworld.ts)
│   └───time.js (time.ts)
│
├───app.js
│
└───package.json 
```
注：动态加载不会识别ts文件，因此如果您用Typescript语言，您需要自行用tsc等工具把ts编译为js。

app.js示例：
```javascript
var Express = require("express")
var Express_WX = require("express-wx")

// 构造Express的实例
var app = Express()

// 构造一个WXRouter的实例（使用express-wx包的WXRouter(config)函数，需要传入config）
var wxRouter = Express_WX.WXRouter({
    // config中只有appInfo是必填的，appInfo只有token字段是必填的。
    // 如果对更多的config配置感兴趣，请阅读WXRouterConfig接口上的注释（见bld/config.d.ts文件）
    appInfo: {
        token: "someToken" // 您需要保证在微信公众平台设置的Token和这里设置的Token一致
    },
    debugToken: "test"
})

// 把wxRouter对象注册到app上
app.use("/", wxRouter)

app.listen(8080) // 监听8080端口
```
  
接下来，您就可以撰写自己的请求处理逻辑的.js文件，并把它们放进handlers目录中。为您提供两个handler的示例供参考：  
  
handlers/helloworld.ts示例：（注意需要先编译为js才可使用）
```typescript
import {TextWXMessage, WXHandler} from "express-wx";

// 向WXHandler(fn)函数传入一个参数，参数的形式即为标准的express的(req, res, next)形式。
// 事实上您不使用WXHandler函数，而是直接提供一个普通函数也是可以的；但特别是当您使用TypeScript时还是强烈建议使用WXHandler，
// 因为这样可以获得更充分的类型提示。
export default WXHandler((req, res, next) => {
    // req是WXRequest类型的对象，它除了具有一般的express请求对象的接口以外，还额外有wxRouter属性（即当前WXRouter的实例，
    // 您可以从中获得公众号信息），
    // 和wx属性（类型为WXMessage，您可以从中获得用户发来的消息。）
    // WXMessage有很多种可能的类型、比如文本消息TextMessage类型；其上的text方法即是用户发来的消息文本。
    // 下面的语句把收到的消息打印出来。
    console.log("收到消息：" + (req.wx as TextWXMessage).text)
    //使用res.wx(WXMessage)方法可以回复消息给用户
    // 特殊的为了方便，回复文字内容时可以直接使用更简便的res.wxText(string)。
    // 下面的语句向用户回复消息"Hello World"。
    res.wxText("Hello World")
})

```
  
handlers/time.ts示例：（注意需要先编译为js才可使用）
```typescript
import {TextWXMessage, WXHandler} from "express-wx";
import * as moment from "moment"

// 这个处理逻辑用于在用户发送的文本带有“时间”两字时，向用户回复当前的时间。
var handler = WXHandler((req, res, next) => {
    if (req.wx instanceof TextWXMessage && req.wx.text.indexOf("时间") !== -1) {
        // 仅当收到的消息是文本消息且文本内容中含有“时间”二字时
        // 返回当前日期和时间的格式化字符串，使用moment库
        res.wxText(moment(new Date()).format('YYYY-MM-DD HH:mm:ss'))
    }
    else next() // 否则，则本函数不处理此消息，调用next函数交给后续的人处理。。
})
// 设置一下优先级
// 因为我们有另一个回复一切请求的hellowrorld.js，如果helloworld比这个函数先被调用就无法实现回复当前时间的功能了。
// 一个handler在没有特殊设置的情况下默认优先级为0，因此我们要把上面这个handler的优先级设置为一个大于0的数
handler.priority = 10

export default handler

```
  
虽然本程序已经对微信的API进行了尽量简洁、对人友好的封装，但仍然建议您可以阅读一下[微信公众平台的官方文档](https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Receiving_standard_messages.html)，这样有利于更好的使用本软件实现您的功能。

## 更多配置项参考
通过在WXRouter的构造函数传入config，可以实现更多的功能。  
请看[这里](./src/config.ts)查看更多的配置项参考。  

## Issue/Pull Request大欢迎！
欢迎提出Issue反馈问题、建议、意见，欢迎发起Pull Request完善本程序。  
由于项目尚处于初期阶段，对现有代码的测试尚不完善，因此暂不强制要求您的实现新特性的PR应当编写对新特性的测试。（当然，现有的数量有限的基础测试还是需要通过的，这个会由CI自动完成）  
It is very welcomed to raise Issues and/or make Pull Requests. Though English document is not supplied at this time, please feel free to use English in Issues and Pull Requests.

## 感谢
特别感谢[Rika](https://github.com/RikaSugisawa/)的帮助和合作。  
本项目的代码中使用了很多她的代码，包括：
- 动态文件加载的代码是基于[express-router-dynamic](https://github.com/RikaSugisawa/express-router-dynamic)的原理和代码的。
- 部分微信的代码，例如校验请求签名，使用了她的个人未开源代码。

## License
[MIT License](./LICENSE)

## 更新计划
以下是计划在未来逐步实现的功能（按顺序）。欢迎提交Pull Request！
- ACCESS_TOKEN管理
- UserProvider的实现（基于mongodb的用户管理）
- 微信JSAPI签名
- 发送模版消息
- 素材管理接口  
  
考虑到即使是个人开发者也已经能十分容易的实现https的现状，微信自带的消息加解密功能暂无支持计划。