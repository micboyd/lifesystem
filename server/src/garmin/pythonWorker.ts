/**
 * Runs garmin-service/worker.py for one operation: one JSON request on stdin,
 * one JSON reply on stdout. Requests carry tokens and, on connect, the password,
 * so they go over stdin (never argv, which other processes can read) and are
 * never logged. Python 3.12+ comes from GARMIN_PYTHON, else the service's venv.
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { GARMIN_ERROR_CODES, GarminError, type GarminErrorCode } from './provider'

const SERVICE_DIR = path.resolve(__dirname, '../../../garmin-service')
const WORKER = path.join(SERVICE_DIR, 'worker.py')
/** Under Heroku's 30 s request cap, with room for the rest of the request. */
const TIMEOUT_MS = 25_000

function python(): string {
    if (process.env.GARMIN_PYTHON) return process.env.GARMIN_PYTHON
    const venv = path.join(SERVICE_DIR, '.venv', 'bin', 'python')
    return existsSync(venv) ? venv : 'python3'
}

export interface WorkerReply<T> {
    result: T
    /** Refreshed tokens, when the worker had any. */
    tokens?: string
}

export type WorkerRun = <T>(request: Record<string, unknown>) => Promise<WorkerReply<T>>

export const runWorker: WorkerRun = <T>(request: Record<string, unknown>) =>
    new Promise<WorkerReply<T>>((resolve, reject) => {
        const child = spawn(python(), ['-I', WORKER], {
            cwd: SERVICE_DIR,
            stdio: ['pipe', 'pipe', 'ignore'],
            env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
        })
        let out = ''
        const timer = setTimeout(() => {
            child.kill('SIGKILL')
            reject(new GarminError('unavailable'))
        }, TIMEOUT_MS)
        child.stdout.on('data', (chunk) => (out += chunk))
        child.on('error', () => {
            clearTimeout(timer)
            reject(new GarminError('not_configured'))
        })
        child.on('close', () => {
            clearTimeout(timer)
            let reply: { ok?: boolean; code?: string; result?: T; tokens?: string }
            try {
                reply = JSON.parse(out)
            } catch {
                reject(new GarminError('not_configured'))
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
