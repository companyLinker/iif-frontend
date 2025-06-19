import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const useInactivityLogout = (timeoutDuration) => {
  const navigate = useNavigate();

  useEffect(() => {
    let timeoutId;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      localStorage.setItem("lastActivity", Date.now().toString());
      timeoutId = setTimeout(logout, timeoutDuration);
    };

    const logout = () => {
      localStorage.removeItem("isAuthenticated");
      localStorage.removeItem("userRole");
      localStorage.removeItem("lastActivity");
      navigate("/login", { replace: true });
    };

    const handleActivity = () => {
      resetTimer();
    };

    // Initialize timer
    resetTimer();

    // Add event listeners for user activity
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, handleActivity));

    // Cleanup on component unmount
    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) =>
        window.removeEventListener(event, handleActivity)
      );
    };
  }, [navigate, timeoutDuration]);
};

export default useInactivityLogout;
