import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginApi, registerApi, updateUserApi, googleAuthApi } from '../services/api.js';

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
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem('escrowx_user', JSON.stringify(user));
      setRole(user.role || 'client');
    } else {
      localStorage.removeItem('escrowx_user');
    }
  }, [user]);

  // Saved on the server too: the backend checks the account's role for things like
  // sending proposals, so a browser-only switch left the screen and the server disagreeing.
  const switchRole = async (newRole) => {
    if (!user || newRole === role) return { success: true };
    if (switching) return { success: false, message: 'Already switching, please wait.' };
    setSwitching(true);
    try {
      const res = await updateUserApi(user._id || user.id, { role: newRole });
      const saved = res.data?.user?.role;
      // An outdated backend ignores the role field and answers "success" with the OLD role.
      if (saved !== newRole) {
        return {
          success: false,
          message: 'The server did not save the new role. Restart the backend (stop and run `npm run dev` again) so it loads the latest code, then try again.'
        };
      }
      setUser((prev) => (prev ? { ...prev, role: saved } : prev));
      setRole(saved);
      return { success: true };
    } catch (err) {
      if (!err.response) {
        return { success: false, message: 'Cannot reach the server. Make sure the backend is running, then try again.' };
      }
      return {
        success: false,
        message: err.response?.data?.message || `Could not switch role (server error ${err.response.status}). Please try again.`
      };
    } finally {
      setSwitching(false);
    }
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

  // Google sign-in. A brand-new person gets { needsRole: true } and must pick a role first.
  const loginWithGoogle = async (credential, chosenRole) => {
    setLoading(true);
    try {
      const res = await googleAuthApi(credential, chosenRole);
      if (res.data?.success && res.data.user) {
        setUser({ ...res.data.user, token: res.data.token });
        setRole(res.data.user.role || 'client');
        return { success: true, user: res.data.user };
      }
      if (res.data?.needsRole) return { success: false, needsRole: true, name: res.data.name, email: res.data.email };
      return { success: false, message: res.data?.message || 'Google sign-in failed' };
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
        switching,
        setUser,
        updateUser,
        switchRole,
        login,
        loginWithGoogle,
        register,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
