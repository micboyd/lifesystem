import type { ReactNode } from 'react'
import Modal from './Modal'
import Button from './Button'

interface ConfirmModalProps {
    open: boolean
    title?: string
    /** The body — a question or short explanation of what will happen. */
    message: ReactNode
    confirmLabel?: string
    cancelLabel?: string
    /** Style the confirm button as destructive (red) rather than the coral primary. */
    danger?: boolean
    onConfirm: () => void
    onClose: () => void
}

/**
 * A small yes/no confirmation dialog on top of the shared Modal — the in-app
 * replacement for window.confirm. Confirming runs `onConfirm` and closes.
 */
export default function ConfirmModal({
    open,
    title = 'Are you sure?',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onConfirm,
    onClose,
}: ConfirmModalProps) {
    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            size="sm"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        {cancelLabel}
                    </Button>
                    <Button
                        variant="primary"
                        className={
                            danger
                                ? 'bg-red-600 shadow-red-600/25 hover:bg-red-700 active:bg-red-800'
                                : ''
                        }
                        onClick={() => {
                            onConfirm()
                            onClose()
                        }}
                    >
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            {message}
        </Modal>
    )
}
