import {WXRequest} from "./WXRequest";
import {WXResponse} from "./WXResponse";
import {RequestHandler} from "express";

export interface UserProvider extends RequestHandler{
    (req: WXRequest, res: WXResponse, next)
}

export function UserProvider(fn: (req: WXRequest, res: WXResponse, next) => void): UserProvider {
    throw Error("当前版本暂未实现此功能！")
}