export type CompoundTodoMeta = {
  compoundId: string;
  compoundPosition: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createCompoundId() {
  return `compound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeCompoundTodoMeta(value: unknown): CompoundTodoMeta | null {
  if (!isRecord(value)) {
    return null;
  }

  const compoundId = typeof value.compoundId === 'string' ? value.compoundId.trim() : '';
  const rawPosition = typeof value.compoundPosition === 'number' ? value.compoundPosition : Number.NaN;

  if (!compoundId || !Number.isFinite(rawPosition)) {
    return null;
  }

  return {
    compoundId,
    compoundPosition: Math.max(0, Math.floor(rawPosition)),
  };
}

export function serializeCompoundTodoMeta(meta: CompoundTodoMeta | null | undefined) {
  return meta ? JSON.stringify(meta) : '';
}
