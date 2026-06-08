import * as migration_20260608_024132_initial from './20260608_024132_initial';
import * as migration_20260608_145602_lesson_entities from './20260608_145602_lesson_entities';
import * as migration_20260608_224715_bundle_versioning from './20260608_224715_bundle_versioning';

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
    name: '20260608_224715_bundle_versioning'
  },
];
