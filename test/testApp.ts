import {WXHandler, TextWXMessage, WXRouter} from "../src";
import * as Express from "express";
import * as Path from "path";
let staticExample = WXHandler((req, res, next) => {
    if (req.wx instanceof TextWXMessage && req.wx.text === "testStatic") res.wxText("resultStatic")
    else next()
})
staticExample.priority = 10

export var app = Express()

export var wxRouter = WXRouter({
    appInfo: {token: "testtoken"},
    handlersDir: Path.join(Path.dirname(module.filename), "dynamic"),
    staticHandlers: [staticExample],
    debugToken: "test",
})

app.use("/wx", wxRouter)

export var url = "http://localhost:48024/wx/?debug=test"

app.listen(48024)