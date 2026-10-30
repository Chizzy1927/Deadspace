import { describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../integration/test-database.js';

// Guards the integration suite's ability to delete rows: it must never target a non-test DB.
describe('resolveTestDatabaseUrl', () => {
  it('derives a *_test database from DATABASE_URL', () => {
    expect(resolveTestDatabaseUrl({ DATABASE_URL: 'postgresql://u:p@localhost:5433/deadspace' })).toBe(
      'postgresql://u:p@localhost:5433/deadspace_test',
    );
  });

  it('keeps a DATABASE_URL that already targets a test database (CI)', () => {
    expect(resolveTestDatabaseUrl({ DATABASE_URL: 'postgresql://u:p@localhost:5432/deadspace_test' })).toBe(
      'postgresql://u:p@localhost:5432/deadspace_test',
    );
  });

  it('prefers TEST_DATABASE_URL', () => {
    expect(
      resolveTestDatabaseUrl({
        DATABASE_URL: 'postgresql://u:p@localhost:5433/deadspace',
        TEST_DATABASE_URL: 'postgresql://u:p@db:5432/other_test',
      }),
    ).toBe('postgresql://u:p@db:5432/other_test');
  });

  it('refuses a TEST_DATABASE_URL that is not a *_test database', () => {
    expect(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: 'postgresql://u:p@localhost:5433/deadspace' })).toThrow(
      /must end in _test/,
    );
  });

  it('requires a database URL', () => {
    expect(() => resolveTestDatabaseUrl({})).toThrow(/TEST_DATABASE_URL or DATABASE_URL/);
  });
});
