import * as migration_20260608_024132_initial from './20260608_024132_initial';
import * as migration_20260608_145602_lesson_entities from './20260608_145602_lesson_entities';
import * as migration_20260608_224715_bundle_versioning from './20260608_224715_bundle_versioning';
import * as migration_20260609_164927_subjectgrade_unique_drop_media from './20260609_164927_subjectgrade_unique_drop_media';
import * as migration_20260609_170000_drop_subject_slug from './20260609_170000_drop_subject_slug';
import * as migration_20260622_210554_add_unit_fields from './20260622_210554_add_unit_fields';
import * as migration_20260623_151918_add_payload_jobs from './20260623_151918_add_payload_jobs';
import * as migration_20260624_221905_official_version_model from './20260624_221905_official_version_model';
import * as migration_20260625_125532_drop_lesson_bundles from './20260625_125532_drop_lesson_bundles';

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
    name: '20260625_125532_drop_lesson_bundles'
  },
];
