import * as migration_20260608_024132_initial from './20260608_024132_initial';

export const migrations = [
  {
    up: migration_20260608_024132_initial.up,
    down: migration_20260608_024132_initial.down,
    name: '20260608_024132_initial'
  },
];
