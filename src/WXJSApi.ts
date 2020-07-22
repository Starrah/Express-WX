/**
 * JSAPI签名所用的内容。WXRouter.signJSAPI函数需要传入一个此类型的对象作为参数。
 *
 * 其中url是必填的，而timestamp和noncestr是可选的，如果不填则会默认初始化为一个合适的值。
 *
 * 更多内容，请阅读微信官方文档 https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/JS-SDK.html
 */
export interface WxJSApiSignParam {
    url: string
    timestamp?: number
    noncestr?: string
}

/**
 * JSAPI签名函数（WXRouter.signJSAPI）返回的对象。与微信的JS-SDK的wx.config所需要的参数的字段是匹配的，
 * 不过您需要自行补充所用API的jsApiList后才能成功wx.config。
 *
 * 更多内容，请阅读微信官方文档 https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/JS-SDK.html
 */
export interface WxJSApiSignResult {
    appId: string
    timestamp: number
    nonceStr: string
    signature: string
}