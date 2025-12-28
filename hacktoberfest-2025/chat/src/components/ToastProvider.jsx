import React, { createContext, useContext, useReducer } from 'react';
import Toast from './Toast';

const ToastContext = createContext();

const toastReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [...state.toasts, { ...action.toast, id: Date.now() + Math.random() }]
      };
    case 'REMOVE_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter(toast => toast.id !== action.id)
      };
    case 'REMOVE_ALL_TOASTS':
      return {
        ...state,
        toasts: []
      };
    default:
      return state;
  }
};

export const ToastProvider = ({ children }) => {
  const [state, dispatch] = useReducer(toastReducer, { toasts: [] });

  const showToast = (message, type = 'info', duration = 5000) => {
    dispatch({
      type: 'ADD_TOAST',
      toast: { message, type, duration }
    });
  };

  const removeToast = (id) => {
    dispatch({ type: 'REMOVE_TOAST', id });
  };

  const removeAllToasts = () => {
    dispatch({ type: 'REMOVE_ALL_TOASTS' });
  };

  return (
    <ToastContext.Provider value={{ showToast, removeToast, removeAllToasts }}>
      {children}
      <div className="toasts-container">
        {state.toasts.map(toast => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};