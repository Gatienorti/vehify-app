import { configureStore } from '@reduxjs/toolkit';
import { api } from '../services/api';
import authReducer from './authSlice';
import historyReducer from './historySlice';
import purchasesReducer from './purchasesSlice';
import settingsReducer from './settingsSlice';
import { authPersistenceMiddleware } from '../features/auth/localAuth';
import { historyPersistenceMiddleware } from '../features/history/localHistory';
import { purchasesPersistenceMiddleware } from '../features/purchases/localPurchases';
import { settingsPersistenceMiddleware } from '../features/settings/localSettings';

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    auth: authReducer,
    history: historyReducer,
    purchases: purchasesReducer,
    settings: settingsReducer,
  },
  middleware: (getDefault) =>
    getDefault().concat(
      api.middleware,
      authPersistenceMiddleware.middleware,
      historyPersistenceMiddleware.middleware,
      purchasesPersistenceMiddleware.middleware,
      settingsPersistenceMiddleware.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
