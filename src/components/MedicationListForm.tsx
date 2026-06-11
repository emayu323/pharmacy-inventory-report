import type { MedicationCheckItem } from '../types'
import type { DrugMasterEntry } from '../drugMaster'
import { Trash2, GripVertical, ChevronDown, Plus } from 'lucide-react'
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
    drugOptions: DrugMasterEntry[];
    mode?: 'regular' | 'other';
    defaultPrescriptionDays?: string;
}

export default function MedicationListForm({ title, items, onUpdate, onSearchDrug, drugOptions, mode = 'regular', defaultPrescriptionDays = '' }: Props) {
    const isRegular = mode === 'regular'
    const addLabel = isRegular ? '定期薬を追加' : '臨時薬・その他を追加'

    const handleAdd = () => {
        const newItem: MedicationCheckItem = {
            id: crypto.randomUUID(),
            name: '',
            current_amount: '',
            leftover_amount: '',
            prescription_amount: '',
            prescription_days: isRegular ? defaultPrescriptionDays : '',
            previous_supply_until: '',
            actual_remaining_days: '',
            actual_remaining_reason: '',
            calculated_previous_remaining_days: '',
            calculated_total_days: '',
            calculated_supply_until: '',
            next_required_amount: '',
            unit: isRegular ? '日分' : '',
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

    const handleChange = <K extends keyof MedicationCheckItem>(
        index: number,
        field: K,
        value: MedicationCheckItem[K]
    ) => {
        const newList = [...items]
        newList[index] = { ...newList[index], [field]: value }

        // Auto-calculate current_amount if leftover or prescription changes
        if (!isRegular && (field === 'leftover_amount' || field === 'prescription_amount')) {
            const leftover = parseFloat(newList[index].leftover_amount || '0')
            const prescription = parseFloat(newList[index].prescription_amount || '0')
            newList[index] = {
                ...newList[index],
                current_amount: String(leftover + prescription)
            }
        }

        if (field === 'name' && typeof value === 'string') {
            const matchingDrug = drugOptions.find(option => option.name === value)
            if (!isRegular && matchingDrug?.unit) {
                newList[index] = {
                    ...newList[index],
                    unit: matchingDrug.unit
                }
            }
            onSearchDrug(value)
        }

        onUpdate(newList)
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

    const headerClassName = `medication-grid-header medication-grid-header-${mode}`

    return (
        <section className="card medication-list-section" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                {title}
            </h3>

            {/* Datalist for drugs */}
            <datalist id="drug-options-shared">
                {drugOptions.map((opt, i) => (
                    <option key={`${opt.name}-${opt.unit}-${i}`} value={opt.name} label={opt.unit || undefined} />
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
                    <div className={headerClassName}>
                        <div></div> {/* Handle */}
                        <div>薬品名</div>
                        {isRegular ? (
                            <>
                                <div>前回いつまで分</div>
                                <div>今回処方日数</div>
                                <div>実残日数</div>
                                <div>合計残日数</div>
                                <div>いつまで分</div>
                            </>
                        ) : (
                            <>
                                <div>数量</div>
                                <div>単位</div>
                                <div>備考</div>
                            </>
                        )}
                        {isRegular && (
                            <>
                                <div>単位</div>
                                <div>備考</div>
                            </>
                        )}
                        <div></div> {/* Actions */}
                    </div>
                    <div className="medication-list-body">
                        {items.map((item, index) => (
                            <SortableItem
                                key={item.id}
                                item={item}
                                index={index}
                                onChange={handleChange}
                                onRemove={handleRemove}
                                mode={mode}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            <style>{`
                .medication-list-section {
                    overflow: visible;
                }

                .medication-grid-header,
                .medication-row {
                    display: grid;
                    gap: 0.5rem;
                    align-items: end;
                }

                .medication-grid-header-regular,
                .medication-row-regular {
                    grid-template-columns: auto minmax(170px, 2fr) minmax(138px, 1fr) minmax(106px, 0.8fr) minmax(96px, 0.7fr) minmax(104px, 0.75fr) minmax(128px, 0.9fr) minmax(96px, 0.7fr) minmax(180px, 1.4fr) auto;
                }

                .medication-grid-header-other,
                .medication-row-other {
                    grid-template-columns: auto minmax(220px, 2fr) minmax(120px, 1fr) minmax(96px, 0.7fr) minmax(240px, 2fr) auto;
                }

                .medication-grid-header {
                    margin-bottom: 0.5rem;
                    padding: 0 0.75rem;
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: var(--color-text-muted);
                }

                .medication-list-body {
                    display: grid;
                    gap: 0.5rem;
                }

                .medication-row {
                    background-color: var(--color-background);
                    border: 1px solid transparent;
                    border-radius: 6px;
                    padding: 0.75rem;
                }

                .medication-drag-handle {
                    cursor: grab;
                    display: flex;
                    align-items: center;
                    height: 100%;
                    padding-bottom: 0.8rem;
                    color: var(--color-text-muted);
                }

                .medication-calculated {
                    min-height: 2.65rem;
                    display: flex;
                    align-items: center;
                    padding: 0.625rem;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    background-color: #f8fafc;
                    color: var(--color-text-main);
                    font-weight: 700;
                    white-space: nowrap;
                }

                .medication-calculated-empty {
                    color: var(--color-text-muted);
                    font-weight: 500;
                }

                .medication-actual-reason {
                    grid-column: 2 / -2;
                    display: grid;
                    grid-template-columns: minmax(96px, 0.7fr) minmax(220px, 2fr);
                    gap: 0.5rem;
                    align-items: center;
                    margin-top: -0.25rem;
                }

                .medication-actual-reason-label {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: var(--color-text-muted);
                    white-space: nowrap;
                }

                .medication-add-button {
                    margin-top: 0.75rem;
                    width: 100%;
                    border: 1px dashed var(--color-border);
                    color: var(--color-primary);
                    background-color: #f8fafc;
                }

                .medication-add-button:hover {
                    border-color: var(--color-primary);
                    background-color: #eff6ff;
                }

                @media (max-width: 960px) {
                    .medication-grid-header {
                        display: none;
                    }

                    .medication-row,
                    .medication-row-regular,
                    .medication-row-other {
                        grid-template-columns: 1fr 1fr;
                        gap: 0.875rem;
                        align-items: start;
                        border-color: var(--color-border);
                        background-color: var(--color-surface);
                    }

                    .medication-drag-handle {
                        grid-column: 1 / -1;
                        height: auto;
                        padding-bottom: 0;
                        justify-content: flex-start;
                    }

                    .medication-row-name,
                    .medication-row-notes,
                    .medication-actual-reason,
                    .mobile-actions {
                        grid-column: 1 / -1;
                    }

                    .medication-actual-reason {
                        grid-template-columns: 1fr;
                        margin-top: 0;
                    }

                    .medication-actual-reason-label {
                        font-size: 0.85rem;
                    }

                    .mobile-actions {
                        display: flex;
                        justify-content: flex-end;
                        border-top: 1px dashed var(--color-border);
                        padding-top: 0.75rem;
                    }

                    .medication-row-label {
                        display: block !important;
                        margin-bottom: 0.25rem;
                        font-size: 0.85rem;
                        font-weight: 700;
                        color: var(--color-text-muted);
                    }
                }

                @media (max-width: 520px) {
                    .medication-row,
                    .medication-row-regular,
                    .medication-row-other {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
            <button
                onClick={handleAdd}
                className="btn btn-ghost medication-add-button"
                type="button"
                aria-label={addLabel}
            >
                <Plus size={16} />
                {addLabel}
            </button>
        </section>
    )
}

const formatDisplayDate = (value: string | undefined): string => {
    return value ? value.replace(/-/g, '/') : ''
}

// Sub-component for Sortable Item
function SortableItem({ item, index, onChange, onRemove, mode }: {
    item: MedicationCheckItem,
    index: number,
    onChange: <K extends keyof MedicationCheckItem>(index: number, field: K, value: MedicationCheckItem[K]) => void,
    onRemove: (index: number) => void,
    mode: 'regular' | 'other'
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
    const isRegular = mode === 'regular';
    const totalDays = item.calculated_total_days || ''
    const supplyUntil = formatDisplayDate(item.calculated_supply_until)

    return (
        <div ref={setNodeRef} style={style}>
            <div className={`medication-row medication-row-${mode}`}>
                {/* Drag Handle */}
                <div {...attributes} {...listeners} className="medication-drag-handle" aria-label="並び替え">
                    <GripVertical size={20} />
                </div>

                {/* Drug Name - Full width on mobile */}
                <div className="medication-row-name">
                    <label className="medication-row-label">薬品名</label>
                    <input
                        type="text"
                        className="input"
                        placeholder="薬品名"
                        list="drug-options-shared"
                        value={item.name}
                        onChange={(e) => onChange(index, 'name', e.target.value)}
                    />
                </div>

                {isRegular ? (
                    <>
                        <div className="mobile-stack-horizontal">
                            <label className="medication-row-label">前回いつまで分</label>
                            <input
                                type="date"
                                className="input"
                                value={item.previous_supply_until || ''}
                                onChange={(e) => onChange(index, 'previous_supply_until', e.target.value)}
                            />
                        </div>
                        <div className="mobile-stack-horizontal">
                            <label className="medication-row-label">今回処方日数</label>
                            <input
                                type="number"
                                className="input"
                                placeholder="28"
                                value={item.prescription_days || ''}
                                onChange={(e) => onChange(index, 'prescription_days', e.target.value)}
                            />
                        </div>
                        <div className="mobile-stack-horizontal">
                            <label className="medication-row-label">実残日数</label>
                            <input
                                type="number"
                                className="input"
                                placeholder={item.calculated_previous_remaining_days ? `計算 ${item.calculated_previous_remaining_days}` : ''}
                                value={item.actual_remaining_days || ''}
                                onChange={(e) => onChange(index, 'actual_remaining_days', e.target.value)}
                                title="患者宅で実際に数えた残薬が計算値と違う場合だけ入力"
                            />
                        </div>
                        <div className="mobile-stack-horizontal">
                            <label className="medication-row-label">合計残日数</label>
                            <div className={`medication-calculated ${totalDays ? '' : 'medication-calculated-empty'}`}>
                                {totalDays ? `${totalDays}日` : '-'}
                            </div>
                        </div>
                        <div className="mobile-stack-horizontal">
                            <label className="medication-row-label">いつまで分</label>
                            <div className={`medication-calculated ${supplyUntil ? '' : 'medication-calculated-empty'}`}>
                                {supplyUntil || '-'}
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="mobile-stack-horizontal">
                            <label className="medication-row-label">数量</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="数量"
                                value={item.current_amount}
                                onChange={(e) => onChange(index, 'current_amount', e.target.value)}
                            />
                        </div>
                    </>
                )}
                <div className="mobile-stack-horizontal">
                    <label className="medication-row-label">単位</label>
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
                            aria-label="単位を選択"
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
                <div className="medication-row-notes">
                    <label className="medication-row-label">備考</label>
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
                        onClick={() => onRemove(index)}
                        className="btn btn-ghost"
                        style={{ color: 'var(--color-error)', padding: '0.5rem' }}
                        title="削除"
                        type="button"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>

                {isRegular && (item.actual_remaining_days || item.actual_remaining_reason) && (
                    <div className="medication-actual-reason">
                        <span className="medication-actual-reason-label">実残理由</span>
                        <input
                            type="text"
                            className="input"
                            placeholder="例: 飲み忘れ、紛失、回収など"
                            value={item.actual_remaining_reason || ''}
                            onChange={(e) => onChange(index, 'actual_remaining_reason', e.target.value)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
