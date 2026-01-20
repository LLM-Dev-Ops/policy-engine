/**
 * ROI Estimation Agent
 *
 * Computes ROI and cost-efficiency metrics for LLM usage.
 * Emits exactly ONE DecisionEvent per invocation via ruvector-service.
 *
 * NON-RESPONSIBILITIES:
 * - Does NOT execute SQL directly
 * - Does NOT intercept live execution
 * - Does NOT execute workflows (that is LLM-Orchestrator)
 * - Does NOT apply optimizations directly (that is LLM-Auto-Optimizer)
 */
import {
  ROIEstimationInput,
  ROIEstimationOutput,
  ROIEstimationDecisionEvent,
} from '../contracts';
import { config } from '../config';
import { logger, ruvectorClient, hashInputs, generateEventId } from '../utils';

export class ROIEstimationAgent {
  private readonly agentId = 'llm-costops-roi';
  private readonly agentVersion = '1.0.0';

  /**
   * Process ROI estimation request
   */
  async process(input: ROIEstimationInput): Promise<ROIEstimationDecisionEvent> {
    const startTime = Date.now();

    logger.info({ request_id: input.request_id }, 'Processing ROI estimation');

    // Fetch cost data from ruvector-service
    const costData = await this.fetchCostData(input);

    // Calculate ROI
    const output = this.calculateROI(input, costData);

    // Create DecisionEvent
    const event: ROIEstimationDecisionEvent = {
      event_id: generateEventId(),
      agent_id: this.agentId,
      agent_version: this.agentVersion,
      decision_type: 'roi_estimation',
      inputs_hash: hashInputs(input),
      inputs: input,
      outputs: output,
      confidence: this.calculateConfidence(input, costData),
      execution_ref: {
        request_id: input.request_id,
        environment: config.service.environment,
      },
      timestamp: new Date().toISOString(),
      metadata: {
        processing_time_ms: Date.now() - startTime,
        source: 'roi-estimation-agent',
      },
    };

    // Persist to ruvector-service
    await ruvectorClient.persistDecisionEvent(event);

    logger.info(
      {
        event_id: event.event_id,
        roi_percentage: output.roi_metrics.roi_percentage,
        total_cost: output.costs.total_cost,
      },
      'ROI estimation completed'
    );

    return event;
  }

  /**
   * Fetch cost data from ruvector-service
   */
  private async fetchCostData(input: ROIEstimationInput): Promise<any[]> {
    return ruvectorClient.queryCostData({
      scope: input.scope,
      from_date: input.period.start_date,
      to_date: input.period.end_date,
      limit: 10000,
    });
  }

  /**
   * Calculate ROI metrics
   */
  private calculateROI(input: ROIEstimationInput, costData: any[]): ROIEstimationOutput {
    // Calculate total costs
    const totalLLMCost = costData.reduce(
      (sum, record) => sum + (record.total_cost || 0),
      0
    );

    // Estimate infrastructure overhead (10% of LLM costs)
    const infrastructureCost = totalLLMCost * 0.1;
    const totalCost = totalLLMCost + infrastructureCost;

    // Calculate value from provided metrics
    const valueSources = this.calculateValueSources(input.value_metrics);
    const totalValue = valueSources.reduce((sum, v) => sum + v.amount, 0);

    // Calculate ROI metrics
    const roiPercentage = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
    const tasksCompleted = input.value_metrics?.tasks_completed || costData.length;
    const costPerTask = tasksCompleted > 0 ? totalCost / tasksCompleted : 0;
    const valuePerDollar = totalCost > 0 ? totalValue / totalCost : 0;

    // Calculate payback period
    const daysInPeriod = this.calculateDaysInPeriod(
      input.period.start_date,
      input.period.end_date
    );
    const dailyValue = daysInPeriod > 0 ? totalValue / daysInPeriod : 0;
    const paybackPeriodDays =
      dailyValue > 0 ? Math.ceil(totalCost / dailyValue) : undefined;

    return {
      roi_id: generateEventId(),
      period: {
        start_date: input.period.start_date,
        end_date: input.period.end_date,
      },
      costs: {
        total_llm_cost: Math.round(totalLLMCost * 100) / 100,
        infrastructure_cost: Math.round(infrastructureCost * 100) / 100,
        total_cost: Math.round(totalCost * 100) / 100,
        currency: 'USD',
      },
      value: {
        estimated_value: Math.round(totalValue * 100) / 100,
        value_sources: valueSources,
      },
      roi_metrics: {
        roi_percentage: Math.round(roiPercentage * 100) / 100,
        cost_per_task: Math.round(costPerTask * 10000) / 10000,
        value_per_dollar_spent: Math.round(valuePerDollar * 100) / 100,
        payback_period_days: paybackPeriodDays,
      },
      benchmarks: this.calculateBenchmarks(roiPercentage),
      recommendations: this.generateRecommendations(roiPercentage, costPerTask),
    };
  }

  /**
   * Calculate value sources from provided metrics
   */
  private calculateValueSources(
    valueMetrics?: ROIEstimationInput['value_metrics']
  ): Array<{ source: string; amount: number; confidence: number }> {
    const sources: Array<{ source: string; amount: number; confidence: number }> = [];

    if (!valueMetrics) {
      return sources;
    }

    // Time savings (assuming $50/hour value)
    if (valueMetrics.time_saved_hours) {
      sources.push({
        source: 'time_savings',
        amount: valueMetrics.time_saved_hours * 50,
        confidence: 0.7,
      });
    }

    // Direct revenue attribution
    if (valueMetrics.revenue_attributed) {
      sources.push({
        source: 'revenue_attributed',
        amount: valueMetrics.revenue_attributed,
        confidence: 0.9,
      });
    }

    // Cost savings
    if (valueMetrics.cost_savings) {
      sources.push({
        source: 'cost_savings',
        amount: valueMetrics.cost_savings,
        confidence: 0.85,
      });
    }

    // Task completion (assuming $5/task value)
    if (valueMetrics.tasks_completed) {
      sources.push({
        source: 'task_completion',
        amount: valueMetrics.tasks_completed * 5,
        confidence: 0.6,
      });
    }

    // Custom metrics
    if (valueMetrics.custom_metrics) {
      for (const [key, value] of Object.entries(valueMetrics.custom_metrics)) {
        sources.push({
          source: `custom:${key}`,
          amount: value,
          confidence: 0.5,
        });
      }
    }

    return sources;
  }

  /**
   * Calculate days in period
   */
  private calculateDaysInPeriod(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate industry benchmarks
   */
  private calculateBenchmarks(
    roiPercentage: number
  ): { industry_average_roi?: number; percentile_rank?: number } {
    // Industry benchmarks (based on typical AI/ML ROI data)
    const industryAverageROI = 200; // 200% average ROI for AI initiatives

    // Calculate percentile rank
    let percentileRank: number;
    if (roiPercentage <= 0) {
      percentileRank = 10;
    } else if (roiPercentage <= 100) {
      percentileRank = 25 + (roiPercentage / 100) * 20;
    } else if (roiPercentage <= 200) {
      percentileRank = 45 + ((roiPercentage - 100) / 100) * 25;
    } else if (roiPercentage <= 500) {
      percentileRank = 70 + ((roiPercentage - 200) / 300) * 20;
    } else {
      percentileRank = 90 + Math.min(10, (roiPercentage - 500) / 500 * 10);
    }

    return {
      industry_average_roi: industryAverageROI,
      percentile_rank: Math.round(percentileRank),
    };
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(input: ROIEstimationInput, costData: any[]): number {
    let confidence = 0.5; // Base confidence

    // More data = higher confidence
    if (costData.length > 100) confidence += 0.2;
    else if (costData.length > 10) confidence += 0.1;

    // More value metrics = higher confidence
    if (input.value_metrics) {
      const metricsCount = Object.keys(input.value_metrics).filter(
        (k) => input.value_metrics![k as keyof typeof input.value_metrics] !== undefined
      ).length;
      confidence += metricsCount * 0.05;
    }

    return Math.min(0.95, confidence);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    roiPercentage: number,
    costPerTask: number
  ): string[] {
    const recommendations: string[] = [];

    if (roiPercentage < 0) {
      recommendations.push(
        'Current ROI is negative. Consider reviewing high-cost operations for optimization.'
      );
      recommendations.push(
        'Evaluate if lower-cost models can achieve acceptable quality for non-critical tasks.'
      );
    } else if (roiPercentage < 100) {
      recommendations.push(
        'ROI is below industry average. Focus on increasing task throughput or reducing costs.'
      );
    } else if (roiPercentage > 300) {
      recommendations.push(
        'Excellent ROI. Consider expanding LLM usage to additional use cases.'
      );
    }

    if (costPerTask > 1) {
      recommendations.push(
        `Cost per task ($${costPerTask.toFixed(2)}) is high. Consider batching operations or model optimization.`
      );
    }

    return recommendations;
  }
}

export const roiEstimationAgent = new ROIEstimationAgent();
