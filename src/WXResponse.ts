import {Response} from "express"
import {extendPrototype, xmlGetKey, xmlSetText} from "./utils";
import {WXRouter} from "./WXRouter";
import {NoResponseWXMessage, TextWXMessage, WXMessage} from "./WXMessage";
import {js2xml} from "xml-js";
import {WXRequest} from "./WXRequest";

export interface WXResponse extends Response {

}

export class WXResponse implements Response {
    constructor(baseObj: Response) {
        extendPrototype(baseObj, this)
        // @ts-ignore
        baseObj.__proto__ = this.__proto__
        // @ts-ignore
        return baseObj
    }

    /** 向客户端回复消息。
     *
     * 回复消息应该使用WXMessage类的具体实例。
     *
     * @example
     * res.wx(new ImageWXMessage(image_media_id));
     */
    wx(message: WXMessage) {
        let xmlObj = message.toXML()
        let sendStr

        if (!xmlObj) sendStr = "success"
        else {
            if (!xmlObj.ToUserName) xmlSetText(xmlObj, "ToUserName", (this.req as WXRequest).wx.openId, true)
            if (!xmlObj.FromUserName) xmlSetText(xmlObj, "FromUserName", xmlGetKey((this.req as WXRequest)._rawXmlObj, "ToUserName"), true)
            sendStr = js2xml({xml: xmlObj}, {compact: true})
        }
        this.send(sendStr)
        this.wxRouter.messageLogger.logMessage(this.req as WXRequest, message, this._curHandler)
    }

    get wxRouter(): WXRouter {
        return (this.req as WXRequest).wxRouter
    }

    _curHandler: any

    /**
     * 向客户端回复文本消息的快速方法，使用本方法可以免去构造TextWXMessage的麻烦。
     *
     * 该方法等价于wx(new TextWXMessage(text));
     */
    wxText(text: string) {
        this.wx(new TextWXMessage(text))
    }

    /**
     * 向客户端不回复消息（即向微信服务器回复success）的快速方法，使用本方法可以免去构造NoResponseWXMessage的麻烦。
     *
     * 该方法等价于wx(new NoResponseWXMessage());
     */
    wxNoResp() {
        this.wx(new NoResponseWXMessage())
    }

    /**
     * 向微信服务器回复原始的xml。不建议使用本方法，请尽量使用wx方法。
     */
    _wxRawXmlSend(xml) {
        this.send(js2xml({xml}, {compact: true}))
    }
}