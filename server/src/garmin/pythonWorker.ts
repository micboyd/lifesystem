/**
 * Runs server/garmin-service/worker.py for one operation: one JSON request on stdin,
 * one JSON reply on stdout. Requests carry tokens and, on connect, the password,
 * so they go over stdin (never argv, which other processes can read) and are
 * never logged. Python 3.12+ comes from GARMIN_PYTHON, else the service's venv.
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { GARMIN_ERROR_CODES, GarminError, type GarminErrorCode } from './provider'

const SERVICE_DIR = path.resolve(__dirname, '../../garmin-service')
const WORKER = path.join(SERVICE_DIR, 'worker.py')
/** Under Heroku's 30 s request cap, with room for the rest of the request. */
const TIMEOUT_MS = 25_000

/** Where heroku/python installs itself; its bin isn't always on the app's PATH. */
const HEROKU_PYTHON = path.join(process.env.HOME ?? '/app', '.heroku', 'python')

function python(): string {
    if (process.env.GARMIN_PYTHON) return process.env.GARMIN_PYTHON
    const venv = path.join(SERVICE_DIR, '.venv', 'bin', 'python')
    if (existsSync(venv)) return venv
    const heroku = path.join(HEROKU_PYTHON, 'bin', 'python3')
    return existsSync(heroku) ? heroku : 'python3'
}

/** Heroku's Python links a shared libpython, found via LD_LIBRARY_PATH. */
function libraryPath(): string {
    const lib = path.join(HEROKU_PYTHON, 'lib')
    const current = process.env.LD_LIBRARY_PATH ?? ''
    if (!existsSync(lib) || current.split(':').includes(lib)) return current
    return current ? `${lib}:${current}` : lib
}

export interface WorkerReply<T> {
    result: T
    /** Refreshed tokens, when the worker had any. */
    tokens?: string
}

export type WorkerRun = <T>(request: Record<string, unknown>) => Promise<WorkerReply<T>>

export const runWorker: WorkerRun = <T>(request: Record<string, unknown>) =>
    new Promise<WorkerReply<T>>((resolve, reject) => {
        const bin = python()
        const child = spawn(bin, ['-I', WORKER], {
            cwd: SERVICE_DIR,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                PATH: process.env.PATH ?? '',
                HOME: process.env.HOME ?? '',
                LD_LIBRARY_PATH: libraryPath(),
                LANG: process.env.LANG ?? 'C.UTF-8',
            },
        })
        let out = ''
        // Only kept for the log when the worker dies before replying (a missing
        // library or Python); the library's own logging is disabled in the worker.
        let err = ''
        const timer = setTimeout(() => {
            child.kill('SIGKILL')
            reject(new GarminError('unavailable'))
        }, TIMEOUT_MS)
        child.stdout.on('data', (chunk) => (out += chunk))
        child.stderr.on('data', (chunk) => (err = (err + chunk).slice(-2000)))
        let failedToStart = false
        child.on('error', (e) => {
            failedToStart = true
            clearTimeout(timer)
            console.error(
                `[garmin] could not start ${bin}: ${e.message} ` +
                    `(${HEROKU_PYTHON} ${existsSync(HEROKU_PYTHON) ? 'exists' : 'missing'}; PATH=${process.env.PATH ?? ''})`
            )
            reject(new GarminError('worker_unavailable'))
        })
        child.on('close', (exitCode) => {
            clearTimeout(timer)
            if (failedToStart) return
            let reply: { ok?: boolean; code?: string; result?: T; tokens?: string }
            try {
                reply = JSON.parse(out)
            } catch {
                const lastLine = err.trim().split('\n').pop() ?? ''
                console.error(`[garmin] worker (${bin}) exited ${exitCode} without a reply: ${lastLine}`)
                reject(new GarminError('worker_unavailable'))
                return
            }
            if (reply.ok) {
                resolve({ result: reply.result as T, tokens: reply.tokens })
                return
            }
            const code = GARMIN_ERROR_CODES.includes(reply.code as GarminErrorCode)
                ? (reply.code as GarminErrorCode)
                : 'error'
            reject(new GarminError(code))
        })
        child.stdin.end(JSON.stringify(request))
    })
