import { useState, useEffect } from 'react';
import type { Goal, GoalFormData, ThrustArea, UomType } from '../types';
import { geminiEnabled } from '../lib/gemini';
import { AIDescriptionWriter } from './AIGoalSuggestions';

// ─── Constants ────────────────────────────────────────────────────────────────

const THRUST_AREAS: ThrustArea[] = [
  'Revenue',
  'Cost',
  'Quality',
  'Delivery',
  'Safety',
  'People',
  'Innovation',
  'Customer',
];

const UOM_OPTIONS: { value: UomType; label: string; description: string }[] = [
  {
    value: 'NUMERIC_MIN',
    label: 'Numeric (Min)',
    description: 'Higher actual is better — e.g. Revenue, Units Sold. Score = actual ÷ target.',
  },
  {
    value: 'NUMERIC_MAX',
    label: 'Numeric (Max)',
    description: 'Lower actual is better — e.g. Cost, TAT. Score = target ÷ actual.',
  },
  {
    value: 'TIMELINE',
    label: 'Timeline',
    description:
      'Date-based completion. On or before deadline = 100%. Partial credit for late completion.',
  },
  {
    value: 'ZERO',
    label: 'Zero',
    description:
      'Zero incidents = success — e.g. Safety incidents. Score is 1 if actual = 0, else 0.',
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface GoalFormProps {
  /** Pre-filled goal for edit mode. Omit for create mode. */
  goal?: Goal;
  /** The sheet ID to associate the new goal with (required for create mode). */
  goalSheetId?: string;
  onSubmit: (data: GoalFormData) => void;
  onCancel: () => void;
  loading?: boolean;
  /**
   * When true, the goal was pushed by a manager (isShared=true).
   * Title, Description, UoM Type, Thrust Area, and Target fields are read-only;
   * only Weightage is editable.
   */
  isShared?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GoalForm({ goal, goalSheetId, onSubmit, onCancel, loading = false, isShared = false }: GoalFormProps) {
  const [thrustArea, setThrustArea] = useState<ThrustArea>(goal?.thrustArea ?? 'Revenue');
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [uomType, setUomType] = useState<UomType>(goal?.uomType ?? 'NUMERIC_MIN');
  const [target, setTarget] = useState(goal?.target ?? '');
  const [weightage, setWeightage] = useState<number>(
    goal?.weightage != null ? Number(goal.weightage) : 10
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when goal prop changes (e.g. switching between edit targets)
  useEffect(() => {
    if (goal) {
      setThrustArea(goal.thrustArea);
      setTitle(goal.title);
      setDescription(goal.description);
      setUomType(goal.uomType);
      setTarget(goal.target);
      setWeightage(Number(goal.weightage));
    }
  }, [goal]);

  const selectedUom = UOM_OPTIONS.find((o) => o.value === uomType);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    const titleStr = String(title).trim();
    const descStr = String(description).trim();
    const targetStr = String(target).trim();
    
    if (!titleStr) newErrors.title = 'Title is required.';
    if (!descStr) newErrors.description = 'Description is required.';
    if (!targetStr) newErrors.target = 'Target is required.';
    if (uomType === 'TIMELINE' && isNaN(Date.parse(targetStr))) {
      newErrors.target = 'Target must be a valid date for Timeline goals.';
    }
    if (uomType !== 'TIMELINE' && isNaN(Number(targetStr))) {
      newErrors.target = 'Target must be a number for this UoM type.';
    }
    if (weightage < 10) newErrors.weightage = 'Minimum weightage is 10%.';
    if (weightage > 100) newErrors.weightage = 'Weightage cannot exceed 100%.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const sheetId = goal?.goalSheetId ?? goalSheetId ?? '';
    onSubmit({
      goalSheetId: sheetId,
      thrustArea,
      title: String(title).trim(),
      description: String(description).trim(),
      uomType,
      target: String(target).trim(),
      weightage,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Shared goal notice */}
      {isShared && (
        <div className="rounded-md border border-purple-200 bg-purple-50 p-3">
          <p className="text-sm font-medium text-purple-800">Shared KPI</p>
          <p className="mt-0.5 text-xs text-purple-600">
            This goal was pushed by your manager. Title, Description, UoM Type, Thrust Area, and
            Target are read-only. You can only adjust the Weightage.
          </p>
        </div>
      )}

      {/* Thrust Area */}
      <div>
        <label htmlFor="thrustArea" className="block text-sm font-medium text-gray-700 mb-1">
          Thrust Area <span className="text-red-500">*</span>
        </label>
        <select
          id="thrustArea"
          value={thrustArea}
          onChange={(e) => setThrustArea(e.target.value as ThrustArea)}
          disabled={loading || isShared}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-gray-50"
        >
          {THRUST_AREAS.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
        {isShared && (
          <p className="mt-1 text-xs text-purple-600">Read-only — set by manager</p>
        )}
      </div>

      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading || isShared}
          placeholder="e.g. Increase quarterly revenue by 15%"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-gray-50"
        />
        {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title}</p>}
        {isShared && (
          <p className="mt-1 text-xs text-purple-600">Read-only — set by manager</p>
        )}
      </div>

      {/* Description */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description <span className="text-red-500">*</span>
          </label>
          {geminiEnabled && !isShared && (
            <AIDescriptionWriter
              title={title}
              thrustArea={thrustArea}
              uomType={uomType}
              onGenerated={(desc) => setDescription(desc)}
            />
          )}
        </div>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading || isShared}
          rows={3}
          placeholder="Describe the goal in detail..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-gray-50 resize-none"
        />
        {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
        {isShared && (
          <p className="mt-1 text-xs text-purple-600">Read-only — set by manager</p>
        )}
      </div>

      {/* UoM Type */}
      <div>
        <label htmlFor="uomType" className="block text-sm font-medium text-gray-700 mb-1">
          Unit of Measure (UoM) Type <span className="text-red-500">*</span>
        </label>
        <select
          id="uomType"
          value={uomType}
          onChange={(e) => setUomType(e.target.value as UomType)}
          disabled={loading || isShared}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-gray-50"
        >
          {UOM_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {selectedUom && (
          <p className="mt-1 text-xs text-gray-500">{selectedUom.description}</p>
        )}
        {isShared && (
          <p className="mt-1 text-xs text-purple-600">Read-only — set by manager</p>
        )}
      </div>

      {/* Target */}
      <div>
        <label htmlFor="target" className="block text-sm font-medium text-gray-700 mb-1">
          Target <span className="text-red-500">*</span>
        </label>
        {uomType === 'TIMELINE' ? (
          <input
            id="target"
            type="date"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={loading || isShared}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-gray-50"
          />
        ) : (
          <input
            id="target"
            type="number"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={loading || isShared}
            placeholder="Enter numeric target"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-gray-50"
          />
        )}
        {errors.target && <p className="mt-1 text-xs text-red-600">{errors.target}</p>}
        {isShared && (
          <p className="mt-1 text-xs text-purple-600">Read-only — set by manager</p>
        )}
      </div>

      {/* Weightage */}
      <div>
        <label htmlFor="weightage" className="block text-sm font-medium text-gray-700 mb-1">
          Weightage (%) <span className="text-red-500">*</span>
        </label>
        <input
          id="weightage"
          type="number"
          min={10}
          max={100}
          step={1}
          value={weightage}
          onChange={(e) => setWeightage(Number(e.target.value))}
          disabled={loading}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        />
        <p className="mt-1 text-xs text-gray-500">Must be between 10% and 100%.</p>
        {errors.weightage && <p className="mt-1 text-xs text-red-600">{errors.weightage}</p>}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {loading ? 'Saving…' : goal ? 'Save Changes' : 'Add Goal'}
        </button>
      </div>
    </form>
  );
}

export default GoalForm;
