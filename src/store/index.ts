import { configureStore } from '@reduxjs/toolkit';
import { api } from '../services/api';
import historyReducer from './historySlice';
import purchasesReducer from './purchasesSlice';
import { historyPersistenceMiddleware } from '../features/history/localHistory';
import { purchasesPersistenceMiddleware } from '../features/purchases/localPurchases';

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    history: historyReducer,
    purchases: purchasesReducer,
  },
  middleware: (getDefault) =>
    getDefault().concat(
      api.middleware,
      historyPersistenceMiddleware.middleware,
      purchasesPersistenceMiddleware.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
