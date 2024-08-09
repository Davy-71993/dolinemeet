import { Server, Socket } from "socket.io"
import { createWorker } from 'mediasoup'
import { Peer, PeerProducer, Room } from "./types"
import { createRoom, createWebRtcTransport } from "../utils/peer"
import { deletePeer, exitRoom, peer, room } from "./utils"

export default async function init(socket: Server){

    // Connect to web-socket server
    const io = socket.of('/sfu')
    
    // Create a worker
    const worker = await createWorker({
        rtcMaxPort: 2020,
        rtcMinPort: 2000,
        logLevel: "debug",
        logTags: ['info', 'simulcast']
    })

    // Just incase the worker dies
    worker.on('died', ()=>{
        console.log("Worker died, ", worker.pid)
        setTimeout(() => {
            process.exit(1)
        }, 1000);
    })
    console.log("Worker created successifully, PID: ", worker.pid)

    // Initialize the server properties
    let rooms: Room[] = []
    let peers: Peer[] = []

    // Keep track of the sfu
    const printSfu = () => {
        console.log({
            rooms: rooms.map((room) =>({
                name: room.name,
                producerTransports: room.producerTransports?.length,
                producers: room.producers?.length,
                consumerTransports: room.consumerTransports?.length,
                consumers: room.consumers?.length
            })),
            peers: peers.length
        })
    }

    // Listen for connections and disconnections.
    io.on('connection', (socket: Socket)=>{
        console.log("New peer connected, ID: ", socket.id)
        /**
         * Handle the disconnection of a peer base on the socket id
         */
        socket.on('disconnect', ()=> {
            console.log('peer disconnected')
            // do some cleanup
            // 1. Find the peer
            const peer = peers.find((peer) => peer.id === socket.id)
            if(!peer){
                return
            }

            // 2. Get the room this peer belongs to
            const room = rooms.find(room => room.id === peer.roomID)
            if(!room){
                return
            }
            
            // 3. Handle the deletion of the peer from the room
            exitRoom(peer, room)

            // 4. Delete the peer from the list.
            peers = deletePeer(peer, peers)

            // Check the number of rooms and peers active
            printSfu()
        })

        /**
         * Ths is when a peer deliberately chooses to leave the room.
         */
        socket.on('exitRoom', ()=>{
            console.log(("Exiting room"))
            // do some cleanup
            // 1. Find the peer
            const peer = peers.find((peer) => peer.id === socket.id)
            if(!peer){
                return
            }

            // 2. Get the room this peer belongs to
            const room = rooms.find(room => room.id === peer.roomID)
            if(!room){
                return
            }

            // 3. Exit the room
            exitRoom(peer, room)

            // Check the number of rooms and peers active
            printSfu()
        })
    
        /**
         * Handle room creation and joining.
         * @Todo Impliment authetication to ensure that a user can only join a room with permission.
         * @Note Public rooms eg broadcasts can be freely accissible by any user.
         * @Todo Implement a possibility for shared room names but distinguished by thier ids
         */
        socket.on('createOrJoinRoom', async({ roomName }: { roomName: string }, callback: (roomID: string)=>void)=>{
            console.log("Create or join room ", roomName)

            // Try to find the room from the list
            const room = rooms.find((room)=> room.name === roomName)

            // If the room already exists, just send back its id
            if(room){
                console.log("Room already exists")
                callback(room.id)
                return
            }

            // Otherwise, create a new room and send back its id
            console.log("Creating new room")

            // Create Mediasoup router
            const router = await createRoom(worker)

            // Create a room for this router
            const newRoom: Room = {
                id: router.id,
                name: roomName,
                router,
                producerTransports: [],
                producers: [],
                consumerTransports: [],
                consumers: []
            }
            // Send back the room id
            callback(newRoom.id)

            // Append the room to the rooms list
            rooms.push(newRoom)

            // Check the number of rooms and peers active
            printSfu()
        })

        socket.on('getRTPCapabilities', ({ roomID }, callback)=>{
            // Find the room from the list of rooms
            const room = rooms.find((room) => room.id === roomID )
            
            // If there is no room with the prived id,
            if(!room){
                console.log("There is no room with the specified id")
                callback({
                    error: "There is no room with the specified id"
                })
                return
            }

            // Otherwise send back the room RTPCapabilities
            callback(room.router.rtpCapabilities)
        })

        /**
         * Handle the creation of the producer transport on the rserver side.
         * @todo Later find a way to check whether we already have a producer transport the user and just send
         *       back the necessary params instead of hving to create multiple transports for the same user. 
         */
        socket.on('createSendRtcTransport', async({roomID}, callback)=>{
            // Get the target room from the list of rooms
            const room = rooms.find((room) => room.id === roomID)

            // If the room does not exist then terminate the process and send back the error message
            if(!room){
                console.log("The room is undefined.")
                callback({
                    error: "The spacified room does not exist on the server"
                })
                return
            }

            // Try to create webrtc transport to produce media in the room
            const { transport, error } = await createWebRtcTransport(room.router)
            
            // If an error occurs during the creation of the router
            // Send back the error message and terminate the process.
            if(!transport){
                callback({
                    error: "The router could not create the webRTC transport."
                })
                return
            }

            // Create a new peer and append it to the peers list
            const peer: Peer = {
                id: socket.id,
                roomID
            }
            peers.push(peer)

            // Create a producer transport and append it to the room.
            const producerTransport = {
                id: transport.id,
                peerID: peer.id,
                transport: transport
            }
            room.producerTransports?.push(producerTransport)

            // Check the number of rooms and peers active
            printSfu()

            // Send back the required data to client to create a client side producer transport.
            callback({
                params: {
                    id: transport.id,
                    iceParameters: transport.iceParameters,
                    iceCandidates: transport.iceCandidates,
                    dtlsParameters: transport.dtlsParameters
                },
                peerID: peer.id
            })
        })

        /**
         * Connect the client sent transport to the server send transport for the specified peer 
         */
        socket.on('connectSendTransport', async({ dtlsParameters, peerID }) => {
            console.log("Connecting transport")
            // Get the specified peer
            const currentPeer = peer(peerID, peers)
            // Get the target room
            const currentRoom = room(currentPeer, rooms)
            // Find the required send transport (For the specified peer) 
            const producerTransport = currentRoom?.producerTransports?.find(prdT => prdT.peerID === currentPeer?.id )
            // Then connect the two transports.
            await producerTransport?.transport.connect({ dtlsParameters })
        })

        /**
         * Produce media to the room
         * We expect the roomID and  the peerID from the client, but just in case 
         * we don't recieve them, then we use the socket id which is also equal to the peerID to identify 
         * the specified peer tranport that should produce media.
         */
        socket.on('produceMedia',  async({ kind, rtpParameters, peerID, roomID }, callback)=>{
    
            // Get the peer or send back an error
            const currentPeer = peer(socket.id, peers)
            if(!currentPeer){
                console.log(`No peer was found with this id, peerID: ${socket.id}`)
                callback({
                    error: `No peer was found with this id, peerID: ${socket.id}`
                })
                return
            }
            // Get the room or send back an error
            const currentRoom = room(currentPeer, rooms)
            if(!currentRoom){
                console.log(`No room was found for the peer, peerID: ${currentPeer.id}`)
                callback({
                    error: `No room was found for the peer, peerID: ${currentPeer.id}`
                })
                return
            }
            // Get the target producer transport 
            const producerTransport = currentRoom?.producerTransports?.find(prdT => prdT.peerID === currentPeer?.id )

            // If the producer transport is missing,
            // Break and send the error message to client
            if(!producerTransport){
                console.log(`The producer transport for peer ${currentPeer?.id} could not be found in ${currentRoom?.name}`)
                callback({
                    error: `The producer transport for peer ${currentPeer?.id} could not be found in ${currentRoom?.name}`
                })
                return
            }

            // Otherwise produce the media.
            // This creates a producer on the router (Room)
            const producer = await producerTransport.transport.produce({
                kind, rtpParameters
            })

            // For any reason, if the producer is not successifull created,
            // break and send the error to the client
            if(!producer){
                console.log("The producer transport could not produce media")
                callback({
                    error: `The producer transport for peer ${currentPeer?.id} in ${currentRoom?.name} could not produce media.`
                })
                return
            }

            // Otherwise listen for the close event on the producer transport responsible for this producer
            producer.on('transportclose', () => {
                console.log('Transport for this producer has closed')
                // Once the responsible transport closes, remove the producer from the room and close it (producer)
                currentRoom.producers = currentRoom.producers?.filter(pr => pr.id !== producer.id)
                producer.close()
            })

            /**
             * Create a new producer for the peer and append it to the room producers.
             * @todo Device a mechanism to ensure that a user has only on active prodcuer ie no duplicate producers for the same producer transport.
             */
            const newRoomProducer: PeerProducer = {
                id: producer.id,
                producer,
                peerID: currentPeer.id,
                transportID: producerTransport.id

            }

            currentRoom.producers?.push(newRoomProducer)
            // currentRoom.producers = [...(new Set(currentRoom.producers))]

            callback({
                producerID: producer?.id,
                transportID: producerTransport.id
            })
        })
    })

}