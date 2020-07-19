import {WXMessage} from "./WXMessage";
import * as Fs from "fs"
import * as Url from "url"
import * as Path from "path"
import * as Chalk from "chalk";
import {promisify} from "util";
import {WXHandler} from "./WXHandler";
import {ReqWithUser} from "./UserProvider";
import {WithNameForLog} from "./WXRouter";

export type LogLevels = "ERROR" | "WARNING" | "INFO" | "MESSAGE" | "DEBUG"

export interface Logger {
    /** 当前Logger是否是有效的实例 **/
    valid: boolean

    log(data: any, level: LogLevels): Promise<void>

    logMessage(reqWx: WXMessage, resWx: WXMessage, handler: WXHandler): Promise<MessageLogObj>
}

interface _MessageLogObj {
    openId: string
    user?: any
    req: any
    res: any
    handler: string
}

type MessageLogObj = {[k in any]: any} & _MessageLogObj

export abstract class LoggerBase implements Logger {
    valid: boolean = false

    abstract async log(data: any, level: LogLevels)

    async logMessage(reqWx: WXMessage, resWx: WXMessage, handler: WXHandler): Promise<MessageLogObj> {
        let obj: MessageLogObj = {
            openId: reqWx.openId,
            req: reqWx.toLog(),
            res: resWx.toLog(),
            handler: handler.nameForLog
        }
        let user = (reqWx as ReqWithUser<any>).user
        if (user) {
            obj.user = (user as WithNameForLog).nameForLog || user
        }
        return obj
    }

}

class FileLogger extends LoggerBase{
    chalk: boolean = false
    toConsole: boolean = false
    path: string
    fd: number

    constructor(url: string) {
        super()
        let urlObj
        if (url.indexOf("console") === 0) {
            // 只要有console就使用console输出模式，不强求符合url格式
            this.toConsole = true
            this.chalk = true
            this.valid = true
            try {
                urlObj = new Url.URL(url)
            } catch (e) {
                urlObj = new Url.URL("console://")
            }
        }
        else {
            if (url.indexOf("://") === -1) {
                // 如果不含有任何URL的protocol的xxx://部分，则推定为只传入了纯路径path，则手动附加file://在前面使其成为url。
                url = "file://" + url
            }
            urlObj = new Url.URL(url)
            if (urlObj.protocol !== "file:") return
            this.path = urlObj.pathname
            Fs.mkdirSync(Path.dirname(this.path), {recursive: true})
            this.fd = Fs.openSync(this.path, "a")
            this.valid = true
        }

        let chalkParam = urlObj.searchParams.get("chalk")
        if (chalkParam === "true") this.chalk = true
        else if (chalkParam === "false") this.chalk = false
    }

    private static _prefix(level: LogLevels): string {
        let levelStr
        if (level === "ERROR") levelStr = Chalk.bgRed("ERROR") + "\t"
        else if (level === "WARNING") levelStr = Chalk.bgYellow("WARNING") + "\t"
        else if (level === "INFO") levelStr = Chalk.bgGreen("INFO") + "\t"
        else if (level === "MESSAGE") levelStr = Chalk.bgCyan("MESSAGE") + "\t"
        else if (level === "DEBUG") levelStr = Chalk.bgWhite("DEBUG") + "\t"
        return new Date().toLocaleString() + " " + levelStr
    }

    async log(data: any, level: LogLevels = "INFO") {
        if (this.toConsole) {
            if (level === "ERROR" || level === "WARNING") {
                console.error(_prefix(level) + data)
            }
            else {
                console.log(_prefix(level) + data)
            }
        }
        else {
            await promisify(Fs.appendFile)(this.fd, _prefix(level) + data)
        }
    }


}

let urlObj = new Url.URL("console://?chalk=true")
console.log(urlObj.protocol);
console.log(urlObj.pathname);
console.log(JSON.parse(urlObj.searchParams.get("chalk")));

function _prefix(level: LogLevels): string {
    let levelStr
    if (level === "ERROR") levelStr = Chalk.bgRed("ERROR") + "\t"
    else if (level === "WARNING") levelStr = Chalk.bgYellow("WARNING") + "\t"
    else if (level === "INFO") levelStr = Chalk.bgGreen("INFO") + "\t\t"
    else if (level === "MESSAGE") levelStr = Chalk.bgCyan("MESSAGE") + "\t"
    else if (level === "DEBUG") levelStr = Chalk.bgWhite("DEBUG") + "\t"
    return new Date().toLocaleString() + " " + levelStr
}

console.log(_prefix("ERROR") + "yyyyy");
console.log(_prefix("WARNING") + "yyyyy");
console.log(_prefix("INFO") + "yyyyy");
console.log(_prefix("MESSAGE") + "yyyyy");
console.log(_prefix("DEBUG") + "yyyyy");