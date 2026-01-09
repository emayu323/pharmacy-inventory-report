# Database Schema & Type Definitions

## 1. Tables (Supabase / PostgreSQL)

### `reports` Table
Stores the main report data.

| Column Name | Type | Description |
|---|---|---|
| id | uuid | Primary Key |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Last update time |
| patient_name | text | 患者氏名 |
| patient_dob | date | 生年月日 |
| patient_gender | text | 性別 ('male', 'female', 'other') |
| doctor_name | text | 主治医 |
| pharmacist_name | text | 担当薬剤師 |
| prescription_date | date | 処方日 |
| dispensing_date | date | 調剤日 |
| visit_date | date | 訪問日 |
| compliance_status | text | 服薬コンプライアンス (Free text or Enum) |
| leftover_meds | text | 残薬確認 |
| storage_status | text | 保管状況 |
| medication_instruction | text | 服薬指導内容 |
| side_effects | text | 副作用確認 |
| next_visit_plan | text | 次回訪問予定・計画 |

### `pharmacists` Table (Optional for V1, but good for management)
| Column Name | Type | Description |
|---|---|---|
| id | uuid | Primary Key |
| name | text | Display Name |
| user_id | uuid | Link to Supabase Auth User (optional) |

---

## 2. TypeScript Interfaces

```typescript
export type Gender = 'male' | 'female' | 'other';

export interface Report {
  id: string; // UUID
  created_at: string;
  updated_at: string;
  
  // Basic Info
  patient_name: string;
  patient_dob: string; // ISO Date string 'YYYY-MM-DD'
  patient_gender: Gender;
  doctor_name: string;
  pharmacist_name: string;
  
  // Dates
  prescription_date: string;
  dispensing_date: string;
  visit_date: string;
  
  // Medication Status
  compliance_status: string;
  leftover_meds: string;
  storage_status: string;
  
  // Instructions
  medication_instruction: string;
  side_effects: string;
  
  // Plan
  next_visit_plan: string;
}

export type NewReport = Omit<Report, 'id' | 'created_at' | 'updated_at'>;
```
