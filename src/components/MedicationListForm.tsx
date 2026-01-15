import type { MedicationCheckItem } from '../types'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
// Removed uuid import


interface Props {
    title: string;
    items: MedicationCheckItem[];
    onUpdate: (items: MedicationCheckItem[]) => void;
    onSearchDrug: (query: string) => void;
    drugOptions: string[];
}

export default function MedicationListForm({ title, items, onUpdate, onSearchDrug, drugOptions }: Props) {
    const handleAdd = () => {
        const newItem: MedicationCheckItem = {
            id: crypto.randomUUID(),
            name: '',
            current_amount: '',
            next_required_amount: '',
            unit: '日分',
            notes: '',
            checked: false
        }
        onUpdate([...items, newItem])
    }

    const handleRemove = (index: number) => {
        const newList = [...items]
        newList.splice(index, 1)
        onUpdate(newList)
    }

    const handleChange = (index: number, field: keyof MedicationCheckItem, value: any) => {
        const newList = [...items]
        // @ts-ignore
        newList[index][field] = value

        if (field === 'name') {
            onSearchDrug(value as string)
        }

        onUpdate(newList)
    }

    const handleMove = (index: number, direction: -1 | 1) => {
        const newList = [...items]
        const newIndex = index + direction

        if (newIndex >= 0 && newIndex < newList.length) {
            const temp = newList[index]
            newList[index] = newList[newIndex]
            newList[newIndex] = temp
            onUpdate(newList)
        }
    }

    return (
        <section className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                {title}
            </h3>

            {/* Datalist for drugs */}
            <datalist id="drug-options-shared">
                {drugOptions.map((opt, i) => (
                    <option key={i} value={opt} />
                ))}
            </datalist>

            <div className="mobile-card-view" style={{ display: 'grid', gap: '0.5rem' }}>
                {items.map((item, index) => (
                    <div key={item.id} className="mobile-card-item" style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(150px, 2fr) 1fr 1fr 1fr 1.5fr auto auto auto',
                        gap: '0.5rem',
                        alignItems: 'end',
                        backgroundColor: 'var(--color-bg)',
                        padding: '0.75rem',
                        borderRadius: '6px'
                    }}>
                        {/* Drug Name - Full width on mobile */}
                        <div style={{ gridColumn: '1 / -1' }} className="details-desktop-only">
                            <label className="label" style={{ fontSize: '0.9rem' }}>薬品名</label>
                        </div>
                        <div className="mobile-full-width" style={{ gridColumn: 'span 1' }}>
                            <label className="label desktop-hidden" style={{ fontSize: '0.9rem' }}>薬品名</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="薬品名"
                                list="drug-options-shared"
                                value={item.name}
                                onChange={(e) => handleChange(index, 'name', e.target.value)}
                            />
                        </div>

                        {/* Amounts Row on Mobile */}
                        <div className="mobile-stack-horizontal">
                            <label className="label desktop-hidden" style={{ fontSize: '0.9rem' }}>残数</label>
                            <input
                                type="number"
                                className="input"
                                placeholder="残数"
                                value={item.current_amount}
                                onChange={(e) => handleChange(index, 'current_amount', e.target.value)}
                            />
                        </div>
                        <div className="mobile-stack-horizontal">
                            <label className="label desktop-hidden" style={{ fontSize: '0.9rem' }}>必要数</label>
                            <input
                                type="number"
                                className="input"
                                placeholder="必要数"
                                value={item.next_required_amount}
                                onChange={(e) => handleChange(index, 'next_required_amount', e.target.value)}
                            />
                        </div>
                        <div className="mobile-stack-horizontal">
                            <label className="label desktop-hidden" style={{ fontSize: '0.9rem' }}>単位</label>
                            <select
                                className="input"
                                value={item.unit}
                                onChange={(e) => handleChange(index, 'unit', e.target.value)}
                            >
                                <option value="日分">日分</option>
                                <option value="錠">錠</option>
                                <option value="本">本</option>
                                <option value="g">g</option>
                                <option value="枚">枚</option>
                                <option value="包">包</option>
                                <option value="シート">シート</option>
                                <option value="ml">ml</option>
                            </select>
                        </div>

                        {/* Notes - Full width on mobile */}
                        <div className="mobile-full-width">
                            <label className="label desktop-hidden" style={{ fontSize: '0.9rem' }}>備考</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="備考"
                                value={item.notes}
                                onChange={(e) => handleChange(index, 'notes', e.target.value)}
                            />
                        </div>

                        {/* Actions - Flex row on mobile */}
                        <div className="mobile-actions" style={{ display: 'contents' }}>
                            <button
                                onClick={() => handleMove(index, -1)}
                                disabled={index === 0}
                                className="btn btn-ghost"
                                style={{ padding: '0.25rem', opacity: index === 0 ? 0.3 : 1 }}
                                title="上に移動"
                                type="button"
                            >
                                <ArrowUp size={16} />
                            </button>
                            <button
                                onClick={() => handleMove(index, 1)}
                                disabled={index === items.length - 1}
                                className="btn btn-ghost"
                                style={{ padding: '0.25rem', opacity: index === items.length - 1 ? 0.3 : 1 }}
                                title="下に移動"
                                type="button"
                            >
                                <ArrowDown size={16} />
                            </button>
                            <button
                                onClick={() => handleRemove(index)}
                                className="btn btn-ghost"
                                style={{ color: 'var(--color-error)', padding: '0.5rem' }}
                                title="削除"
                                type="button"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
                    @media (max-width: 640px) {
                        .mobile-card-item {
                             grid-template-columns: 1fr 1fr 1fr !important;
                             grid-template-rows: auto auto auto auto !important;
                             gap: 1rem !important;
                             align-items: start !important;
                        }
                        
                        /* Name takes full width */
                        .mobile-card-item > div:nth-child(2) {
                            grid-column: 1 / -1 !important;
                        }
                        
                        /* Notes takes full width */
                        .mobile-card-item > div:nth-child(6) {
                            grid-column: 1 / -1 !important;
                        }
                        
                        /* Hide desktop labels inside grid usually, but here we added them inline for mobile */
                        .details-desktop-only {
                            display: none !important;
                        }

                        /* Actions row at the bottom */
                        .mobile-actions {
                            display: flex !important;
                            grid-column: 1 / -1 !important;
                            justify-content: flex-end;
                            gap: 1rem;
                            border-top: 1px dashed var(--color-border);
                            padding-top: 0.5rem;
                            margin-top: 0.5rem;
                        }
                    }
                `}</style>
            <button
                onClick={handleAdd}
                className="btn btn-ghost"
                style={{ marginTop: '0.5rem', width: '100%', border: '1px dashed var(--color-border)' }}
                type="button"
            >
                <Plus size={16} /> 薬剤を追加
            </button>
        </section>
    )
}
