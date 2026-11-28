import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_deck_versions_spec_slides_phase" AS ENUM ('predict', 'observe', 'explain', 'dqb', 'model');

    CREATE TYPE "public"."enum_deck_versions_spec_slides_blocks_type" AS ENUM ('text', 'bullets', 'numbered', 'callout', 'table', 'cards', 'columns', 'tiles', 'illustration', 'diagram', 'figure');

    CREATE TYPE "public"."enum_deck_versions_spec_slides_blocks_style" AS ENUM ('normal', 'question', 'emphasis', 'caption');

    CREATE TYPE "public"."enum_deck_versions_spec_slides_blocks_template" AS ENUM ('none', 'animal_cell', 'plant_cell', 'bacterium', 'onion_epidermis', 'cheek_cells', 'light_microscope', 'red_blood_cell', 'white_blood_cell', 'sperm_cell', 'egg_cell', 'nerve_cell', 'muscle_cell', 'ciliated_epithelial_cell', 'root_hair_cell', 'guard_cells', 'xylem_vessel', 'phloem_sieve_tube', 'palisade_cell', 'levels_of_organisation');

    CREATE TYPE "public"."enum_deck_versions_spec_figure_coverage_status" AS ENUM ('drawn', 'declined');

    CREATE TYPE "public"."enum_deck_versions_spec_build_log_type" AS ENUM ('science_flag', 'term_flag', 'inconsistency', 'trimmed_time', 'placeholder_check', 'added_fact', 'sow_problem', 'safety_flag', 'resource_note', 'missing_detail', 'other');

    CREATE TYPE "public"."enum_deck_versions_spec_glance_rows_group" AS ENUM ('opening', 'predict', 'observe', 'explain', 'dqb', 'model', 'summary');

    CREATE TYPE "public"."enum_deck_versions_spec_glance_resource_notes_match" AS ENUM ('best_match', 'preview_first', 'use_later', 'do_not_use');

    CREATE TABLE "decks" (
      "id" serial PRIMARY KEY NOT NULL,
      "title" varchar NOT NULL,
      "lesson_plan_id" integer NOT NULL,
      "subject_grade_id" integer NOT NULL,
      "substrand_id" varchar NOT NULL,
      "lesson_number" numeric NOT NULL,
      "official_version_id" integer,
      "import_fingerprint" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "deck_versions" (
      "id" serial PRIMARY KEY NOT NULL,
      "deck_id" integer NOT NULL,
      "subject_grade_id" integer NOT NULL,
      "source_version_id" integer,
      "author_id" integer,
      "semver" varchar DEFAULT '1.0.0' NOT NULL,
      "spec_unit_map_minutes" numeric,
      "spec_goals_minutes" numeric,
      "spec_hero_art_id" varchar,
      "spec_hero_prompt" varchar,
      "spec_hero_alt" varchar,
      "spec_hero_icon" varchar,
      "spec_lesson_title_short" varchar,
      "spec_lesson_oneliner" varchar,
      "spec_is_practical" boolean,
      "spec_so_far" varchar,
      "spec_safety_title" varchar,
      "spec_safety_minutes" numeric,
      "spec_safety_notes_wait_time" varchar,
      "spec_safety_notes_why_this_works" varchar,
      "spec_safety_notes_science_note" varchar,
      "spec_glance_fallback" varchar,
      "spec_summary_observe_prompt" varchar,
      "spec_summary_learn_prompt" varchar,
      "spec_summary_explain_prompt" varchar,
      "spec_summary_next_lesson" varchar,
      "spec_summary_answer_observe" varchar,
      "spec_summary_answer_learn" varchar,
      "spec_summary_answer_explain" varchar,
      "spec_summary_minutes" numeric,
      "spec_summary_notes_wait_time" varchar,
      "spec_summary_notes_why_this_works" varchar,
      "spec_summary_notes_science_note" varchar,
      "spec_unit_map_notes_wait_time" varchar,
      "spec_unit_map_notes_why_this_works" varchar,
      "spec_unit_map_notes_science_note" varchar,
      "spec_goals_notes_wait_time" varchar,
      "spec_goals_notes_why_this_works" varchar,
      "spec_goals_notes_science_note" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "deck_versions_spec_slides" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "phase" "public"."enum_deck_versions_spec_slides_phase",
      "title" varchar,
      "subtitle" varchar,
      "check_for_understanding" boolean,
      "student_task" boolean,
      "minutes" numeric,
      "time_note" varchar,
      "notes_wait_time" varchar,
      "notes_why_this_works" varchar,
      "notes_science_note" varchar
    );

    CREATE TABLE "deck_versions_spec_slides_timers" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "label" varchar,
      "time" varchar
    );

    CREATE TABLE "deck_versions_spec_slides_blocks" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "type" "public"."enum_deck_versions_spec_slides_blocks_type",
      "style" "public"."enum_deck_versions_spec_slides_blocks_style",
      "text" varchar,
      "template" "public"."enum_deck_versions_spec_slides_blocks_template",
      "figure" varchar,
      "art_id" varchar,
      "art_prompt" varchar
    );

    CREATE TABLE "deck_versions_spec_slides_blocks_items" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_slides_blocks_rows" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL
    );

    CREATE TABLE "deck_versions_spec_slides_blocks_rows_cells" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_slides_blocks_labels" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_slides_resources" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_slides_notes_do" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_slides_notes_say" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_slides_notes_look_for" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_slides_notes_if_then" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_slides_notes_answer_key" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_slides_quiz_links" (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_figure_coverage" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "figure_id" varchar,
      "status" "public"."enum_deck_versions_spec_figure_coverage_status",
      "slide" varchar,
      "reason" varchar
    );

    CREATE TABLE "deck_versions_spec_build_log" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "slide" varchar,
      "type" "public"."enum_deck_versions_spec_build_log_type",
      "sow_says" varchar,
      "deck_does" varchar,
      "why" varchar
    );

    CREATE TABLE "deck_versions_spec_purpose" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_before_class" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_do_not_show" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_unit_map_titles" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_goals" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_key_words" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "word" varchar,
      "definition" varchar
    );

    CREATE TABLE "deck_versions_spec_safety_rules" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_safety_notes_do" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_safety_notes_say" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_safety_notes_look_for" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_safety_notes_if_then" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_safety_notes_answer_key" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_glance_rows" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "group" "public"."enum_deck_versions_spec_glance_rows_group",
      "minutes" numeric,
      "what" varchar
    );

    CREATE TABLE "deck_versions_spec_glance_materials" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_glance_resource_notes" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "key" varchar,
      "match" "public"."enum_deck_versions_spec_glance_resource_notes_match",
      "note" varchar
    );

    CREATE TABLE "deck_versions_spec_summary_reflection" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_summary_notes_do" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_summary_notes_say" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_summary_notes_look_for" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_summary_notes_if_then" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_summary_notes_answer_key" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_unit_map_notes_do" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_unit_map_notes_say" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_unit_map_notes_look_for" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_unit_map_notes_if_then" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_unit_map_notes_answer_key" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_goals_notes_do" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_goals_notes_say" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_goals_notes_look_for" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_goals_notes_if_then" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    CREATE TABLE "deck_versions_spec_goals_notes_answer_key" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "value" varchar
    );

    ALTER TABLE "decks" ADD CONSTRAINT "decks_lesson_plan_id_lesson_plans_id_fk"
      FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE set null ON UPDATE no action;

    ALTER TABLE "decks" ADD CONSTRAINT "decks_subject_grade_id_subject_grades_id_fk"
      FOREIGN KEY ("subject_grade_id") REFERENCES "public"."subject_grades"("id") ON DELETE set null ON UPDATE no action;

    ALTER TABLE "decks" ADD CONSTRAINT "decks_official_version_id_deck_versions_id_fk"
      FOREIGN KEY ("official_version_id") REFERENCES "public"."deck_versions"("id") ON DELETE set null ON UPDATE no action;

    ALTER TABLE "deck_versions" ADD CONSTRAINT "deck_versions_deck_id_decks_id_fk"
      FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE set null ON UPDATE no action;

    ALTER TABLE "deck_versions" ADD CONSTRAINT "deck_versions_subject_grade_id_subject_grades_id_fk"
      FOREIGN KEY ("subject_grade_id") REFERENCES "public"."subject_grades"("id") ON DELETE set null ON UPDATE no action;

    ALTER TABLE "deck_versions" ADD CONSTRAINT "deck_versions_source_version_id_deck_versions_id_fk"
      FOREIGN KEY ("source_version_id") REFERENCES "public"."deck_versions"("id") ON DELETE set null ON UPDATE no action;

    ALTER TABLE "deck_versions" ADD CONSTRAINT "deck_versions_author_id_users_id_fk"
      FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides" ADD CONSTRAINT "deck_versions_spec_slides_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides_timers" ADD CONSTRAINT "deck_versions_spec_slides_timers_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions_spec_slides"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides_blocks" ADD CONSTRAINT "deck_versions_spec_slides_blocks_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions_spec_slides"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides_blocks_items" ADD CONSTRAINT "deck_versions_spec_slides_blocks_items_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions_spec_slides_blocks"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides_blocks_rows" ADD CONSTRAINT "deck_versions_spec_slides_blocks_rows_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions_spec_slides_blocks"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides_blocks_rows_cells" ADD CONSTRAINT "deck_versions_spec_slides_blocks_rows_cells_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions_spec_slides_blocks_rows"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides_blocks_labels" ADD CONSTRAINT "deck_versions_spec_slides_blocks_labels_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions_spec_slides_blocks"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides_resources" ADD CONSTRAINT "deck_versions_spec_slides_resources_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions_spec_slides"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides_notes_do" ADD CONSTRAINT "deck_versions_spec_slides_notes_do_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions_spec_slides"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides_notes_say" ADD CONSTRAINT "deck_versions_spec_slides_notes_say_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions_spec_slides"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides_notes_look_for" ADD CONSTRAINT "deck_versions_spec_slides_notes_look_for_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions_spec_slides"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides_notes_if_then" ADD CONSTRAINT "deck_versions_spec_slides_notes_if_then_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions_spec_slides"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides_notes_answer_key" ADD CONSTRAINT "deck_versions_spec_slides_notes_answer_key_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions_spec_slides"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_slides_quiz_links" ADD CONSTRAINT "deck_versions_spec_slides_quiz_links_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions_spec_slides"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_figure_coverage" ADD CONSTRAINT "deck_versions_spec_figure_coverage_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_build_log" ADD CONSTRAINT "deck_versions_spec_build_log_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_purpose" ADD CONSTRAINT "deck_versions_spec_purpose_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_before_class" ADD CONSTRAINT "deck_versions_spec_before_class_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_do_not_show" ADD CONSTRAINT "deck_versions_spec_do_not_show_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_unit_map_titles" ADD CONSTRAINT "deck_versions_spec_unit_map_titles_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_goals" ADD CONSTRAINT "deck_versions_spec_goals_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_key_words" ADD CONSTRAINT "deck_versions_spec_key_words_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_safety_rules" ADD CONSTRAINT "deck_versions_spec_safety_rules_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_safety_notes_do" ADD CONSTRAINT "deck_versions_spec_safety_notes_do_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_safety_notes_say" ADD CONSTRAINT "deck_versions_spec_safety_notes_say_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_safety_notes_look_for" ADD CONSTRAINT "deck_versions_spec_safety_notes_look_for_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_safety_notes_if_then" ADD CONSTRAINT "deck_versions_spec_safety_notes_if_then_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_safety_notes_answer_key" ADD CONSTRAINT "deck_versions_spec_safety_notes_answer_key_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_glance_rows" ADD CONSTRAINT "deck_versions_spec_glance_rows_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_glance_materials" ADD CONSTRAINT "deck_versions_spec_glance_materials_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_glance_resource_notes" ADD CONSTRAINT "deck_versions_spec_glance_resource_notes_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_summary_reflection" ADD CONSTRAINT "deck_versions_spec_summary_reflection_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_summary_notes_do" ADD CONSTRAINT "deck_versions_spec_summary_notes_do_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_summary_notes_say" ADD CONSTRAINT "deck_versions_spec_summary_notes_say_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_summary_notes_look_for" ADD CONSTRAINT "deck_versions_spec_summary_notes_look_for_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_summary_notes_if_then" ADD CONSTRAINT "deck_versions_spec_summary_notes_if_then_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_summary_notes_answer_key" ADD CONSTRAINT "deck_versions_spec_summary_notes_answer_key_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_unit_map_notes_do" ADD CONSTRAINT "deck_versions_spec_unit_map_notes_do_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_unit_map_notes_say" ADD CONSTRAINT "deck_versions_spec_unit_map_notes_say_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_unit_map_notes_look_for" ADD CONSTRAINT "deck_versions_spec_unit_map_notes_look_for_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_unit_map_notes_if_then" ADD CONSTRAINT "deck_versions_spec_unit_map_notes_if_then_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_unit_map_notes_answer_key" ADD CONSTRAINT "deck_versions_spec_unit_map_notes_answer_key_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_goals_notes_do" ADD CONSTRAINT "deck_versions_spec_goals_notes_do_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_goals_notes_say" ADD CONSTRAINT "deck_versions_spec_goals_notes_say_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_goals_notes_look_for" ADD CONSTRAINT "deck_versions_spec_goals_notes_look_for_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_goals_notes_if_then" ADD CONSTRAINT "deck_versions_spec_goals_notes_if_then_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "deck_versions_spec_goals_notes_answer_key" ADD CONSTRAINT "deck_versions_spec_goals_notes_answer_key_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."deck_versions"("id") ON DELETE cascade ON UPDATE no action;

    CREATE INDEX "decks_lesson_plan_idx" ON "decks" USING btree ("lesson_plan_id");

    CREATE INDEX "decks_subject_grade_idx" ON "decks" USING btree ("subject_grade_id");

    CREATE INDEX "decks_official_version_idx" ON "decks" USING btree ("official_version_id");

    CREATE INDEX "decks_updated_at_idx" ON "decks" USING btree ("updated_at");

    CREATE INDEX "decks_created_at_idx" ON "decks" USING btree ("created_at");

    CREATE UNIQUE INDEX "subjectGrade_substrandId_lessonNumber_idx" ON "decks" USING btree ("subject_grade_id", "substrand_id", "lesson_number");

    CREATE INDEX "deck_versions_deck_idx" ON "deck_versions" USING btree ("deck_id");

    CREATE INDEX "deck_versions_subject_grade_idx" ON "deck_versions" USING btree ("subject_grade_id");

    CREATE INDEX "deck_versions_source_version_idx" ON "deck_versions" USING btree ("source_version_id");

    CREATE INDEX "deck_versions_author_idx" ON "deck_versions" USING btree ("author_id");

    CREATE INDEX "deck_versions_semver_idx" ON "deck_versions" USING btree ("semver");

    CREATE INDEX "deck_versions_updated_at_idx" ON "deck_versions" USING btree ("updated_at");

    CREATE INDEX "deck_versions_created_at_idx" ON "deck_versions" USING btree ("created_at");

    CREATE UNIQUE INDEX "deck_semver_idx" ON "deck_versions" USING btree ("deck_id", "semver");

    CREATE INDEX "deck_versions_spec_slides_order_idx" ON "deck_versions_spec_slides" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_parent_id_idx" ON "deck_versions_spec_slides" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_slides_timers_order_idx" ON "deck_versions_spec_slides_timers" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_timers_parent_id_idx" ON "deck_versions_spec_slides_timers" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_slides_blocks_order_idx" ON "deck_versions_spec_slides_blocks" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_blocks_parent_id_idx" ON "deck_versions_spec_slides_blocks" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_slides_blocks_items_order_idx" ON "deck_versions_spec_slides_blocks_items" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_blocks_items_parent_id_idx" ON "deck_versions_spec_slides_blocks_items" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_slides_blocks_rows_order_idx" ON "deck_versions_spec_slides_blocks_rows" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_blocks_rows_parent_id_idx" ON "deck_versions_spec_slides_blocks_rows" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_slides_blocks_rows_cells_order_idx" ON "deck_versions_spec_slides_blocks_rows_cells" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_blocks_rows_cells_parent_id_idx" ON "deck_versions_spec_slides_blocks_rows_cells" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_slides_blocks_labels_order_idx" ON "deck_versions_spec_slides_blocks_labels" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_blocks_labels_parent_id_idx" ON "deck_versions_spec_slides_blocks_labels" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_slides_resources_order_idx" ON "deck_versions_spec_slides_resources" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_resources_parent_id_idx" ON "deck_versions_spec_slides_resources" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_slides_notes_do_order_idx" ON "deck_versions_spec_slides_notes_do" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_notes_do_parent_id_idx" ON "deck_versions_spec_slides_notes_do" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_slides_notes_say_order_idx" ON "deck_versions_spec_slides_notes_say" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_notes_say_parent_id_idx" ON "deck_versions_spec_slides_notes_say" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_slides_notes_look_for_order_idx" ON "deck_versions_spec_slides_notes_look_for" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_notes_look_for_parent_id_idx" ON "deck_versions_spec_slides_notes_look_for" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_slides_notes_if_then_order_idx" ON "deck_versions_spec_slides_notes_if_then" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_notes_if_then_parent_id_idx" ON "deck_versions_spec_slides_notes_if_then" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_slides_notes_answer_key_order_idx" ON "deck_versions_spec_slides_notes_answer_key" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_notes_answer_key_parent_id_idx" ON "deck_versions_spec_slides_notes_answer_key" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_slides_quiz_links_order_idx" ON "deck_versions_spec_slides_quiz_links" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_slides_quiz_links_parent_id_idx" ON "deck_versions_spec_slides_quiz_links" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_figure_coverage_order_idx" ON "deck_versions_spec_figure_coverage" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_figure_coverage_parent_id_idx" ON "deck_versions_spec_figure_coverage" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_build_log_order_idx" ON "deck_versions_spec_build_log" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_build_log_parent_id_idx" ON "deck_versions_spec_build_log" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_purpose_order_idx" ON "deck_versions_spec_purpose" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_purpose_parent_id_idx" ON "deck_versions_spec_purpose" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_before_class_order_idx" ON "deck_versions_spec_before_class" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_before_class_parent_id_idx" ON "deck_versions_spec_before_class" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_do_not_show_order_idx" ON "deck_versions_spec_do_not_show" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_do_not_show_parent_id_idx" ON "deck_versions_spec_do_not_show" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_unit_map_titles_order_idx" ON "deck_versions_spec_unit_map_titles" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_unit_map_titles_parent_id_idx" ON "deck_versions_spec_unit_map_titles" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_goals_order_idx" ON "deck_versions_spec_goals" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_goals_parent_id_idx" ON "deck_versions_spec_goals" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_key_words_order_idx" ON "deck_versions_spec_key_words" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_key_words_parent_id_idx" ON "deck_versions_spec_key_words" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_safety_rules_order_idx" ON "deck_versions_spec_safety_rules" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_safety_rules_parent_id_idx" ON "deck_versions_spec_safety_rules" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_safety_notes_do_order_idx" ON "deck_versions_spec_safety_notes_do" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_safety_notes_do_parent_id_idx" ON "deck_versions_spec_safety_notes_do" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_safety_notes_say_order_idx" ON "deck_versions_spec_safety_notes_say" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_safety_notes_say_parent_id_idx" ON "deck_versions_spec_safety_notes_say" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_safety_notes_look_for_order_idx" ON "deck_versions_spec_safety_notes_look_for" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_safety_notes_look_for_parent_id_idx" ON "deck_versions_spec_safety_notes_look_for" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_safety_notes_if_then_order_idx" ON "deck_versions_spec_safety_notes_if_then" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_safety_notes_if_then_parent_id_idx" ON "deck_versions_spec_safety_notes_if_then" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_safety_notes_answer_key_order_idx" ON "deck_versions_spec_safety_notes_answer_key" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_safety_notes_answer_key_parent_id_idx" ON "deck_versions_spec_safety_notes_answer_key" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_glance_rows_order_idx" ON "deck_versions_spec_glance_rows" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_glance_rows_parent_id_idx" ON "deck_versions_spec_glance_rows" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_glance_materials_order_idx" ON "deck_versions_spec_glance_materials" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_glance_materials_parent_id_idx" ON "deck_versions_spec_glance_materials" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_glance_resource_notes_order_idx" ON "deck_versions_spec_glance_resource_notes" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_glance_resource_notes_parent_id_idx" ON "deck_versions_spec_glance_resource_notes" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_summary_reflection_order_idx" ON "deck_versions_spec_summary_reflection" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_summary_reflection_parent_id_idx" ON "deck_versions_spec_summary_reflection" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_summary_notes_do_order_idx" ON "deck_versions_spec_summary_notes_do" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_summary_notes_do_parent_id_idx" ON "deck_versions_spec_summary_notes_do" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_summary_notes_say_order_idx" ON "deck_versions_spec_summary_notes_say" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_summary_notes_say_parent_id_idx" ON "deck_versions_spec_summary_notes_say" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_summary_notes_look_for_order_idx" ON "deck_versions_spec_summary_notes_look_for" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_summary_notes_look_for_parent_id_idx" ON "deck_versions_spec_summary_notes_look_for" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_summary_notes_if_then_order_idx" ON "deck_versions_spec_summary_notes_if_then" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_summary_notes_if_then_parent_id_idx" ON "deck_versions_spec_summary_notes_if_then" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_summary_notes_answer_key_order_idx" ON "deck_versions_spec_summary_notes_answer_key" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_summary_notes_answer_key_parent_id_idx" ON "deck_versions_spec_summary_notes_answer_key" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_unit_map_notes_do_order_idx" ON "deck_versions_spec_unit_map_notes_do" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_unit_map_notes_do_parent_id_idx" ON "deck_versions_spec_unit_map_notes_do" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_unit_map_notes_say_order_idx" ON "deck_versions_spec_unit_map_notes_say" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_unit_map_notes_say_parent_id_idx" ON "deck_versions_spec_unit_map_notes_say" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_unit_map_notes_look_for_order_idx" ON "deck_versions_spec_unit_map_notes_look_for" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_unit_map_notes_look_for_parent_id_idx" ON "deck_versions_spec_unit_map_notes_look_for" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_unit_map_notes_if_then_order_idx" ON "deck_versions_spec_unit_map_notes_if_then" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_unit_map_notes_if_then_parent_id_idx" ON "deck_versions_spec_unit_map_notes_if_then" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_unit_map_notes_answer_key_order_idx" ON "deck_versions_spec_unit_map_notes_answer_key" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_unit_map_notes_answer_key_parent_id_idx" ON "deck_versions_spec_unit_map_notes_answer_key" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_goals_notes_do_order_idx" ON "deck_versions_spec_goals_notes_do" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_goals_notes_do_parent_id_idx" ON "deck_versions_spec_goals_notes_do" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_goals_notes_say_order_idx" ON "deck_versions_spec_goals_notes_say" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_goals_notes_say_parent_id_idx" ON "deck_versions_spec_goals_notes_say" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_goals_notes_look_for_order_idx" ON "deck_versions_spec_goals_notes_look_for" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_goals_notes_look_for_parent_id_idx" ON "deck_versions_spec_goals_notes_look_for" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_goals_notes_if_then_order_idx" ON "deck_versions_spec_goals_notes_if_then" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_goals_notes_if_then_parent_id_idx" ON "deck_versions_spec_goals_notes_if_then" USING btree ("_parent_id");

    CREATE INDEX "deck_versions_spec_goals_notes_answer_key_order_idx" ON "deck_versions_spec_goals_notes_answer_key" USING btree ("_order");

    CREATE INDEX "deck_versions_spec_goals_notes_answer_key_parent_id_idx" ON "deck_versions_spec_goals_notes_answer_key" USING btree ("_parent_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "decks" DROP CONSTRAINT "decks_official_version_id_deck_versions_id_fk";
    DROP TABLE "deck_versions_spec_goals_notes_answer_key";
    DROP TABLE "deck_versions_spec_goals_notes_if_then";
    DROP TABLE "deck_versions_spec_goals_notes_look_for";
    DROP TABLE "deck_versions_spec_goals_notes_say";
    DROP TABLE "deck_versions_spec_goals_notes_do";
    DROP TABLE "deck_versions_spec_unit_map_notes_answer_key";
    DROP TABLE "deck_versions_spec_unit_map_notes_if_then";
    DROP TABLE "deck_versions_spec_unit_map_notes_look_for";
    DROP TABLE "deck_versions_spec_unit_map_notes_say";
    DROP TABLE "deck_versions_spec_unit_map_notes_do";
    DROP TABLE "deck_versions_spec_summary_notes_answer_key";
    DROP TABLE "deck_versions_spec_summary_notes_if_then";
    DROP TABLE "deck_versions_spec_summary_notes_look_for";
    DROP TABLE "deck_versions_spec_summary_notes_say";
    DROP TABLE "deck_versions_spec_summary_notes_do";
    DROP TABLE "deck_versions_spec_summary_reflection";
    DROP TABLE "deck_versions_spec_glance_resource_notes";
    DROP TABLE "deck_versions_spec_glance_materials";
    DROP TABLE "deck_versions_spec_glance_rows";
    DROP TABLE "deck_versions_spec_safety_notes_answer_key";
    DROP TABLE "deck_versions_spec_safety_notes_if_then";
    DROP TABLE "deck_versions_spec_safety_notes_look_for";
    DROP TABLE "deck_versions_spec_safety_notes_say";
    DROP TABLE "deck_versions_spec_safety_notes_do";
    DROP TABLE "deck_versions_spec_safety_rules";
    DROP TABLE "deck_versions_spec_key_words";
    DROP TABLE "deck_versions_spec_goals";
    DROP TABLE "deck_versions_spec_unit_map_titles";
    DROP TABLE "deck_versions_spec_do_not_show";
    DROP TABLE "deck_versions_spec_before_class";
    DROP TABLE "deck_versions_spec_purpose";
    DROP TABLE "deck_versions_spec_build_log";
    DROP TABLE "deck_versions_spec_figure_coverage";
    DROP TABLE "deck_versions_spec_slides_quiz_links";
    DROP TABLE "deck_versions_spec_slides_notes_answer_key";
    DROP TABLE "deck_versions_spec_slides_notes_if_then";
    DROP TABLE "deck_versions_spec_slides_notes_look_for";
    DROP TABLE "deck_versions_spec_slides_notes_say";
    DROP TABLE "deck_versions_spec_slides_notes_do";
    DROP TABLE "deck_versions_spec_slides_resources";
    DROP TABLE "deck_versions_spec_slides_blocks_labels";
    DROP TABLE "deck_versions_spec_slides_blocks_rows_cells";
    DROP TABLE "deck_versions_spec_slides_blocks_rows";
    DROP TABLE "deck_versions_spec_slides_blocks_items";
    DROP TABLE "deck_versions_spec_slides_blocks";
    DROP TABLE "deck_versions_spec_slides_timers";
    DROP TABLE "deck_versions_spec_slides";
    DROP TABLE "deck_versions";
    DROP TABLE "decks";
    DROP TYPE "public"."enum_deck_versions_spec_glance_resource_notes_match";
    DROP TYPE "public"."enum_deck_versions_spec_glance_rows_group";
    DROP TYPE "public"."enum_deck_versions_spec_build_log_type";
    DROP TYPE "public"."enum_deck_versions_spec_figure_coverage_status";
    DROP TYPE "public"."enum_deck_versions_spec_slides_blocks_template";
    DROP TYPE "public"."enum_deck_versions_spec_slides_blocks_style";
    DROP TYPE "public"."enum_deck_versions_spec_slides_blocks_type";
    DROP TYPE "public"."enum_deck_versions_spec_slides_phase";
  `)
}
