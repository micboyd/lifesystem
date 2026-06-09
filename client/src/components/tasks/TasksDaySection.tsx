import { useEffect, useRef, useState } from 'react'
import Spinner from '../Spinner'
import { listTasks, createTask, updateTask, deleteTask } from '../../services/tasks'
import { useInvalidate } from '../../context/DataSyncContext'
import type { Task } from '../../types'

interface Props {
    date: string
}

export default function TasksDaySection({ date }: Props) {
    const invalidate = useInvalidate()
    const [tasks, setTasks] = useState<Task[]>([])
    const [loadedDate, setLoadedDate] = useState<string | null>(null)
    const loading = loadedDate !== date
    const [busy, setBusy] = useState<Set<string>>(new Set())
    const [newTitle, setNewTitle] = useState('')
    const [adding, setAdding] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        let active = true
        listTasks(date, date)
            .then((list) => active && setTasks(list))
            .catch(() => active && setTasks([]))
            .finally(() => { if (active) setLoadedDate(date) })
        return () => { active = false }
    }, [date])

    function mark(id: string, on: boolean) {
        setBusy((s) => {
            const n = new Set(s)
            if (on) n.add(id); else n.delete(id)
            return n
        })
    }

    async function toggle(task: Task) {
        if (busy.has(task._id)) return
        mark(task._id, true)
        // Optimistic
        setTasks((prev) => prev.map((t) => (t._id === task._id ? { ...t, completed: !t.completed } : t)))
        try {
            await updateTask(task._id, { completed: !task.completed })
            invalidate('tasks')
        } catch {
            setTasks((prev) => prev.map((t) => (t._id === task._id ? { ...t, completed: task.completed } : t)))
        } finally {
            mark(task._id, false)
        }
    }

    async function handleAdd() {
        const title = newTitle.trim()
        if (!title || adding) return
        setAdding(true)
        try {
            const task = await createTask(date, title)
            setTasks((prev) => [...prev, task])
            invalidate('tasks')
            setNewTitle('')
            inputRef.current?.focus()
        } finally {
            setAdding(false)
        }
    }

    async function remove(id: string) {
        setTasks((prev) => prev.filter((t) => t._id !== id))
        try {
            await deleteTask(id)
            invalidate('tasks')
        } catch { /* refetch could go here */ }
    }

    const done = tasks.filter((t) => t.completed).length
    const total = tasks.length

    if (loading) return <div className="grid place-items-center py-6"><Spinner /></div>

    return (
        <div className="flex flex-col gap-1">
            {/* Progress */}
            {total > 0 && (
                <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-400">{done}/{total} done</span>
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-neutral-100">
                        <div
                            className="h-full rounded-full bg-neutral-800 transition-all duration-300"
                            style={{ width: total ? `${(done / total) * 100}%` : '0%' }}
                        />
                    </div>
                </div>
            )}

            {/* Task rows */}
            {tasks.map((task) => (
                <div
                    key={task._id}
                    className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-neutral-50"
                >
                    <button
                        type="button"
                        onClick={() => toggle(task)}
                        disabled={busy.has(task._id)}
                        className={[
                            'grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors',
                            task.completed ? 'border-neutral-800 bg-neutral-800' : 'border-neutral-300 hover:border-neutral-500',
                        ].join(' ')}
                        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
                    >
                        {task.completed && <i className="fa-solid fa-check text-[9px] text-white" aria-hidden="true" />}
                    </button>

                    <span className={[
                        'flex-1 truncate text-sm font-medium',
                        task.completed ? 'text-neutral-400 line-through' : 'text-neutral-800',
                    ].join(' ')}>
                        {task.title}
                    </span>

                    <button
                        type="button"
                        onClick={() => remove(task._id)}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-neutral-300 opacity-0 transition-all hover:bg-neutral-200 hover:text-neutral-600 group-hover:opacity-100"
                        aria-label="Delete task"
                    >
                        <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
                    </button>
                </div>
            ))}

            {/* Quick add */}
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 focus-within:border-neutral-400 focus-within:ring-2 focus-within:ring-neutral-200">
                <i className="fa-solid fa-plus text-xs text-neutral-300" aria-hidden="true" />
                <input
                    ref={inputRef}
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                    placeholder="Add a task…"
                    className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 outline-none"
                />
                {newTitle.trim() && (
                    <button
                        type="button"
                        onClick={handleAdd}
                        disabled={adding}
                        className="rounded-full bg-neutral-950 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                    >
                        Add
                    </button>
                )}
            </div>
        </div>
    )
}
