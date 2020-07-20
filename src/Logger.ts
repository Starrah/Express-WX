import {WXMessage} from "./WXMessage";
import * as Fs from "fs"
import * as Path from "path"
import * as Chalk from "chalk";
import {promisify} from "util";
import {WXHandler} from "./WXHandler";
import {ReqWithUser} from "./UserProvider";
import {WithNameForLog} from "./WXRouter";
import * as Util from "util"

export type LogLevels = "ERROR" | "WARNING" | "INFO" | "MESSAGE" | "DEBUG"

export interface Logger {
    log(data: any): Promise<void>
    log(data: any, level: LogLevels): Promise<void>

    logMessage(reqWx: WXMessage, resWx: WXMessage, handler: WXHandler): Promise<void>
}

interface _MessageLogObj {
    openId: string
    user?: any
    req: any
    res: any
    handler?: string
}

type MessageLogObj = {[k in any]: any} & _MessageLogObj

function MessageLogObj(reqWx: WXMessage, resWx: WXMessage, handler: WXHandler): MessageLogObj {
    let obj: MessageLogObj = {
        openId: reqWx.openId,
        req: reqWx.toLog(),
        res: resWx.toLog(),
        handler: handler && handler.nameForLog
    }
    let user = (reqWx as ReqWithUser<any>).user
    if (user) {
        obj.user = (user as WithNameForLog).nameForLog || user
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
export class FileOrConsoleLogger implements Logger{
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
        }
        else {
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
            }
            else {
                console.log(this._prefix(level) + data)
            }
        }
        else {
            await promisify(Fs.appendFile)(this.fd, this._prefix(level) + data + "\r\n")
        }
    }

    async logMessage(reqWx: WXMessage, resWx: WXMessage, handler: WXHandler) {
        let logObj = MessageLogObj(reqWx, resWx, handler)
        let userStr = logObj.user && ((logObj.user as WithNameForLog).nameForLog || Util.format(logObj.user))
        userStr = userStr? `(${userStr})`: ""
        let logStr = `${Chalk.underline(logObj.openId + userStr)}: ${Util.inspect(logObj.req)} --> ${Util.inspect(logObj.res)}`
        await this.log(logStr, "MESSAGE")
    }
}