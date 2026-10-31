CREATE TABLE `article_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`event_id` text NOT NULL,
	`model` text NOT NULL,
	`effort` text NOT NULL,
	`request_json` text NOT NULL,
	`response_body` text DEFAULT '' NOT NULL,
	`output_text` text DEFAULT '' NOT NULL,
	`parsed_article_json` text DEFAULT '' NOT NULL,
	`http_status` integer,
	`openai_request_id` text DEFAULT '' NOT NULL,
	`response_id` text DEFAULT '' NOT NULL,
	`outcome` text NOT NULL,
	`fallback_reason` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_article_generations_event_created` ON `article_generations` (`event_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_article_generations_game_created` ON `article_generations` (`game_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`revision` integer NOT NULL,
	`eliminated_player_id` text NOT NULL,
	`predecessor_id` text NOT NULL,
	`inherited_target_id` text NOT NULL,
	`type` text NOT NULL,
	`epitaph` text NOT NULL,
	`publish_at` text,
	`approval_required` integer DEFAULT 0 NOT NULL,
	`approved_at` text,
	`article_format` text,
	`article_section` text,
	`article_headline` text,
	`article_body` text,
	`article_quote` text,
	`press_details` text,
	`press_final_words` text,
	`press_submitted_at` text,
	`article_generated_at` text,
	`article_status` text DEFAULT 'ready' NOT NULL,
	`article_manual` integer DEFAULT 0 NOT NULL,
	`article_suppressed` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`undone_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_events_game_revision` ON `events` (`game_id`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_events_game_created` ON `events` (`game_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_events_game_publish` ON `events` (`game_id`,`publish_at`);--> statement-breakpoint
CREATE TABLE `game_mutations` (
	`game_id` text NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_game_mutations_revision` ON `game_mutations` (`game_id`,`revision`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`access_code` text NOT NULL,
	`registration_invite_hash` text,
	`journalist_preset` text DEFAULT 'christie' NOT NULL,
	`journalist_detail_mode` text DEFAULT 'adapt' NOT NULL,
	`journalist_notes` text DEFAULT '' NOT NULL,
	`journalist_model` text DEFAULT '' NOT NULL,
	`journalist_effort` text DEFAULT 'default' NOT NULL,
	`journalist_core_prompt` text DEFAULT '' NOT NULL,
	`journalist_source_prompt` text DEFAULT '' NOT NULL,
	`journalist_role_prompt` text DEFAULT '' NOT NULL,
	`journalist_presets_json` text DEFAULT '' NOT NULL,
	`journalist_detail_modes_json` text DEFAULT '' NOT NULL,
	`journalist_formats_json` text DEFAULT '' NOT NULL,
	`crew_roles_json` text DEFAULT '' NOT NULL,
	`fog_mode` text DEFAULT 'auto' NOT NULL,
	`exposure_rule` text DEFAULT 'eliminate_killer' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`started_at` text,
	`ended_at` text,
	`winner_id` text,
	`winner_ids_json` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`name` text NOT NULL,
	`group_name` text DEFAULT '' NOT NULL,
	`role_key` text DEFAULT '' NOT NULL,
	`custom_role` text DEFAULT '' NOT NULL,
	`feminine` integer DEFAULT 0 NOT NULL,
	`profile_completed` integer DEFAULT 0 NOT NULL,
	`secret_hash` text NOT NULL,
	`pin_hash` text,
	`pin_salt` text,
	`pin_failed_attempts` integer DEFAULT 0 NOT NULL,
	`pin_locked_until` text,
	`auth_version` integer DEFAULT 0 NOT NULL,
	`photo_key` text,
	`photo_type` text,
	`status` text DEFAULT 'active' NOT NULL,
	`target_id` text,
	`eliminated_at` text,
	`elimination_reason` text,
	`removed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_players_secret_hash` ON `players` (`secret_hash`);--> statement-breakpoint
CREATE INDEX `idx_players_game_status` ON `players` (`game_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_players_target` ON `players` (`game_id`,`target_id`);