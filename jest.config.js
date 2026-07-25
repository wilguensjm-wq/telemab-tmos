module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/services'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'services/**/*.ts',
    '!services/**/*.d.ts',
    '!services/**/index.ts',
    '!services/**/*.test.ts',
    '!services/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        skipLibCheck: true,
      },
    },
  },
};
