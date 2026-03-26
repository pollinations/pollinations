import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthService } from '../services/AuthService';

interface AuthContextType {
  token: string | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadToken = async () => {
      const storedToken = await AuthService.getToken();
      setToken(storedToken);
      setIsLoading(false);
    };
    loadToken();
  }, []);

  const login = async () => {
    setIsLoading(true);
    const newToken = await AuthService.loginWithPollinations();
    if (newToken) {
      setToken(newToken);
    }
    setIsLoading(false);
  };

  const logout = async () => {
    setIsLoading(true);
    await AuthService.clearToken();
    setToken(null);
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider value={{ token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
