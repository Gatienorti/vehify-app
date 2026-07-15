import { configureStore } from '@reduxjs/toolkit';
import { api } from '../services/api';
import authReducer from './authSlice';
import historyReducer from './historySlice';
import settingsReducer from './settingsSlice';
import { authPersistenceMiddleware } from '../features/auth/localAuth';
import { historyPersistenceMiddleware } from '../features/history/localHistory';
import { settingsPersistenceMiddleware } from '../features/settings/localSettings';

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    auth: authReducer,
    history: historyReducer,
    settings: settingsReducer,
  },
  middleware: (getDefault) =>
    getDefault().concat(
      api.middleware,
      authPersistenceMiddleware.middleware,
      historyPersistenceMiddleware.middleware,
      settingsPersistenceMiddleware.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
