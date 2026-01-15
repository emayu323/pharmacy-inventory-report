import type { MedicationCheckItem } from '../types'
import { Plus, Trash2, ArrowUp, ArrowDown, GripVertical, ChevronDown } from 'lucide-react'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
            leftover_amount: '',
            prescription_amount: '',
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

        // Auto-calculate current_amount if leftover or prescription changes
        if (field === 'leftover_amount' || field === 'prescription_amount') {
            // @ts-ignore
            const leftover = parseFloat(newList[index].leftover_amount || '0')
            // @ts-ignore
            const prescription = parseFloat(newList[index].prescription_amount || '0')
            // @ts-ignore
            newList[index].current_amount = String(leftover + prescription)
        }

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

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex((item) => item.id === active.id);
            const newIndex = items.findIndex((item) => item.id === over.id);
            onUpdate(arrayMove(items, oldIndex, newIndex));
        }
    };

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

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={items.map(item => item.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="desktop-only" style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto minmax(150px, 2fr) 1fr 1fr 1fr 1fr 1fr 1.5fr auto auto auto',
                        gap: '0.5rem',
                        marginBottom: '0.5rem',
                        padding: '0 0.75rem',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        color: 'var(--color-text-secondary)'
                    }}>
                        <div></div> {/* Handle */}
                        <div>薬品名</div>
                        <div>残薬</div>
                        <div>処方数</div>
                        <div>現在残数</div>
                        <div>必要数</div>
                        <div>単位</div>
                        <div>備考</div>
                        <div></div> {/* Actions */}
                    </div>
                    <div className="mobile-card-view" style={{ display: 'grid', gap: '0.5rem' }}>
                        {items.map((item, index) => (
                            <SortableItem
                                key={item.id}
                                item={item}
                                index={index}
                                onChange={handleChange}
                                onRemove={handleRemove}
                                onMove={handleMove}
                                itemsLength={items.length}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            <style>{`
                    /* Default: hidden on desktop */
                    .desktop-hidden {
                        display: none;
                    }

                    @media (max-width: 640px) {
                        /* Show on mobile */
                        .desktop-hidden {
                             display: block;
                             margin-bottom: 0.25rem;
                        }

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

                        .desktop-only {
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

// Sub-component for Sortable Item
function SortableItem({ item, index, onChange, onRemove, onMove, itemsLength }: {
    item: MedicationCheckItem,
    index: number,
    onChange: (index: number, field: keyof MedicationCheckItem, value: any) => void,
    onRemove: (index: number) => void,
    onMove: (index: number, direction: -1 | 1) => void,
    itemsLength: number
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: item.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} className="mobile-card-item" >
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'auto minmax(150px, 2fr) 1fr 1fr 1fr 1fr 1fr 1.5fr auto auto auto',
                gap: '0.5rem',
                alignItems: 'end',
                backgroundColor: 'var(--color-bg)',
                padding: '0.75rem',
                borderRadius: '6px'
            }}>
                {/* Drag Handle */}
                <div {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex', alignItems: 'center', height: '100%', paddingBottom: '0.8rem' }}>
                    <GripVertical size={20} style={{ color: 'var(--color-text-secondary)' }} />
                </div>

                {/* Drug Name - Full width on mobile */}
                <div className="mobile-full-width" style={{ gridColumn: 'span 1' }}>
                    <label className="label desktop-hidden" style={{ fontSize: '0.9rem' }}>薬品名</label>
                    <input
                        type="text"
                        className="input"
                        placeholder="薬品名"
                        list="drug-options-shared"
                        value={item.name}
                        onChange={(e) => onChange(index, 'name', e.target.value)}
                    />
                </div>

                {/* Amounts Row on Mobile */}
                <div className="mobile-stack-horizontal">
                    <label className="label desktop-hidden" style={{ fontSize: '0.9rem' }}>残薬</label>
                    <input
                        type="number"
                        className="input"
                        placeholder="残薬"
                        value={item.leftover_amount || ''}
                        onChange={(e) => onChange(index, 'leftover_amount', e.target.value)}
                    />
                </div>
                <div className="mobile-stack-horizontal">
                    <label className="label desktop-hidden" style={{ fontSize: '0.9rem' }}>処方数</label>
                    <input
                        type="number"
                        className="input"
                        placeholder="処方数"
                        value={item.prescription_amount || ''}
                        onChange={(e) => onChange(index, 'prescription_amount', e.target.value)}
                    />
                </div>
                <div className="mobile-stack-horizontal">
                    <label className="label desktop-hidden" style={{ fontSize: '0.9rem' }}>現在残数</label>
                    <input
                        type="text"
                        className="input"
                        placeholder="現在残数"
                        value={item.current_amount}
                        readOnly
                        style={{ backgroundColor: 'var(--color-bg-secondary)', cursor: 'not-allowed' }}
                    />
                </div>
                <div className="mobile-stack-horizontal">
                    <label className="label desktop-hidden" style={{ fontSize: '0.9rem' }}>必要数</label>
                    <input
                        type="number"
                        className="input"
                        placeholder="必要数"
                        value={item.next_required_amount}
                        onChange={(e) => onChange(index, 'next_required_amount', e.target.value)}
                    />
                </div>
                <div className="mobile-stack-horizontal">
                    <label className="label desktop-hidden" style={{ fontSize: '0.9rem' }}>単位</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                            type="text"
                            className="input"
                            placeholder="単位"
                            value={item.unit}
                            onChange={(e) => onChange(index, 'unit', e.target.value)}
                            style={{ paddingRight: '2rem' }}
                        />
                        <div style={{
                            position: 'absolute',
                            right: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            pointerEvents: 'none',
                            color: 'var(--color-text-secondary)'
                        }}>
                            <ChevronDown size={14} />
                        </div>
                        <select
                            style={{
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                width: '2rem',
                                height: '100%',
                                opacity: 0,
                                cursor: 'pointer'
                            }}
                            value=""
                            onChange={(e) => {
                                if (e.target.value) {
                                    onChange(index, 'unit', e.target.value);
                                }
                            }}
                        >
                            <option value="" disabled>単位を選択</option>
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
                </div>

                {/* Notes - Full width on mobile */}
                <div className="mobile-full-width">
                    <label className="label desktop-hidden" style={{ fontSize: '0.9rem' }}>備考</label>
                    <input
                        type="text"
                        className="input"
                        placeholder="備考"
                        value={item.notes}
                        onChange={(e) => onChange(index, 'notes', e.target.value)}
                    />
                </div>

                {/* Actions - Flex row on mobile */}
                <div className="mobile-actions" style={{ display: 'contents' }}>
                    <button
                        onClick={() => onMove(index, -1)}
                        disabled={index === 0}
                        className="btn btn-ghost"
                        style={{ padding: '0.25rem', opacity: index === 0 ? 0.3 : 1 }}
                        title="上に移動"
                        type="button"
                    >
                        <ArrowUp size={16} />
                    </button>
                    <button
                        onClick={() => onMove(index, 1)}
                        disabled={index === itemsLength - 1}
                        className="btn btn-ghost"
                        style={{ padding: '0.25rem', opacity: index === itemsLength - 1 ? 0.3 : 1 }}
                        title="下に移動"
                        type="button"
                    >
                        <ArrowDown size={16} />
                    </button>
                    <button
                        onClick={() => onRemove(index)}
                        className="btn btn-ghost"
                        style={{ color: 'var(--color-error)', padding: '0.5rem' }}
                        title="削除"
                        type="button"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
