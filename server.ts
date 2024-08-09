
import express from 'express'
import { createServer } from "http"
import { Server } from 'socket.io'
import init from './src/lib'

// Create the express app
const app = express()


// Create https server
const httpsServer = createServer(app)

// Initialize the socket io server
const socket = new Server(httpsServer, {
    cors: {
        origin: "*"
    }
})

// Listen on port 8000
httpsServer.listen(8000, ()=>{
    console.log('Listening on port 8000')
})

init(socket)