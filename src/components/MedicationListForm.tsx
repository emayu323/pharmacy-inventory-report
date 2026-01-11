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
            unit: '錠',
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

            <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {items.map((item, index) => (
                        <div key={item.id} style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(150px, 2fr) 1fr 1fr 1fr 1.5fr auto auto auto',
                            gap: '0.5rem',
                            alignItems: 'end',
                            backgroundColor: 'var(--color-bg)',
                            padding: '0.75rem',
                            borderRadius: '6px'
                        }}>
                            <div>
                                <label className="label" style={{ fontSize: '0.75rem' }}>薬品名</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="薬品名"
                                    list="drug-options-shared"
                                    value={item.name}
                                    onChange={(e) => handleChange(index, 'name', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="label" style={{ fontSize: '0.75rem' }}>現在残数</label>
                                <input
                                    type="number"
                                    className="input"
                                    placeholder="残数"
                                    value={item.current_amount}
                                    onChange={(e) => handleChange(index, 'current_amount', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="label" style={{ fontSize: '0.75rem' }}>次回必要数</label>
                                <input
                                    type="number"
                                    className="input"
                                    placeholder="必要数"
                                    value={item.next_required_amount}
                                    onChange={(e) => handleChange(index, 'next_required_amount', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="label" style={{ fontSize: '0.75rem' }}>単位</label>
                                <input
                                    type="text"
                                    list={`unit-options-${item.id}`}
                                    className="input"
                                    placeholder="単位"
                                    value={item.unit}
                                    onChange={(e) => handleChange(index, 'unit', e.target.value)}
                                />
                                <datalist id={`unit-options-${item.id}`}>
                                    <option value="日分" />
                                    <option value="錠" />
                                    <option value="本" />
                                    <option value="g" />
                                    <option value="枚" />
                                    <option value="包" />
                                    <option value="シート" />
                                    <option value="ml" />
                                </datalist>
                            </div>
                            <div>
                                <label className="label" style={{ fontSize: '0.75rem' }}>備考</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="備考"
                                    value={item.notes}
                                    onChange={(e) => handleChange(index, 'notes', e.target.value)}
                                />
                            </div>
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
                    ))}
                </div>
                <button
                    onClick={handleAdd}
                    className="btn btn-ghost"
                    style={{ marginTop: '0.5rem', width: '100%', border: '1px dashed var(--color-border)' }}
                    type="button"
                >
                    <Plus size={16} /> 薬剤を追加
                </button>
            </div>
        </section>
    )
}
