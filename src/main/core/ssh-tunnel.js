import { Client } from 'ssh2'
import { readFileSync } from 'fs'
import net from 'net'

/**
 * Opens an SSH tunnel to forward a remote DB port to a local port.
 * Supports all SSH auth methods: key, key+passphrase, password, agent, keyboard-interactive.
 *
 * @param {object} config - SSH + forwarding config
 * @returns {Promise<{client: Client, localPort: number}>}
 */
export function openTunnel(config) {
  return new Promise((resolve, reject) => {
    const {
      sshHost,
      sshPort = 22,
      sshUsername,
      authMethod, // 'key' | 'key-passphrase' | 'password' | 'agent' | 'keyboard-interactive'
      keyPath,
      passphrase,
      password,
      remoteDbHost = 'localhost',
      remoteDbPort
    } = config

    const client = new Client()

    // Build auth config based on method
    const authConfig = buildAuthConfig(authMethod, { keyPath, passphrase, password })

    client.on('ready', () => {
      // Find a free local port then forward
      const server = net.createServer()
      server.listen(0, '127.0.0.1', () => {
        const localPort = server.address().port
        server.close(() => {
          resolve({ client, localPort })
        })
      })
    })

    client.on('error', (err) => {
      reject(new Error(`SSH connection failed: ${err.message}`))
    })

    const connectConfig = {
      host: sshHost,
      port: sshPort,
      username: sshUsername,
      readyTimeout: 15000,
      ...authConfig
    }

    // For keyboard-interactive, register the handler
    if (authMethod === 'keyboard-interactive') {
      connectConfig.tryKeyboard = true
      client.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
        const responses = prompts.map((p) => (p.prompt.toLowerCase().includes('password') ? password : ''))
        finish(responses)
      })
    }

    client.connect(connectConfig)
  })
}

/**
 * Forwards a connection through SSH tunnel.
 */
export function forwardPort(client, remoteHost, remotePort, localPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      client.forwardOut('127.0.0.1', localPort, remoteHost, remotePort, (err, stream) => {
        if (err) {
          socket.destroy()
          return
        }
        socket.pipe(stream).pipe(socket)
      })
    })

    server.listen(localPort, '127.0.0.1', () => {
      resolve(server)
    })

    server.on('error', reject)
  })
}

/**
 * Opens a full tunnel: SSH connection + local port forwarding server.
 */
export async function createTunnel(config) {
  const { remoteDbHost = 'localhost', remoteDbPort } = config

  // Open SSH connection
  const { client, localPort } = await openTunnel(config)

  // Start port-forward server
  const server = await forwardPort(client, remoteDbHost, remoteDbPort, localPort)

  return {
    localPort,
    close: () => {
      server.close()
      client.end()
    }
  }
}

/**
 * Tests only the SSH connection (no port forwarding).
 */
export function testSshConnection(config) {
  return new Promise((resolve, reject) => {
    const {
      sshHost,
      sshPort = 22,
      sshUsername,
      authMethod,
      keyPath,
      passphrase,
      password
    } = config

    const client = new Client()
    const authConfig = buildAuthConfig(authMethod, { keyPath, passphrase, password })

    const timeout = setTimeout(() => {
      client.end()
      reject(new Error('Connection timed out (15s)'))
    }, 15000)

    client.on('ready', () => {
      clearTimeout(timeout)
      client.end()
      resolve({ success: true, message: 'SSH connection successful' })
    })

    client.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(err.message))
    })

    const connectConfig = {
      host: sshHost,
      port: sshPort,
      username: sshUsername,
      readyTimeout: 15000,
      ...authConfig
    }

    if (authMethod === 'keyboard-interactive') {
      connectConfig.tryKeyboard = true
      client.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
        const responses = prompts.map((p) => (p.prompt.toLowerCase().includes('password') ? password : ''))
        finish(responses)
      })
    }

    client.connect(connectConfig)
  })
}

function buildAuthConfig(authMethod, { keyPath, passphrase, password }) {
  switch (authMethod) {
    case 'key':
      return {
        privateKey: readFileSync(keyPath)
      }

    case 'key-passphrase':
      return {
        privateKey: readFileSync(keyPath),
        passphrase: passphrase
      }

    case 'password':
      return {
        password: password
      }

    case 'agent':
      return {
        agent: process.env.SSH_AUTH_SOCK
      }

    case 'keyboard-interactive':
      return {
        tryKeyboard: true
      }

    default:
      throw new Error(`Unknown auth method: ${authMethod}`)
  }
}
