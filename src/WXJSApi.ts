/**
 * JSAPI签名所用的内容。
 *
 * WXRouter.signJSAPI函数需要传入一个此类型的对象作为参数。
 *
 * 更多内容，请阅读微信官方文档 https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/JS-SDK.html
 */
export interface WxJSApiSignParam {
    url: string
    timestamp: string
    noncestr: string
}