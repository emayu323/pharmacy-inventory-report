import toast from 'react-hot-toast';

interface ConfirmToastProps {
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
    t: any; // Toast instance
}

export default function ConfirmToast({
    message,
    onConfirm,
    onCancel,
    confirmText = 'はい',
    cancelText = 'いいえ',
    type = 'warning',
    t
}: ConfirmToastProps) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            minWidth: '300px'
        }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 500, lineHeight: 1.5 }}>
                {message.split('\n').map((line, i) => (
                    <div key={i}>{line}</div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button
                    onClick={() => {
                        toast.dismiss(t.id);
                        if (onCancel) onCancel();
                    }}
                    style={{
                        padding: '0.4rem 0.75rem',
                        fontSize: '0.875rem',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'white',
                        cursor: 'pointer'
                    }}
                >
                    {cancelText}
                </button>
                <button
                    onClick={() => {
                        toast.dismiss(t.id);
                        onConfirm();
                    }}
                    style={{
                        padding: '0.4rem 0.75rem',
                        fontSize: '0.875rem',
                        borderRadius: '4px',
                        border: 'none',
                        backgroundColor: type === 'danger' ? 'var(--color-danger)' : 'var(--color-primary)',
                        color: 'white',
                        fontWeight: 500,
                        cursor: 'pointer'
                    }}
                >
                    {confirmText}
                </button>
            </div>
        </div>
    );
}
