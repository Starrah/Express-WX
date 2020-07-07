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