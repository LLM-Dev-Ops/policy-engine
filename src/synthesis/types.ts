/**
 * Executive Synthesis Types
 * Types for policy validation executive summaries
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type Recommendation = 'APPROVE' | 'DEFER' | 'REJECT';

export interface DeployReference {
  environment: string;
  timestamp: string;
  version?: string;
  commit_sha?: string;
}

export interface IterationMetrics {
  success_rate: number;
  failed_iterations: number;
  blocking_issues: BlockingIssue[];
  steps_executed: string[];
}

export interface BlockingIssue {
  type: 'deny_action' | 'conflicting_priorities' | 'missing_conditions' | 'validation_error' | 'security_risk';
  severity: RiskLevel;
  description: string;
  location?: string;
  rule_id?: string;
}

export interface ExecutiveSummary {
  deploy_reference: DeployReference;
  iteration_metrics: IterationMetrics;
  risk_level: RiskLevel;
  recommendation: Recommendation;
  rationale: string;
}

export interface PolicyCreateResult {
  policy_id: string;
  version: string;
  status: string;
  rules_count: number;
  validation_errors: string[];
  synthesis?: ExecutiveSummary;
}

export interface PolicyEditResult {
  policy_id: string;
  version: string;
  previous_version: string;
  changes_applied: string[];
  validation_errors: string[];
  synthesis?: ExecutiveSummary;
}

export interface PolicyToggleResult {
  policy_id: string;
  previous_status: string;
  new_status: string;
  affected_rules: number;
  synthesis?: ExecutiveSummary;
}

export interface PolicyDeleteResult {
  policy_id: string;
  deleted: boolean;
  synthesis?: ExecutiveSummary;
}
