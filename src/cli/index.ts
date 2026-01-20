#!/usr/bin/env node
/**
 * LLM-Policy-Engine CLI
 * Command-line interface for policy management and evaluation
 *
 * Executive Synthesis Integration:
 * - policy create: synthesis with conflict analysis and enforcement impact
 * - policy edit: synthesis with change tracking and impact projection
 * - policy enable: synthesis with rollback instructions
 * - policy disable: synthesis with rollback instructions
 * - policy dry-run: violation predictions without state change
 */
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { PolicyRepository } from '../db/models/policy-repository';
import { EvaluationRepository } from '../db/models/evaluation-repository';
import { PolicyEngine } from '../core/engine/policy-engine';
import { db } from '../db/client';
import { MigrationRunner } from '../db/migrate';
import { Policy, PolicyEvaluationRequest, EvaluationContext } from '../types/policy';
import { v4 as uuidv4 } from 'uuid';
import {
  createPolicy,
  updatePolicy,
  enablePolicy,
  disablePolicy,
  dryRunPolicy,
  validatePolicy as validatePolicyCmd,
} from '../commands/policy';
import {
  agentEvaluate,
  agentResolve,
  agentRoute,
  agentInfo,
  agentRegister,
} from '../commands/agent';
import {
  approvalEvaluate,
  approvalRoute,
  approvalResolve,
  approvalStatus,
  approvalInfo,
  approvalRegister,
} from '../commands/approval-routing';
import {
  ExecutiveSummary,
  DecisionPacket,
  PolicyDryRunResult,
} from '../synthesis';

const program = new Command();
const policyRepository = new PolicyRepository();
const evaluationRepository = new EvaluationRepository();
// Note: yamlParser, jsonParser, and validator are used directly in command modules now

/**
 * Format and output executive synthesis for CLI display
 */
function outputSynthesis(synthesis: ExecutiveSummary, label: string = 'Executive Synthesis'): void {
  console.log(`\n--- ${label} ---`);
  console.log(`Risk Level: ${synthesis.risk_level.toUpperCase()}`);
  console.log(`Recommendation: ${synthesis.recommendation}`);
  console.log(`Rationale: ${synthesis.rationale}`);

  if (synthesis.iteration_metrics.blocking_issues.length > 0) {
    console.log(`\nBlocking Issues (${synthesis.iteration_metrics.blocking_issues.length}):`);
    synthesis.iteration_metrics.blocking_issues.forEach((issue, idx) => {
      console.log(`  ${idx + 1}. [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}`);
      if (issue.rule_id) {
        console.log(`     Rule: ${issue.rule_id}`);
      }
    });
  }

  console.log(`\nSteps Executed: ${synthesis.iteration_metrics.steps_executed.join(' -> ')}`);
  console.log(`Success Rate: ${(synthesis.iteration_metrics.success_rate * 100).toFixed(1)}%`);
  console.log(`Environment: ${synthesis.deploy_reference.environment}`);
  console.log(`Timestamp: ${synthesis.deploy_reference.timestamp}`);
}

/**
 * Format and output decision packet for CLI display
 */
function outputDecisionPacket(packet: DecisionPacket): void {
  console.log('\n--- Decision Packet ---');

  // Conflict Analysis
  console.log(`\nConflict Analysis:`);
  console.log(`  Has Conflicts: ${packet.conflict_analysis.has_conflicts ? 'YES' : 'No'}`);
  console.log(`  Summary: ${packet.conflict_analysis.summary}`);
  if (packet.conflict_analysis.conflicts.length > 0) {
    console.log(`  Conflicts (${packet.conflict_analysis.conflicts.length}):`);
    packet.conflict_analysis.conflicts.forEach((conflict, idx) => {
      console.log(`    ${idx + 1}. [${conflict.severity.toUpperCase()}] ${conflict.conflict_type}`);
      console.log(`       ${conflict.description}`);
      if (conflict.resolution) {
        console.log(`       Resolution: ${conflict.resolution}`);
      }
    });
  }

  // Affected Resources
  console.log(`\nAffected Resource Count: ${packet.affected_resource_count}`);

  // Enforcement Impact
  console.log(`\nEnforcement Impact Projection:`);
  console.log(`  Impact Level: ${packet.enforcement_impact.impact_level.toUpperCase()}`);
  console.log(`  Description: ${packet.enforcement_impact.description}`);
  console.log(`  Confidence: ${(packet.enforcement_impact.confidence * 100).toFixed(0)}%`);
  console.log(`  Predictions (per hour):`);
  console.log(`    - Allowed: ~${packet.enforcement_impact.allowed_predictions}`);
  console.log(`    - Denied: ~${packet.enforcement_impact.denied_predictions}`);
  console.log(`    - Warned: ~${packet.enforcement_impact.warned_predictions}`);
  console.log(`    - Modified: ~${packet.enforcement_impact.modified_predictions}`);

  // Rollback Instructions (if present)
  if (packet.rollback_instructions) {
    console.log(`\nRollback Instructions:`);
    console.log(`  Previous Status: ${packet.rollback_instructions.previous_status}`);
    console.log(`  Rollback Command: ${packet.rollback_instructions.rollback_command}`);
    console.log(`  Safe Rollback Window: ${packet.rollback_instructions.safe_rollback_window}`);
    console.log(`  Verification Steps:`);
    packet.rollback_instructions.verification_steps.forEach((step, idx) => {
      console.log(`    ${idx + 1}. ${step}`);
    });
    if (packet.rollback_instructions.warnings.length > 0) {
      console.log(`  Warnings:`);
      packet.rollback_instructions.warnings.forEach((warning) => {
        console.log(`    ⚠️  ${warning}`);
      });
    }
  }
}

/**
 * Format and output dry-run results for CLI display
 */
function outputDryRunResults(result: PolicyDryRunResult): void {
  console.log('\n=== Policy Dry-Run Results ===');
  console.log(`Policy ID: ${result.policy_id}`);
  console.log(`Can Apply: ${result.can_apply ? 'YES' : 'NO'}`);

  if (result.validation_errors.length > 0) {
    console.log(`\nValidation Errors (${result.validation_errors.length}):`);
    result.validation_errors.forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err}`);
    });
  }

  if (result.violation_predictions.length > 0) {
    console.log(`\nViolation Predictions (${result.violation_predictions.length}):`);
    result.violation_predictions.forEach((vp, idx) => {
      console.log(`  ${idx + 1}. [${vp.risk_level.toUpperCase()}] ${vp.rule_name}`);
      console.log(`     Action: ${vp.predicted_action}`);
      console.log(`     Frequency: ${vp.estimated_frequency} (~${vp.estimated_affected_requests_per_hour}/hour)`);
      console.log(`     Trigger conditions: ${vp.sample_trigger_conditions.join(', ')}`);
    });
  }

  outputDecisionPacket(result.decision_packet);
  outputSynthesis(result.synthesis);
}

program
  .name('llm-policy')
  .description('LLM Policy Engine CLI - Manage and evaluate policies')
  .version('1.0.0');

// Policy management commands
const policyCommand = program.command('policy').description('Manage policies');

policyCommand
  .command('create')
  .description('Create a new policy from file (with executive synthesis)')
  .argument('<file>', 'Policy file (YAML or JSON)')
  .option('-c, --created-by <user>', 'User creating the policy')
  .option('--json', 'Output full result as JSON')
  .option('--no-synthesis', 'Disable synthesis output')
  .action(async (file: string, options) => {
    try {
      const result = await createPolicy(file, options.createdBy);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.validation_errors.length > 0) {
          console.error('Policy validation failed:');
          result.validation_errors.forEach((err) => console.error(`  - ${err}`));
          if (result.synthesis && options.synthesis !== false) {
            outputSynthesis(result.synthesis, 'Validation Synthesis');
          }
          await db.close();
          process.exit(1);
        }

        console.log(`Policy created successfully: ${result.policy_id}`);
        console.log(`  Version: ${result.version}`);
        console.log(`  Status: ${result.status}`);
        console.log(`  Rules: ${result.rules_count}`);

        if (result.synthesis && options.synthesis !== false) {
          outputSynthesis(result.synthesis, 'Create Synthesis');
        }
      }

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to create policy:', error);
      await db.close();
      process.exit(1);
    }
  });

policyCommand
  .command('update')
  .description('Update an existing policy (with executive synthesis)')
  .alias('edit')
  .argument('<id>', 'Policy ID')
  .argument('<file>', 'Policy file (YAML or JSON)')
  .option('--json', 'Output full result as JSON')
  .option('--no-synthesis', 'Disable synthesis output')
  .action(async (id: string, file: string, options) => {
    try {
      const result = await updatePolicy(id, file);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.validation_errors.length > 0) {
          console.error('Policy validation failed:');
          result.validation_errors.forEach((err) => console.error(`  - ${err}`));
          if (result.synthesis && options.synthesis !== false) {
            outputSynthesis(result.synthesis, 'Validation Synthesis');
          }
          await db.close();
          process.exit(1);
        }

        console.log(`Policy updated successfully: ${result.policy_id}`);
        console.log(`  Version: ${result.version} (was: ${result.previous_version})`);
        console.log(`  Changes: ${result.changes_applied.join(', ') || 'none'}`);

        if (result.synthesis && options.synthesis !== false) {
          outputSynthesis(result.synthesis, 'Edit Synthesis');
        }
      }

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to update policy:', error);
      await db.close();
      process.exit(1);
    }
  });

policyCommand
  .command('delete')
  .description('Delete a policy')
  .argument('<id>', 'Policy ID')
  .action(async (id: string) => {
    try {
      await policyRepository.delete(id);
      console.log(`Policy deleted successfully: ${id}`);

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to delete policy:', error);
      await db.close();
      process.exit(1);
    }
  });

policyCommand
  .command('list')
  .description('List all policies')
  .option('-n, --namespace <namespace>', 'Filter by namespace')
  .option('-s, --status <status>', 'Filter by status (active, draft, deprecated)')
  .action(async (options) => {
    try {
      let policies: Policy[];

      if (options.namespace) {
        policies = await policyRepository.findByNamespace(options.namespace);
      } else {
        policies = await policyRepository.findActive();
      }

      if (options.status) {
        policies = policies.filter((p) => p.status === options.status);
      }

      console.log(`Found ${policies.length} policies:\n`);
      policies.forEach((policy) => {
        console.log(`${policy.metadata.id}`);
        console.log(`  Name: ${policy.metadata.name}`);
        console.log(`  Namespace: ${policy.metadata.namespace}`);
        console.log(`  Version: ${policy.metadata.version}`);
        console.log(`  Status: ${policy.status}`);
        console.log(`  Priority: ${policy.metadata.priority || 0}`);
        console.log(`  Rules: ${policy.rules.length}`);
        console.log();
      });

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to list policies:', error);
      await db.close();
      process.exit(1);
    }
  });

policyCommand
  .command('get')
  .description('Get policy details')
  .argument('<id>', 'Policy ID')
  .option('-o, --output <format>', 'Output format (json, yaml)', 'json')
  .action(async (id: string, options) => {
    try {
      const policy = await policyRepository.findById(id);
      if (!policy) {
        console.error(`Policy not found: ${id}`);
        process.exit(1);
      }

      if (options.output === 'yaml') {
        const yaml = require('yaml');
        console.log(yaml.stringify(policy));
      } else {
        console.log(JSON.stringify(policy, null, 2));
      }

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to get policy:', error);
      await db.close();
      process.exit(1);
    }
  });

policyCommand
  .command('validate')
  .description('Validate a policy file without creating it (with synthesis)')
  .argument('<file>', 'Policy file (YAML or JSON)')
  .option('--json', 'Output full result as JSON')
  .option('--no-synthesis', 'Disable synthesis output')
  .action(async (file: string, options) => {
    try {
      const result = await validatePolicyCmd(file);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.valid) {
          console.log('Policy is valid');
          console.log(`  ID: ${result.policy.metadata.id}`);
          console.log(`  Name: ${result.policy.metadata.name}`);
          console.log(`  Rules: ${result.policy.rules.length}`);
        } else {
          console.error('Policy validation failed:');
          result.errors.forEach((err) => console.error(`  - ${err}`));
        }

        if (result.synthesis && options.synthesis !== false) {
          outputSynthesis(result.synthesis, 'Validation Synthesis');
        }
      }

      process.exit(result.valid ? 0 : 1);
    } catch (error) {
      console.error('Failed to validate policy:', error);
      process.exit(1);
    }
  });

policyCommand
  .command('enable')
  .description('Enable a policy (with rollback instructions in synthesis)')
  .argument('<id>', 'Policy ID')
  .option('--json', 'Output full result as JSON')
  .option('--no-synthesis', 'Disable synthesis output')
  .action(async (id: string, options) => {
    try {
      const result = await enablePolicy(id);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Policy enabled successfully: ${result.policy_id}`);
        console.log(`  Previous Status: ${result.previous_status}`);
        console.log(`  New Status: ${result.new_status}`);
        console.log(`  Affected Rules: ${result.affected_rules}`);

        if (result.decision_packet && options.synthesis !== false) {
          outputDecisionPacket(result.decision_packet);
        }

        if (result.synthesis && options.synthesis !== false) {
          outputSynthesis(result.synthesis, 'Enable Synthesis');
        }
      }

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to enable policy:', error);
      await db.close();
      process.exit(1);
    }
  });

policyCommand
  .command('disable')
  .description('Disable a policy (with rollback instructions in synthesis)')
  .argument('<id>', 'Policy ID')
  .option('--json', 'Output full result as JSON')
  .option('--no-synthesis', 'Disable synthesis output')
  .action(async (id: string, options) => {
    try {
      const result = await disablePolicy(id);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Policy disabled successfully: ${result.policy_id}`);
        console.log(`  Previous Status: ${result.previous_status}`);
        console.log(`  New Status: ${result.new_status}`);
        console.log(`  Affected Rules: ${result.affected_rules}`);

        if (result.decision_packet && options.synthesis !== false) {
          outputDecisionPacket(result.decision_packet);
        }

        if (result.synthesis && options.synthesis !== false) {
          outputSynthesis(result.synthesis, 'Disable Synthesis');
        }
      }

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to disable policy:', error);
      await db.close();
      process.exit(1);
    }
  });

policyCommand
  .command('dry-run')
  .description('Evaluate policy impact without state changes (violation predictions)')
  .argument('<file>', 'Policy file (YAML or JSON)')
  .option('--json', 'Output full result as JSON')
  .action(async (file: string, options) => {
    try {
      const result = await dryRunPolicy(file);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        outputDryRunResults(result);
      }

      await db.close();
      // Exit with non-zero if policy cannot be applied
      process.exit(result.can_apply ? 0 : 1);
    } catch (error) {
      console.error('Failed to run policy dry-run:', error);
      await db.close();
      process.exit(1);
    }
  });

// Evaluation commands
const evalCommand = program.command('evaluate').description('Evaluate policies');

evalCommand
  .command('run')
  .description('Evaluate a request against policies')
  .option('-c, --context <file>', 'Context JSON file')
  .option('-p, --policies <ids>', 'Comma-separated policy IDs')
  .option('-t, --trace', 'Enable trace mode')
  .option('-d, --dry-run', 'Dry run mode')
  .action(async (options) => {
    try {
      let context: EvaluationContext;

      if (options.context) {
        const contextContent = readFileSync(options.context, 'utf-8');
        context = JSON.parse(contextContent);
      } else {
        console.error('Context file required (-c, --context)');
        process.exit(1);
      }

      const policies = await policyRepository.findActive();
      const engine = new PolicyEngine(policies);

      const request: PolicyEvaluationRequest = {
        requestId: uuidv4(),
        context,
        policies: options.policies ? options.policies.split(',') : undefined,
        trace: options.trace || false,
        dryRun: options.dryRun || false,
      };

      const response = await engine.evaluate(request);

      console.log('Evaluation Result:');
      console.log(JSON.stringify(response, null, 2));

      if (!options.dryRun) {
        await evaluationRepository.log(request, response);
        console.log('\nEvaluation logged to database');
      }

      await db.close();
      process.exit(response.decision.allowed ? 0 : 1);
    } catch (error) {
      console.error('Evaluation failed:', error);
      await db.close();
      process.exit(1);
    }
  });

evalCommand
  .command('history')
  .description('View evaluation history')
  .option('-r, --request-id <id>', 'Filter by request ID')
  .option('-p, --policy-id <id>', 'Filter by policy ID')
  .option('-l, --limit <number>', 'Limit results', '20')
  .action(async (options) => {
    try {
      const filters: any = {
        limit: parseInt(options.limit, 10),
      };

      if (options.requestId) {
        const evaluation = await evaluationRepository.findByRequestId(options.requestId);
        if (evaluation) {
          console.log(JSON.stringify(evaluation, null, 2));
        } else {
          console.log('Evaluation not found');
        }
      } else if (options.policyId) {
        const evaluations = await evaluationRepository.findByPolicyId(
          options.policyId,
          filters.limit,
        );
        console.log(`Found ${evaluations.length} evaluations:\n`);
        console.log(JSON.stringify(evaluations, null, 2));
      } else {
        const evaluations = await evaluationRepository.find(filters);
        console.log(`Found ${evaluations.length} evaluations:\n`);
        console.log(JSON.stringify(evaluations, null, 2));
      }

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to get evaluation history:', error);
      await db.close();
      process.exit(1);
    }
  });

evalCommand
  .command('stats')
  .description('View evaluation statistics')
  .option('-d, --days <number>', 'Days to look back', '7')
  .action(async (options) => {
    try {
      const days = parseInt(options.days, 10);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = await evaluationRepository.getStats(startDate);

      console.log('Evaluation Statistics:');
      console.log(`  Total Evaluations: ${stats.total}`);
      console.log(`  Allowed: ${stats.allowed} (${((stats.allowed / stats.total) * 100).toFixed(1)}%)`);
      console.log(`  Denied: ${stats.denied} (${((stats.denied / stats.total) * 100).toFixed(1)}%)`);
      console.log(`  Warned: ${stats.warned} (${((stats.warned / stats.total) * 100).toFixed(1)}%)`);
      console.log(`  Modified: ${stats.modified} (${((stats.modified / stats.total) * 100).toFixed(1)}%)`);
      console.log(`  Avg Evaluation Time: ${stats.avgEvaluationTimeMs.toFixed(2)}ms`);
      console.log(`  Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to get evaluation stats:', error);
      await db.close();
      process.exit(1);
    }
  });

// Database commands
const dbCommand = program.command('db').description('Database management');

dbCommand
  .command('migrate')
  .description('Run database migrations')
  .action(async () => {
    try {
      const migrationRunner = new MigrationRunner();
      await migrationRunner.up();
      console.log('Database migrations completed successfully');

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Migration failed:', error);
      await db.close();
      process.exit(1);
    }
  });

dbCommand
  .command('migrate:status')
  .description('Check migration status')
  .action(async () => {
    try {
      const migrationRunner = new MigrationRunner();
      const status = await migrationRunner.status();

      console.log('\nApplied migrations:');
      status.applied.forEach((m) => console.log(`  ✓ ${m.version} - ${m.name}`));

      console.log('\nPending migrations:');
      status.pending.forEach((m) => console.log(`  ○ ${m.version} - ${m.name}`));

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to get migration status:', error);
      await db.close();
      process.exit(1);
    }
  });

dbCommand
  .command('migrate:rollback')
  .description('Rollback last migration')
  .action(async () => {
    try {
      const migrationRunner = new MigrationRunner();
      await migrationRunner.down();
      console.log('Migration rolled back successfully');

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Rollback failed:', error);
      await db.close();
      process.exit(1);
    }
  });

// Agent commands - Policy Enforcement Agent
const agentCommand = program.command('agent').description('Policy Enforcement Agent commands');

agentCommand
  .command('evaluate')
  .description('Evaluate a request against policy rules')
  .requiredOption('-c, --context <file|json>', 'Context JSON file or inline JSON')
  .option('-r, --request-id <id>', 'Request ID (auto-generated if not provided)')
  .option('-p, --policies <ids>', 'Comma-separated policy IDs to evaluate')
  .option('-d, --dry-run', 'Dry run mode (no side effects)')
  .option('-t, --trace', 'Enable trace mode for debugging')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await agentEvaluate({
      context: options.context,
      requestId: options.requestId,
      policies: options.policies,
      dryRun: options.dryRun,
      trace: options.trace,
      json: options.json,
    });
  });

agentCommand
  .command('resolve')
  .description('Resolve constraint conflicts for a given context')
  .requiredOption('-c, --context <file|json>', 'Context JSON file or inline JSON')
  .option('-r, --request-id <id>', 'Request ID')
  .option('-p, --policies <ids>', 'Comma-separated policy IDs')
  .option('-d, --dry-run', 'Dry run mode')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await agentResolve({
      context: options.context,
      requestId: options.requestId,
      policies: options.policies,
      dryRun: options.dryRun,
      trace: true,
      json: options.json,
    });
  });

agentCommand
  .command('route')
  .description('Route a decision to appropriate enforcement layers')
  .requiredOption('-c, --context <file|json>', 'Context JSON file or inline JSON')
  .option('-r, --request-id <id>', 'Request ID')
  .option('-p, --policies <ids>', 'Comma-separated policy IDs')
  .option('-d, --dry-run', 'Dry run mode')
  .option('-t, --trace', 'Enable trace mode')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await agentRoute({
      context: options.context,
      requestId: options.requestId,
      policies: options.policies,
      dryRun: options.dryRun,
      trace: options.trace,
      json: options.json,
    });
  });

agentCommand
  .command('info')
  .description('Get agent registration information')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await agentInfo({ json: options.json });
  });

agentCommand
  .command('register')
  .description('Register agent with ruvector-service')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await agentRegister({ json: options.json });
  });

// Approval Routing Agent commands
const approvalCommand = program
  .command('approval')
  .description('Approval Routing Agent commands - manage approval workflows');

approvalCommand
  .command('evaluate')
  .description('Evaluate approval requirements for an action')
  .requiredOption('-a, --action-type <type>', 'Action type')
  .requiredOption('--resource-id <id>', 'Resource ID')
  .requiredOption('--resource-type <type>', 'Resource type')
  .requiredOption('-o, --operation <op>', 'Operation (create, read, update, delete, execute)')
  .requiredOption('--requester <file|json>', 'Requester JSON file or inline JSON')
  .option('-r, --request-id <id>', 'Request ID')
  .option('--rules <rules>', 'Comma-separated approval rule IDs')
  .option('-p, --priority <level>', 'Priority (low, normal, high, critical, emergency)')
  .option('-c, --context <file|json>', 'Additional context JSON')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await approvalEvaluate({
      requestId: options.requestId,
      actionType: options.actionType,
      resourceId: options.resourceId,
      resourceType: options.resourceType,
      operation: options.operation,
      requester: options.requester,
      rules: options.rules,
      priority: options.priority,
      context: options.context,
      json: options.json,
    });
  });

approvalCommand
  .command('route')
  .description('Route an action to appropriate approval workflow')
  .requiredOption('-a, --action-type <type>', 'Action type')
  .requiredOption('--resource-id <id>', 'Resource ID')
  .requiredOption('--resource-type <type>', 'Resource type')
  .requiredOption('-o, --operation <op>', 'Operation (create, read, update, delete, execute)')
  .requiredOption('--requester <file|json>', 'Requester JSON file or inline JSON')
  .option('-r, --request-id <id>', 'Request ID')
  .option('--rules <rules>', 'Comma-separated approval rule IDs')
  .option('-p, --priority <level>', 'Priority (low, normal, high, critical, emergency)')
  .option('-c, --context <file|json>', 'Additional context JSON')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await approvalRoute({
      requestId: options.requestId,
      actionType: options.actionType,
      resourceId: options.resourceId,
      resourceType: options.resourceType,
      operation: options.operation,
      requester: options.requester,
      rules: options.rules,
      priority: options.priority,
      context: options.context,
      json: options.json,
    });
  });

approvalCommand
  .command('resolve')
  .description('Resolve approval conflicts for an action')
  .requiredOption('-a, --action-type <type>', 'Action type')
  .requiredOption('--resource-id <id>', 'Resource ID')
  .requiredOption('--resource-type <type>', 'Resource type')
  .requiredOption('-o, --operation <op>', 'Operation (create, read, update, delete, execute)')
  .requiredOption('--requester <file|json>', 'Requester JSON file or inline JSON')
  .option('-r, --request-id <id>', 'Request ID')
  .option('--rules <rules>', 'Comma-separated approval rule IDs')
  .option('-p, --priority <level>', 'Priority (low, normal, high, critical, emergency)')
  .option('-c, --context <file|json>', 'Additional context JSON')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await approvalResolve({
      requestId: options.requestId,
      actionType: options.actionType,
      resourceId: options.resourceId,
      resourceType: options.resourceType,
      operation: options.operation,
      requester: options.requester,
      rules: options.rules,
      priority: options.priority,
      context: options.context,
      json: options.json,
    });
  });

approvalCommand
  .command('status <request-id>')
  .description('Get status of an approval request')
  .option('--json', 'Output as JSON')
  .action(async (requestId: string, options: { json?: boolean }) => {
    await approvalStatus(requestId, { json: options.json });
  });

approvalCommand
  .command('info')
  .description('Get Approval Routing Agent registration information')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await approvalInfo({ json: options.json });
  });

approvalCommand
  .command('register')
  .description('Register Approval Routing Agent with ruvector-service')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await approvalRegister({ json: options.json });
  });

// Server commands
program
  .command('server:start')
  .description('Start the API server')
  .option('-p, --port <port>', 'Server port')
  .action(async (options) => {
    try {
      const { startAPIServer } = await import('../api/server');
      await startAPIServer(options.port ? parseInt(options.port, 10) : undefined);
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

program
  .command('grpc:start')
  .description('Start the gRPC server')
  .option('-p, --port <port>', 'gRPC server port')
  .action(async (options) => {
    try {
      const { startGRPCServer } = await import('../grpc/server');
      await startGRPCServer(options.port ? parseInt(options.port, 10) : undefined);
    } catch (error) {
      console.error('Failed to start gRPC server:', error);
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);
