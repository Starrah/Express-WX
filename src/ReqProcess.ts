import {Request} from "express";
import * as crypto from "crypto"
import {WXRequest} from "./WXRequest";
import {WXResponse} from "./WXResponse";
import {WXRouter} from "./WXRouter";
import * as bodyParser from "body-parser";
import {promisify} from "util";
import {xml2js, js2xml} from "xml-js";
import {parseMessageXml} from "./WXMessage";
js2xml

export function checkSignature(token: string, {nonce, signature, timestamp}) {
    return crypto.createHash('sha1')
        .update([token, timestamp, nonce].sort().join(''))
        .digest('hex') == signature
}

function checkSignatureOrDebug(req: Request, wxRouter: WXRouter) {
    return checkSignature(wxRouter.appInfo.token, req.query as any) ||
        (wxRouter.config.debugToken &&
            (wxRouter.config.debugToken === req.query.debug || wxRouter.config.debugToken === req.header("debug")))
}

export default async function ReqProcess(req: WXRequest, res: WXResponse, next, wxRouter: WXRouter, reo: {req, res, next}) {
    // 检查生命周期情况，未初始化或已销毁则返回错误
    if (!wxRouter.initialized || wxRouter.destroyed) res.sendStatus(503)
    // 若debug字段正确，则不检查超时和签名
    if (!(wxRouter.config.debugToken && (wxRouter.config.debugToken === req.query.debug ||
        wxRouter.config.debugToken === req.header("debug")))) {
        if (wxRouter.config.messageTimeout &&
            new Date().getTime() - (Number(req.query.timestamp) * 1000) > wxRouter.config.messageTimeout) {
            res.sendStatus(408)
            return;
        }
        if (!checkSignatureOrDebug(req, wxRouter)) {
            res.sendStatus(403)
            return;
        }
    }
    if (req.query.echostr) {
        res.send(req.query.echostr)
        return
    }

    await promisify(bodyParser.text({
        type: ['text/*', "*/xml"]
    }))(req, res)
    let content_type = req.header('content-type')
    if (content_type && content_type.indexOf('xml') !== -1) {
        let xmlObj = xml2js(req.body, {compact: true})['xml']
        req = new WXRequest(req, parseMessageXml(xmlObj), wxRouter)
        req._rawXmlObj = xmlObj

        res = new WXResponse(res)

        req.res = res
        res.req = req
        reo.req = req
        reo.res = res
    } else if (!wxRouter.config.allowNoneWXRequests) res.sendStatus(406)
    next(reo)
}