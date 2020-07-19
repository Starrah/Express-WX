import {Request, RequestHandler, Response, Router} from 'express'
import {mergeConfigWithDefault, WXAPPInfo, WXRouterConfig} from "./config";
import {extendPrototype} from "./utils";
import ReqProcess from "./ReqProcess";
import {WXRequest} from "./WXRequest";
import {WXResponse} from "./WXResponse";
import {loadRouter, watchRecursively} from "./watchFiles";
import {IRouterHandler, IRouterMatcher} from "express-serve-static-core";
import {WxJSApiSignParam} from './WXJSApi'
import {WithPriority} from "./WXHandler";

interface _WXRouterBase extends Router {
}

class _WXRouterBase implements Router {
    constructor(config: WXRouterConfig) {
        let base = Router()
        // @ts-ignore
        this._superProto = base._proto_
        base.use(this.handleRequest.bind(this))
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
        } else {
            appInfo.then(v => this.appInfo = v)
        }

        this._staticHandlers = this.config.staticHandlers

        // 监视动态路由
        let handlersDirArr = this.config.handlersDir instanceof Array ? this.config.handlersDir : [this.config.handlersDir]
        let initDynamics = {};

        (async () => {
            for (let oneDir of handlersDirArr) {
                await watchRecursively(oneDir)
                Object.assign(initDynamics, await loadRouter(oneDir))
            }
            this._handlerMap = initDynamics
        })()

        // @ts-ignore
        return base
    }

    private async _nextFunction(curIndex: number, clo: { lastNextCallIndex: number, curHandlers: RequestHandler[] }, reo: { req, res, next }, err?) {
        if (curIndex >= clo.curHandlers.length) {
            if (!err && reo.req.wx) {
                if (this.config.finalResponseText) reo.res.wxText(this.config.finalResponseText)
                else reo.res.wxNoResp()
            }
            else {
                reo.next(err)
            }
            return
        }
        clo.lastNextCallIndex = curIndex
        let handler = clo.curHandlers[curIndex]
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

    /**
     * JSAPI签名
     * @return 签名signature，直接填入JS-SDK的config参数的signature字段即可。详见微信官方文档。
     */
    signJSAPI(param: WxJSApiSignParam): string {
        throw Error("当前版本暂未实现微信JSAPI签名功能！")
    }
}

export interface WXRouter extends _WXRouterBase, Router, RequestHandler {
}

export function WXRouter(config: WXRouterConfig): WXRouter {
    // @ts-ignore
    return new _WXRouterBase(config)
}

