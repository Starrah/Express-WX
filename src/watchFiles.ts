import * as Fs from "fs";
import {promisify} from "util";
import * as Path from "path";
import {RequestHandler} from "express";
import {WXRouter} from "./WXRouter";

export function NocacheRequire(path) {
    path = Path.resolve(path)
    delete require.cache[path]
    return require(path)
}

let watchers: Record<string, Fs.FSWatcher> = {}

// Code copied from express-router-dynamic (https://github.com/RikaSugisawa/express-router-dynamic)
type FsWatchCallback = (event: 'rename' | 'change', filename: string,
                        type: "fileAdd" | "fileRemove" | "dirAdd" | "dirRemove" | "fileChange") => any

export async function watchRecursively(path: string, extraCallback?: FsWatchCallback) {
    const callback = async (event, filename) => {
        filename = Path.resolve(filename)
        let stat
        try {
            stat = await promisify(Fs.stat)(filename)
        } catch (e) {
        }

        if (event == "rename" && !stat) {
            let type: "dirRemove" | "fileRemove" = watchers[filename] ? "dirRemove" : "fileRemove"
            if (watchers[filename]) watchers[filename].close()
            delete watchers[filename]
            extraCallback(event, filename, type)
        } else if (event == "rename" && stat) {
            if (stat.isDirectory()) {
                watch(filename)
                extraCallback(event, filename, "dirAdd")
            } else extraCallback(event, filename, "fileAdd")
        } else {
            extraCallback(event, filename, "fileChange")
        }
    }

    function watch(dirname: string = path) {
        (async () => {
            if (watchers[dirname]) watchers[dirname].close()
            watchers[dirname] = Fs.watch(dirname,
                (event, filename) =>
                    callback(event as any, Path.join(dirname, filename))
            )
                .addListener('error', (err: any) => {
                        console.warn(err.message, dirname)
                    }
                )
            for await(let dir of await promisify(Fs.opendir)(dirname)) {
                if (dir.isDirectory())
                    watch(Path.join(dirname, dir.name))
            }
        })().catch(reason => {
            console.warn(reason.message)
        })
    }

    watch()

}

/**
 * 加载动态路由。path可以是目录也可以是文件名，目录的话就会递归加载，文件名就是只加载一个、返回只有一个元素的对象。
 */
export async function loadRouter(path): Promise<{[k: string]: RequestHandler}> {
    path = Path.resolve(path)
    let stat
    try {
        stat = await promisify(Fs.stat)(path)
        if (stat.isDirectory()) {
            let result = {}
            let files = await promisify(Fs.readdir)(path)
            for (let file of files) {
                file = Path.join(path, file)
                Object.assign(result, await loadRouter(file))
            }
            return result
        } else {
            if (Path.extname(path) !== ".js") return {}
            else {
                let module = NocacheRequire(path)
                module = module.default || module
                if (typeof module !== "function") return {}

                // 尝试从文件名中获得优先级数值
                // 文件名中的优先级数值高于文件内priority属性定义的优先级数值，
                // 因此用正则判断文件名上是否有优先级数值的定义，如果有必定覆盖priority属性。
                let splited = Path.basename(path, ".js").split("_")
                let lastPartStr = splited[splited.length - 1]
                let lastPartNumber = lastPartStr.match(/^-?\d+(.\d+)?$/) ? Number(lastPartStr) : null
                if (lastPartNumber) module.priority = lastPartNumber

                // 如果导入的对象上不存在nameForLog属性，则添加上文件名作为默认值，以备可能的日志记录中使用
                module.nameForLog = module.nameForLog || Path.basename(path, ".js")

                let obj = {}
                obj[path] = module
                return obj
            }
        }
    } catch (e) {
        return {}
    }

}

export function generateOnChangeCb(wxRouter: WXRouter): FsWatchCallback {
    return async function (event, filename, type) {
        if (type === "dirAdd" || type === "fileAdd" || type === "fileChange") {
            let newRouters = await loadRouter(filename)
            wxRouter._handlerMap = Object.assign(wxRouter._handlerMap, newRouters)
        }
        else if (type === "fileRemove") {
            let old = wxRouter._handlerMap
            delete old[filename]
            wxRouter._handlerMap = old
        }else if(type === "dirRemove") {
            let old = wxRouter._handlerMap
            for (let key in old) {
                if (Path.relative(filename, key).indexOf("..") !== 0) {
                    //key相对于filename的相对路径的开头不是..，即key是filename目录的子文件。
                    delete old[key]
                }
            }
            wxRouter._handlerMap = old
        }
    }
}