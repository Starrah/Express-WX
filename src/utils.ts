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
    return xml[key]._cdata || xml[key]._text || xml[key]
}

export function xmlSetText(xml, key: string, value: string, cdata = false) {
    if (value === null || value === undefined) return
    else if (cdata) xml[key] = {_cdata: value}
    else xml[key] = {_text: value}
    return xml
}