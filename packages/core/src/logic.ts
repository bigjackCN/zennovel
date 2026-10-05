import type { Condition, Effect, Variable, VariableValue } from './types';

export type VariableState = Record<string, VariableValue>;

export function initialVariables(variables: Variable[]): VariableState {
  const state: VariableState = {};
  for (const v of variables) state[v.id] = v.initial;
  return state;
}

export function evaluateCondition(condition: Condition, vars: VariableState): boolean {
  switch (condition.kind) {
    case 'all':
      return condition.conditions.every((c) => evaluateCondition(c, vars));
    case 'any':
      return condition.conditions.some((c) => evaluateCondition(c, vars));
    case 'compare': {
      const left = vars[condition.variableId];
      const right = condition.value;
      switch (condition.op) {
        case '==':
          return left === right;
        case '!=':
          return left !== right;
        case '>':
          return Number(left) > Number(right);
        case '>=':
          return Number(left) >= Number(right);
        case '<':
          return Number(left) < Number(right);
        case '<=':
          return Number(left) <= Number(right);
      }
    }
  }
}

/** Returns a new variable state; never mutates the input. */
export function applyEffect(effect: Effect, vars: VariableState): VariableState {
  const current = vars[effect.variableId];
  let next: VariableValue;
  switch (effect.op) {
    case 'set':
      next = effect.value ?? current ?? 0;
      break;
    case 'add':
      next = Number(current ?? 0) + Number(effect.value ?? 0);
      break;
    case 'subtract':
      next = Number(current ?? 0) - Number(effect.value ?? 0);
      break;
    case 'toggle':
      next = !current;
      break;
  }
  return { ...vars, [effect.variableId]: next };
}
