import {Request} from "express"
import {extendPrototype} from "./utils";
import {WXRouter} from "./WXRouter";
import {xml2js} from "xml-js";
import {WXMessage} from "./WXMessage";

export interface WXRequest extends Request {

}

export class WXRequest implements Request{
    constructor(baseObj: Request, wxRouter: WXRouter) {
        extendPrototype(baseObj, this)
        this.wxRouter = wxRouter
    }

    /** 当前微信对应的WXRouter实例。 */
    wxRouter: WXRouter

    /** 收到的消息的WXMessage类型。
     * 要判断具体的类型，可以使用req.wx instanceof TextWXMessage, 也可以使用req.wx.type === "text"。 */
    wx: WXMessage

    /** 收到的XML经xml-js转换后得到的原始对象。不建议使用此字段，请尽量使用集成完整处理的wx字段。 */
    _rawXmlObj: any
}

