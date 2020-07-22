import {WXMessage} from "./WXMessage";
import * as Fs from "fs"
import * as Path from "path"
import * as Chalk from "chalk";
import {promisify} from "util";
import {WXHandler} from "./WXHandler";
import {LoggableUser, WXRequestWithUser} from "./UserProvider";
import * as Util from "util"
import * as Mongoose from "mongoose"
import {WXRequest} from "./WXRequest";

const Mixed = Mongoose.Schema.Types.Mixed

export type LogLevels = "ERROR" | "WARNING" | "INFO" | "MESSAGE" | "DEBUG"

export interface Logger {
    log(data: any): Promise<void>

    log(data: any, level: LogLevels): Promise<void>

    logMessage(req: WXRequest, resWx: WXMessage, handler: WXHandler): Promise<void>
}

interface _MessageLogObj {
    openId: string
    userData?: any
    req: any
    res: any
    handler?: string
}

type MessageLogObj = { [k in any]: any } & _MessageLogObj

function MessageLogObj(req: WXRequest, resWx: WXMessage, handler: WXHandler, loggerInstance: Logger): MessageLogObj {
    let obj: MessageLogObj = {
        openId: req.wx.openId,
        req: req.wx.toLog(),
        res: resWx.toLog(),
        handler: handler && handler.nameForLog
    }
    let user = (req as WXRequestWithUser<any>).user
    if (user) {
        obj.userData = (user as LoggableUser).toLogData?.(loggerInstance) || user
    }
    return obj
}

export function isLegalLogger(o: any): boolean {
    return typeof o.log === "function" && typeof o.logMessage === "function"
}

/**
 * 把日志记录到控制台或文件的日志记录器。
 *
 * 构造函数可以传入一个字符串格式参数，表示要记录到的文件的文件路径。**如果不传入此参数，则默认为记录到控制台。**
 */
export class FileOrConsoleLogger implements Logger {
    chalk: boolean
    toConsole: boolean = false
    path: string
    fd: number

    /**
     * @param path 可选 要记录到的文件的路径位置。**如果不填，则默认为记录到控制台。**
     * @param chalk 可选 是否开启控制台文字颜色(chalk)。默认为true。
     */
    constructor(path: string | undefined = undefined, chalk: boolean = true) {
        if (!path) {
            // 如果未传入合法路径则是默认输出到控制台
            this.toConsole = true
        } else {
            this.path = path
            Fs.mkdirSync(Path.dirname(this.path), {recursive: true})
            this.fd = Fs.openSync(this.path, "a")
        }
        this.chalk = chalk
    }

    // noinspection JSMethodCanBeStatic
    private _prefix(level: LogLevels): string {
        let levelStr
        if (level === "ERROR") levelStr = Chalk.bgRed("ERROR") + "\t"
        else if (level === "WARNING") levelStr = Chalk.bgYellow("WARNING") + "\t"
        else if (level === "INFO") levelStr = Chalk.bgGreen("INFO") + "\t\t"
        else if (level === "MESSAGE") levelStr = Chalk.bgCyan("MESSAGE") + "\t"
        else if (level === "DEBUG") levelStr = Chalk.bgWhite("DEBUG") + "\t"
        return new Date().toLocaleString() + " " + levelStr
    }

    async log(data: any, level: LogLevels = "INFO") {
        if (this.toConsole) {
            if (level === "ERROR" || level === "WARNING") {
                console.error(this._prefix(level) + data)
            } else {
                console.log(this._prefix(level) + data)
            }
        } else {
            await promisify(Fs.appendFile)(this.fd, this._prefix(level) + data + "\r\n")
        }
    }

    async logMessage(req: WXRequest, resWx: WXMessage, handler: WXHandler) {
        let logObj = MessageLogObj(req, resWx, handler, this)
        let userStr = logObj.userData? `(${logObj.userData})` : ""
        let logStr = `${Chalk.underline(logObj.openId + userStr)}: ${Util.inspect(logObj.req)} --> ${Util.inspect(logObj.res)}`
        await this.log(logStr, "MESSAGE")
    }
}

/**
 * 把日志记录到MongoDB的日志记录器。
 *
 * 构造函数必须传入一个MongoDB URI、一个Collection名字，并可选传入一个配置对象。详见构造函数的注释。
 */
export class MongoDBLogger implements Logger {
    valid: boolean = false
    model: Mongoose.Model<Mongoose.Document>
    connection: Mongoose.Connection

    /**
     * @param mongoUri MongoDB的URI，形如mongodb://user:password@host:port/database
     * @param collection 要存储日志的collection的名字
     * @param option 选项配置。其中capped表示集合是否capped，dbName表示使用的database名字（不填则默认为uri中指定的那个database）。
     * 而connectionOption和schemaOption定义的内容是直接原样传给mongoose.createConnection和new mongoose.Schema的，详见Mongoose.js官方文档。
     */
    constructor(mongoUri: string, collection: string, option?: {
        capped?: boolean,
        dbName?: string,
        connectionOption?: Mongoose.ConnectionOptions,
        schemaOption?: Mongoose.SchemaOptions
    }) {
        // option处理
        option = option || {}
        if (option.capped === undefined) option.capped = true
        if (option.dbName !== undefined) {
            option.connectionOption = option.connectionOption || {}
            option.connectionOption.dbName = option.dbName
        }
        option.schemaOption = option.schemaOption || {}
        option.schemaOption.capped = option.capped

        // Schema构建
        option.schemaOption.strict = false
        option.schemaOption.versionKey = false
        let schema = new Mongoose.Schema({
            date: {type: Date, default: Date.now}, // 日期date对象
            level: {type: String, default: "INFO"},
            content: {type: String},
            openId: {type: String},
            user: {type: Mixed},
            req: {type: Mixed},
            handler: {type: String},
            res: {type: Mixed}
        }, option.schemaOption)

        // 连接和model构建
        let pendingConnection = Mongoose.createConnection(mongoUri, option.connectionOption)
        pendingConnection.then(()=>{this.valid = true})
        this.connection = pendingConnection
        this.model = this.connection.model(collection, schema, collection)
    }

    async log(data: any, level: LogLevels = "INFO") {
        if (typeof data === "function") data = data.name
        if (typeof data !== "object") data = {content: data}
        data.level = level
        let modelObj = new this.model(data)
        await Util.promisify(modelObj.save).call(modelObj)
    }

    async logMessage(req: WXRequest, resWx: WXMessage, handler: WXHandler) {
        let logObj = MessageLogObj(req, resWx, handler, this)
        let obj: any = {
            openId: logObj.openId,
            user: logObj.userData,
            req: logObj.req,
            handler: logObj.handler,
            res: logObj.res
        }
        await this.log(obj, "MESSAGE")
    }
}

/**
 * 可以用于把把日志同时记录到多个logger的logger。
 */
export class WrapManyLogger implements Logger {
    loggerList: Array<Logger> = []

    /**
     * @param loggerList
     */
    constructor(loggerList: Array<Logger>) {
        this.loggerList = loggerList
    }

    async log(data: any, level: LogLevels = "INFO") {
        for (let onePromise of this.loggerList.map((v)=>v.log(data, level))) {
            await onePromise
        }
    }

    async logMessage(req: WXRequest, resWx: WXMessage, handler: WXHandler) {
        for (let onePromise of this.loggerList.map((v)=>v.logMessage(req, resWx, handler))) {
            await onePromise
        }
    }
}