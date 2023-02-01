import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const ProtectedRoute = ({ children }) => {
    const { user } = useAuth()
    console.log(user)
    if (!user) {
      return <Navigate to="/login" replace />;
    }
  
    return children;
};

export default ProtectedRoute