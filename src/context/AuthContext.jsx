import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginApi, registerApi } from '../services/api.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('escrowx_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Discard any stale demo accounts
        if (
          parsed?._id === 'usr_client_01' ||
          parsed?._id === 'usr_free_01' ||
          parsed?.id === 'usr_client_01' ||
          parsed?.id === 'usr_free_01' ||
          parsed?.name === 'Alex Carter' ||
          parsed?.name === 'Sarah Chen'
        ) {
          localStorage.removeItem('escrowx_user');
          return null;
        }
        return parsed;
      } catch (e) {
        localStorage.removeItem('escrowx_user');
        return null;
      }
    }
    return null;
  });

  const [role, setRole] = useState(() => user?.role || 'client');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem('escrowx_user', JSON.stringify(user));
      setRole(user.role || 'client');
    } else {
      localStorage.removeItem('escrowx_user');
    }
  }, [user]);

  const switchRole = (newRole) => {
    if (!user) return;
    const updated = { ...user, role: newRole };
    setUser(updated);
    setRole(newRole);
  };

  const updateUser = (patch) => {
    if (!user) return;
    const updated = { ...user, ...patch };
    setUser(updated);
  };

  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await loginApi(email, password);
      if (res.data?.success && res.data.user) {
        setUser({ ...res.data.user, token: res.data.token });
        setRole(res.data.user.role || 'client');
        return { success: true, user: res.data.user };
      }
      return { success: false, message: res.data?.message || 'Login failed' };
    } catch (err) {
      return { success: false, message: err.response?.data?.message || err.message };
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    setLoading(true);
    try {
      const res = await registerApi(userData);
      if (res.data?.success && res.data.user) {
        setUser({ ...res.data.user, token: res.data.token });
        setRole(res.data.user.role || 'client');
        return { success: true, user: res.data.user };
      }
      return { success: false, message: res.data?.message || 'Registration failed' };
    } catch (err) {
      return { success: false, message: err.response?.data?.message || err.message };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('escrowx_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        setUser,
        updateUser,
        switchRole,
        login,
        register,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
