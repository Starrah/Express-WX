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
