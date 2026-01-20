/**
 * Budget Enforcement Agent
 *
 * Evaluates budgets and cost constraints.
 * Emits exactly ONE DecisionEvent per invocation via ruvector-service.
 *
 * NON-RESPONSIBILITIES:
 * - Does NOT execute SQL directly
 * - Does NOT intercept live execution
 * - Does NOT enforce security policies (that is LLM-Shield)
 * - Does NOT block requests directly - only provides advisory signals
 */
import {
  BudgetEnforcementInput,
  BudgetEnforcementOutput,
  BudgetEnforcementDecisionEvent,
  BudgetStatus,
} from '../contracts';
import { config } from '../config';
import { logger, ruvectorClient, hashInputs, generateEventId } from '../utils';

export class BudgetEnforcementAgent {
  private readonly agentId = 'llm-costops-budget';
  private readonly agentVersion = '1.0.0';

  /**
   * Process budget enforcement request
   */
  async process(input: BudgetEnforcementInput): Promise<BudgetEnforcementDecisionEvent> {
    const startTime = Date.now();

    logger.info({ request_id: input.request_id, check_type: input.check_type }, 'Processing budget check');

    // Fetch budget data from ruvector-service
    const budgetData = await this.fetchBudgetData(input);

    // Evaluate budget status
    const output = this.evaluateBudget(input, budgetData);

    // Create DecisionEvent
    const event: BudgetEnforcementDecisionEvent = {
      event_id: generateEventId(),
      agent_id: this.agentId,
      agent_version: this.agentVersion,
      decision_type: 'budget_enforcement',
      inputs_hash: hashInputs(input),
      inputs: input,
      outputs: output,
      confidence: 1.0, // Deterministic evaluation
      execution_ref: {
        request_id: input.request_id,
        environment: config.service.environment,
      },
      timestamp: new Date().toISOString(),
      metadata: {
        processing_time_ms: Date.now() - startTime,
        source: 'budget-enforcement-agent',
      },
    };

    // Persist to ruvector-service
    await ruvectorClient.persistDecisionEvent(event);

    logger.info(
      {
        event_id: event.event_id,
        status: output.status,
        allowed: output.allowed,
        percentage_used: output.usage.percentage_used,
      },
      'Budget check completed'
    );

    return event;
  }

  /**
   * Fetch budget data from ruvector-service
   */
  private async fetchBudgetData(input: BudgetEnforcementInput): Promise<any> {
    const budgetData = await ruvectorClient.queryBudget({
      user_id: input.scope.user_id,
      team_id: input.scope.team_id,
      project_id: input.scope.project_id,
      budget_id: input.budget_id,
    });

    // Return default budget if none found
    if (!budgetData) {
      return {
        budget_id: input.budget_id || 'default',
        limit: 1000, // Default $1000/month
        period: 'monthly',
        currency: 'USD',
        current_spend: 0,
        warning_threshold: config.budgets.defaultWarningThreshold,
        critical_threshold: config.budgets.defaultCriticalThreshold,
      };
    }

    return budgetData;
  }

  /**
   * Evaluate budget status
   */
  private evaluateBudget(
    input: BudgetEnforcementInput,
    budgetData: any
  ): BudgetEnforcementOutput {
    const limit = budgetData.limit || 1000;
    const currentSpend = budgetData.current_spend || 0;
    const estimatedCost = input.estimated_cost || 0;
    const projectedSpend = currentSpend + estimatedCost;

    const percentageUsed = (currentSpend / limit) * 100;
    const projectedPercentage = (projectedSpend / limit) * 100;

    const warningThreshold =
      (budgetData.warning_threshold || config.budgets.defaultWarningThreshold) * 100;
    const criticalThreshold =
      (budgetData.critical_threshold || config.budgets.defaultCriticalThreshold) * 100;

    // Determine status
    const status = this.determineStatus(projectedPercentage, warningThreshold, criticalThreshold);

    // Determine threshold level
    const thresholdLevel = this.determineThresholdLevel(
      percentageUsed,
      warningThreshold,
      criticalThreshold
    );

    // Determine if request should be allowed
    const allowed = status !== 'exceeded';

    // Determine enforcement action
    const enforcementAction = this.determineEnforcementAction(status, input.check_type);

    // Generate recommendations
    const recommendations = this.generateRecommendations(status, percentageUsed, limit);

    return {
      budget_id: budgetData.budget_id || input.budget_id || 'default',
      status,
      allowed,
      budget: {
        limit,
        period: budgetData.period || 'monthly',
        currency: budgetData.currency || 'USD',
      },
      usage: {
        current_spend: Math.round(currentSpend * 100) / 100,
        remaining: Math.round((limit - currentSpend) * 100) / 100,
        percentage_used: Math.round(percentageUsed * 100) / 100,
      },
      thresholds: {
        warning_threshold: warningThreshold,
        critical_threshold: criticalThreshold,
        current_threshold_level: thresholdLevel,
      },
      recommendations,
      enforcement_action: enforcementAction,
    };
  }

  /**
   * Determine budget status
   */
  private determineStatus(
    projectedPercentage: number,
    warningThreshold: number,
    criticalThreshold: number
  ): BudgetStatus {
    if (projectedPercentage >= 100) {
      return 'exceeded';
    } else if (projectedPercentage >= criticalThreshold) {
      return 'critical';
    } else if (projectedPercentage >= warningThreshold) {
      return 'warning';
    }
    return 'healthy';
  }

  /**
   * Determine current threshold level
   */
  private determineThresholdLevel(
    percentageUsed: number,
    warningThreshold: number,
    criticalThreshold: number
  ): 'none' | 'warning' | 'critical' {
    if (percentageUsed >= criticalThreshold) {
      return 'critical';
    } else if (percentageUsed >= warningThreshold) {
      return 'warning';
    }
    return 'none';
  }

  /**
   * Determine enforcement action
   */
  private determineEnforcementAction(
    status: BudgetStatus,
    checkType: string
  ): 'none' | 'warn' | 'throttle' | 'block' {
    // Pre-request checks may suggest blocking
    if (checkType === 'pre_request') {
      switch (status) {
        case 'exceeded':
          return 'block';
        case 'critical':
          return 'throttle';
        case 'warning':
          return 'warn';
        default:
          return 'none';
      }
    }

    // Periodic and threshold alerts are advisory only
    switch (status) {
      case 'exceeded':
        return 'warn';
      case 'critical':
        return 'warn';
      case 'warning':
        return 'warn';
      default:
        return 'none';
    }
  }

  /**
   * Generate recommendations based on budget status
   */
  private generateRecommendations(
    status: BudgetStatus,
    percentageUsed: number,
    limit: number
  ): string[] {
    const recommendations: string[] = [];

    switch (status) {
      case 'exceeded':
        recommendations.push('Budget has been exceeded. Consider increasing the budget limit.');
        recommendations.push('Review recent high-cost operations for optimization opportunities.');
        recommendations.push('Consider switching to more cost-effective models for non-critical tasks.');
        break;
      case 'critical':
        recommendations.push(
          `Budget is at ${percentageUsed.toFixed(1)}% usage. Only $${(limit * (1 - percentageUsed / 100)).toFixed(2)} remaining.`
        );
        recommendations.push('Prioritize critical operations only.');
        recommendations.push('Consider model tier optimization to extend remaining budget.');
        break;
      case 'warning':
        recommendations.push(
          `Budget usage at ${percentageUsed.toFixed(1)}%. Monitor closely.`
        );
        recommendations.push('Review usage patterns and optimize where possible.');
        break;
      case 'healthy':
        // No recommendations needed
        break;
    }

    return recommendations;
  }
}

export const budgetEnforcementAgent = new BudgetEnforcementAgent();
