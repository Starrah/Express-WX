import {expect} from "chai"
import {describe, it} from "mocha"
import * as request from "request-promise"
import {xml2js} from "xml-js";
import {app, url, wxRouter} from "./testApp";
import * as delay from "delay";

app

function getRespText(xml): string {
    return xml2js(xml, {compact: true})["xml"]["Content"]["_cdata"]
}

describe("overall", () => {
    it('initializeApp', async () => {
        await wxRouter.tillInitialized()
    }).timeout(10000);

    it('testStatic', async () => {
        let nowTime = Math.round(new Date().getTime() / 1000)
        let respXml = await request.post(url, {
            body: `<xml>
  <ToUserName><![CDATA[toUser]]></ToUserName>
  <FromUserName><![CDATA[fromUser]]></FromUserName>
  <CreateTime>${nowTime}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[testStatic]]></Content>
  <MsgId>1234567890123456</MsgId>
</xml>`,
            encoding: "UTF-8",
            headers: {
                "Content-Type": "text/xml"
            }
        })
        let respText = getRespText(respXml)
        expect(respText).equal("resultStatic")
    })

    it('testSuccess', async () => {
        let nowTime = Math.round(new Date().getTime() / 1000)
        let respXml = await request.post(url, {
            body: `<xml>
  <ToUserName><![CDATA[toUser]]></ToUserName>
  <FromUserName><![CDATA[fromUser]]></FromUserName>
  <CreateTime>${nowTime}</CreateTime>
  <MsgType><![CDATA[image]]></MsgType>
  <PicUrl><![CDATA[http://www.baidu.com]]></PicUrl>
  <MediaId><![CDATA[media_id]]></MediaId>
  <MsgId>1234567890123456</MsgId>
</xml>`,
            encoding: "UTF-8",
            headers: {
                "Content-Type": "text/xml"
            }
        })
        expect(respXml).equal("success")
    })

    it('testMain1', async () => {
        let nowTime = Math.round(new Date().getTime() / 1000)
        let respXml = await request.post(url, {
            body: `<xml>
  <ToUserName><![CDATA[toUser]]></ToUserName>
  <FromUserName><![CDATA[fromUser]]></FromUserName>
  <CreateTime>${nowTime}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[testMain1]]></Content>
  <MsgId>1234567890123456</MsgId>
</xml>`,
            encoding: "UTF-8",
            headers: {
                "Content-Type": "text/xml"
            }
        })
        let respText = getRespText(respXml)
        expect(respText).equal("resultT1_testMain1")
    })
})
