import * as migration_20260608_024132_initial from './20260608_024132_initial';
import * as migration_20260608_145602_lesson_entities from './20260608_145602_lesson_entities';
import * as migration_20260608_224715_bundle_versioning from './20260608_224715_bundle_versioning';
import * as migration_20260609_164927_subjectgrade_unique_drop_media from './20260609_164927_subjectgrade_unique_drop_media';

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
    name: '20260609_164927_subjectgrade_unique_drop_media'
  },
];
