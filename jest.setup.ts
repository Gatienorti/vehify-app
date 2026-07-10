/* eslint-disable @typescript-eslint/no-require-imports */
import '@testing-library/react-native';

// AsyncStorage mock for local history tests.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
