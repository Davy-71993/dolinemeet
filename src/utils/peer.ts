import { Router, RouterOptions } from "mediasoup/node/lib/types";
import { Worker } from "mediasoup/node/lib/Worker";


export const createRoom = async(worker: Worker) => {
    
    const options: RouterOptions = {
        mediaCodecs: [
            {
                kind: 'audio',
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2
            },
            {
                kind: 'video',
                mimeType: 'video/VP8',
                clockRate: 90000,
                parameters: {
                    'x-google-start-bitrate': 1000
                }
            }
        ]

    }
    const room = await worker.createRouter(options)

    return room
}

export const createWebRtcTransport = async(router: Router) => {
    try {
        const webRtcTransportOptions = {
            listenIps: [
                {
                    ip: '0.0.0.0',
                    announcedIp: '127.0.0.1'
                }
            ],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true
        }

        let transport = await router.createWebRtcTransport(webRtcTransportOptions)

        transport.on('dtlsstatechange', dtlsState => {
            if(dtlsState === 'closed'){
                transport.close()
            }
        })
        
        transport.on('@close', ()=>{
            console.log('transport closed!')
        })

        return {transport}
    } catch (error) {
        return {error}
    }
}