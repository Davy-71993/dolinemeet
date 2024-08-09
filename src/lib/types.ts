import { Consumer, MediaKind, Producer, Router, WebRtcTransport } from "mediasoup/node/lib/types"

export type MediaCodec = {
    kind: MediaKind,
    mimeType: string,
    clockRate: number,
    parameters?: any,
    channels?: number
}

export type Room = {
    router: Router,
    id: string,
    name: string,
    producerTransports?: PeerTransport[],
    consumerTransports?: PeerTransport[],
    producers?: PeerProducer[]
    consumers?: PeerConsumer[]
}

export type PeerTransport = {
    transport: WebRtcTransport,
    id: string,
    peerID: string
}

export type PeerProducer = {
    producer: Producer,
    id: string,
    transportID: string,
    peerID: string
}

export type PeerConsumer = {
    consumer: Consumer,
    id: string,
    transportID: string,
    peerID: string
}

export type Peer = {
    id: string,
    roomID: string,
}