import {xmlGetKey, xmlSetText} from "./utils";
import * as request from "request-promise"
import {pascal} from "naming-style"

export declare type WXMessageType = "text" | "event" | "image" | "voice" | "video" | "shortvideo" | "location" | "link"
    | "music" | "news" | "noresponse" | "mpnews" | "msgmenu" | "wxcard" | "miniprogrampage"

export declare type WXMessage = TextWXMessage | EventWXMessage | ImageWXMessage | VoiceWXMessage | VideoWXMessage
    | ShortVideoWXMessage | LocationWXMessage | LinkWXMessage | MusicWXMessage | NewsWXMessage | NoResponseWXMessage
    | MPNewsWXMessage | MsgMenuWXMessage | WXCardWXMessage | MiniProgramPageWXMessage

let _registeredWXTypes = {}

/** @decorator */
export function WXMessageReceiveClass(typeName: string, cannotToXML: boolean = false): ClassDecorator {
    return (target): void => {
        if (target.hasOwnProperty("fromXML")) {
            _registeredWXTypes[typeName] = target
        } else {
            target["fromXML"] = function () {
                throw Error("微信API未定义此种消息类型为可能接收到的消息类型！您很可能是收到了一个不是一个来自微信官方的请求。")
            }
        }
        if (!target.prototype.hasOwnProperty("toJson")) target.prototype.toJson = function () {
            throw Error("微信API未提供向用户发送此类型的消息的方法！")
        }
        if (cannotToXML) target.prototype.toXML = function () {
            throw Error("该类型的消息不能被回复给用户，只能通过客服消息发送！")
        }
    };
}

let _wxJsonToXmlKeyAdapter = {
    musicurl: "MusicUrl",
    hqmusicurl: "HQMusicUrl",
    picurl: "PicUrl"
}

function addJSONtoXML(xml, json) {
    for (let k in json) {
        if (k === "touser" || k === "msgtype") continue
        let v = json[k]
        let type = typeof v
        let parsedKey = _wxJsonToXmlKeyAdapter[k] || pascal(k)
        if (type === "string" || type === "boolean" || type === "number") xmlSetText(xml, parsedKey, v, true)
        else if (type === "object") {
            if (v instanceof Array) {
                xml[parsedKey] = {item: v.map((o) => addJSONtoXML({}, o))}
            } else xml[parsedKey] = addJSONtoXML({}, v)
        }
    }
    return xml
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

    addBasicPartToXML(xml) {
        this.type = xmlGetKey(xml, "MsgType")
        this.openId = xmlGetKey(xml, "FromUserName")
        this.CreateTime = new Date(Number(xmlGetKey(xml, "CreateTime")) * 1000)
        this.MsgId = xmlGetKey(xml, "MsgId")
        return this
    }

    static fromXML(xml): WXMessageBasicPart {
        return new WXMessageBasicPart(null).addBasicPartToXML(xml)
    }

    toJson(): any {
        return {
            touser: this.openId,
            msgtype: this.type
        }
    }

    toXML(): any {
        // 在消息转xml阶段，是不加入FromUserName信息的，由内置中间件在之后根据req中提供的信息加入进来。
        // 而如果openId已经指定，则会自动填入ToUserName；否则会留空ToUserName，之后由WXRouter上的逻辑手动填入。
        let xml = {}
        xmlSetText(xml, "MsgType", this.type, true)
        xmlSetText(xml, "CreateTime", String(Math.round(this.CreateTime.getTime() / 1000)))
        xmlSetText(xml, "ToUserName", this.openId, true)
        addJSONtoXML(xml, this.toJson())
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
    /** 仅在该消息是服务消息发送的可点击菜单的点击事件产生的消息时才会有此字段，是按钮的id。详见微信官方文档。 */
    bizmsgmenuid?: string

    constructor(text: string) {
        super("text");
        this.text = text
    }

    static fromXML(xml): TextWXMessage {
        let ins = new TextWXMessage(xmlGetKey(xml, "Content")).addBasicPartToXML(xml)
        ins.bizmsgmenuid = xmlGetKey(xml, "bizmsgmenuid")
        return ins
    }

    toJson() {
        let s = super.toJson()
        s.text = {content: this.text}
        return s
    }

    toXML() {
        let xml = super.toXML()
        xml.Content = xml.Text.Content
        delete xml.Text
        return xml
    }

    toLog(): any {
        if (!this.bizmsgmenuid) return this.text
        else return super.toLog()
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
    event: "subscribe" | "ubsubscribe" | "SCAN" | "LOCATION" | "CLICK" | "VIEW" | "TEMPLATESENDJOBFINISH"

    /** 事件消息的EventKey字段。（扫描带参二维码、自定义菜单事件携带。）详请阅读微信官方文档。 */
    EventKey?: string
    /** 事件消息的EventTicket字段。（扫描带参二维码携带。）详请阅读微信官方文档。 */
    Ticket?: string

    /** 上报地理位置事件的与地理位置有关的字段。详请阅读微信官方文档。 */
    positionInfo?: PositionOfEventWXMessage

    /** 发送模版消息结果。详请阅读微信官方文档。*/
    Status: string

    constructor() {
        super("event");
    }

    static fromXML(xml): EventWXMessage {
        let ins = new EventWXMessage().addBasicPartToXML(xml)
        ins.event = xmlGetKey(xml, "Event")
        ins.EventKey = xmlGetKey(xml, "EventKey")
        if (ins.event === "subscribe" || ins.event === "SCAN") ins.Ticket = xmlGetKey(xml, "Ticket")
        if (ins.event === "LOCATION") ins.positionInfo = {
            Latitude: xmlGetKey(xml, "Latitude"),
            Longitude: xmlGetKey(xml, "Longitude"),
            Precision: xmlGetKey(xml, "Precision")
        }
        if (ins.event === "TEMPLATESENDJOBFINISH") ins.Status = xmlGetKey(xml, "Status")
        return ins
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
        let ins = new ImageWXMessage(xmlGetKey(xml, "MediaId")).addBasicPartToXML(xml)
        ins.PicUrl = xmlGetKey(xml, "PicUrl")
        return ins
    }

    toJson() {
        let s = super.toJson()
        s.image = {"media_id": this.MediaId}
        return s
    }

    async requestBytes(): Promise<Buffer> {
        if (!this.PicUrl) return null
        return request(this.PicUrl, {
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
        let ins = new VoiceWXMessage(xmlGetKey(xml, "MediaId")).addBasicPartToXML(xml)
        ins.Format = xmlGetKey(xml, "Format")
        ins.Recognition = xmlGetKey(xml, "Recognition")
        return ins
    }

    toJson() {
        let s = super.toJson()
        s.voice = {media_id: this.MediaId}
        return s
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
        let ins = new VideoWXMessage(xmlGetKey(xml, "MediaId")).addBasicPartToXML(xml)
        ins.ThumbMediaId = xmlGetKey(xml, "ThumbMediaId")
        return ins
    }

    toJson() {
        let s = super.toJson()
        s.video = {
            media_id: this.MediaId,
            thumb_media_id: this.ThumbMediaId,
            title: this.title,
            description: this.description
        }
        return s
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
        let ins = new ShortVideoWXMessage().addBasicPartToXML(xml)
        ins.MediaId = xmlGetKey(xml, "MediaId")
        ins.ThumbMediaId = xmlGetKey(xml, "ThumbMediaId")
        return ins
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
        let ins = new LocationWXMessage().addBasicPartToXML(xml)
        ins.x = xmlGetKey(xml, "Location_X")
        ins.y = xmlGetKey(xml, "Location_Y")
        ins.scale = xmlGetKey(xml, "Scale")
        ins.label = xmlGetKey(xml, "Label")
        return ins
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
        let ins = new LinkWXMessage().addBasicPartToXML(xml)
        ins.url = xmlGetKey(xml, "Url")
        ins.title = xmlGetKey(xml, "Title")
        ins.description = xmlGetKey(xml, "Description")
        return ins
    }
}

/** 此消息类型只会作为回复类型，不会出现在收到的消息中。 */
@WXMessageReceiveClass("music")
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

    toJson() {
        let s = super.toJson()
        s.music = {
            title: this.title,
            description: this.description,
            musicurl: this.MusicURL,
            hqmusicurl: this.HQMusicURL,
            thumb_media_id: this.ThumbMediaId
        }
        return s
    }
}

export interface NewsWXMessageItem {
    /** 图文的Url。详请阅读微信官方文档。 */
    url: string
    /** 图文的PicUrl。详请阅读微信官方文档。 */
    picurl: string
    /** 图文的Title。详请阅读微信官方文档。 */
    title: string
    /** 图文的Description。详请阅读微信官方文档。 */
    description: string
}

/** 图文消息类型。此消息类型只会作为回复类型，不会出现在收到的消息中。 */
@WXMessageReceiveClass("news")
export class NewsWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "news"
    articles: Array<NewsWXMessageItem>

    constructor(articles: Array<NewsWXMessageItem>) {
        super("news");
        this.articles = articles
    }

    toJson() {
        let s = super.toJson()
        s.news = {
            articles: this.articles
        }
        return s
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

/** 图文消息类型。此消息类型只会作为**客服消息**的回复类型，不会出现在收到的消息中、也不能通过被动回复返回给用户。 */
@WXMessageReceiveClass("mpnews", true)
export class MPNewsWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "mpnews"
    /** 微信图文消息的MediaId。详请阅读微信官方文档。 */
    MediaId: string

    constructor(MediaId: string) {
        super("mpnews");
        this.MediaId = MediaId
    }

    toJson() {
        let s = super.toJson()
        s.mpnews = {media_id: this.MediaId}
        return s
    }
}

/** 图文消息类型。此消息类型只会作为**客服消息**的回复类型，不会出现在收到的消息中、也不能通过被动回复返回给用户。 */
@WXMessageReceiveClass("msgmenu", true)
export class MsgMenuWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "msgmenu"
    /** 菜单消息的标题 */
    head_content: string
    /** 可点击的按钮的定义。数组中的每个元素表示一个按钮，content是按钮的文字，
     *  而id是按钮的id、会在TextWXMessage的bizmsgmenuid字段返回。 详见微信官方文档。*/
    list: Array<{ id: string, content: string }>
    /** 菜单消息的尾部文字 */
    tail_content: string

    constructor(head_content: string, list: Array<{ id: string, content: string }>, tail_content?: string) {
        super("msgmenu");
        this.head_content = head_content
        this.list = list
        this.tail_content = tail_content
    }

    toJson() {
        let s = super.toJson()
        s.msgmenu = {
            head_content: this.head_content,
            list: this.list,
            tail_content: this.tail_content
        }
        return s
    }
}

/** 图文消息类型。此消息类型只会作为**客服消息**的回复类型，不会出现在收到的消息中、也不能通过被动回复返回给用户。 */
@WXMessageReceiveClass("wxcard", true)
export class WXCardWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "wxcard"
    /** 微信图文消息的MediaId。详请阅读微信官方文档。 */
    card_id: string

    constructor(card_id: string) {
        super("wxcard");
        this.card_id = card_id
    }

    toJson() {
        let s = super.toJson()
        s.wxcard = {card_id: this.card_id}
        return s
    }
}

/** 图文消息类型。此消息类型只会作为**客服消息**的回复类型，不会出现在收到的消息中、也不能通过被动回复返回给用户。 */
@WXMessageReceiveClass("miniprogrampage", true)
export class MiniProgramPageWXMessage extends WXMessageBasicPart {
    type: WXMessageType = "mpnews"
    /** 详见微信官方文档 */
    title: string
    /** 详见微信官方文档 */
    appid: string
    /** 详见微信官方文档 */
    pagepath: string
    /** 详见微信官方文档 */
    thumb_media_id: string

    constructor(titie: string, appid: string, pagepath: string, thumb_media_id: string) {
        super("mpnews");
        this.title = titie
        this.appid = appid
        this.pagepath = pagepath
        this.thumb_media_id = thumb_media_id
    }

    toJson() {
        let s = super.toJson()
        s.miniprogrampage = {
            title: this.title,
            appid: this.appid,
            pagepath: this.pagepath,
            thumb_media_id: this.thumb_media_id
        }
        return s
    }
}

export function parseMessageXml(xml): WXMessage {
    let type = xmlGetKey(xml, "MsgType")
    let cls = _registeredWXTypes[type]
    if (!cls) throw Error("收到了不支持的消息类型！")
    return cls.fromXML(xml)
}

