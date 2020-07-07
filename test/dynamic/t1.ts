import {WXHandler, TextWXMessage} from "../../src";

export default WXHandler((req, res, next) => {
    if (req.wx instanceof TextWXMessage && req.wx.text !== "testSuccess") res.wxText(`resultT1_${req.wx.text}`)
    else next()
})

