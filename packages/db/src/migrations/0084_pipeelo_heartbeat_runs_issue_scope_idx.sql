CREATE INDEX IF NOT EXISTS "heartbeat_runs_company_issue_idx" ON "heartbeat_runs" USING btree ("company_id",("context_snapshot" ->> 'issueId'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "heartbeat_runs_company_task_idx" ON "heartbeat_runs" USING btree ("company_id",("context_snapshot" ->> 'taskId'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "heartbeat_runs_company_task_key_idx" ON "heartbeat_runs" USING btree ("company_id",("context_snapshot" ->> 'taskKey'));
