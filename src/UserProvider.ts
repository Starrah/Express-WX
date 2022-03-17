import {WXRequest} from "./WXRequest";
import {Logger, MongoDBLogger} from "./Logger";
import * as Mongoose from "mongoose"
import {Connection, Document, Model, Promise, Schema} from "mongoose";
import * as SendRequest from "request-promise";
import {assertWXAPISuccess, isPromiseLike} from "./utils";
import {WXRouter} from "./WXRouter";

export interface LoggableUser {
    toLogData?(loggerInstance: Logger): any
}

export declare type ToLogDataFuncOfLoggableUser<T> = (this: T & LoggableUser, loggerInstance: Logger) => any

interface WithUser<T> {
    user?: T
}

export type WXRequestWithUser<T> = WXRequest & WithUser<T>

/**
 * 该类型是一种函数（能够根据openId产生用户信息的函数）的别名。函数的参数和返回值要求如下：
 *
 * @param openId 字符串格式，即req.wx.openId
 * @return 可以是任意类型（undefined或者null当然也可以）。 不过建议最好为string类型或是LoggableUser的实例（为了在日志记录时更合理的处理用户信息的字段格式）
 */
export type UserProvider = (openId: string) => string | LoggableUser | any | Promise<string | LoggableUser | any>


/**
 * 微信接口返回的用户数据的接口定义。
 *
 * 详见微信公众平台官方文档。
 */
export interface WXAPIUser extends LoggableUser {
    subscribe: 0 | 1
    openid: string
    nickname: string
    sex: 0 | 1 | 2 //值为1时是男性，值为2时是女性，值为0时是未知
    language: "zh_CN" | string
    city: string
    province: string
    country: "中国" | string
    headimgurl: string
    subscribe_time: number
    unionid: string
    remark: string
    groupid: number
    tagid_list: Array<number>
    subscribe_scene: "ADD_SCENE_SEARCH" | "ADD_SCENE_ACCOUNT_MIGRATION" | "ADD_SCENE_PROFILE_CARD" | "ADD_SCENE_QR_CODE" | "ADD_SCENE_PROFILE_LINK" | "ADD_SCENE_PROFILE_ITEM" | "ADD_SCENE_PAID" | "ADD_SCENE_WECHAT_ADVERTISEMENT" | "ADD_SCENE_OTHERS"
    qr_scene: number
    qr_scene_str: string
}

/**
 * 这是一个构造函数，它返回的是一个UserProvider。
 *
 * 被返回的UserProvider的作用即是根据openId，请求微信接口，获取用户信息。当然为了减小接口的压力可能会对用户信息做一个缓存。
 *
 * @param userInfoCacheTimeMs 用户信息的缓存时间，单位为ms，默认为2小时(7200000ms)。如果指定为0则是不缓存。缓存在本地的内存进行，不会持久化。
 * @param toLogData 选填。可以传入函数用于把用户的数据对象变换为可日志记录的格式。默认为：对MongoDBLogger记录昵称、性别、省份、unionid、remark；其余种类的Logger的则只记录昵称字符串。
 * @constructor
 */
export function WXAPIUserProvider(userInfoCacheTimeMs: number = 7200000, toLogData?: ToLogDataFuncOfLoggableUser<WXAPIUser>): UserProvider {
    let resFunc: ((openId: string) => Promise<WXAPIUser>) & { cache: { [k: string]: { user: WXAPIUser, date: Date } }, cacheTime: number }
    // @ts-ignore
    resFunc = async function (openId: string): WXAPIUser {
        let {user, date} = resFunc.cache[openId] || {}
        // @ts-ignore
        if (user && new Date() - date <= resFunc.cacheTime) return user
        else {
            user = await SendRequest.get("https://api.weixin.qq.com/cgi-bin/user/info", {
                qs: {
                    access_token: (this as WXRouter).accessToken,
                    openid: openId,
                    lang: "zh_CN"
                },
                json: true
            })
            assertWXAPISuccess(user)
            user.toLogData = toLogData || function (loggerInstance: Logger) {
                if (loggerInstance instanceof MongoDBLogger) {
                    let {nickname, sex, province, unionid, remark} = (this as WXAPIUser)
                    return {nickname, sex, province, unionid, remark: remark ? remark : undefined}
                }
                return (this as WXAPIUser).nickname
            }
            resFunc.cache[openId] = {user, date: new Date()}
            return user
        }
    }
    resFunc.cacheTime = userInfoCacheTimeMs
    resFunc.cache = {}
    return resFunc
}

/**
 * 这是一个构造函数，它返回的是一个UserProvider。
 *
 * 被返回的UserProvider的作用即是根据openId，在指定的MongoDB collection中查找出用户对应的数据对象（T类型）。
 * 返回的对象类型是T & mongoose.Document，同时具有T指定的属性和mongoose提供的文档操作接口，因而对用户的数据的增删改也同样很方便。
 *
 * @constructor
 * @param connection 可以传MongoDB的URI，形如mongodb://user:password@host:port/database，也可以传Mongoose的Connection。
 * @param schema 用户数据对应的mongoose.Schema。
 * @param toLogData 必填，指定如何把用户转换为日志格式。
 * @param option 选项配置。其中dbName表示使用的database名字（不填则默认为uri中指定的那个database）。
 * 而connectionOption的内容是直接原样传给mongoose.createConnection的。
 */
export function MongoDBUserProvider<T>(connection: string | Connection, schema: Schema, toLogData: ToLogDataFuncOfLoggableUser<T>, option?: {
    dbName?: string,
    connectionOption?: Mongoose.ConnectionOptions,
    openIdFieldName?: string
}): UserProvider {
    // option处理
    option = option || {}
    if (option.dbName !== undefined) {
        option.connectionOption = option.connectionOption || {}
        option.connectionOption.dbName = option.dbName
    }
    let openIdName = option.openIdFieldName || "openId"
    // 最终要返回的Provider函数
    let resFunc: ((openId: string) => Promise<T & Document>) & { valid: boolean, model: Model<T & Document> }

    // 如果是string，则创建连接
    if (typeof connection === "string") connection = Mongoose.createConnection(connection, option.connectionOption)

    const indexDefinition = {}
    indexDefinition[openIdName] = 1
    schema.index(indexDefinition)
    let model: Model<T & Document> = <Model<any & Document>>connection.model(schema.get("collection"), schema)
    // @ts-ignore
    resFunc = async function (openId: string): T {
        if (resFunc.valid === false) throw Error("MongoDB连接失败，故无法查询用户！")
        let queryParam = {}
        queryParam[openIdName] = openId
        let res: T & Document = await resFunc.model.findOne(queryParam);
        if (res) (res as LoggableUser).toLogData = toLogData
        return res
    }

    // 如果是pendingConnection，则then一下
    if (isPromiseLike(connection)) (connection as any).then(() => resFunc.valid = true, () => resFunc.valid = false)
    else resFunc.valid = true // 否则直接视为成功

    resFunc.model = model
    return resFunc
}
