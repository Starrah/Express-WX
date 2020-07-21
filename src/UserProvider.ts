import {WXRequest} from "./WXRequest";
import {Logger} from "./Logger";
import * as Mongoose from "mongoose"

export interface LoggableUser {
    toLogData?(loggerInstance: Logger): any
}

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
 * 这是一个构造函数，它返回的是一个UserProvider。
 *
 * 被返回的UserProvider的作用即是根据openId，请求微信接口，获取用户信息。当然为了减小接口的压力可能会对用户信息做一个缓存。
 *
 * @param userInfoCacheTimeMs 用户信息的缓存时间，单位为ms，默认为2小时(7200000ms)。如果指定为0则是不缓存。缓存在本地的内存进行，不会持久化。
 * @constructor
 */
export function WXAPIUserProvider(userInfoCacheTimeMs: number = 7200000): UserProvider {
    // TODO
    throw Error("当前版本暂未实现此项功能。请期待后续更新，亦欢迎提交PR！")
}

/**
 * 这是一个构造函数，它返回的是一个UserProvider。
 *
 * 被返回的UserProvider的作用即是根据openId，在指定的MongoDB collection中查找出用户对应的数据对象（T类型）。
 * 返回的对象直接是Mongoose的Model<Document & T>实例，因而对用户的数据的增删改也同样很方便。
 *
 * @constructor
 * @param mongoUri MongoDB的URI，形如mongodb://user:password@host:port/database
 * @param schema 用户数据对应的mongoose.Schema。
 * @param option 选项配置。其中dbName表示使用的database名字（不填则默认为uri中指定的那个database）。
 * 而connectionOption的内容是直接原样传给mongoose.createConnection的。
 */
export function MongoDBUserProvider<T>(mongoUri: string, schema: Mongoose.Schema, option?: {
    dbName?: string,
    connectionOption?: Mongoose.ConnectionOptions,
}): UserProvider {
    // TODO
    throw Error("当前版本暂未实现此项功能。请期待后续更新，亦欢迎提交PR！")
}