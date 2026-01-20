/**
 * Approval Routing CLI Commands
 *
 * CLI commands for invoking the Approval Routing Agent.
 *
 * Commands:
 * - approval evaluate: Evaluate approval requirements for an action
 * - approval route: Route approval to appropriate approvers
 * - approval resolve: Resolve approval conflicts
 * - approval status: Check approval status for a request
 * - approval info: Get agent registration information
 * - approval register: Register agent with ruvector-service
 */
import { readFileSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ApprovalRoutingAgent } from '../agents/approval-routing';
import {
  ApprovalRoutingInput,
  ApprovalDecisionEvent,
  ApprovalRequester,
  ApprovalPriority,
} from '../agents/contracts/approval-routing';
import { ruvectorServiceClient } from '../integrations/ruvector-service';

/**
 * CLI Options for approval routing commands
 */
export interface ApprovalRoutingCommandOptions {
  /** Type of action being requested */
  actionType?: string;
  /** Identifier of the resource being acted upon */
  resourceId?: string;
  /** Type of resource (e.g., model, deployment, budget) */
  resourceType?: string;
  /** Operation being performed (e.g., create, update, delete, execute) */
  operation?: string;
  /** Requester info as JSON file path or JSON string */
  requester?: string;
  /** Priority level for the approval request */
  priority?: ApprovalPriority;
  /** Comma-separated approval rule IDs to evaluate */
  rules?: string;
  /** Request ID for tracking */
  requestId?: string;
  /** Output as JSON */
  json?: boolean;
  /** Additional context as JSON file or string */
  context?: string;
}

/**
 * Load context from file or JSON string
 */
function loadContext<T>(contextArg: string): T {
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
 * Load requester information from file or JSON string
 */
function loadRequester(requesterArg: string): ApprovalRequester {
  const data = loadContext<Partial<ApprovalRequester>>(requesterArg);

  // Validate required fields
  if (!data.id || !data.email || !data.roles || !data.department) {
    throw new Error(
      'Requester must include: id, email, roles (array), and department'
    );
  }

  return {
    id: data.id,
    email: data.email,
    roles: data.roles,
    department: data.department,
    manager_id: data.manager_id,
    cost_center: data.cost_center,
  };
}

/**
 * Format ApprovalDecisionEvent for CLI output
 */
function formatApprovalDecisionEvent(
  event: ApprovalDecisionEvent,
  json: boolean
): void {
  if (json) {
    console.log(JSON.stringify(event, null, 2));
    return;
  }

  console.log('\n=== Approval Routing Decision ===');
  console.log(`Event ID: ${event.event_id}`);
  console.log(`Agent: ${event.agent_id} v${event.agent_version}`);
  console.log(`Decision Type: ${event.decision_type}`);
  console.log(`Timestamp: ${event.timestamp}`);

  console.log('\n--- Decision ---');
  console.log(`Outcome: ${event.outputs.decision.toUpperCase().replace(/_/g, ' ')}`);
  console.log(`Confidence: ${(event.confidence * 100).toFixed(1)}%`);
  console.log(`Evaluation Time: ${event.outputs.evaluation_time_ms.toFixed(2)}ms`);

  // Required approvers
  if (event.outputs.required_approvers.length > 0) {
    console.log('\n--- Required Approvers ---');
    event.outputs.required_approvers.forEach((approver, i) => {
      console.log(`  ${i + 1}. ${approver.name} (${approver.role})`);
      console.log(`     Email: ${approver.email}`);
      if (approver.delegate_id) {
        console.log(`     Delegate: ${approver.delegate_id}`);
      }
    });
  } else if (event.outputs.decision === 'auto_approved') {
    console.log('\n--- Auto-Approved ---');
    if (event.outputs.routing_metadata.auto_approve_reason) {
      console.log(`  Reason: ${event.outputs.routing_metadata.auto_approve_reason}`);
    }
  }

  // Approval chain steps
  if (event.outputs.approval_chain.length > 0) {
    console.log('\n--- Approval Chain ---');
    event.outputs.approval_chain.forEach((step) => {
      console.log(`  Step ${step.step_order}: ${step.step_name || 'Unnamed'}`);
      console.log(`    Type: ${step.step_type}`);
      console.log(`    Required Approvals: ${step.required_approvals}`);
      console.log(`    Timeout: ${step.timeout_seconds}s`);
      console.log(`    Approvers: ${step.approvers.map((a) => a.name).join(', ') || 'None assigned'}`);
      if (step.instructions) {
        console.log(`    Instructions: ${step.instructions}`);
      }
    });
  }

  // Timeout and escalation
  console.log('\n--- Timeout & Escalation ---');
  console.log(`Total Timeout: ${event.outputs.timeout_seconds}s`);
  console.log(`Justification Required: ${event.outputs.justification_required ? 'Yes' : 'No'}`);

  if (event.outputs.escalation_path.length > 0) {
    console.log('\n  Escalation Path:');
    event.outputs.escalation_path.forEach((level) => {
      console.log(`    Level ${level.level}: After ${level.timeout_seconds}s`);
      console.log(`      Approvers: ${level.approvers.map((a) => a.name).join(', ')}`);
      if (level.message) {
        console.log(`      Message: ${level.message}`);
      }
    });
  }

  // Routing metadata
  console.log('\n--- Routing Metadata ---');
  const metadata = event.outputs.routing_metadata;
  console.log(`Rules Evaluated: ${metadata.rules_evaluated.length}`);
  console.log(`Rules Matched: ${metadata.rules_matched.length}`);
  if (metadata.rules_matched.length > 0) {
    console.log(`  Matched: ${metadata.rules_matched.join(', ')}`);
  }
  if (metadata.risk_score !== undefined) {
    console.log(`Risk Score: ${metadata.risk_score}/100`);
  }
  if (metadata.compliance_tags && metadata.compliance_tags.length > 0) {
    console.log(`Compliance Tags: ${metadata.compliance_tags.join(', ')}`);
  }

  // Rules applied
  if (event.rules_applied.length > 0) {
    console.log('\n--- Rules Applied ---');
    event.rules_applied.forEach((rule, i) => {
      console.log(`  ${i + 1}. [${rule.rule_id}] ${rule.rule_name}`);
      if (rule.description) {
        console.log(`     ${rule.description}`);
      }
      console.log(`     Priority: ${rule.priority}`);
      console.log(`     Required Approvers: ${rule.required_approvers}`);
      console.log(`     Timeout: ${rule.timeout_seconds}s`);
    });
  }

  // Execution reference
  console.log('\n--- Execution Reference ---');
  console.log(`Request ID: ${event.execution_ref.request_id}`);
  console.log(`Environment: ${event.execution_ref.environment}`);
  if (event.execution_ref.trace_id) {
    console.log(`Trace ID: ${event.execution_ref.trace_id}`);
  }

  // Metadata
  if (event.metadata) {
    console.log('\n--- Metadata ---');
    console.log(`Mode: ${event.metadata.mode || 'real-time'}`);
    console.log(`Cached: ${event.metadata.cached ? 'Yes' : 'No'}`);
    if (event.metadata.sla_tier) {
      console.log(`SLA Tier: ${event.metadata.sla_tier}`);
    }
  }
}

/**
 * Validate required options for evaluate/route/resolve commands
 */
function validateRequiredOptions(options: ApprovalRoutingCommandOptions, command: string): void {
  const missingOptions: string[] = [];

  if (!options.actionType) missingOptions.push('--action-type');
  if (!options.resourceId) missingOptions.push('--resource-id');
  if (!options.resourceType) missingOptions.push('--resource-type');
  if (!options.operation) missingOptions.push('--operation');
  if (!options.requester) missingOptions.push('--requester');

  if (missingOptions.length > 0) {
    console.error(`Error: Missing required options: ${missingOptions.join(', ')}`);
    console.error(`Usage: llm-policy approval ${command} ${missingOptions.map((o) => `${o} <value>`).join(' ')} [options]`);
    process.exit(1);
  }
}

/**
 * Build ApprovalRoutingInput from CLI options
 */
function buildInput(options: ApprovalRoutingCommandOptions): ApprovalRoutingInput {
  const requester = loadRequester(options.requester!);
  const ruleIds = options.rules?.split(',').map((s) => s.trim());

  // Parse additional context if provided
  let details: Record<string, unknown> | undefined;
  if (options.context) {
    details = loadContext<Record<string, unknown>>(options.context);
  }

  return {
    request_id: options.requestId || uuidv4(),
    action_context: {
      action_type: options.actionType!,
      resource_id: options.resourceId!,
      resource_type: options.resourceType!,
      operation: options.operation!,
      details,
    },
    requester,
    approval_rules: ruleIds,
    priority: options.priority,
    metadata: details ? { context: details } : undefined,
  };
}

/**
 * Create agent instance
 */
function createAgent(): ApprovalRoutingAgent {
  // In production, would load rules from configuration
  return new ApprovalRoutingAgent();
}

/**
 * Approval Evaluate Command
 *
 * Evaluate approval requirements for an action.
 */
export async function approvalEvaluate(options: ApprovalRoutingCommandOptions): Promise<void> {
  try {
    validateRequiredOptions(options, 'evaluate');

    const input = buildInput(options);
    const agent = createAgent();
    const decisionEvent = await agent.evaluate(input);

    formatApprovalDecisionEvent(decisionEvent, options.json || false);

    // Exit with appropriate code based on decision
    const exitCode = decisionEvent.outputs.decision === 'auto_approved' ? 0 : 1;
    process.exit(exitCode);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Approval Route Command
 *
 * Route approval to appropriate approvers.
 */
export async function approvalRoute(options: ApprovalRoutingCommandOptions): Promise<void> {
  try {
    validateRequiredOptions(options, 'route');

    const input = buildInput(options);
    const agent = createAgent();
    const decisionEvent = await agent.route(input);

    // Add routing-specific output
    if (!options.json) {
      console.log('\n--- Routing Targets ---');
      const targets = [
        'llm-orchestrator',
        'approval-workflow-service',
        'notification-service',
      ];
      targets.forEach((target, i) => {
        console.log(`  ${i + 1}. ${target}`);
      });
    }

    formatApprovalDecisionEvent(decisionEvent, options.json || false);

    const exitCode = decisionEvent.outputs.decision === 'auto_approved' ? 0 : 1;
    process.exit(exitCode);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Approval Resolve Command
 *
 * Resolve approval conflicts.
 */
export async function approvalResolve(options: ApprovalRoutingCommandOptions): Promise<void> {
  try {
    validateRequiredOptions(options, 'resolve');

    const input = buildInput(options);
    const agent = createAgent();
    const decisionEvent = await agent.resolve(input);

    // Add conflict resolution details
    if (!options.json) {
      console.log('\n--- Conflict Resolution ---');
      if (decisionEvent.rules_applied.length > 1) {
        console.log('  Multiple rules matched - resolved by priority ordering');
      } else {
        console.log('  No conflicts detected');
      }
    }

    formatApprovalDecisionEvent(decisionEvent, options.json || false);

    const exitCode = decisionEvent.outputs.decision === 'auto_approved' ? 0 : 1;
    process.exit(exitCode);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Approval Status Command
 *
 * Check approval status for a request.
 */
export async function approvalStatus(
  requestId: string,
  options: { json?: boolean }
): Promise<void> {
  try {
    if (!requestId) {
      console.error('Error: Request ID is required');
      console.error('Usage: llm-policy approval status <request-id> [options]');
      process.exit(1);
    }

    const agent = createAgent();
    const status = await agent.getStatus(requestId);

    if (!status) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Approval request not found', request_id: requestId }, null, 2));
      } else {
        console.log(`\nApproval request not found: ${requestId}`);
        console.log('The request may have expired or been cancelled.');
      }
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log('\n=== Approval Status ===');
      console.log(`Request ID: ${status.approval_request_id}`);
      console.log(`Status: ${status.status.toUpperCase()}`);
      console.log(`Decision: ${status.decision.toUpperCase()}`);
      if (status.current_step !== undefined && status.total_steps !== undefined) {
        console.log(`Progress: Step ${status.current_step} of ${status.total_steps}`);
      }
      if (status.time_remaining_seconds !== undefined) {
        console.log(`Time Remaining: ${status.time_remaining_seconds}s`);
      }
      console.log(`Last Updated: ${status.updated_at}`);

      if (status.approvals_received && status.approvals_received.length > 0) {
        console.log('\n--- Approvals Received ---');
        status.approvals_received.forEach((approval, i) => {
          console.log(`  ${i + 1}. ${approval.approver_name}: ${approval.decision.toUpperCase()}`);
          console.log(`     At: ${approval.timestamp}`);
          if (approval.comments) {
            console.log(`     Comments: ${approval.comments}`);
          }
        });
      }

      if (status.escalation_level) {
        console.log(`\n  Escalation Level: ${status.escalation_level}`);
      }
    }

    // Exit with 0 if approved, 1 otherwise
    const exitCode = status.status === 'approved' ? 0 : 1;
    process.exit(exitCode);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Approval Info Command
 *
 * Get agent registration information.
 */
export async function approvalInfo(options: { json?: boolean }): Promise<void> {
  const registration = ApprovalRoutingAgent.getRegistration();

  if (options.json) {
    console.log(JSON.stringify(registration, null, 2));
    return;
  }

  console.log('\n=== Approval Routing Agent ===');
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
 * Approval Register Command
 *
 * Register agent with ruvector-service.
 */
export async function approvalRegister(options: { json?: boolean }): Promise<void> {
  try {
    const registration = ApprovalRoutingAgent.getRegistration();
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
