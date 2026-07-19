import * as migration_20260608_024132_initial from './20260608_024132_initial';
import * as migration_20260608_145602_lesson_entities from './20260608_145602_lesson_entities';
import * as migration_20260608_224715_bundle_versioning from './20260608_224715_bundle_versioning';
import * as migration_20260609_164927_subjectgrade_unique_drop_media from './20260609_164927_subjectgrade_unique_drop_media';
import * as migration_20260609_170000_drop_subject_slug from './20260609_170000_drop_subject_slug';
import * as migration_20260622_210554_add_unit_fields from './20260622_210554_add_unit_fields';
import * as migration_20260623_151918_add_payload_jobs from './20260623_151918_add_payload_jobs';
import * as migration_20260624_221905_official_version_model from './20260624_221905_official_version_model';
import * as migration_20260625_125532_drop_lesson_bundles from './20260625_125532_drop_lesson_bundles';
import * as migration_20260628_154237_add_version_semver_unique from './20260628_154237_add_version_semver_unique';
import * as migration_20260629_213000_add_rate_limit_counters from './20260629_213000_add_rate_limit_counters';
import * as migration_20260702_015014_add_version_author from './20260702_015014_add_version_author';
import * as migration_20260702_194849_add_favorites from './20260702_194849_add_favorites';
import * as migration_20260702_230926_add_email_task from './20260702_230926_add_email_task';
import * as migration_20260703_041716_add_messaging from './20260703_041716_add_messaging';
import * as migration_20260706_175339_favorites_per_version from './20260706_175339_favorites_per_version';
import * as migration_20260710_041621_add_email_verification from './20260710_041621_add_email_verification';
import * as migration_20260719_185124_ares_resource_links_cutover from './20260719_185124_ares_resource_links_cutover';

export const migrations = [
  {
    up: migration_20260608_024132_initial.up,
    down: migration_20260608_024132_initial.down,
    name: '20260608_024132_initial',
  },
  {
    up: migration_20260608_145602_lesson_entities.up,
    down: migration_20260608_145602_lesson_entities.down,
    name: '20260608_145602_lesson_entities',
  },
  {
    up: migration_20260608_224715_bundle_versioning.up,
    down: migration_20260608_224715_bundle_versioning.down,
    name: '20260608_224715_bundle_versioning',
  },
  {
    up: migration_20260609_164927_subjectgrade_unique_drop_media.up,
    down: migration_20260609_164927_subjectgrade_unique_drop_media.down,
    name: '20260609_164927_subjectgrade_unique_drop_media',
  },
  {
    up: migration_20260609_170000_drop_subject_slug.up,
    down: migration_20260609_170000_drop_subject_slug.down,
    name: '20260609_170000_drop_subject_slug',
  },
  {
    up: migration_20260622_210554_add_unit_fields.up,
    down: migration_20260622_210554_add_unit_fields.down,
    name: '20260622_210554_add_unit_fields',
  },
  {
    up: migration_20260623_151918_add_payload_jobs.up,
    down: migration_20260623_151918_add_payload_jobs.down,
    name: '20260623_151918_add_payload_jobs',
  },
  {
    up: migration_20260624_221905_official_version_model.up,
    down: migration_20260624_221905_official_version_model.down,
    name: '20260624_221905_official_version_model',
  },
  {
    up: migration_20260625_125532_drop_lesson_bundles.up,
    down: migration_20260625_125532_drop_lesson_bundles.down,
    name: '20260625_125532_drop_lesson_bundles',
  },
  {
    up: migration_20260628_154237_add_version_semver_unique.up,
    down: migration_20260628_154237_add_version_semver_unique.down,
    name: '20260628_154237_add_version_semver_unique',
  },
  {
    up: migration_20260629_213000_add_rate_limit_counters.up,
    down: migration_20260629_213000_add_rate_limit_counters.down,
    name: '20260629_213000_add_rate_limit_counters',
  },
  {
    up: migration_20260702_015014_add_version_author.up,
    down: migration_20260702_015014_add_version_author.down,
    name: '20260702_015014_add_version_author',
  },
  {
    up: migration_20260702_194849_add_favorites.up,
    down: migration_20260702_194849_add_favorites.down,
    name: '20260702_194849_add_favorites',
  },
  {
    up: migration_20260702_230926_add_email_task.up,
    down: migration_20260702_230926_add_email_task.down,
    name: '20260702_230926_add_email_task',
  },
  {
    up: migration_20260703_041716_add_messaging.up,
    down: migration_20260703_041716_add_messaging.down,
    name: '20260703_041716_add_messaging',
  },
  {
    up: migration_20260706_175339_favorites_per_version.up,
    down: migration_20260706_175339_favorites_per_version.down,
    name: '20260706_175339_favorites_per_version',
  },
  {
    up: migration_20260710_041621_add_email_verification.up,
    down: migration_20260710_041621_add_email_verification.down,
    name: '20260710_041621_add_email_verification',
  },
  {
    up: migration_20260719_185124_ares_resource_links_cutover.up,
    down: migration_20260719_185124_ares_resource_links_cutover.down,
    name: '20260719_185124_ares_resource_links_cutover'
  },
];
