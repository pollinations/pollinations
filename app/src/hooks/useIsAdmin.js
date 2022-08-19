import useLocalStorage from './useLocalStorage';

export function useIsAdmin() {
    return useLocalStorage('isAdmin', false);
}
