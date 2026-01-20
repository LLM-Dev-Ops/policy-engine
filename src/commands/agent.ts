/**
 * Agent CLI Commands
 *
 * CLI commands for invoking the Policy Enforcement Agent.
 *
 * Commands:
 * - agent evaluate: Evaluate a request against policies
 * - agent resolve: Resolve constraint conflicts
 * - agent route: Route decision to enforcement layers
 * - agent info: Get agent registration information
 * - agent register: Register agent with ruvector-service
 */
import { readFileSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PolicyEnforcementAgent } from '../agents/policy-enforcement';
import { PolicyEnforcementInput, DecisionEvent } from '../agents/contracts';
import { PolicyRepository } from '../db/models/policy-repository';
import { ruvectorServiceClient } from '../integrations/ruvector-service';
import { db } from '../db/client';

/**
 * CLI Options for agent commands
 */
export interface AgentCommandOptions {
  context?: string;
  requestId?: string;
  policies?: string;
  dryRun?: boolean;
  trace?: boolean;
  json?: boolean;
}

/**
 * Load context from file or JSON string
 */
function loadContext(contextArg: string): PolicyEnforcementInput['context'] {
  // Try as file path first
  if (existsSync(contextArg)) {
    const content = readFileSync(contextArg, 'utf-8');
    return JSON.parse(content);
  }

  // Try as JSON string
  try {
    return JSON.parse(contextArg);
  } catch {
    throw new Error(
      `Context must be a valid JSON file path or JSON string. Got: ${contextArg}`
    );
  }
}

/**
 * Format DecisionEvent for CLI output
 */
function formatDecisionEvent(event: DecisionEvent, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(event, null, 2));
    return;
  }

  console.log('\n=== Policy Enforcement Decision ===');
  console.log(`Event ID: ${event.event_id}`);
  console.log(`Agent: ${event.agent_id} v${event.agent_version}`);
  console.log(`Decision Type: ${event.decision_type}`);
  console.log(`Timestamp: ${event.timestamp}`);

  console.log('\n--- Output ---');
  console.log(`Decision: ${event.outputs.decision.toUpperCase()}`);
  console.log(`Allowed: ${event.outputs.allowed ? 'YES' : 'NO'}`);
  if (event.outputs.reason) {
    console.log(`Reason: ${event.outputs.reason}`);
  }
  console.log(`Evaluation Time: ${event.outputs.evaluation_time_ms.toFixed(2)}ms`);

  if (event.outputs.matched_policies.length > 0) {
    console.log(`\nMatched Policies: ${event.outputs.matched_policies.join(', ')}`);
  }
  if (event.outputs.matched_rules.length > 0) {
    console.log(`Matched Rules: ${event.outputs.matched_rules.join(', ')}`);
  }

  if (event.outputs.approval_requirements) {
    console.log('\n--- Approval Required ---');
    console.log(`Approvers: ${event.outputs.approval_requirements.approvers.join(', ')}`);
    console.log(`Timeout: ${event.outputs.approval_requirements.timeout_seconds}s`);
  }

  if (event.outputs.modifications) {
    console.log('\n--- Modifications ---');
    console.log(JSON.stringify(event.outputs.modifications, null, 2));
  }

  console.log('\n--- Confidence & Constraints ---');
  console.log(`Confidence: ${(event.confidence * 100).toFixed(1)}%`);
  console.log(`Constraints Applied: ${event.constraints_applied.length}`);

  if (event.constraints_applied.length > 0) {
    event.constraints_applied.forEach((c, i) => {
      console.log(
        `  ${i + 1}. [${c.severity.toUpperCase()}] ${c.constraint_name} - ${c.satisfied ? 'SATISFIED' : 'VIOLATED'}`
      );
      if (c.reason) {
        console.log(`     Reason: ${c.reason}`);
      }
    });
  }

  console.log('\n--- Execution Reference ---');
  console.log(`Request ID: ${event.execution_ref.request_id}`);
  console.log(`Environment: ${event.execution_ref.environment}`);
  if (event.execution_ref.trace_id) {
    console.log(`Trace ID: ${event.execution_ref.trace_id}`);
  }

  if (event.metadata) {
    console.log('\n--- Metadata ---');
    console.log(`Mode: ${event.metadata.mode || 'real-time'}`);
    console.log(`Cached: ${event.metadata.cached ? 'Yes' : 'No'}`);
  }
}

/**
 * Create and load agent with active policies
 */
async function createAgent(): Promise<PolicyEnforcementAgent> {
  const repository = new PolicyRepository();
  const policies = await repository.findActive();
  return new PolicyEnforcementAgent(policies);
}

/**
 * Agent Evaluate Command
 *
 * Evaluate a request against policy rules.
 */
export async function agentEvaluate(options: AgentCommandOptions): Promise<void> {
  try {
    if (!options.context) {
      console.error('Error: --context is required');
      console.error('Usage: llm-policy agent evaluate --context <file|json> [options]');
      process.exit(1);
    }

    const context = loadContext(options.context);
    const requestId = options.requestId || uuidv4();
    const policyIds = options.policies?.split(',').map((s) => s.trim());

    const input: PolicyEnforcementInput = {
      request_id: requestId,
      context,
      policy_ids: policyIds,
      dry_run: options.dryRun,
      trace: options.trace,
    };

    const agent = await createAgent();
    const decisionEvent = await agent.evaluate(input);

    formatDecisionEvent(decisionEvent, options.json || false);

    await db.close();
    process.exit(decisionEvent.outputs.allowed ? 0 : 1);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    await db.close();
    process.exit(1);
  }
}

/**
 * Agent Resolve Command
 *
 * Resolve constraint conflicts for a given context.
 */
export async function agentResolve(options: AgentCommandOptions): Promise<void> {
  try {
    if (!options.context) {
      console.error('Error: --context is required');
      console.error('Usage: llm-policy agent resolve --context <file|json> [options]');
      process.exit(1);
    }

    const context = loadContext(options.context);
    const requestId = options.requestId || uuidv4();
    const policyIds = options.policies?.split(',').map((s) => s.trim());

    const input: PolicyEnforcementInput = {
      request_id: requestId,
      context,
      policy_ids: policyIds,
      dry_run: options.dryRun,
      trace: true, // Always enable trace for resolve
    };

    const agent = await createAgent();
    const decisionEvent = await agent.resolve(input);

    formatDecisionEvent(decisionEvent, options.json || false);

    await db.close();
    process.exit(decisionEvent.outputs.allowed ? 0 : 1);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    await db.close();
    process.exit(1);
  }
}

/**
 * Agent Route Command
 *
 * Route a decision to appropriate enforcement layers.
 */
export async function agentRoute(options: AgentCommandOptions): Promise<void> {
  try {
    if (!options.context) {
      console.error('Error: --context is required');
      console.error('Usage: llm-policy agent route --context <file|json> [options]');
      process.exit(1);
    }

    const context = loadContext(options.context);
    const requestId = options.requestId || uuidv4();
    const policyIds = options.policies?.split(',').map((s) => s.trim());

    const input: PolicyEnforcementInput = {
      request_id: requestId,
      context,
      policy_ids: policyIds,
      dry_run: options.dryRun,
      trace: options.trace,
    };

    const agent = await createAgent();
    const decisionEvent = await agent.route(input);

    // Add routing targets to output
    if (!options.json) {
      console.log('\n--- Routing Targets ---');
      const targets = (decisionEvent.metadata as any)?.routing_targets || [];
      targets.forEach((target: string, i: number) => {
        console.log(`  ${i + 1}. ${target}`);
      });
    }

    formatDecisionEvent(decisionEvent, options.json || false);

    await db.close();
    process.exit(decisionEvent.outputs.allowed ? 0 : 1);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    await db.close();
    process.exit(1);
  }
}

/**
 * Agent Info Command
 *
 * Get agent registration information.
 */
export async function agentInfo(options: { json?: boolean }): Promise<void> {
  const registration = PolicyEnforcementAgent.getRegistration();

  if (options.json) {
    console.log(JSON.stringify(registration, null, 2));
    return;
  }

  console.log('\n=== Policy Enforcement Agent ===');
  console.log(`Agent ID: ${registration.agent_id}`);
  console.log(`Version: ${registration.agent_version}`);
  console.log(`Type: ${registration.agent_type}`);
  console.log(`Name: ${registration.agent_name}`);
  console.log(`\nDescription:\n  ${registration.description}`);

  console.log('\n--- CLI Contract ---');
  console.log(`Command: ${registration.cli_contract.command}`);
  console.log(`Subcommands: ${registration.cli_contract.subcommands.join(', ')}`);
  console.log(`Required Flags: ${registration.cli_contract.required_flags.join(', ')}`);
  console.log(`Optional Flags: ${registration.cli_contract.optional_flags.join(', ')}`);

  console.log('\n--- Consumers ---');
  registration.consumers.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));

  console.log('\n--- Non-Responsibilities ---');
  registration.non_responsibilities.forEach((nr, i) => console.log(`  ${i + 1}. ${nr}`));

  console.log('\n--- Failure Modes ---');
  registration.failure_modes.forEach((fm, i) => console.log(`  ${i + 1}. ${fm}`));

  console.log(`\nRegistered At: ${registration.registered_at}`);
}

/**
 * Agent Register Command
 *
 * Register agent with ruvector-service.
 */
export async function agentRegister(options: { json?: boolean }): Promise<void> {
  try {
    const registration = PolicyEnforcementAgent.getRegistration();
    const ack = await ruvectorServiceClient.registerAgent(registration);

    if (options.json) {
      console.log(JSON.stringify(ack, null, 2));
    } else {
      if (ack.registered) {
        console.log('Agent registered successfully');
        console.log(`  Agent ID: ${ack.agent_id}`);
      } else {
        console.error('Agent registration failed');
        console.error(`  Error: ${ack.error}`);
      }
    }

    process.exit(ack.registered ? 0 : 1);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
