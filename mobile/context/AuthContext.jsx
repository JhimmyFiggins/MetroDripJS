import React, { createContext, useContext, useState } from 'react';
import { setCustomerId, clearCustomer } from '../../src/services/apiClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const isGuest = user === null;

  const login = (customer) => {
    setUser(customer);
    setCustomerId(customer?.id);
  };

  const logout = () => {
    setUser(null);
    clearCustomer();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isGuest,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}