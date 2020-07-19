import {xmlGetKey, xmlSetText} from "./utils";
import * as request from "request-promise"

export declare type WXMessageType =
    "text"
    | "event"
    | "image"
    | "voice"
    | "video"
    | "shortvideo"
    | "location"
    | "link"
    | "music"
    | "news"
    | "noresponse"

export declare type WXMessage =
    TextWXMessage
    | EventWXMessage
    | ImageWXMessage
    | VoiceWXMessage
    | VideoWXMessage
    | ShortVideoWXMessage
    | LocationWXMessage
    | LinkWXMessage
    | MusicWXMessage
    | NewsWXMessage
    | NoResponseWXMessage

let _registeredWXTypes = {}

/** @decorator */
export function WXMessageReceiveClass(typeName: string): ClassDecorator {
    return (target): void => {
        _registeredWXTypes[typeName] = target
    };
}

export class WXMessageBasicPart {
    /** 消息类型 (MsgType) */
    type: WXMessageType
    /** 对端用户的openId。
     * 在此消息是收到的消息（即req.wx获得的对象）时，此字段必定存在并对应于微信XML中的FromUserName字段；
     * 在此消息是回复的消息时，可以不提供此字段（保持此字段为undefined），内置逻辑会根据收到的消息内容为您自动添加ToUserName字段。
     * 事实我们建议您最好不提供此字段，因为如果发出消息的openId和收到消息的openId不一致的话会发送失败，让系统自动添加更安全。 */
    openId: string
    /** 消息创建时间 (CreateTime)。在回复消息时您不必手工指定、会自动添加的。 */
    CreateTime: Date
    /** 消息唯一ID (MsgId)。在回复消息时您不必手工指定、会自动添加的。 */
    MsgId: string

    constructor(type: WXMessageType, openId?: string) {
        if (!type) return
        this.type = type
        this.openId = openId
        this.CreateTime = new Date()
    }

    static fromXML(xml): WXMessageBasicPart {
        let ins = new WXMessageBasicPart(null)
        ins.type = xmlGetKey(xml, "MsgType")
        ins.openId = xmlGetKey(xml, "FromUserName")
        ins.CreateTime = new Date(Number(xmlGetKey(xml, "CreateTime")) * 1000)
        ins.MsgId = xmlGetKey(xml, "MsgId")
        return ins
    }

    toXML(xml?) {
        // 在消息转xml阶段，是不加入ToUserName信息的，由内置中间件在之后根据req中提供的信息加入进来。
        // 而如果openId已经指定，则会自动填入FromUserName；否则会留空FromUserName，之后由WXRouter上的逻辑手动填入。
        xml = xml || {}
        xmlSetText(xml, "MsgType", this.type, true)
        xmlSetText(xml, "CreateTime", String(Math.round(this.CreateTime.getTime() / 1000)))
        xmlSetText(xml, "ToUserName", this.openId, true)
        return xml
    }

    toLog(): any {
        let o = Object.assign({}, this)
        delete o.openId
        delete o.CreateTime
        delete o.MsgId
        return o
    }
}

@WXMessageReceiveClass("text")
export class TextWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "text"
    /** 文本消息的内容字段 (Content) */
    text: string

    constructor(text: string) {
        super("text");
        this.text = text
    }

    static fromXML(xml): TextWXMessage {
        let base = WXMessageBasicPart.fromXML(xml)
        let ins = new TextWXMessage(xmlGetKey(xml, "Content"))
        Object.assign(ins, base)
        return ins
    }

    toXML(xml?) {
        xml = super.toXML()
        xmlSetText(xml, "Content", this.text, true)
        return xml
    }

    toLog(): any {
        return this.text
    }
}

export interface PositionOfEventWXMessage {
    Latitude: string
    Longitude: string
    Precision: string
}

@WXMessageReceiveClass("event")
export class EventWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "event"
    /** 事件消息的Event字段。详请阅读微信官方文档。 */
    event: "subscribe" | "ubsubscribe" | "SCAN" | "LOCATION" | "CLICK" | "VIEW"

    /** 事件消息的EventKey字段。（扫描带参二维码、自定义菜单事件携带。）详请阅读微信官方文档。 */
    EventKey?: string
    /** 事件消息的EventTicket字段。（扫描带参二维码携带。）详请阅读微信官方文档。 */
    Ticket?: string

    /** 上报地理位置事件的与地理位置有关的字段。详请阅读微信官方文档。 */
    positionInfo?: PositionOfEventWXMessage

    constructor() {
        super("event");
    }

    static fromXML(xml): EventWXMessage {
        let base = WXMessageBasicPart.fromXML(xml)
        let ins = new EventWXMessage()
        ins.event = xmlGetKey(xml, "Event")
        ins.EventKey = xmlGetKey(xml, "EventKey")
        if (ins.event === "subscribe" || ins.event === "SCAN") ins.Ticket = xmlGetKey(xml, "Ticket")
        if (ins.event === "LOCATION") ins.positionInfo = {
            Latitude: xmlGetKey(xml, "Latitude"),
            Longitude: xmlGetKey(xml, "Longitude"),
            Precision: xmlGetKey(xml, "Precision")
        }
        Object.assign(ins, base)
        return ins
    }

    toXML(xml?) {
        throw Error("微信API未提供回复此类型的消息的方法！")
    }
}

@WXMessageReceiveClass("image")
export class ImageWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "image"
    /** 图片消息的图片url (PicUrl)，可以请求此资源获取图片内容
     * （例如，通过调用requestBytes异步方法获取图片二进制Buffer）。
     * 仅在收到的消息中存在此字段，对于发出的消息不需要也不应指定。详请阅读微信官方文档。 */
    PicUrl: string
    /** 图片消息的MediaId。详请阅读微信官方文档。 */
    MediaId: string

    constructor(MediaId: string) {
        super("image");
        this.MediaId = MediaId
    }

    static fromXML(xml): ImageWXMessage {
        let base = WXMessageBasicPart.fromXML(xml)
        let ins = new ImageWXMessage(xmlGetKey(xml, "MediaId"))
        ins.PicUrl = xmlGetKey(xml, "PicUrl")
        Object.assign(ins, base)
        return ins
    }

    toXML(xml?) {
        xml = super.toXML()
        xml["Image"] = xmlSetText({}, "MediaId", this.MediaId, true)
        return xml
    }

    async requestBytes(): Promise<Buffer> {
        if (!this.PicUrl) return null
        return await request(this.PicUrl, {
            method: "GET",
            timeout: 3000,
            encoding: null,
            gzip: true
        });
    }
}

@WXMessageReceiveClass("voice")
export class VoiceWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "voice"
    /** 语音消息的MediaId。详请阅读微信官方文档。 */
    MediaId: string
    /** 语音消息的Format。详请阅读微信官方文档。 */
    Format: string
    /** 语音消息的Reconition。详请阅读微信官方文档。 */
    Recognition: string

    constructor(MediaId: string) {
        super("voice");
        this.MediaId = MediaId
    }

    static fromXML(xml): VoiceWXMessage {
        let base = WXMessageBasicPart.fromXML(xml)
        let ins = new VoiceWXMessage(xmlGetKey(xml, "MediaId"))
        ins.Format = xmlGetKey(xml, "Format")
        ins.Recognition = xmlGetKey(xml, "Recognition")
        Object.assign(ins, base)
        return ins
    }

    toXML(xml?) {
        xml = super.toXML()
        xml["Voice"] = xmlSetText({}, "MediaId", this.MediaId, true)
        return xml
    }

    async requestBytes(): Promise<Buffer> {
        throw Error("利用素材接口获取该Media的方法暂未实现！")
    }
}

@WXMessageReceiveClass("video")
export class VideoWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "video"
    /** 视频消息的MediaId。详请阅读微信官方文档。 */
    MediaId: string
    /** 视频消息缩略图的MediaId。详请阅读微信官方文档。 */
    ThumbMediaId: string

    /** 回复消息时，可选填入的视频标题。注意收到的消息类型无此字段！ */
    title?: string
    /** 回复消息时，可选填入的视频描述。注意收到的消息类型无此字段！ */
    description?: string

    constructor(MediaId: string, title?: string, description?: string) {
        super("video");
        this.MediaId = MediaId
        this.title = title
        this.description = description
    }

    static fromXML(xml): VideoWXMessage {
        let base = WXMessageBasicPart.fromXML(xml)
        let ins = new VideoWXMessage(xmlGetKey(xml, "MediaId"))
        ins.ThumbMediaId = xmlGetKey(xml, "ThumbMediaId")
        Object.assign(ins, base)
        return ins
    }

    toXML(xml?) {
        xml = super.toXML()
        let i = {}
        xmlSetText(i, "MediaId", this.MediaId, true)
        xmlSetText(i, "Title", this.title, true)
        xmlSetText(i, "Description", this.description, true)
        xml["Video"] = i
        return xml
    }

    async requestBytes(): Promise<Buffer> {
        throw Error("利用素材接口获取该Media的方法暂未实现！")
    }

    async requestThumbBytes(): Promise<Buffer> {
        throw Error("利用素材接口获取该Media的方法暂未实现！")
    }
}

@WXMessageReceiveClass("shortvideo")
export class ShortVideoWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "shortvideo"
    /** 视频消息的MediaId。详请阅读微信官方文档。 */
    MediaId: string
    /** 视频消息缩略图的MediaId。详请阅读微信官方文档。 */
    ThumbMediaId: string

    constructor() {
        super("shortvideo");
    }

    static fromXML(xml): ShortVideoWXMessage {
        let base = WXMessageBasicPart.fromXML(xml)
        let ins = new ShortVideoWXMessage()
        ins.MediaId = xmlGetKey(xml, "MediaId")
        ins.ThumbMediaId = xmlGetKey(xml, "ThumbMediaId")
        Object.assign(ins, base)
        return ins
    }

    toXML(xml?) {
        throw Error("微信API未提供回复此类型的消息的方法！")
    }

    async requestBytes(): Promise<Buffer> {
        throw Error("利用素材接口获取该Media的方法暂未实现！")
    }

    async requestThumbBytes(): Promise<Buffer> {
        throw Error("利用素材接口获取该Media的方法暂未实现！")
    }
}

@WXMessageReceiveClass("location")
export class LocationWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "location"
    /** 纬度 (Location_X)。详请阅读微信官方文档。注意：考虑到更精确的数值保存，提供的是string而非number类型！ */
    x: string
    /** 经度 (Location_Y)。详请阅读微信官方文档。注意：考虑到更精确的数值保存，提供的是string而非number类型！ */
    y: string
    /** 地图缩放大小 (Scale)。详请阅读微信官方文档。注意：考虑到更精确的数值保存，提供的是string而非number类型！ */
    scale: string
    /** 地理位置信息 (Label)。详请阅读微信官方文档。 */
    label: string

    constructor() {
        super("location");
    }

    static fromXML(xml): LocationWXMessage {
        let base = WXMessageBasicPart.fromXML(xml)
        let ins = new LocationWXMessage()
        ins.x = xmlGetKey(xml, "Location_X")
        ins.y = xmlGetKey(xml, "Location_Y")
        ins.scale = xmlGetKey(xml, "Scale")
        ins.label = xmlGetKey(xml, "Label")
        Object.assign(ins, base)
        return ins
    }

    toXML(xml?) {
        throw Error("微信API未提供回复此类型的消息的方法！")
    }
}

@WXMessageReceiveClass("link")
export class LinkWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "link"
    /** 消息的Url。详请阅读微信官方文档。 */
    url: string
    /** 消息的Title。详请阅读微信官方文档。 */
    title: string
    /** 消息的Description。详请阅读微信官方文档。 */
    description?: string

    constructor() {
        super("link");
    }

    static fromXML(xml): LinkWXMessage {
        let base = WXMessageBasicPart.fromXML(xml)
        let ins = new LinkWXMessage()
        ins.url = xmlGetKey(xml, "Url")
        ins.title = xmlGetKey(xml, "Title")
        ins.description = xmlGetKey(xml, "Description")
        Object.assign(ins, base)
        return ins
    }

    toXML(xml?) {
        throw Error("微信API未提供回复此类型的消息的方法！")
    }
}

/** 此消息类型只会作为回复类型，不会出现在收到的消息中。 */
export class MusicWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "music"
    /** 音乐的MusicURL。详请阅读微信官方文档。 */
    MusicURL?: string
    /** 音乐的HQMusicURL。详请阅读微信官方文档。 */
    HQMusicURL?: string
    /** 音乐的ThumbMediaId。详请阅读微信官方文档。 */
    ThumbMediaId: string
    /** 音乐的Title。详请阅读微信官方文档。 */
    title?: string
    /** 音乐的Description。详请阅读微信官方文档。 */
    description?: string

    constructor(ThumbMediaId, MusicURL?, HQMusicURL?, title?, description?) {
        super("music");
        this.ThumbMediaId = ThumbMediaId
        this.MusicURL = MusicURL
        this.HQMusicURL = HQMusicURL
        this.title = title
        this.description = description
    }

    toXML(xml?) {
        xml = super.toXML()
        let i = {}
        xmlSetText(i, "MusicURL", this.MusicURL, true)
        xmlSetText(i, "HQMusicURL", this.HQMusicURL, true)
        xmlSetText(i, "ThumbMediaId", this.ThumbMediaId, true)
        xmlSetText(i, "Title", this.title, true)
        xmlSetText(i, "Description", this.description, true)
        xml["Music"] = i
        return xml
    }
}

export interface NewsWXMessageItem {
    /** 图文的Url。详请阅读微信官方文档。 */
    url: string
    /** 图文的PicUrl。详请阅读微信官方文档。 */
    PicUrl: string
    /** 图文的Title。详请阅读微信官方文档。 */
    title: string
    /** 图文的Description。详请阅读微信官方文档。 */
    description: string
}

/** 图文消息类型。此消息类型只会作为回复类型，不会出现在收到的消息中。 */
export class NewsWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "news"
    articles: Array<NewsWXMessageItem>

    constructor(articles: Array<NewsWXMessageItem>) {
        super("news");
        this.articles = articles
    }

    toXML(xml?) {
        xml = super.toXML()
        let arr = this.articles.map(v => {
            let i = {}
            xmlSetText(i, "Url", v.url, true)
            xmlSetText(i, "PicUrl", v.PicUrl, true)
            xmlSetText(i, "Title", v.title, true)
            xmlSetText(i, "Description", v.description, true)
            return i
        })
        xml["Articles"] = {item: arr}
        return xml
    }
}

/** 表示希望对客户端不予回复任何消息（即接口返回"success"）。此消息类型只会作为回复类型，不会出现在收到的消息中。 */
export class NoResponseWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "noresponse"

    constructor() {
        super("noresponse");
    }

    toXML(xml?) {
        return null
    }

    toLog(): any {
        return null
    }
}

export function parseMessageXml(xml): WXMessage {
    let type = xmlGetKey(xml, "MsgType")
    let cls = _registeredWXTypes[type]
    if (!cls) throw Error("收到了不支持的消息类型！")
    return cls.fromXML(xml)
}


