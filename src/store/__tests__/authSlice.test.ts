import reducer, { clearAuth, hydrateAuth, setAuth, type AuthState } from '../authSlice';

const USER = { id: 7, name: 'Sam Buyer', email: 'sam@icloud.com' };

const initial: AuthState = { token: null, user: null, hydrated: false };

describe('authSlice', () => {
  it('starts anonymous and unhydrated', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(initial);
  });

  it('hydrateAuth(null) marks hydrated without a session', () => {
    const state = reducer(initial, hydrateAuth(null));
    expect(state).toEqual({ token: null, user: null, hydrated: true });
  });

  it('hydrateAuth(session) restores token + user and marks hydrated', () => {
    const state = reducer(initial, hydrateAuth({ token: 'abc', user: USER }));
    expect(state).toEqual({ token: 'abc', user: USER, hydrated: true });
  });

  it('setAuth signs the user in', () => {
    const state = reducer(initial, setAuth({ token: 'tok-1', user: USER }));
    expect(state.token).toBe('tok-1');
    expect(state.user).toEqual(USER);
  });

  it('clearAuth signs out but preserves the hydrated flag', () => {
    const signedIn = reducer(reducer(initial, hydrateAuth(null)), setAuth({ token: 't', user: USER }));
    const state = reducer(signedIn, clearAuth());
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.hydrated).toBe(true);
  });
});
