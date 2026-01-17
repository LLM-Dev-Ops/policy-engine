/**
 * Database Migration Runner
 * Manages database schema migrations
 */
import { db } from './client';
import logger from '@utils/logger';
import { DatabaseError } from '@utils/errors';

interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_policies_table',
    up: `
      CREATE TABLE IF NOT EXISTS policies (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        version VARCHAR(50) NOT NULL,
        namespace VARCHAR(255) NOT NULL,
        tags TEXT[] DEFAULT '{}',
        priority INTEGER DEFAULT 0,
        status VARCHAR(50) NOT NULL,
        rules JSONB NOT NULL,
        created_by VARCHAR(255),
        internal_version INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_policies_namespace ON policies(namespace);
      CREATE INDEX idx_policies_status ON policies(status);
      CREATE INDEX idx_policies_priority ON policies(priority DESC);
      CREATE INDEX idx_policies_created_at ON policies(created_at DESC);
    `,
    down: `
      DROP TABLE IF EXISTS policies;
    `,
  },
  {
    version: 2,
    name: 'create_policy_evaluations_table',
    up: `
      CREATE TABLE IF NOT EXISTS policy_evaluations (
        id SERIAL PRIMARY KEY,
        request_id VARCHAR(255) NOT NULL,
        policy_ids TEXT[] DEFAULT '{}',
        decision VARCHAR(50) NOT NULL,
        allowed BOOLEAN NOT NULL,
        reason TEXT,
        matched_policies TEXT[] DEFAULT '{}',
        matched_rules TEXT[] DEFAULT '{}',
        context JSONB,
        evaluation_time_ms INTEGER,
        cached BOOLEAN DEFAULT false,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_evaluations_request_id ON policy_evaluations(request_id);
      CREATE INDEX idx_evaluations_decision ON policy_evaluations(decision);
      CREATE INDEX idx_evaluations_allowed ON policy_evaluations(allowed);
      CREATE INDEX idx_evaluations_created_at ON policy_evaluations(created_at DESC);
      CREATE INDEX idx_evaluations_policy_ids ON policy_evaluations USING GIN(policy_ids);
    `,
    down: `
      DROP TABLE IF EXISTS policy_evaluations;
    `,
  },
  {
    version: 3,
    name: 'create_migrations_table',
    up: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `
      DROP TABLE IF EXISTS schema_migrations;
    `,
  },
  {
    version: 4,
    name: 'add_internal_version_to_policies',
    up: `
      -- Add internal_version column if it doesn't exist
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'policies' AND column_name = 'internal_version'
        ) THEN
          ALTER TABLE policies ADD COLUMN internal_version INTEGER DEFAULT 1;
        END IF;
      END $$;
    `,
    down: `
      ALTER TABLE policies DROP COLUMN IF EXISTS internal_version;
    `,
  },
  {
    version: 5,
    name: 'create_policy_versions_table',
    up: `
      -- Policy version history table
      CREATE TABLE IF NOT EXISTS policy_versions (
        id SERIAL PRIMARY KEY,
        policy_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        version VARCHAR(50) NOT NULL,
        namespace VARCHAR(255) NOT NULL,
        tags TEXT[] DEFAULT '{}',
        priority INTEGER DEFAULT 0,
        status VARCHAR(50) NOT NULL,
        rules JSONB NOT NULL,
        created_by VARCHAR(255),
        internal_version INTEGER NOT NULL,
        previous_version_id INTEGER REFERENCES policy_versions(id),
        archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted BOOLEAN DEFAULT FALSE,
        UNIQUE(policy_id, internal_version)
      );

      CREATE INDEX idx_policy_versions_policy_id ON policy_versions(policy_id);
      CREATE INDEX idx_policy_versions_internal_version ON policy_versions(internal_version DESC);
      CREATE INDEX idx_policy_versions_archived_at ON policy_versions(archived_at DESC);
      CREATE INDEX idx_policy_versions_deleted ON policy_versions(deleted);
    `,
    down: `
      DROP TABLE IF EXISTS policy_versions;
    `,
  },
  {
    version: 6,
    name: 'create_policy_audit_trail_table',
    up: `
      -- Append-only audit trail table
      -- NO UPDATE or DELETE operations allowed - enforced by RLS
      CREATE TABLE IF NOT EXISTS policy_audit_trail (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        policy_id VARCHAR(255) NOT NULL,
        policy_version INTEGER NOT NULL,
        action VARCHAR(50) NOT NULL CHECK (action IN ('create', 'edit', 'enable', 'disable', 'delete', 'version_update')),
        actor_identity VARCHAR(512) NOT NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        before_hash VARCHAR(64),
        after_hash VARCHAR(64),
        correlation_id VARCHAR(255) NOT NULL,
        metadata JSONB DEFAULT '{}',
        -- Prevent any modifications after insert
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for efficient querying
      CREATE INDEX idx_audit_policy_id ON policy_audit_trail(policy_id);
      CREATE INDEX idx_audit_timestamp ON policy_audit_trail(timestamp DESC);
      CREATE INDEX idx_audit_actor ON policy_audit_trail(actor_identity);
      CREATE INDEX idx_audit_correlation ON policy_audit_trail(correlation_id);
      CREATE INDEX idx_audit_action ON policy_audit_trail(action);

      -- Create a rule to prevent UPDATE and DELETE on audit trail
      -- This enforces append-only behavior at the database level
      CREATE OR REPLACE RULE audit_no_update AS
        ON UPDATE TO policy_audit_trail
        DO INSTEAD NOTHING;

      CREATE OR REPLACE RULE audit_no_delete AS
        ON DELETE TO policy_audit_trail
        DO INSTEAD NOTHING;
    `,
    down: `
      DROP RULE IF EXISTS audit_no_delete ON policy_audit_trail;
      DROP RULE IF EXISTS audit_no_update ON policy_audit_trail;
      DROP TABLE IF EXISTS policy_audit_trail;
    `,
  },
  {
    version: 7,
    name: 'create_api_request_log_table',
    up: `
      -- Request logging for observability and debugging
      CREATE TABLE IF NOT EXISTS api_request_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        correlation_id VARCHAR(255) NOT NULL,
        method VARCHAR(10) NOT NULL,
        path VARCHAR(1024) NOT NULL,
        status_code INTEGER,
        actor_identity VARCHAR(512),
        duration_ms INTEGER,
        request_metadata JSONB DEFAULT '{}',
        response_metadata JSONB DEFAULT '{}',
        error_type VARCHAR(255),
        error_message TEXT,
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_request_log_correlation ON api_request_log(correlation_id);
      CREATE INDEX idx_request_log_timestamp ON api_request_log(timestamp DESC);
      CREATE INDEX idx_request_log_actor ON api_request_log(actor_identity);
      CREATE INDEX idx_request_log_path ON api_request_log(path);
      CREATE INDEX idx_request_log_status ON api_request_log(status_code);

      -- Partition by month for efficient cleanup (optional, for high-volume deployments)
      -- CREATE TABLE api_request_log_partitioned (...) PARTITION BY RANGE (timestamp);
    `,
    down: `
      DROP TABLE IF EXISTS api_request_log;
    `,
  },
];

export class MigrationRunner {
  /**
   * Run all pending migrations
   */
  async up(): Promise<void> {
    try {
      logger.info('Starting database migrations');

      // Ensure migrations table exists
      await this.ensureMigrationsTable();

      // Get applied migrations
      const appliedVersions = await this.getAppliedVersions();

      // Find pending migrations
      const pendingMigrations = migrations
        .filter((m) => !appliedVersions.includes(m.version))
        .sort((a, b) => a.version - b.version);

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }

      // Run each pending migration
      for (const migration of pendingMigrations) {
        await this.runMigration(migration);
      }

      logger.info(
        { count: pendingMigrations.length },
        'Database migrations completed successfully',
      );
    } catch (error) {
      logger.error({ error }, 'Database migration failed');
      throw new DatabaseError(
        `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Rollback last migration
   */
  async down(): Promise<void> {
    try {
      logger.info('Rolling back last migration');

      await this.ensureMigrationsTable();

      const appliedVersions = await this.getAppliedVersions();
      if (appliedVersions.length === 0) {
        logger.info('No migrations to rollback');
        return;
      }

      const lastVersion = Math.max(...appliedVersions);
      const migration = migrations.find((m) => m.version === lastVersion);

      if (!migration || !migration.down) {
        throw new Error(`Cannot rollback migration version ${lastVersion}`);
      }

      await this.rollbackMigration(migration);

      logger.info({ version: lastVersion }, 'Migration rolled back successfully');
    } catch (error) {
      logger.error({ error }, 'Migration rollback failed');
      throw new DatabaseError(
        `Rollback failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get migration status
   */
  async status(): Promise<{
    applied: Migration[];
    pending: Migration[];
  }> {
    try {
      await this.ensureMigrationsTable();

      const appliedVersions = await this.getAppliedVersions();

      const applied = migrations
        .filter((m) => appliedVersions.includes(m.version))
        .sort((a, b) => a.version - b.version);

      const pending = migrations
        .filter((m) => !appliedVersions.includes(m.version))
        .sort((a, b) => a.version - b.version);

      return { applied, pending };
    } catch (error) {
      throw new DatabaseError(
        `Failed to get migration status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Reset database (rollback all migrations)
   */
  async reset(): Promise<void> {
    try {
      logger.warn('Resetting database - all data will be lost');

      await this.ensureMigrationsTable();

      const appliedVersions = await this.getAppliedVersions();
      const appliedMigrations = migrations
        .filter((m) => appliedVersions.includes(m.version))
        .sort((a, b) => b.version - a.version); // Reverse order for rollback

      for (const migration of appliedMigrations) {
        if (migration.down) {
          await this.rollbackMigration(migration);
        }
      }

      logger.info('Database reset completed');
    } catch (error) {
      logger.error({ error }, 'Database reset failed');
      throw new DatabaseError(
        `Reset failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Ensure migrations table exists
   */
  private async ensureMigrationsTable(): Promise<void> {
    const migrationTableMigration = migrations.find((m) => m.name === 'create_migrations_table');
    if (migrationTableMigration) {
      await db.query(migrationTableMigration.up);
    }
  }

  /**
   * Get list of applied migration versions
   */
  private async getAppliedVersions(): Promise<number[]> {
    try {
      const result = await db.query('SELECT version FROM schema_migrations ORDER BY version');
      return result.rows.map((row) => row.version);
    } catch (error) {
      // Table doesn't exist yet
      return [];
    }
  }

  /**
   * Run a single migration
   */
  private async runMigration(migration: Migration): Promise<void> {
    await db.transaction(async (client) => {
      logger.info({ version: migration.version, name: migration.name }, 'Running migration');

      // Execute migration SQL
      await client.query(migration.up);

      // Record migration
      await client.query(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
        [migration.version, migration.name],
      );

      logger.info(
        { version: migration.version, name: migration.name },
        'Migration completed',
      );
    });
  }

  /**
   * Rollback a single migration
   */
  private async rollbackMigration(migration: Migration): Promise<void> {
    if (!migration.down) {
      throw new Error(`Migration ${migration.name} has no down migration`);
    }

    await db.transaction(async (client) => {
      logger.info(
        { version: migration.version, name: migration.name },
        'Rolling back migration',
      );

      // Execute rollback SQL
      await client.query(migration.down!);

      // Remove migration record
      await client.query('DELETE FROM schema_migrations WHERE version = $1', [migration.version]);

      logger.info(
        { version: migration.version, name: migration.name },
        'Migration rolled back',
      );
    });
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2] || 'up';
  const runner = new MigrationRunner();

  (async () => {
    try {
      switch (command) {
        case 'up':
          await runner.up();
          break;
        case 'down':
          await runner.down();
          break;
        case 'status':
          const status = await runner.status();
          console.log('\nApplied migrations:');
          status.applied.forEach((m) => console.log(`  ✓ ${m.version} - ${m.name}`));
          console.log('\nPending migrations:');
          status.pending.forEach((m) => console.log(`  ○ ${m.version} - ${m.name}`));
          break;
        case 'reset':
          await runner.reset();
          break;
        default:
          console.error(`Unknown command: ${command}`);
          console.log('Available commands: up, down, status, reset');
          process.exit(1);
      }

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Migration error:', error);
      await db.close();
      process.exit(1);
    }
  })();
}

export default MigrationRunner;
