# LLM-CostOps CLI Commands

All LLM-CostOps agents are accessible via the `agentics-cli` tool.

## Prerequisites

```bash
# Install agentics-cli (if not already installed)
npm install -g @agentics/cli

# Configure CLI
agentics config set costops.url https://llm-costops-<hash>.run.app
```

## Available Commands

### Cost Attribution

Attribute costs to users, teams, and projects.

```bash
# Basic cost attribution
agentics costops analyze \
  --provider openai \
  --model gpt-4-turbo \
  --input-tokens 1000 \
  --output-tokens 500 \
  --user-id user123 \
  --team-id team456

# With metadata
agentics costops analyze \
  --provider anthropic \
  --model claude-3-sonnet \
  --input-tokens 2000 \
  --output-tokens 1000 \
  --project-id proj789 \
  --metadata '{"session_id": "abc123"}'

# Output format
agentics costops analyze --provider openai --model gpt-4o --input-tokens 500 --output-tokens 200 --format json
```

**Expected Output:**
```json
{
  "success": true,
  "event_id": "costops-abc123",
  "outputs": {
    "total_cost": 0.0175,
    "currency": "USD",
    "breakdown": {
      "input_cost": 0.005,
      "output_cost": 0.015,
      "base_cost": 0.02,
      "markup": 0.002
    }
  }
}
```

### Cost Forecasting

Forecast future LLM spend.

```bash
# 30-day forecast
agentics costops forecast \
  --start-date 2024-02-01 \
  --end-date 2024-03-01 \
  --granularity daily \
  --team-id team456

# Quarterly forecast with confidence level
agentics costops forecast \
  --start-date 2024-01-01 \
  --end-date 2024-03-31 \
  --granularity monthly \
  --confidence-level 90 \
  --project-id proj789

# User-level forecast
agentics costops forecast \
  --start-date 2024-02-01 \
  --end-date 2024-02-28 \
  --user-id user123 \
  --historical-window 60
```

**Expected Output:**
```json
{
  "success": true,
  "event_id": "costops-def456",
  "outputs": {
    "summary": {
      "total_predicted_cost": 1250.00,
      "average_daily_cost": 41.67,
      "trend": "increasing",
      "trend_percentage": 12.5
    }
  }
}
```

### Budget Enforcement

Check and enforce budget constraints.

```bash
# Check team budget
agentics costops inspect \
  --type budget \
  --team-id team456

# Pre-request budget check
agentics costops inspect \
  --type budget \
  --user-id user123 \
  --estimated-cost 0.50 \
  --check-type pre_request

# Project budget status
agentics costops inspect \
  --type budget \
  --project-id proj789 \
  --budget-id budget-monthly-prod
```

**Expected Output:**
```json
{
  "success": true,
  "event_id": "costops-ghi789",
  "outputs": {
    "status": "warning",
    "allowed": true,
    "usage": {
      "current_spend": 850.00,
      "remaining": 150.00,
      "percentage_used": 85.0
    },
    "enforcement_action": "warn"
  }
}
```

### ROI Estimation

Calculate return on investment metrics.

```bash
# Basic ROI calculation
agentics costops analyze \
  --type roi \
  --start-date 2024-01-01 \
  --end-date 2024-01-31 \
  --team-id team456

# With value metrics
agentics costops analyze \
  --type roi \
  --start-date 2024-01-01 \
  --end-date 2024-01-31 \
  --project-id proj789 \
  --tasks-completed 500 \
  --time-saved-hours 100 \
  --cost-savings 5000

# Full ROI with custom metrics
agentics costops analyze \
  --type roi \
  --start-date 2024-01-01 \
  --end-date 2024-01-31 \
  --use-case "customer-support" \
  --revenue-attributed 25000 \
  --custom-metrics '{"tickets_resolved": 1500}'
```

**Expected Output:**
```json
{
  "success": true,
  "event_id": "costops-jkl012",
  "outputs": {
    "roi_metrics": {
      "roi_percentage": 312.5,
      "cost_per_task": 0.025,
      "value_per_dollar_spent": 4.125
    },
    "benchmarks": {
      "industry_average_roi": 200,
      "percentile_rank": 75
    }
  }
}
```

### Cost-Performance Tradeoff

Analyze model alternatives and optimize configuration.

```bash
# Analyze current configuration
agentics costops analyze \
  --type tradeoff \
  --provider openai \
  --model gpt-4-turbo \
  --avg-input-tokens 1000 \
  --avg-output-tokens 500 \
  --requests-per-day 1000 \
  --optimization-goal balanced

# Minimize cost with constraints
agentics costops analyze \
  --type tradeoff \
  --provider anthropic \
  --model claude-3-opus \
  --avg-input-tokens 2000 \
  --avg-output-tokens 1000 \
  --requests-per-day 500 \
  --optimization-goal minimize_cost \
  --max-latency-ms 2000 \
  --min-quality-score 0.85

# Quality-first optimization
agentics costops analyze \
  --type tradeoff \
  --provider openai \
  --model gpt-3.5-turbo \
  --avg-input-tokens 500 \
  --avg-output-tokens 200 \
  --requests-per-day 5000 \
  --quality-requirement high \
  --optimization-goal quality_first
```

**Expected Output:**
```json
{
  "success": true,
  "event_id": "costops-mno345",
  "outputs": {
    "recommended_config": {
      "provider": "anthropic",
      "model": "claude-3.5-sonnet",
      "rationale": "Switching to claude-3.5-sonnet provides 45.2% cost savings with comparable performance.",
      "expected_savings_monthly": 450.00
    }
  }
}
```

## Configuration

### Environment Variables

The CLI resolves service URL dynamically:

```bash
# Set via environment
export AGENTICS_COSTOPS_URL=https://llm-costops-xyz.run.app

# Or via CLI config
agentics config set costops.url https://llm-costops-xyz.run.app
agentics config set costops.timeout 30000
```

### Output Formats

```bash
# JSON output (default)
agentics costops analyze ... --format json

# Table output
agentics costops analyze ... --format table

# Quiet output (event_id only)
agentics costops analyze ... --format quiet
```

## Health Check

```bash
# Check service health
agentics costops health

# Expected output:
# {
#   "status": "healthy",
#   "service": "llm-costops",
#   "version": "1.0.0"
# }
```

## Error Handling

```bash
# Verbose error output
agentics costops analyze ... --verbose

# Debug mode
agentics costops analyze ... --debug
```
