import {WXRequest} from "./WXRequest";
import {WXResponse} from "./WXResponse";
import {RequestHandler} from "express";

export interface WithPriority{
    priority?: number
    nameForLog?: any
}

/**
 * 提供一个接口和一个简单的构造函数，以便您方便的构建WXHandler获得ts类型检查。
 */
export interface WXHandler extends RequestHandler, WithPriority{
    (req: WXRequest, res: WXResponse, next)
}

/**
 * 提供一个接口和一个简单的构造函数，以便您方便的构建WXHandler获得ts类型检查。
 *
 * 该函数返回的就是传入的fn本身。之所以设计本函数是因为用本函数封装一下您的处理逻辑函数，有利于语义更清晰，
 * 并且可以在您不需要显式声明req为WXRequest、resWXResponse为的情况下就可以获得完整的类型提示。
 */
export function WXHandler(fn: (req: WXRequest, res: WXResponse, next) => void, priority?: number): WXHandler {
    if (priority !== undefined) {
        // @ts-ignore
        fn.priority = priority
    }
    return fn
}