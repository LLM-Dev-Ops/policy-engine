/**
 * LLM-CostOps Decision Event Contracts
 *
 * DecisionEvent schemas for cost accounting, forecasting, and financial governance.
 * ALL events are persisted via ruvector-service (never direct SQL).
 */

/**
 * Cost decision types for CostOps agents
 */
export type CostDecisionType =
  | 'cost_attribution'
  | 'cost_forecast'
  | 'budget_enforcement'
  | 'roi_estimation'
  | 'cost_performance_tradeoff';

/**
 * Currency codes supported by CostOps
 */
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD';

/**
 * Time granularity for forecasts and aggregations
 */
export type TimeGranularity = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/**
 * Budget status levels
 */
export type BudgetStatus = 'healthy' | 'warning' | 'critical' | 'exceeded';

/**
 * Cost Attribution Input
 */
export interface CostAttributionInput {
  request_id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms?: number;
  user_id?: string;
  team_id?: string;
  project_id?: string;
  environment?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Cost Attribution Output
 */
export interface CostAttributionOutput {
  total_cost: number;
  currency: CurrencyCode;
  breakdown: {
    input_cost: number;
    output_cost: number;
    base_cost: number;
    markup?: number;
  };
  unit_costs: {
    per_1k_input_tokens: number;
    per_1k_output_tokens: number;
  };
  attribution: {
    user_id?: string;
    team_id?: string;
    project_id?: string;
    cost_center?: string;
  };
  tags?: string[];
}

/**
 * Cost Forecast Input
 */
export interface CostForecastInput {
  request_id: string;
  scope: {
    user_id?: string;
    team_id?: string;
    project_id?: string;
    provider?: string;
    model?: string;
  };
  forecast_period: {
    start_date: string;
    end_date: string;
    granularity: TimeGranularity;
  };
  historical_window_days?: number;
  confidence_level?: number;
}

/**
 * Cost Forecast Output
 */
export interface CostForecastOutput {
  forecast_id: string;
  period: {
    start_date: string;
    end_date: string;
    granularity: TimeGranularity;
  };
  predictions: Array<{
    date: string;
    predicted_cost: number;
    lower_bound: number;
    upper_bound: number;
    confidence: number;
  }>;
  summary: {
    total_predicted_cost: number;
    average_daily_cost: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    trend_percentage: number;
  };
  currency: CurrencyCode;
  model_info: {
    algorithm: string;
    accuracy_score: number;
    training_data_points: number;
  };
}

/**
 * Budget Enforcement Input
 */
export interface BudgetEnforcementInput {
  request_id: string;
  scope: {
    user_id?: string;
    team_id?: string;
    project_id?: string;
  };
  budget_id?: string;
  estimated_cost?: number;
  check_type: 'pre_request' | 'periodic' | 'threshold_alert';
}

/**
 * Budget Enforcement Output
 */
export interface BudgetEnforcementOutput {
  budget_id: string;
  status: BudgetStatus;
  allowed: boolean;
  budget: {
    limit: number;
    period: TimeGranularity;
    currency: CurrencyCode;
  };
  usage: {
    current_spend: number;
    remaining: number;
    percentage_used: number;
  };
  thresholds: {
    warning_threshold: number;
    critical_threshold: number;
    current_threshold_level: 'none' | 'warning' | 'critical';
  };
  recommendations?: string[];
  enforcement_action?: 'none' | 'warn' | 'throttle' | 'block';
}

/**
 * ROI Estimation Input
 */
export interface ROIEstimationInput {
  request_id: string;
  scope: {
    user_id?: string;
    team_id?: string;
    project_id?: string;
    use_case?: string;
  };
  period: {
    start_date: string;
    end_date: string;
  };
  value_metrics?: {
    tasks_completed?: number;
    time_saved_hours?: number;
    revenue_attributed?: number;
    cost_savings?: number;
    custom_metrics?: Record<string, number>;
  };
}

/**
 * ROI Estimation Output
 */
export interface ROIEstimationOutput {
  roi_id: string;
  period: {
    start_date: string;
    end_date: string;
  };
  costs: {
    total_llm_cost: number;
    infrastructure_cost: number;
    total_cost: number;
    currency: CurrencyCode;
  };
  value: {
    estimated_value: number;
    value_sources: Array<{
      source: string;
      amount: number;
      confidence: number;
    }>;
  };
  roi_metrics: {
    roi_percentage: number;
    cost_per_task: number;
    value_per_dollar_spent: number;
    payback_period_days?: number;
  };
  benchmarks?: {
    industry_average_roi?: number;
    percentile_rank?: number;
  };
  recommendations?: string[];
}

/**
 * Cost-Performance Tradeoff Input
 */
export interface CostPerformanceTradeoffInput {
  request_id: string;
  current_config: {
    provider: string;
    model: string;
    parameters?: Record<string, unknown>;
  };
  workload_profile: {
    avg_input_tokens: number;
    avg_output_tokens: number;
    requests_per_day: number;
    latency_requirement_ms?: number;
    quality_requirement?: 'low' | 'medium' | 'high' | 'critical';
  };
  optimization_goal: 'minimize_cost' | 'maximize_performance' | 'balanced' | 'quality_first';
  constraints?: {
    max_cost_per_request?: number;
    max_latency_ms?: number;
    min_quality_score?: number;
  };
}

/**
 * Cost-Performance Tradeoff Output
 */
export interface CostPerformanceTradeoffOutput {
  analysis_id: string;
  current_performance: {
    cost_per_request: number;
    avg_latency_ms: number;
    quality_score: number;
    monthly_cost: number;
  };
  alternatives: Array<{
    provider: string;
    model: string;
    cost_per_request: number;
    estimated_latency_ms: number;
    quality_score: number;
    monthly_cost: number;
    cost_savings_percentage: number;
    performance_impact: string;
    recommendation_score: number;
  }>;
  recommended_config: {
    provider: string;
    model: string;
    rationale: string;
    expected_savings_monthly: number;
    expected_performance_change: string;
  };
  tradeoff_analysis: {
    cost_vs_quality_frontier: Array<{ cost: number; quality: number; config: string }>;
    cost_vs_latency_frontier: Array<{ cost: number; latency: number; config: string }>;
  };
}

/**
 * Base CostOps DecisionEvent
 */
export interface CostOpsDecisionEvent {
  event_id: string;
  agent_id: string;
  agent_version: string;
  decision_type: CostDecisionType;
  inputs_hash: string;
  confidence: number;
  execution_ref: {
    request_id: string;
    trace_id?: string;
    span_id?: string;
    environment: string;
    session_id?: string;
  };
  timestamp: string;
  metadata?: {
    cached?: boolean;
    processing_time_ms?: number;
    data_freshness_ms?: number;
    source?: string;
    [key: string]: unknown;
  };
}

/**
 * Cost Attribution DecisionEvent
 */
export interface CostAttributionDecisionEvent extends CostOpsDecisionEvent {
  decision_type: 'cost_attribution';
  inputs: CostAttributionInput;
  outputs: CostAttributionOutput;
}

/**
 * Cost Forecast DecisionEvent
 */
export interface CostForecastDecisionEvent extends CostOpsDecisionEvent {
  decision_type: 'cost_forecast';
  inputs: CostForecastInput;
  outputs: CostForecastOutput;
}

/**
 * Budget Enforcement DecisionEvent
 */
export interface BudgetEnforcementDecisionEvent extends CostOpsDecisionEvent {
  decision_type: 'budget_enforcement';
  inputs: BudgetEnforcementInput;
  outputs: BudgetEnforcementOutput;
}

/**
 * ROI Estimation DecisionEvent
 */
export interface ROIEstimationDecisionEvent extends CostOpsDecisionEvent {
  decision_type: 'roi_estimation';
  inputs: ROIEstimationInput;
  outputs: ROIEstimationOutput;
}

/**
 * Cost-Performance Tradeoff DecisionEvent
 */
export interface CostPerformanceTradeoffDecisionEvent extends CostOpsDecisionEvent {
  decision_type: 'cost_performance_tradeoff';
  inputs: CostPerformanceTradeoffInput;
  outputs: CostPerformanceTradeoffOutput;
}

/**
 * Union type for all CostOps DecisionEvents
 */
export type AnyCostOpsDecisionEvent =
  | CostAttributionDecisionEvent
  | CostForecastDecisionEvent
  | BudgetEnforcementDecisionEvent
  | ROIEstimationDecisionEvent
  | CostPerformanceTradeoffDecisionEvent;
