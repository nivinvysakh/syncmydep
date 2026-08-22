/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'commonjs',
          moduleResolution: 'bundler',
          esModuleInterop: true,
          skipLibCheck: true,
          types: ['jest', 'node']
        }
      }
    ]
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node']
};
