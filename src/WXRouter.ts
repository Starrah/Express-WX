import {Request, RequestHandler, Response, Router} from 'express'
import {mergeConfigWithDefault, WXAPPInfo, WXRouterConfig} from "./config";
import {assertWXAPISuccess, checkify, extendPrototype} from "./utils";
import ReqProcess from "./ReqProcess";
import {WXRequest} from "./WXRequest";
import {WXResponse} from "./WXResponse";
import {generateOnChangeCb, loadRouter, watchRecursively} from "./watchFiles";
import {IRouterHandler, IRouterMatcher} from "express-serve-static-core";
import {WxJSApiSignParam} from './WXJSApi'
import {Logger} from "./Logger";
import * as delay from "delay";
import * as Path from "path";
import {WithPriority} from "./WXHandler";
import * as SendRequest from "request-promise"

interface _WXRouterBase extends Router {
}

class _WXRouterBase implements Router {
    // 生命周期相关
    private _initialized: boolean = false
    get initialized(): boolean {
        return this._initialized
    }

    assertInitialized() {
        if (!this.initialized) throw Error("本WXRouter的实例需要异步初始化，而该过程还未完成，因此暂无法执行要求的功能。请稍后再试！")
    }

    private _destroyed: boolean = false
    get destroyed(): boolean {
        return this._destroyed
    }
    /** 返回一个Promise，它在当前WXRouter对象初始化完成后才予以resolve。只要初始化没有完成，就会一直pending。*/
    async tillInitialized() {
        while (!this.initialized) {
            await delay(20)
        }
        return
    }
    private _onDestroy() {
        this._destroyed = true
        this.logger.log("WXRouter被销毁！", "WARNING")
    }


    constructor(config: WXRouterConfig) {
        let base = Router()
        // @ts-ignore
        this._superProto = base._proto_
        base.use(this.handleRequest.bind(base))
        // @ts-ignore
        base.__proto__ = extendPrototype(base, this).__proto__

        // 处理配置
        this.config = mergeConfigWithDefault(config)

        let appInfo: WXAPPInfo | Promise<WXAPPInfo>
        if (typeof this.config.appInfo === "object") {
            appInfo = this.config.appInfo
        } else if (typeof this.config.appInfo === "function") {
            appInfo = this.config.appInfo()
        } else {
            throw Error("没有提供有效的appInfo！")
        }
        if (!(appInfo instanceof Promise)) {
            if (!appInfo.token) throw Error("appInfo中没有提供token！")
            this.appInfo = appInfo
        }

        this._staticHandlers = this.config.staticHandlers

        // 监视动态路由
        let handlersDirArr = this.config.handlersDir instanceof Array ? this.config.handlersDir : [this.config.handlersDir]
        let initDynamics = {};

        Object.assign(base, this);
        // 异步加载过程，最后需要设置initialized属性
        (async function () {
            // 异步调用appInfo获取函数
            this.appInfo = await appInfo

            // 建立文件删除监听器，当本文件被删除，自动调用_onDestroy标记本实例为已销毁。
            let myPath = module.path
            await watchRecursively(myPath, (event, filename, type) => {
                if (type === "fileRemove" && Path.resolve(myPath) === Path.resolve(filename)) {
                    this._onDestroy()
                }
            })

            // 监视文件夹和加载初始路由
            for (let oneDir of handlersDirArr) {
                await watchRecursively(oneDir, generateOnChangeCb(this))
                Object.assign(initDynamics, await loadRouter(oneDir))
            }
            this._handlerMap = initDynamics

            // 建立定时任务和accessToken初次获取
            // 无论何种情况（是否开启enbaleAccessToken、是否配置APPID），都一定会建立每10分钟刷新accessToken的定时任务。
            // 这是为了防止用户在代码的其他地方运行时修改config和appInfo，我们的逻辑也能正常工作。
            const TRY_UPDATE_CALL_INTERVAL = 20000;
            // noinspection ES6MissingAwait
            (async () => {
                while (!this.destroyed) { // 只要WXRouter没被摧毁，就一直运行
                    await delay(TRY_UPDATE_CALL_INTERVAL)
                    await this._tryUpdateAccessTokenIfNecessary() // _tryUpdate函数的实现为，如果获取access_token发生异常，只会log warning而不会抛出。
                }
            })()
            if (await checkify(this._assertAccessTokenAvailable).call(this)) { // 如果经检查、获取所需要的配置正确的话
                await this.updateAccessToken(true) //则尝试获取一次，此次获取失败的异常直接抛出
            }

            this._initialized = true
            this.logger.log("WXRouter初始化成功！")
        }).call(base)
        // @ts-ignore
        return base
    }

    get logger(): Logger | null {
        return this.config.logger
    }

    get messageLogger(): Logger | null {
        return this.config.messageLogger || this.config.logger
    }

    private async _nextFunction(curIndex: number, clo: { lastNextCallIndex: number, curHandlers: RequestHandler[] }, reo: { req, res, next }, err?) {
        if (curIndex >= clo.curHandlers.length) {
            if (!err && reo.req.wx) {
                if (this.config.finalResponseText) {
                    reo.res._curHandler = {nameForLog: "$finalResponse"}
                    reo.res.wxText(this.config.finalResponseText)
                } else reo.res.wxNoResp()
            } else {
                reo.next(err)
            }
            return
        }
        clo.lastNextCallIndex = curIndex
        let handler = clo.curHandlers[curIndex]
        reo.res._curHandler = handler
        let theNext = this._nextFunction.bind(this, curIndex + 1, clo, reo)

        try {
            if (err) {
                if (handler.length === 4) await handler.call(this, err, reo.req, reo.res, theNext)
                else {
                    theNext(err)
                    return
                }
            } else {
                await handler.call(this, reo.req, reo.res, theNext)
            }

            if (this.config.autoCallNext && !reo.res.headersSent && clo.lastNextCallIndex < curIndex + 1)
                theNext(err)
        } catch (e) {
            theNext(e)
        }
    }

    handleRequest(req: Request, res: Response, next) {
        ReqProcess(req as WXRequest, res as WXResponse, this._nextFunction.bind(this, 0, {
            curHandlers: this._handlers.concat(),
            lastNextCallIndex: -1
        }), this as any, {req, res, next}).catch(err => next(err))
    }

    config: WXRouterConfig
    appInfo: WXAPPInfo

    /**
     * 静态中间件列表
     *
     *
     * 直接修改此数组中的值不会自动触发路由更新。建议您不要直接修改此数组中的值。
     * 如果一定需要，请在修改后手动调用triggerHandlersUpdate()来触发更新。
     */
    _staticHandlers: Array<RequestHandler>

    private _handlerMapField: { [k: string]: RequestHandler } = {}
    private _handlers: Array<RequestHandler> = []

    // 为了实现更合理的handler刷新日志记录而使用
    private _lastHandlerUpdateTime: Date = null

    private async _logHandlersUpdate(innerCall: boolean = false) {
        function _theRelativeDynamicFilePath(absPath: string): string {
            let that = this
            if (typeof that.config.handlersDir === "string") {
                return Path.relative(that.config.handlersDir, absPath)
            } else if (that.config.handlersDir.length === 1) {
                return Path.relative(that.config.handlersDir[0], absPath)
            } else return Path.relative(".", absPath)
        }

        if (!innerCall) {
            if (!this._lastHandlerUpdateTime) {
                this._lastHandlerUpdateTime = new Date()
                while (this._lastHandlerUpdateTime) {
                    await delay(200)
                    await this._logHandlersUpdate(true)
                }
            } else this._lastHandlerUpdateTime = new Date()
        } else {
            // @ts-ignore
            if ((new Date() - this._lastHandlerUpdateTime) >= 500) {
                this._lastHandlerUpdateTime = null
                this.logger.log(`动态重新加载消息处理函数的过程成功完成！加载了动态处理函数[${Object.getOwnPropertyNames(this._handlerMap).map((v) => _theRelativeDynamicFilePath.call(this, v))}]${this._staticHandlers.length ? `，和${this._staticHandlers.length}个静态处理函数。` : ""}`)
            }
        }
    }

    triggerHandlersUpdate() {
        let arr = []
        for (let key in this._handlerMapField) {
            arr.push(this._handlerMapField[key])
        }

        // 合并静态中间件
        arr = arr.concat(this._staticHandlers.map((v: RequestHandler & WithPriority, index) => {
            // 如果导入的对象上不存在nameForLog属性，则添加上默认值"$static_{index}"
            v.nameForLog = v.nameForLog || "$static_" + index
            return v
        }))
        arr.sort((a, b) => (b.priority || 0) - (a.priority || 0))
        this._handlers = arr
        this._logHandlersUpdate()
    }

    get _handlerMap(): { [k: string]: RequestHandler } {
        return Object.assign({}, this._handlerMapField)
    }

    set _handlerMap(val: { [k: string]: RequestHandler }) {
        this._handlerMapField = val
        this.triggerHandlersUpdate()
    }

    private _superProto

    use: IRouterHandler<this> & IRouterMatcher<this> = function (path, ...handlers) {
        let that = this as _WXRouterBase
        if (typeof path === "function" || path === "*" || path === "/") {
            // 说明没有指定path或path是通配的
            // 则执行静态中间件添加逻辑而不是原始Router的use逻辑
            if (typeof path === "function") that._staticHandlers.push()
            handlers = handlers || []
            that._staticHandlers = that._staticHandlers.concat(handlers)
            that.triggerHandlersUpdate()
            return this
        }
        // 否则执行默认的use逻辑
        else that._superProto.use(path, ...handlers)
    }

    private _assertAccessTokenAvailable() {
        if (!this.config.enbaleAcccesToken) throw Error("config中没有开启enableAccessToken配置项，因而无法获取accessToken！")
        else if (!(this.appInfo.token && this.appInfo.APPID && this.appInfo.APPSECRET)) throw Error("config中没有配置合法的APPID和APPSECRET，因而无法获取accessToken！")
    }

    private _accessToken: string = null

    /**
     * 获取accessToken。
     *
     * 如果accessToken未开启或者因故（网络问题、WXRouter刚刚初始化还未来得及获取等等）获取不到，会抛异常。
     *
     * 当然我们实现了机制、每隔一段时间会定期刷新accessToken从而避免它过期失效。然而，我们很难保证accessToken一定是有效的，
     * 例如有其他的程序请求了accessToken会造成本程序之前请求的accessToken提前失效。不过，如果一旦出现了accessToken失效的情况
     * （即微信API返回错误码40014），您可以手动调用异步方法updateAccessToken来请求微信API刷新access_token。
     */
    get accessToken(): string {
        this._assertAccessTokenAvailable()
        this.assertInitialized()
        if (!this._accessToken) throw Error("没有有效的access_token可供使用！这可能是因为组件刚刚初始化还未来得及拿到accessToken，请稍后再试！")
        return this._accessToken
    }

    /**
     * 请求微信API刷新access_token。详见微信官方文档。
     *
     * @param _requestByAutoUpdate 标记这个请求是否是由WXRouter内部机制发起的，以在日志记录时有所区别。当您手动调用此函数时，
     * 请不要传此参数、直接保持其为默认值false。
     */
    async updateAccessToken(_requestByAutoUpdate = false): Promise<string> {
        try {
            this._assertAccessTokenAvailable()
            let resObj = await SendRequest.get("https://api.weixin.qq.com/cgi-bin/token", {
                qs: {
                    grant_type: "client_credential",
                    appid: this.appInfo.APPID,
                    secret: this.appInfo.APPSECRET
                },
                json: true
            })
            assertWXAPISuccess(resObj)
            this._accessToken = resObj.access_token
            this._lastAccessTokenUpdateTime = new Date()
            this.logger.log((_requestByAutoUpdate ? "自动" : "手动") + "刷新ACCESS_TOKEN成功！", "INFO")
            return resObj.access_token
        } catch (e) {
            this.logger.log((_requestByAutoUpdate ? "自动" : "手动") + "刷新ACCESS_TOKEN失败！ " + e, "WARNING")
            throw e
        }
    }

    private _lastAccessTokenUpdateTime: Date = null

    /**
     * 无论配置如何，这个函数都必定会每隔10分钟被调用一次。如果用户没开启access_token功能，那么什么也不做直接返回null即可。
     * @private
     */
    private async _tryUpdateAccessTokenIfNecessary(): Promise<string> {
        const AUTO_UPDATE_ACCESS_TOKEN_INTERVAL = 5400000 // 默认每1h30min就会自动刷新access_token
        try {
            this._assertAccessTokenAvailable()
            // @ts-ignore
            if (!this._lastHandlerUpdateTime || new Date() - this._lastHandlerUpdateTime >= AUTO_UPDATE_ACCESS_TOKEN_INTERVAL) {
                return await this.updateAccessToken(true)
            } else return null
        } catch (e) {
            // 如果是配置原因造成的定时刷新失败（包括enableAccessToken未打开、APPID未配置等情况），则不要抛异常，返回null就够了。
            return null
        }
    }

    /**
     * JSAPI签名
     * @return 签名signature，直接填入JS-SDK的config参数的signature字段即可。详见微信官方文档。
     */
    signJSAPI(param: WxJSApiSignParam): string {
        // TODO
        throw Error("当前版本暂未实现此项功能。请期待后续更新，亦欢迎提交PR！")
    }
}

export interface WXRouter extends _WXRouterBase, Router, RequestHandler {
}

export function WXRouter(config: WXRouterConfig): WXRouter {
    // @ts-ignore
    return new _WXRouterBase(config)
}

