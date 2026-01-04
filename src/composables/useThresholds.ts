import type { ThresholdRule } from '@/types/dashboard'

/**
 * Use Thresholds Composable
 * Grug say: Check rules one by one. First match wins color.
 */
export function useThresholds() {

  /**
   * Evaluate a value against a list of rules
   * Returns the color string of the first matching rule, or undefined
   */
  function evaluateThresholds(value: any, rules: ThresholdRule[] | undefined): string | undefined {
    if (!rules || rules.length === 0) return undefined
    if (value === null || value === undefined) return undefined

    for (const rule of rules) {
      if (checkRule(value, rule)) {
        return rule.color
      }
    }

    return undefined
  }

  /**
   * Check single rule
   */
  function checkRule(value: any, rule: ThresholdRule): boolean {
    const valStr = String(value)
    const ruleValStr = rule.value

    // Try numeric comparison first
    const valNum = Number(value)
    const ruleValNum = Number(rule.value)
    const isNumeric = !isNaN(valNum) && !isNaN(ruleValNum) && rule.value.trim() !== ''

    switch (rule.operator) {
      case '>':
        return isNumeric ? valNum > ruleValNum : valStr > ruleValStr
      case '>=':
        return isNumeric ? valNum >= ruleValNum : valStr >= ruleValStr
      case '<':
        return isNumeric ? valNum < ruleValNum : valStr < ruleValStr
      case '<=':
        return isNumeric ? valNum <= ruleValNum : valStr <= ruleValStr
      case '==':
        // Loose equality to handle 1 == "1"
        return value == rule.value
      case '!=':
        return value != rule.value
      default:
        return false
    }
  }

  return {
    evaluateThresholds
  }
}
