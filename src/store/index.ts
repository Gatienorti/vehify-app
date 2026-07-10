import { configureStore } from '@reduxjs/toolkit';
import { api } from '../services/api';
import historyReducer from './historySlice';
import { historyPersistenceMiddleware } from '../features/history/localHistory';

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    history: historyReducer,
  },
  middleware: (getDefault) =>
    getDefault().concat(api.middleware, historyPersistenceMiddleware.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
