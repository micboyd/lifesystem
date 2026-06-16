import { useEffect, useState } from 'react'
import Container from '../components/Container'
import Tabs from '../components/Tabs'
import Button from '../components/Button'
import Input from '../components/Input'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import { Card, CardHeader, CardTitle } from '../components/Card'
import { listCourses, createCourse, updateCourse, deleteCourse } from '../services/courses'
import type { Course } from '../types'

const EMPTY_FORM = { title: '', hours: '', category: '', url: '' }

export default function Study() {
    const [tab, setTab] = useState('Courses')
    const [courses, setCourses] = useState<Course[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [editing, setEditing] = useState<Course | null>(null)
    const [form, setForm] = useState(EMPTY_FORM)
    const [saving, setSaving] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<Course | null>(null)

    useEffect(() => {
        let active = true
        listCourses()
            .then((c) => active && setCourses(c))
            .finally(() => active && setLoading(false))
        return () => { active = false }
    }, [])

    function openAdd() {
        setEditing(null)
        setForm(EMPTY_FORM)
        setModalOpen(true)
    }

    function openEdit(course: Course) {
        setEditing(course)
        setForm({ title: course.title, hours: String(course.hours), category: course.category, url: course.url ?? '' })
        setModalOpen(true)
    }

    function closeModal() {
        setModalOpen(false)
        setEditing(null)
        setForm(EMPTY_FORM)
    }

    async function handleSave() {
        const title = form.title.trim()
        const category = form.category.trim()
        const hours = parseFloat(form.hours)
        const url = form.url.trim() || undefined
        if (!title || !category || !Number.isFinite(hours) || hours < 0) return
        setSaving(true)
        try {
            if (editing) {
                const updated = await updateCourse(editing._id, { title, hours, category, url })
                setCourses((prev) => prev.map((c) => (c._id === editing._id ? updated : c)))
            } else {
                const created = await createCourse({ title, hours, category, url })
                setCourses((prev) => [...prev, created])
            }
            closeModal()
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete() {
        if (!deleteTarget) return
        await deleteCourse(deleteTarget._id)
        setCourses((prev) => prev.filter((c) => c._id !== deleteTarget._id))
        setDeleteTarget(null)
    }

    const grouped = courses.reduce<Record<string, Course[]>>((acc, c) => {
        ;(acc[c.category] ??= []).push(c)
        return acc
    }, {})

    return (
        <Container as="main" className="py-10">
            <div className="flex items-center justify-between gap-4">
                <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Study</h1>
                {tab === 'Courses' && (
                    <Button onClick={openAdd} icon="fa-solid fa-plus">
                        Add course
                    </Button>
                )}
            </div>

            <div className="mt-6">
                <Tabs tabs={['Courses', 'Schedule']} value={tab} onChange={setTab} />
            </div>

            {tab === 'Courses' && (
                loading ? (
                    <div className="mt-16 grid place-items-center">
                        <Spinner />
                    </div>
                ) : courses.length === 0 ? (
                    <div className="mt-16 text-center">
                        <p className="text-sm text-neutral-400">No courses yet. Add one to get started.</p>
                    </div>
                ) : (
                    <div className="mt-8 flex flex-col gap-8">
                        {Object.entries(grouped).map(([category, items]) => (
                            <div key={category}>
                                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                                    {category}
                                </h2>
                                <div className="flex flex-col gap-3">
                                    {items.map((course) => (
                                        <Card key={course._id}>
                                            <CardHeader className="flex items-center justify-between gap-4">
                                                <div className="min-w-0">
                                                    <CardTitle className="truncate">{course.title}</CardTitle>
                                                    <p className="mt-0.5 text-sm text-neutral-400">
                                                        {course.hours} {course.hours === 1 ? 'hour' : 'hours'}
                                                    </p>
                                                    {course.url && (
                                                        <a
                                                            href={course.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="mt-1 inline-flex items-center gap-1.5 text-xs text-neutral-400 transition-colors hover:text-neutral-700"
                                                        >
                                                            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                                                            Open course
                                                        </a>
                                                    )}
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(course)}
                                                        className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                                        aria-label="Edit"
                                                    >
                                                        <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleteTarget(course)}
                                                        className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                                        aria-label="Delete"
                                                    >
                                                        <i className="fa-solid fa-trash text-xs" aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </CardHeader>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {tab === 'Schedule' && (
                <div className="mt-16 text-center">
                    <p className="text-sm text-neutral-400">Schedule coming soon.</p>
                </div>
            )}

            {/* Add / Edit modal */}
            <Modal
                open={modalOpen}
                onClose={closeModal}
                title={editing ? 'Edit course' : 'Add course'}
                size="sm"
                footer={<>
                    <Button variant="ghost" onClick={closeModal} disabled={saving}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving || !form.title.trim() || !form.category.trim() || form.hours === ''}>
                        {saving ? <Spinner size="sm" /> : editing ? 'Save' : 'Add'}
                    </Button>
                </>}
            >
                <div className="flex flex-col gap-4">
                    <Input
                        label="Title"
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="e.g. Introduction to Python"
                        autoFocus
                    />
                    <Input
                        label="Category"
                        value={form.category}
                        onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                        placeholder="e.g. Programming"
                    />
                    <Input
                        label="Hours"
                        type="number"
                        min="0"
                        step="0.5"
                        value={form.hours}
                        onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                        placeholder="e.g. 10"
                    />
                    <Input
                        label="URL"
                        type="url"
                        value={form.url}
                        onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                        placeholder="e.g. https://udemy.com/course/..."
                        icon="fa-solid fa-link"
                    />
                </div>
            </Modal>

            {/* Delete confirmation modal */}
            <Modal
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete course"
                size="sm"
                footer={<>
                    <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                    <Button variant="ghost" onClick={handleDelete} className="text-red-500 hover:bg-red-50 hover:text-red-600">Delete</Button>
                </>}
            >
                <p className="p-6 text-sm text-neutral-600">
                    Are you sure you want to delete <span className="font-semibold">{deleteTarget?.title}</span>? This cannot be undone.
                </p>
            </Modal>
        </Container>
    )
}
