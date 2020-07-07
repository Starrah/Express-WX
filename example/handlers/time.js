"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_wx_1 = require("express-wx");
const moment = require("moment");
// 这个处理逻辑用于在用户发送的文本带有“时间”两字时，向用户回复当前的时间。
var handler = express_wx_1.WXHandler((req, res, next) => {
    if (req.wx instanceof express_wx_1.TextWXMessage && req.wx.text.indexOf("时间") !== -1) {
        // 仅当收到的消息是文本消息且文本内容中含有“时间”二字时
        // 返回当前日期和时间的格式化字符串，使用moment库
        res.wxText(moment(new Date()).format('YYYY-MM-DD HH:mm:ss'));
    }
    else
        next(); // 否则，则本函数不处理此消息，调用next函数交给后续的人处理。。
});
// 设置一下优先级
// 因为我们有另一个回复一切请求的hellowrorld.js，如果helloworld比这个函数先被调用就无法实现回复当前时间的功能了。
// 一个handler在没有特殊设置的情况下默认优先级为0，因此我们要把上面这个handler的优先级设置为一个大于0的数
handler.priority = 10;
exports.default = handler;
//# sourceMappingURL=time.js.map