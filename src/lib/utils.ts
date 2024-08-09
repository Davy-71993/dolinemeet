import { Peer, Room } from "./types"
/**
 * This removes a peer from the room and closed all the transports, 
 * producers and consummers associated with this peer. when a peer is either disconnected due to 
 * network or deliberately chooses to leave the room.
 * 
 * This does not delete the peer from the server nor does it disconnect the peer socket.
 * @param peer The peer to be removed from the room
 * @param room The room to be cleaned
 */
export const exitRoom = (peer: Peer, room: Room) => {
    // 1. Get the peer's producer transport and close it
    const peerTransport = room.producerTransports?.find(p => p.peerID === peer.id)
    peerTransport?.transport.close()

    // 2. Remove the closed transport form the room
    room.producerTransports = room.producerTransports?.filter(p => p.peerID !== peer.id)
}

/**
 * This deletes the peer from the server peers' list and also disconnects the peer socket.
 * And returns the cleaned peers' list.
 * @param peer The peer to be deleted and disconnected
 * @param peers The list of the peers currently active on the server.
 * @returns A list of peers active.
 */
export const deletePeer = (peer: Peer, peers: Peer[]) => {
    return peers.filter((p) => p.id !== peer.id)
}

/**
 * Get the current peer given the id
 */
export const peer = (id: string, peers: Peer[]) => peers.find(p => p.id === id)

/**
 * Get the room given the peer
 */
export const room = (peer?: Peer, rooms?: Room[]) => rooms?.find(r => r.id === peer?.roomID)


