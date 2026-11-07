/**
 * Condition Evaluator - Evaluates policy conditions against context
 */
import { Condition, ConditionOperator, EvaluationContext } from '../../types/policy';
import { PolicyEvaluationError } from '@utils/errors';
import logger from '@utils/logger';
import { toPath } from 'lodash';

export interface ConditionEvaluationResult {
  result: boolean;
  evaluationTimeMs: number;
  details?: string;
}

export class ConditionEvaluator {
  /**
   * Evaluate a condition against an evaluation context
   */
  evaluate(condition: Condition, context: EvaluationContext): ConditionEvaluationResult {
    const startTime = Date.now();

    try {
      const result = this.evaluateCondition(condition, context);
      const evaluationTimeMs = Date.now() - startTime;

      logger.debug(
        {
          condition,
          result,
          evaluationTimeMs,
        },
        'Condition evaluated',
      );

      return {
        result,
        evaluationTimeMs,
        details: `Evaluated ${condition.operator} condition`,
      };
    } catch (error) {
      const evaluationTimeMs = Date.now() - startTime;
      logger.error({ condition, error }, 'Condition evaluation failed');

      throw new PolicyEvaluationError(
        `Condition evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
        { condition, evaluationTimeMs },
      );
    }
  }

  /**
   * Internal recursive condition evaluation
   */
  private evaluateCondition(condition: Condition, context: EvaluationContext): boolean {
    const { operator } = condition;

    // Logical operators
    if (operator === ConditionOperator.AND) {
      return this.evaluateAnd(condition.conditions || [], context);
    }

    if (operator === ConditionOperator.OR) {
      return this.evaluateOr(condition.conditions || [], context);
    }

    if (operator === ConditionOperator.NOT) {
      return !this.evaluateCondition(condition.conditions![0], context);
    }

    // Comparison operators
    const fieldValue = this.getFieldValue(condition.field!, context);
    const compareValue = condition.value;

    switch (operator) {
      case ConditionOperator.EQUALS:
        return this.equals(fieldValue, compareValue);

      case ConditionOperator.NOT_EQUALS:
        return !this.equals(fieldValue, compareValue);

      case ConditionOperator.GREATER_THAN:
        return this.greaterThan(fieldValue, compareValue);

      case ConditionOperator.GREATER_THAN_OR_EQUAL:
        return this.greaterThanOrEqual(fieldValue, compareValue);

      case ConditionOperator.LESS_THAN:
        return this.lessThan(fieldValue, compareValue);

      case ConditionOperator.LESS_THAN_OR_EQUAL:
        return this.lessThanOrEqual(fieldValue, compareValue);

      case ConditionOperator.IN:
        return this.in(fieldValue, compareValue);

      case ConditionOperator.NOT_IN:
        return !this.in(fieldValue, compareValue);

      case ConditionOperator.CONTAINS:
        return this.contains(fieldValue, compareValue);

      case ConditionOperator.NOT_CONTAINS:
        return !this.contains(fieldValue, compareValue);

      case ConditionOperator.MATCHES:
        return this.matches(fieldValue, compareValue);

      default:
        throw new PolicyEvaluationError(`Unknown operator: ${operator}`);
    }
  }

  /**
   * AND operator - all conditions must be true
   */
  private evaluateAnd(conditions: Condition[], context: EvaluationContext): boolean {
    return conditions.every((cond) => this.evaluateCondition(cond, context));
  }

  /**
   * OR operator - at least one condition must be true
   */
  private evaluateOr(conditions: Condition[], context: EvaluationContext): boolean {
    return conditions.some((cond) => this.evaluateCondition(cond, context));
  }

  /**
   * Get field value from context using dot notation
   */
  private getFieldValue(field: string, context: EvaluationContext): any {
    // Policy data must come from the supplied context, not its prototype chain.
    // Keep literal-key precedence and bracket syntax, but check every segment.
    // lodash.has treats sparse array positions as present, so do not use it here.
    if (typeof field !== 'string') return undefined;
    const own = Object.prototype.hasOwnProperty;
    const path = context != null && own.call(context, field) ? [field] : toPath(field);
    let current: any = context;
    for (const key of path) {
      if (current == null || !own.call(current, key)) return undefined;
      current = current[key];
    }
    return current;
  }

  /**
   * Equality comparison
   */
  private equals(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return a === b;

    // Deep equality for objects and arrays
    if (typeof a === 'object' && typeof b === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }

    return String(a) === String(b);
  }

  /**
   * Greater than comparison
   */
  private greaterThan(a: any, b: any): boolean {
    const numA = Number(a);
    const numB = Number(b);

    if (isNaN(numA) || isNaN(numB)) {
      return String(a) > String(b);
    }

    return numA > numB;
  }

  /**
   * Greater than or equal comparison
   */
  private greaterThanOrEqual(a: any, b: any): boolean {
    return this.greaterThan(a, b) || this.equals(a, b);
  }

  /**
   * Less than comparison
   */
  private lessThan(a: any, b: any): boolean {
    const numA = Number(a);
    const numB = Number(b);

    if (isNaN(numA) || isNaN(numB)) {
      return String(a) < String(b);
    }

    return numA < numB;
  }

  /**
   * Less than or equal comparison
   */
  private lessThanOrEqual(a: any, b: any): boolean {
    return this.lessThan(a, b) || this.equals(a, b);
  }

  /**
   * IN operator - value is in array
   */
  private in(value: any, array: any[]): boolean {
    if (!Array.isArray(array)) {
      return false;
    }

    return array.some((item) => this.equals(value, item));
  }

  /**
   * CONTAINS operator - array/string contains value
   */
  private contains(haystack: any, needle: any): boolean {
    if (typeof haystack === 'string') {
      return haystack.includes(String(needle));
    }

    if (Array.isArray(haystack)) {
      return haystack.some((item) => this.equals(item, needle));
    }

    if (typeof haystack === 'object' && haystack !== null) {
      return Object.values(haystack).some((value) => this.equals(value, needle));
    }

    return false;
  }

  /**
   * MATCHES operator - regex match
   */
  private matches(value: any, pattern: string): boolean {
    try {
      const regex = new RegExp(pattern);
      return regex.test(String(value));
    } catch (error) {
      logger.warn({ pattern, error }, 'Invalid regex pattern');
      return false;
    }
  }
}
