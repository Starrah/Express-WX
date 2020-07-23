export function findRootProto(a: any, baseProto: any): any {
    let type = typeof a
    if (type === "object") {
        let proto = a.__proto__
        if (!proto || proto === baseProto ||proto === Object.prototype) return a
    } else if (type === "function") {
        let proto = a.__proto__
        if (!proto || proto === baseProto || proto === Function.prototype) return a
    } else return null
    return findRootProto(a.__proto__, baseProto)
}

export function extendPrototype<T>(baseObj: any, objWithNewProto: T): T{
    let baseProto = baseObj.__proto__
    let newRootProto = findRootProto(objWithNewProto, baseProto)
    Object.assign(objWithNewProto, baseObj)
    newRootProto.__proto__ = baseProto
    // @ts-ignore
    objWithNewProto.__proto__ = newRootProto
    return objWithNewProto
}

export function replaceFunctionContent(baseObj: Function, newFunc: Function): Function {
    // @ts-ignore
    let oldProto = baseObj.__proto__
    Object.assign(newFunc, baseObj)
    // @ts-ignore
    newFunc.__proto__ = oldProto
    return newFunc
}

export function xmlGetKey(xml, key: string) {
    return xml[key] && (xml[key]._cdata || xml[key]._text || xml[key])
}

export function xmlSetText(xml, key: string, value: string, cdata = false) {
    if (value === null || value === undefined) return
    else if (cdata) xml[key] = {_cdata: value}
    else xml[key] = {_text: value}
    return xml
}

export function assertWXAPISuccess(resObj: any) {
    if (!resObj || resObj.errcode) throw resObj
}

/**
 * 把一个可能抛出异常的assert形式函数，转化为一个不会抛出异常、只会返回true或false的check形式函数
 * （当然返回值也可能是包装了true或false的PromiseLike，如果传入的fn本身是异步函数的话）。
 *
 * 新的函数返回true当且仅当传入的fn正常运行完成、没有抛出异常。
 * @param fn
 */
export function checkify(fn: Function) {
    return function (...args): boolean {
        try {
            let res = fn.call(this, ...args)
            if (!(res && res.then && res.catch)) { // 如果不是PromiseLike
                return true
            }
            else return res.then(()=>true).catch(()=>false)
        } catch (e) {
            return false
        }
    }
}