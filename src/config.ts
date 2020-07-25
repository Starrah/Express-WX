import {RequestHandler} from "express";
import {FileOrConsoleLogger, Logger} from "./Logger";
import {UserProvider} from "./UserProvider";

export interface WXAPPInfo {
    /**
     * 必填，在微信公众平台后台设置的token。与微信服务器建立连接所必需。
     */
    token: string

    /**
     * 选填，微信公众号的APPID。如果需要使用ACCESS_TOKEN关联的功能，则必须提供此项。
     */
    APPID?: string

    /**
     * 选填，微信公众号的APPSECRET。如果需要使用ACCESS_TOKEN关联的功能，则必须提供此项。
     */
    APPSECRET?: string
}

export interface WXRouterConfig {
    /**
     * 微信公众平台的基本信息，包括微信公众平台后台设置的令牌（必须）、APPID和APPSECRET（可选）等信息。
     *
     * 可以直接传入一个WXAPPInfo对象，也可传入一个能返回WXAPPInfo的普通函数或异步函数。
     * @see WXAPPInfo
     */
    appInfo: WXAPPInfo | {(): WXAPPInfo | Promise<WXAPPInfo>}

    /**
     * 动态加载请求处理器的目录路径。默认为"./handlers"。
     *
     * 凡在此路径下的、export default为函数类型的.js文件，均会被动态加载、并看做express的RequestHandler，
     * 以参数(req: WXRequest, res: WXResponse, next)依次调用。
     *
     * 依次调用的先后顺序以优先级数值从大到小为顺序。优先级的数值可以按如下方式定义：
     *
     * 1. 如果文件名形如xxx_数字.js，则这个数字部分是优先级。其中数字部分应当介于-10000至10000之间，可以是整数或实数、
     * 可以是正数或负数或0。例如：文件名为example_-5.0.js，则优先级为-5.0。
     * 2. 如果文件名上未定义优先级，则检查js文件的export default得到的函数对象的priority属性，
     * 如果priority属性存在且是number，则它是优先级。
     * 3. 如果上述方式仍未定义优先级，则默认优先级为0。
     */
    handlersDir?: string | string[],

    /**
     * 静态加载的预置的路由或中间件的列表。默认为[]。
     *
     * 凡是写在此列表中的请求处理函数（包括WXRequestHandler、Router、中间件等等，只要是(req, res, next)形式的函数都是可以的）
     * 均会被静态的加载，并和handlersDir目录中动态加载的内容合并，依次调用。
     *
     * 当然该数组中的对象也可通过priority属性定义优先级。
     */
    staticHandlers?: Array<RequestHandler>

    /**
     * 使用的日志记录器。记录的是所有的日志，包括运行日志、报错日志等等，如果没有指定messageLogger的话也会记录消息日志到这里。
     * 默认为记录到控制台的日志记录器。如果希望关闭日志记录功能，请传入null。
     *
     * 需要传入一个实现了Logger接口的实例。同时，也有许多自带的Logger实例可供使用，如记录到控制台或文件的FileOrConsoleLogger、
     * 记录到MongoDB的MongoDBLogger等等，详见Logger.d.ts文件。
     */
    logger?: Logger

    /**
     * 使用的消息日志记录器。默认为使用logger属性中的日志记录器。
     *
     * 与logger属性相同，需要传入一个实现了Logger接口的实例
     */
    messageLogger?: Logger

    /**
     * 是否开启自动获取ACCESS_TOKEN的功能。默认为true。
     *
     * 如果开启，则会自动获取和定时刷新ACCESS_TOKEN；通过WXRouter的accessToken属性可以直接拿到ACCESS_TOKEN的值。
     *
     * 注意：如果appInfo中没有给出APPID和APPSECRET，则本项设置为true也是没用的；注意记得成功获取ACCESS_TOKEN
     * 必须需要在微信公众平台设置白名单。
     */
    enbaleAcccesToken?: boolean

    /**
     * 是否开启JSAPI签名功能。默认为false。
     *
     * 如果开启，则通过WXRouter对象的signJSAPI(param: WXJSApiSignParam)函数可以实现JSAPI的签名。
     *
     * 注：上述签名方法的使用必须满足：appInfo有传入APPID和APPSECRET、enableAccessToken和enableJSAPI均为true。
     * 如果有任何条件不满足，调用signJSAPI函数均会抛出异常。
     */
    enableJSAPI?: boolean

    /**
     * 定时刷新ACCESS_TOKEN的周期，单位为ms。默认为5400000，即每90分钟刷新一次。
     */
    accessTokenUpdateInterval?: number

    /**
     * 此配置项需要传入一个UserProvider的实例，即一个可以根据openId产生用户信息的函数。可以是异步函数。
     * 详见UserProvider的注释（见UserProvider.d.ts）
     *
     * 默认值为undefined，即不开启自动产生用户信息功能。
     *
     * 如果指定了本配置项，则对于每一条收到的消息，都会调用一次此配置项指定的的UserProvider函数，并令req.user=该调用用的返回值。
     * 这样一来req上面就多出了一个user属性。此时的req对象可以用类型WXRequestWithUser<T>来指代（见UserProvider.d.ts）
     *
     * 注：微信公众平台提供了利用openId换取用户信息的接口（只有认证的帐号才有权限使用）。本框架提供了一个通过该接口获取用户详细信息的内置实现，
     * 如果您希望对任何用户直接利用其openId请求微信接口获知用户信息，可以考虑把本配置项指定为WXAPIUserProvider()（见UserProvider.d.ts）。
     */
    userProvider?: UserProvider

    /**
     * 对于微信发来的请求正常会按照微信官方文档中说的方式校验签名，如果签名校验不通过会直接返回403。
     *
     * 但是，考虑到debug的需求，特设置了此配置项，可以传入一个string。这样，如果收到的请求的请求参数
     * （请求url中?之后的部分）中具有debug=XXX，其中XXX是本属性被设置的值的话，则会允许此请求正常处理。
     */
    debugToken?: string

    /**
     * 如果指定了此项，则当依次调用所有处理函数、请求仍未被处理时，则向用户返回Text形式的消息，内容为此字段指定的值。
     * 例如，“您的消息无法被理解”，或者“您的消息将会被尽快人工处理”之类的。
     */
    finalResponseText?: string

    /**
     * 是否自动调用请求处理函数的next。默认为true。
     *
     * 如果开启，则对于加载的每个请求处理器，如果请求处理器返回（包含同步返回和异步返回）时，响应并没有被发出并且next也没有被调用，
     * 则会自动调用next。
     */
    autoCallNext?: boolean

    /**
     * 是否允许非微信请求进入处理逻辑、被各个handlers依次处理。默认为false。
     *
     * 除非有明确的需求，否则建议维持默认值false。因为非微信请求的req上没有wx属性，
     * 如果相关handler没有进行判断的话很可能引起访问undefined属性等异常。
     */
    allowNoneWXRequests?: boolean,

    /**
     * 从微信服务器收到的请求的最大允许时间。单位为ms，默认为5000。
     *
     * 在收到微信服务器发来的请求时，会把请求签名中的timestamp与当前时间作对比，只有差值小于此配置的数值时才会接受，
     * 否则返回HTTP 408 Request Timeout。
     *
     * 若不希望有此项限制（不进行超时检查），将此处的值设置为null或0即可。
     */
    messageTimeout?: number
}

const defaultConfig: WXRouterConfig = {
    appInfo: undefined,
    handlersDir: "./handlers",
    staticHandlers: [],
    logger: new FileOrConsoleLogger(),
    messageLogger: null,
    enbaleAcccesToken: true,
    enableJSAPI: false,
    accessTokenUpdateInterval: 5400000,
    userProvider: undefined,
    debugToken: undefined,
    finalResponseText: undefined,
    autoCallNext: true,
    allowNoneWXRequests: false,
    messageTimeout: 5000
}

export function mergeConfigWithDefault(config: WXRouterConfig): WXRouterConfig {
    for (let key in defaultConfig) {
        // noinspection JSUnfilteredForInLoop
        if (config[key] === undefined) { // noinspection JSUnfilteredForInLoop
            config[key] = defaultConfig[key]
        }
    }
    return config
}