import * as migration_20260608_024132_initial from './20260608_024132_initial';
import * as migration_20260608_145602_lesson_entities from './20260608_145602_lesson_entities';

export const migrations = [
  {
    up: migration_20260608_024132_initial.up,
    down: migration_20260608_024132_initial.down,
    name: '20260608_024132_initial',
  },
  {
    up: migration_20260608_145602_lesson_entities.up,
    down: migration_20260608_145602_lesson_entities.down,
    name: '20260608_145602_lesson_entities'
  },
];
